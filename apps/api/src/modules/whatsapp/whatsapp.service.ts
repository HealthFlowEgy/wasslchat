import { Injectable, Logger, NotFoundException, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../common/prisma/prisma.service';
import { EvolutionApiService } from './evolution-api.service';

@Injectable()
export class WhatsappService {
  private readonly logger = new Logger(WhatsappService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly evolutionApi: EvolutionApiService,
    private readonly configService: ConfigService,
  ) {}

  // ============= SESSION MANAGEMENT =============

  async createSession(tenantId: string, instanceName: string) {
    // Check if session already exists
    const existing = await this.prisma.whatsAppSession.findFirst({
      where: { tenantId, instanceName },
    });

    if (existing) {
      throw new BadRequestException('جلسة بهذا الاسم موجودة مسبقاً');
    }

    // Create instance in Evolution API
    const webhookUrl = `${this.configService.get('API_URL')}/api/v1/webhooks/whatsapp/${tenantId}`;
    
    const result = await this.evolutionApi.createInstance(instanceName, {
      webhook: {
        enabled: true,
        url: webhookUrl,
        webhookByEvents: true,
        events: [
          'QRCODE_UPDATED',
          'CONNECTION_UPDATE',
          'MESSAGES_UPSERT',
          'MESSAGES_UPDATE',
          'SEND_MESSAGE',
        ],
      },
    });

    // Save session to database
    const session = await this.prisma.whatsAppSession.create({
      data: {
        tenantId,
        instanceName,
        instanceId: result.instance?.instanceId,
        connectionType: 'BAILEYS',
        status: 'QR_CODE',
        qrCode: result.qrcode?.base64,
        webhookUrl,
        webhookEvents: [
          'QRCODE_UPDATED',
          'CONNECTION_UPDATE',
          'MESSAGES_UPSERT',
          'MESSAGES_UPDATE',
          'SEND_MESSAGE',
        ],
      },
    });

    return {
      id: session.id,
      instanceName: session.instanceName,
      status: session.status,
      qrCode: session.qrCode,
    };
  }

  async getSessions(tenantId: string) {
    const sessions = await this.prisma.whatsAppSession.findMany({
      where: { tenantId },
      orderBy: { createdAt: 'desc' },
    });

    // Update statuses from Evolution API
    const updatedSessions = await Promise.all(
      sessions.map(async (session) => {
        const status = await this.evolutionApi.getInstanceStatus(session.instanceName);
        return {
          ...session,
          liveStatus: status.status,
        };
      }),
    );

    return updatedSessions;
  }

  async getSession(tenantId: string, id: string) {
    const session = await this.prisma.whatsAppSession.findFirst({
      where: { id, tenantId },
    });

    if (!session) {
      throw new NotFoundException('الجلسة غير موجودة');
    }

    const status = await this.evolutionApi.getInstanceStatus(session.instanceName);

    return {
      ...session,
      liveStatus: status.status,
      profilePicUrl: status.profilePicUrl,
      profileName: status.profileName,
    };
  }

  async connectSession(tenantId: string, id: string) {
    const session = await this.prisma.whatsAppSession.findFirst({
      where: { id, tenantId },
    });

    if (!session) {
      throw new NotFoundException('الجلسة غير موجودة');
    }

    const result = await this.evolutionApi.connectInstance(session.instanceName);

    // Update QR code in database
    if (result.qrcode) {
      await this.prisma.whatsAppSession.update({
        where: { id },
        data: {
          qrCode: result.qrcode,
          qrCodeExpiresAt: new Date(Date.now() + 60000), // 1 minute
          status: 'QR_CODE',
        },
      });
    }

    return {
      qrCode: result.qrcode,
      pairingCode: result.pairingCode,
    };
  }

  async disconnectSession(tenantId: string, id: string) {
    const session = await this.prisma.whatsAppSession.findFirst({
      where: { id, tenantId },
    });

    if (!session) {
      throw new NotFoundException('الجلسة غير موجودة');
    }

    await this.evolutionApi.disconnectInstance(session.instanceName);

    await this.prisma.whatsAppSession.update({
      where: { id },
      data: {
        status: 'DISCONNECTED',
        lastDisconnectedAt: new Date(),
      },
    });

    return { success: true };
  }

  async deleteSession(tenantId: string, id: string) {
    const session = await this.prisma.whatsAppSession.findFirst({
      where: { id, tenantId },
    });

    if (!session) {
      throw new NotFoundException('الجلسة غير موجودة');
    }

    await this.evolutionApi.deleteInstance(session.instanceName);
    await this.prisma.whatsAppSession.delete({ where: { id } });

    return { success: true };
  }

  // ============= MESSAGING =============

  async sendTextMessage(tenantId: string, to: string, text: string) {
    const session = await this.getActiveSession(tenantId);
    
    const result = await this.evolutionApi.sendText(session.instanceName, {
      number: to,
      text,
    });

    // Log message
    await this.logOutboundMessage(tenantId, to, 'TEXT', text, result);

    return result;
  }

  async sendMediaMessage(
    tenantId: string,
    to: string,
    mediaType: 'image' | 'video' | 'audio' | 'document',
    media: string,
    caption?: string,
    fileName?: string,
  ) {
    const session = await this.getActiveSession(tenantId);

    const result = await this.evolutionApi.sendMedia(session.instanceName, {
      number: to,
      mediatype: mediaType,
      media,
      caption,
      fileName,
    });

    await this.logOutboundMessage(tenantId, to, mediaType.toUpperCase(), caption || '', result);

    return result;
  }

  async sendButtonMessage(
    tenantId: string,
    to: string,
    title: string,
    description: string,
    buttons: Array<{ id: string; text: string }>,
    footer?: string,
  ) {
    const session = await this.getActiveSession(tenantId);

    const result = await this.evolutionApi.sendButtons(session.instanceName, {
      number: to,
      title,
      description,
      footer,
      buttons: buttons.map((b) => ({
        buttonId: b.id,
        buttonText: { displayText: b.text },
      })),
    });

    await this.logOutboundMessage(tenantId, to, 'INTERACTIVE', title, result);

    return result;
  }

  async sendListMessage(
    tenantId: string,
    to: string,
    title: string,
    description: string,
    buttonText: string,
    sections: Array<{
      title: string;
      rows: Array<{ id: string; title: string; description?: string }>;
    }>,
    footer?: string,
  ) {
    const session = await this.getActiveSession(tenantId);

    const result = await this.evolutionApi.sendList(session.instanceName, {
      number: to,
      title,
      description,
      buttonText,
      footer,
      sections: sections.map((s) => ({
        title: s.title,
        rows: s.rows.map((r) => ({
          title: r.title,
          description: r.description,
          rowId: r.id,
        })),
      })),
    });

    await this.logOutboundMessage(tenantId, to, 'INTERACTIVE', title, result);

    return result;
  }

  async sendTemplateMessage(
    tenantId: string,
    to: string,
    templateName: string,
    params?: Record<string, string>,
  ) {
    const session = await this.getActiveSession(tenantId);

    const components = params
      ? [
          {
            type: 'body',
            parameters: Object.values(params).map((value) => ({
              type: 'text',
              text: value,
            })),
          },
        ]
      : undefined;

    const result = await this.evolutionApi.sendTemplate(session.instanceName, {
      number: to,
      template: {
        name: templateName,
        language: { code: 'ar' },
        components,
      },
    });

    await this.logOutboundMessage(tenantId, to, 'TEMPLATE', templateName, result);

    return result;
  }

  // ============= HELPERS =============

  private async getActiveSession(tenantId: string) {
    const session = await this.prisma.whatsAppSession.findFirst({
      where: { tenantId, status: 'CONNECTED' },
    });

    if (!session) {
      throw new BadRequestException('لا توجد جلسة واتساب متصلة');
    }

    return session;
  }

  private async logOutboundMessage(
    tenantId: string,
    to: string,
    contentType: string,
    content: string,
    result: any,
  ) {
    // Find or create contact
    let contact = await this.prisma.contact.findFirst({
      where: { tenantId, phone: to },
    });

    if (!contact) {
      contact = await this.prisma.contact.create({
        data: {
          tenantId,
          phone: to,
          whatsappId: to,
          source: 'WHATSAPP',
        },
      });
    }

    // Find or create conversation
    let conversation = await this.prisma.conversation.findFirst({
      where: { tenantId, contactId: contact.id, status: { not: 'RESOLVED' } },
    });

    if (!conversation) {
      conversation = await this.prisma.conversation.create({
        data: {
          tenantId,
          contactId: contact.id,
          status: 'OPEN',
          channel: 'whatsapp',
        },
      });
    }

    // Create message
    await this.prisma.message.create({
      data: {
        conversationId: conversation.id,
        direction: 'OUTBOUND',
        contentType: contentType as any,
        content,
        whatsappMsgId: result?.key?.id,
        status: result?.status === 'PENDING' ? 'PENDING' : 'SENT',
        sentAt: new Date(),
      },
    });

    // Update conversation
    await this.prisma.conversation.update({
      where: { id: conversation.id },
      data: {
        lastMessageAt: new Date(),
        lastAgentMessageAt: new Date(),
        messagesCount: { increment: 1 },
      },
    });
  }

  // ============= WEBHOOK HANDLERS =============

  async handleWebhook(tenantId: string, event: string, data: any) {
    this.logger.debug(`Webhook received: ${event} for tenant ${tenantId}`);

    switch (event) {
      case 'connection.update':
        await this.handleConnectionUpdate(tenantId, data);
        break;
      case 'messages.upsert':
        await this.handleInboundMessage(tenantId, data);
        break;
      case 'messages.update':
        await this.handleMessageUpdate(tenantId, data);
        break;
      case 'qrcode.updated':
        await this.handleQrCodeUpdate(tenantId, data);
        break;
      default:
        this.logger.debug(`Unhandled event: ${event}`);
    }
  }

  private async handleConnectionUpdate(tenantId: string, data: any) {
    const { instance, state } = data;
    
    const statusMap: Record<string, string> = {
      open: 'CONNECTED',
      close: 'DISCONNECTED',
      connecting: 'CONNECTING',
    };

    const status = statusMap[state] || 'DISCONNECTED';

    await this.prisma.whatsAppSession.updateMany({
      where: { tenantId, instanceName: instance },
      data: {
        status: status as any,
        ...(status === 'CONNECTED' && {
          lastConnectedAt: new Date(),
          phoneNumber: data.me?.id?.split(':')[0],
          displayName: data.me?.name,
        }),
        ...(status === 'DISCONNECTED' && {
          lastDisconnectedAt: new Date(),
          disconnectReason: data.reason,
        }),
      },
    });
  }

  private async handleInboundMessage(tenantId: string, data: any) {
    const messages = data.messages || [];

    for (const msg of messages) {
      // Skip outbound messages
      if (msg.key?.fromMe) continue;

      const phone = msg.key?.remoteJid?.split('@')[0];
      if (!phone) continue;

      // Find or create contact
      let contact = await this.prisma.contact.findFirst({
        where: { tenantId, phone },
      });

      if (!contact) {
        contact = await this.prisma.contact.create({
          data: {
            tenantId,
            phone,
            whatsappId: phone,
            name: msg.pushName,
            source: 'WHATSAPP',
            firstContactAt: new Date(),
          },
        });
      } else if (!contact.name && msg.pushName) {
        await this.prisma.contact.update({
          where: { id: contact.id },
          data: { name: msg.pushName },
        });
      }

      // Find or create conversation
      let conversation = await this.prisma.conversation.findFirst({
        where: { tenantId, contactId: contact.id, status: { not: 'RESOLVED' } },
      });

      if (!conversation) {
        conversation = await this.prisma.conversation.create({
          data: {
            tenantId,
            contactId: contact.id,
            status: 'OPEN',
            channel: 'whatsapp',
            firstMessageAt: new Date(),
          },
        });
      }

      // Determine content type and extract content
      const { contentType, content, mediaUrl } = this.parseMessageContent(msg);

      // Create message
      await this.prisma.message.create({
        data: {
          conversationId: conversation.id,
          direction: 'INBOUND',
          contentType: contentType as any,
          content,
          mediaUrl,
          whatsappMsgId: msg.key?.id,
          status: 'DELIVERED',
          deliveredAt: new Date(),
        },
      });

      // Update conversation
      await this.prisma.conversation.update({
        where: { id: conversation.id },
        data: {
          lastMessageAt: new Date(),
          lastContactMessageAt: new Date(),
          messagesCount: { increment: 1 },
          unreadCount: { increment: 1 },
        },
      });

      // Update contact
      await this.prisma.contact.update({
        where: { id: contact.id },
        data: { lastContactAt: new Date() },
      });
    }
  }

  private async handleMessageUpdate(tenantId: string, data: any) {
    const updates = data.updates || [];

    for (const update of updates) {
      const msgId = update.key?.id;
      if (!msgId) continue;

      const statusMap: Record<number, string> = {
        0: 'PENDING',
        1: 'SENT',
        2: 'DELIVERED',
        3: 'READ',
        4: 'FAILED',
      };

      const status = statusMap[update.update?.status] || 'SENT';

      await this.prisma.message.updateMany({
        where: { whatsappMsgId: msgId },
        data: {
          status: status as any,
          ...(status === 'DELIVERED' && { deliveredAt: new Date() }),
          ...(status === 'READ' && { readAt: new Date() }),
          ...(status === 'FAILED' && { 
            failedAt: new Date(),
            failureReason: update.update?.error,
          }),
        },
      });
    }
  }

  private async handleQrCodeUpdate(tenantId: string, data: any) {
    const { instance, qrcode } = data;

    await this.prisma.whatsAppSession.updateMany({
      where: { tenantId, instanceName: instance },
      data: {
        qrCode: qrcode?.base64,
        qrCodeExpiresAt: new Date(Date.now() + 60000),
        status: 'QR_CODE',
      },
    });
  }

  private parseMessageContent(msg: any): { contentType: string; content: string; mediaUrl?: string } {
    if (msg.message?.conversation) {
      return { contentType: 'TEXT', content: msg.message.conversation };
    }
    if (msg.message?.extendedTextMessage) {
      return { contentType: 'TEXT', content: msg.message.extendedTextMessage.text };
    }
    if (msg.message?.imageMessage) {
      return {
        contentType: 'IMAGE',
        content: msg.message.imageMessage.caption || '',
        mediaUrl: msg.message.imageMessage.url,
      };
    }
    if (msg.message?.videoMessage) {
      return {
        contentType: 'VIDEO',
        content: msg.message.videoMessage.caption || '',
        mediaUrl: msg.message.videoMessage.url,
      };
    }
    if (msg.message?.audioMessage) {
      return { contentType: 'AUDIO', content: '', mediaUrl: msg.message.audioMessage.url };
    }
    if (msg.message?.documentMessage) {
      return {
        contentType: 'DOCUMENT',
        content: msg.message.documentMessage.fileName || '',
        mediaUrl: msg.message.documentMessage.url,
      };
    }
    if (msg.message?.locationMessage) {
      return {
        contentType: 'LOCATION',
        content: `${msg.message.locationMessage.degreesLatitude},${msg.message.locationMessage.degreesLongitude}`,
      };
    }
    if (msg.message?.contactMessage) {
      return { contentType: 'CONTACT', content: msg.message.contactMessage.displayName || '' };
    }
    if (msg.message?.stickerMessage) {
      return { contentType: 'STICKER', content: '', mediaUrl: msg.message.stickerMessage.url };
    }

    return { contentType: 'TEXT', content: '[Unsupported message type]' };
  }
}
