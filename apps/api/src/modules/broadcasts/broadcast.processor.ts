import { Process, Processor, OnQueueCompleted, OnQueueFailed } from '@nestjs/bull';
import { Logger } from '@nestjs/common';
import { Job } from 'bull';
import { PrismaService } from '../../common/prisma/prisma.service';
import { WhatsappService } from '../whatsapp/whatsapp.service';

interface BroadcastJobData {
  broadcastId: string;
  tenantId: string;
  resume?: boolean;
}

@Processor('broadcasts')
export class BroadcastProcessor {
  private readonly logger = new Logger(BroadcastProcessor.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly whatsappService: WhatsappService,
  ) {}

  @Process('send-broadcast')
  async handleSendBroadcast(job: Job<BroadcastJobData>) {
    const { broadcastId, tenantId, resume } = job.data;
    this.logger.log(`Processing broadcast: ${broadcastId}`);

    try {
      // Get broadcast details
      const broadcast = await this.prisma.broadcast.findUnique({
        where: { id: broadcastId },
      });

      if (!broadcast) {
        throw new Error('Broadcast not found');
      }

      // Check if cancelled or paused
      if (broadcast.status === 'CANCELLED') {
        this.logger.log(`Broadcast ${broadcastId} was cancelled, skipping`);
        return { success: false, reason: 'cancelled' };
      }

      // Update status to sending
      await this.prisma.broadcast.update({
        where: { id: broadcastId },
        data: {
          status: 'SENDING',
          ...(!resume && { startedAt: new Date() }),
        },
      });

      // Get pending recipients
      const recipients = await this.prisma.broadcastRecipient.findMany({
        where: {
          broadcastId,
          status: 'PENDING',
        },
        include: {
          contact: { select: { id: true, phone: true, name: true } },
        },
        orderBy: { createdAt: 'asc' },
      });

      this.logger.log(`Sending to ${recipients.length} recipients`);

      const batchSize = broadcast.batchSize || 50;
      const batchDelayMs = broadcast.batchDelayMs || 1000;
      
      let sentCount = broadcast.sentCount || 0;
      let failedCount = broadcast.failedCount || 0;

      // Process in batches
      for (let i = 0; i < recipients.length; i += batchSize) {
        // Check if paused
        const currentBroadcast = await this.prisma.broadcast.findUnique({
          where: { id: broadcastId },
          select: { status: true },
        });

        if (currentBroadcast?.status === 'PAUSED' || currentBroadcast?.status === 'CANCELLED') {
          this.logger.log(`Broadcast ${broadcastId} ${currentBroadcast.status.toLowerCase()}, stopping`);
          return { success: true, reason: currentBroadcast.status.toLowerCase(), sentCount };
        }

        const batch = recipients.slice(i, i + batchSize);

        // Send batch
        const results = await Promise.allSettled(
          batch.map((recipient) =>
            this.sendMessage(tenantId, broadcast, recipient.contact),
          ),
        );

        // Update recipient statuses
        for (let j = 0; j < results.length; j++) {
          const result = results[j];
          const recipient = batch[j];

          if (result.status === 'fulfilled' && result.value.success) {
            await this.prisma.broadcastRecipient.update({
              where: { id: recipient.id },
              data: {
                status: 'SENT',
                sentAt: new Date(),
                messageId: result.value.messageId,
              },
            });
            sentCount++;
          } else {
            const error = result.status === 'rejected' 
              ? result.reason?.message 
              : result.value?.error;
            
            await this.prisma.broadcastRecipient.update({
              where: { id: recipient.id },
              data: {
                status: 'FAILED',
                error: error || 'Unknown error',
              },
            });
            failedCount++;
          }
        }

        // Update broadcast counts
        await this.prisma.broadcast.update({
          where: { id: broadcastId },
          data: { sentCount, failedCount },
        });

        // Update job progress
        const progress = Math.round(((i + batchSize) / recipients.length) * 100);
        await job.progress(Math.min(progress, 100));

        // Delay between batches
        if (i + batchSize < recipients.length) {
          await this.sleep(batchDelayMs);
        }
      }

      // Mark as completed
      await this.prisma.broadcast.update({
        where: { id: broadcastId },
        data: {
          status: 'COMPLETED',
          completedAt: new Date(),
          sentCount,
          failedCount,
        },
      });

      this.logger.log(`Broadcast ${broadcastId} completed: ${sentCount} sent, ${failedCount} failed`);

      return { success: true, sentCount, failedCount };
    } catch (error) {
      this.logger.error(`Broadcast ${broadcastId} error: ${error.message}`);
      
      await this.prisma.broadcast.update({
        where: { id: broadcastId },
        data: { status: 'FAILED', error: error.message },
      });

      throw error;
    }
  }

  private async sendMessage(
    tenantId: string,
    broadcast: any,
    contact: { id: string; phone: string; name?: string },
  ): Promise<{ success: boolean; messageId?: string; error?: string }> {
    try {
      let result;

      switch (broadcast.messageType) {
        case 'TEXT':
          const content = this.interpolateVariables(
            broadcast.content,
            { contactName: contact.name || 'عميلنا العزيز' },
          );
          result = await this.whatsappService.sendTextMessage(tenantId, contact.phone, content);
          break;

        case 'IMAGE':
          result = await this.whatsappService.sendMediaMessage(
            tenantId,
            contact.phone,
            'image',
            broadcast.mediaUrl,
            broadcast.mediaCaption,
          );
          break;

        case 'VIDEO':
          result = await this.whatsappService.sendMediaMessage(
            tenantId,
            contact.phone,
            'video',
            broadcast.mediaUrl,
            broadcast.mediaCaption,
          );
          break;

        case 'DOCUMENT':
          result = await this.whatsappService.sendMediaMessage(
            tenantId,
            contact.phone,
            'document',
            broadcast.mediaUrl,
            broadcast.mediaCaption,
          );
          break;

        case 'TEMPLATE':
          const params = this.interpolateTemplateParams(
            broadcast.templateParams || {},
            { contactName: contact.name || 'عميلنا العزيز' },
          );
          result = await this.whatsappService.sendTemplateMessage(
            tenantId,
            contact.phone,
            broadcast.templateName,
            params,
          );
          break;

        default:
          throw new Error(`Unsupported message type: ${broadcast.messageType}`);
      }

      return {
        success: true,
        messageId: result?.key?.id,
      };
    } catch (error) {
      return {
        success: false,
        error: error.message,
      };
    }
  }

  private interpolateVariables(template: string, variables: Record<string, any>): string {
    return template.replace(/\{\{(\w+)\}\}/g, (match, key) => {
      return variables[key] !== undefined ? String(variables[key]) : match;
    });
  }

  private interpolateTemplateParams(
    params: Record<string, string>,
    variables: Record<string, any>,
  ): Record<string, string> {
    const result: Record<string, string> = {};
    for (const [key, value] of Object.entries(params)) {
      result[key] = this.interpolateVariables(value, variables);
    }
    return result;
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  @OnQueueCompleted()
  onCompleted(job: Job, result: any) {
    this.logger.log(`Broadcast job ${job.id} completed: ${JSON.stringify(result)}`);
  }

  @OnQueueFailed()
  onFailed(job: Job, error: Error) {
    this.logger.error(`Broadcast job ${job.id} failed: ${error.message}`);
  }
}
