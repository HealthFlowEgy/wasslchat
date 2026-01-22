import { Injectable, NotFoundException, Logger } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';

@Injectable()
export class MessagesService {
  private readonly logger = new Logger(MessagesService.name);

  constructor(private readonly prisma: PrismaService) {}

  async getByConversation(conversationId: string, query: { page?: number; limit?: number; before?: Date }) {
    const { page = 1, limit = 50, before } = query;
    const skip = (page - 1) * limit;

    const messages = await this.prisma.message.findMany({
      where: {
        conversationId,
        ...(before && { createdAt: { lt: before } }),
      },
      skip,
      take: limit,
      orderBy: { createdAt: 'desc' },
    });

    return messages.reverse();
  }

  async findOne(id: string) {
    const message = await this.prisma.message.findUnique({ where: { id } });
    if (!message) throw new NotFoundException('الرسالة غير موجودة');
    return message;
  }

  async create(conversationId: string, data: {
    direction: 'INBOUND' | 'OUTBOUND';
    contentType: string;
    content: string;
    mediaUrl?: string;
    senderId?: string;
  }) {
    const message = await this.prisma.message.create({
      data: {
        conversationId,
        direction: data.direction,
        contentType: data.contentType as any,
        content: data.content,
        mediaUrl: data.mediaUrl,
        status: data.direction === 'OUTBOUND' ? 'PENDING' : 'DELIVERED',
        ...(data.direction === 'INBOUND' && { deliveredAt: new Date() }),
      },
    });

    // Update conversation
    await this.prisma.conversation.update({
      where: { id: conversationId },
      data: {
        lastMessageAt: new Date(),
        messagesCount: { increment: 1 },
        ...(data.direction === 'INBOUND' && { unreadCount: { increment: 1 }, lastContactMessageAt: new Date() }),
        ...(data.direction === 'OUTBOUND' && { lastAgentMessageAt: new Date() }),
      },
    });

    return message;
  }

  async updateStatus(id: string, status: string, metadata?: any) {
    return this.prisma.message.update({
      where: { id },
      data: {
        status: status as any,
        ...(status === 'SENT' && { sentAt: new Date() }),
        ...(status === 'DELIVERED' && { deliveredAt: new Date() }),
        ...(status === 'READ' && { readAt: new Date() }),
        ...(status === 'FAILED' && { failedAt: new Date(), failureReason: metadata?.reason }),
      },
    });
  }

  async delete(id: string) {
    const message = await this.prisma.message.findUnique({ where: { id } });
    if (!message) throw new NotFoundException('الرسالة غير موجودة');

    await this.prisma.message.update({
      where: { id },
      data: { isDeleted: true, deletedAt: new Date() },
    });
  }
}
