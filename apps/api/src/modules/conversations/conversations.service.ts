import { Injectable, NotFoundException, Logger } from '@nestjs/common';
import { Prisma, ConversationStatus } from '@wasslchat/database';
import { PrismaService } from '../../common/prisma/prisma.service';

export interface ConversationQueryDto {
  page?: number;
  limit?: number;
  status?: ConversationStatus;
  assigneeId?: string;
  contactId?: string;
  channel?: string;
  unreadOnly?: boolean;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}

@Injectable()
export class ConversationsService {
  private readonly logger = new Logger(ConversationsService.name);

  constructor(private readonly prisma: PrismaService) {}

  async findAll(tenantId: string, query: ConversationQueryDto) {
    const {
      page = 1, limit = 20, status, assigneeId, contactId, channel,
      unreadOnly, sortBy = 'lastMessageAt', sortOrder = 'desc',
    } = query;
    const skip = (page - 1) * limit;

    const where: Prisma.ConversationWhereInput = {
      tenantId,
      ...(status && { status }),
      ...(assigneeId && { assigneeId }),
      ...(contactId && { contactId }),
      ...(channel && { channel }),
      ...(unreadOnly && { unreadCount: { gt: 0 } }),
    };

    const [conversations, total] = await Promise.all([
      this.prisma.conversation.findMany({
        where, skip, take: limit,
        orderBy: { [sortBy]: sortOrder },
        include: {
          contact: { select: { id: true, name: true, phone: true, avatar: true } },
          assignee: { select: { id: true, firstName: true, lastName: true, avatar: true } },
          messages: { take: 1, orderBy: { createdAt: 'desc' } },
        },
      }),
      this.prisma.conversation.count({ where }),
    ]);

    return {
      items: conversations.map((c) => ({
        ...c,
        lastMessage: c.messages[0] || null,
      })),
      meta: { page, limit, total, totalPages: Math.ceil(total / limit) },
    };
  }

  async findOne(tenantId: string, id: string) {
    const conversation = await this.prisma.conversation.findFirst({
      where: { id, tenantId },
      include: {
        contact: true,
        assignee: { select: { id: true, firstName: true, lastName: true, avatar: true } },
        messages: { take: 50, orderBy: { createdAt: 'desc' } },
      },
    });

    if (!conversation) throw new NotFoundException('المحادثة غير موجودة');

    // Mark as read
    if (conversation.unreadCount > 0) {
      await this.prisma.conversation.update({
        where: { id },
        data: { unreadCount: 0 },
      });
    }

    return {
      ...conversation,
      messages: conversation.messages.reverse(),
    };
  }

  async assign(tenantId: string, id: string, assigneeId: string | null) {
    const conversation = await this.prisma.conversation.findFirst({ where: { id, tenantId } });
    if (!conversation) throw new NotFoundException('المحادثة غير موجودة');

    if (assigneeId) {
      const user = await this.prisma.user.findFirst({ where: { id: assigneeId, tenantId } });
      if (!user) throw new NotFoundException('المستخدم غير موجود');
    }

    return this.prisma.conversation.update({
      where: { id },
      data: {
        assigneeId,
        ...(assigneeId && { assignedAt: new Date() }),
      },
    });
  }

  async updateStatus(tenantId: string, id: string, status: ConversationStatus) {
    const conversation = await this.prisma.conversation.findFirst({ where: { id, tenantId } });
    if (!conversation) throw new NotFoundException('المحادثة غير موجودة');

    return this.prisma.conversation.update({
      where: { id },
      data: {
        status,
        ...(status === 'RESOLVED' && { resolvedAt: new Date() }),
      },
    });
  }

  async addTags(tenantId: string, id: string, tags: string[]) {
    const conversation = await this.prisma.conversation.findFirst({ where: { id, tenantId } });
    if (!conversation) throw new NotFoundException('المحادثة غير موجودة');

    const currentTags = conversation.tags || [];
    const newTags = [...new Set([...currentTags, ...tags])];

    return this.prisma.conversation.update({
      where: { id },
      data: { tags: newTags },
    });
  }

  async getStats(tenantId: string) {
    const [total, open, pending, resolved, unread, avgResponseTime] = await Promise.all([
      this.prisma.conversation.count({ where: { tenantId } }),
      this.prisma.conversation.count({ where: { tenantId, status: 'OPEN' } }),
      this.prisma.conversation.count({ where: { tenantId, status: 'PENDING' } }),
      this.prisma.conversation.count({ where: { tenantId, status: 'RESOLVED' } }),
      this.prisma.conversation.count({ where: { tenantId, unreadCount: { gt: 0 } } }),
      this.prisma.conversation.aggregate({ where: { tenantId }, _avg: { firstResponseTime: true } }),
    ]);

    return {
      total,
      open,
      pending,
      resolved,
      unread,
      avgFirstResponseTime: avgResponseTime._avg.firstResponseTime || 0,
    };
  }

  async getByContact(tenantId: string, contactId: string) {
    return this.prisma.conversation.findMany({
      where: { tenantId, contactId },
      orderBy: { lastMessageAt: 'desc' },
      include: {
        messages: { take: 1, orderBy: { createdAt: 'desc' } },
      },
    });
  }
}
