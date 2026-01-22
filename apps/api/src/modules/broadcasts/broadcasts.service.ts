import { Injectable, NotFoundException, BadRequestException, Logger } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bull';
import { Queue } from 'bull';
import { Prisma, BroadcastStatus } from '@wasslchat/database';
import { PrismaService } from '../../common/prisma/prisma.service';

export interface CreateBroadcastDto {
  name: string;
  nameAr?: string;
  description?: string;
  messageType: 'TEXT' | 'IMAGE' | 'VIDEO' | 'DOCUMENT' | 'TEMPLATE';
  content?: string;
  contentAr?: string;
  mediaUrl?: string;
  mediaCaption?: string;
  templateName?: string;
  templateParams?: Record<string, string>;
  targetType: 'ALL' | 'GROUP' | 'TAG' | 'CUSTOM';
  targetGroupIds?: string[];
  targetTags?: string[];
  targetContactIds?: string[];
  filters?: {
    hasOrders?: boolean;
    minSpent?: number;
    maxSpent?: number;
    lastContactAfter?: Date;
    lastContactBefore?: Date;
    governorate?: string[];
  };
  scheduledAt?: Date;
  batchSize?: number;
  batchDelayMs?: number;
}

export interface BroadcastQueryDto {
  page?: number;
  limit?: number;
  status?: BroadcastStatus;
  search?: string;
  startDate?: string;
  endDate?: string;
}

@Injectable()
export class BroadcastsService {
  private readonly logger = new Logger(BroadcastsService.name);

  constructor(
    private readonly prisma: PrismaService,
    @InjectQueue('broadcasts') private readonly broadcastQueue: Queue,
    @InjectQueue('broadcast-messages') private readonly messageQueue: Queue,
  ) {}

  async create(tenantId: string, dto: CreateBroadcastDto) {
    // Check plan limits
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      include: { plan: true },
    });

    // Calculate recipients
    const recipientIds = await this.calculateRecipients(tenantId, dto);
    
    if (recipientIds.length === 0) {
      throw new BadRequestException('لا يوجد مستلمين مطابقين للمعايير المحددة');
    }

    // Check monthly broadcast limit
    const thisMonth = new Date();
    thisMonth.setDate(1);
    thisMonth.setHours(0, 0, 0, 0);

    const monthlyCount = await this.prisma.broadcastRecipient.count({
      where: {
        broadcast: { tenantId },
        createdAt: { gte: thisMonth },
      },
    });

    if (tenant.plan.broadcastsLimit !== -1 && 
        monthlyCount + recipientIds.length > tenant.plan.broadcastsLimit) {
      throw new BadRequestException(
        `تجاوزت الحد الشهري للرسائل الجماعية (${tenant.plan.broadcastsLimit})`,
      );
    }

    // Create broadcast
    const broadcast = await this.prisma.broadcast.create({
      data: {
        tenantId,
        name: dto.name,
        nameAr: dto.nameAr,
        description: dto.description,
        messageType: dto.messageType,
        content: dto.content,
        contentAr: dto.contentAr,
        mediaUrl: dto.mediaUrl,
        mediaCaption: dto.mediaCaption,
        templateName: dto.templateName,
        templateParams: dto.templateParams || {},
        targetType: dto.targetType,
        targetGroupIds: dto.targetGroupIds || [],
        targetTags: dto.targetTags || [],
        targetContactIds: dto.targetContactIds || [],
        filters: dto.filters || {},
        totalRecipients: recipientIds.length,
        batchSize: dto.batchSize || 50,
        batchDelayMs: dto.batchDelayMs || 1000,
        status: dto.scheduledAt ? 'SCHEDULED' : 'DRAFT',
        scheduledAt: dto.scheduledAt,
        recipients: {
          createMany: {
            data: recipientIds.map((contactId) => ({ contactId })),
          },
        },
      },
    });

    this.logger.log(`Broadcast created: ${broadcast.id} with ${recipientIds.length} recipients`);

    // Schedule if has scheduledAt
    if (dto.scheduledAt) {
      const delay = new Date(dto.scheduledAt).getTime() - Date.now();
      if (delay > 0) {
        await this.broadcastQueue.add(
          'send-broadcast',
          { broadcastId: broadcast.id, tenantId },
          { delay, jobId: `broadcast-${broadcast.id}` },
        );
      }
    }

    return this.formatBroadcastResponse(broadcast);
  }

  async findAll(tenantId: string, query: BroadcastQueryDto) {
    const { page = 1, limit = 20, status, search, startDate, endDate } = query;
    const skip = (page - 1) * limit;

    const where: Prisma.BroadcastWhereInput = {
      tenantId,
      ...(status && { status }),
      ...(search && {
        OR: [
          { name: { contains: search, mode: 'insensitive' } },
          { nameAr: { contains: search, mode: 'insensitive' } },
        ],
      }),
      ...(startDate && { createdAt: { gte: new Date(startDate) } }),
      ...(endDate && { createdAt: { lte: new Date(endDate) } }),
    };

    const [broadcasts, total] = await Promise.all([
      this.prisma.broadcast.findMany({
        where, skip, take: limit,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.broadcast.count({ where }),
    ]);

    return {
      items: broadcasts.map(this.formatBroadcastResponse),
      meta: { page, limit, total, totalPages: Math.ceil(total / limit) },
    };
  }

  async findOne(tenantId: string, id: string) {
    const broadcast = await this.prisma.broadcast.findFirst({
      where: { id, tenantId },
      include: {
        _count: {
          select: {
            recipients: true,
          },
        },
      },
    });

    if (!broadcast) {
      throw new NotFoundException('الحملة غير موجودة');
    }

    return this.formatBroadcastResponse(broadcast);
  }

  async getRecipients(tenantId: string, broadcastId: string, query: { page?: number; limit?: number; status?: string }) {
    const { page = 1, limit = 50, status } = query;
    const skip = (page - 1) * limit;

    const broadcast = await this.prisma.broadcast.findFirst({
      where: { id: broadcastId, tenantId },
    });

    if (!broadcast) {
      throw new NotFoundException('الحملة غير موجودة');
    }

    const where: Prisma.BroadcastRecipientWhereInput = {
      broadcastId,
      ...(status && { status: status as any }),
    };

    const [recipients, total] = await Promise.all([
      this.prisma.broadcastRecipient.findMany({
        where, skip, take: limit,
        include: {
          contact: { select: { id: true, name: true, phone: true } },
        },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.broadcastRecipient.count({ where }),
    ]);

    return {
      items: recipients,
      meta: { page, limit, total, totalPages: Math.ceil(total / limit) },
    };
  }

  async update(tenantId: string, id: string, dto: Partial<CreateBroadcastDto>) {
    const broadcast = await this.prisma.broadcast.findFirst({
      where: { id, tenantId },
    });

    if (!broadcast) {
      throw new NotFoundException('الحملة غير موجودة');
    }

    if (!['DRAFT', 'SCHEDULED'].includes(broadcast.status)) {
      throw new BadRequestException('لا يمكن تعديل حملة قيد التنفيذ أو مكتملة');
    }

    // Recalculate recipients if targeting changed
    let recipientIds: string[] | null = null;
    if (dto.targetType || dto.targetGroupIds || dto.targetTags || dto.targetContactIds || dto.filters) {
      recipientIds = await this.calculateRecipients(tenantId, {
        targetType: dto.targetType || broadcast.targetType,
        targetGroupIds: dto.targetGroupIds || broadcast.targetGroupIds,
        targetTags: dto.targetTags || broadcast.targetTags,
        targetContactIds: dto.targetContactIds || broadcast.targetContactIds,
        filters: dto.filters || broadcast.filters as any,
      } as any);
    }

    // Update broadcast
    const updated = await this.prisma.$transaction(async (tx) => {
      // Delete old recipients if recalculating
      if (recipientIds) {
        await tx.broadcastRecipient.deleteMany({ where: { broadcastId: id } });
        await tx.broadcastRecipient.createMany({
          data: recipientIds.map((contactId) => ({ broadcastId: id, contactId })),
        });
      }

      return tx.broadcast.update({
        where: { id },
        data: {
          ...(dto.name && { name: dto.name }),
          ...(dto.nameAr !== undefined && { nameAr: dto.nameAr }),
          ...(dto.description !== undefined && { description: dto.description }),
          ...(dto.messageType && { messageType: dto.messageType }),
          ...(dto.content !== undefined && { content: dto.content }),
          ...(dto.contentAr !== undefined && { contentAr: dto.contentAr }),
          ...(dto.mediaUrl !== undefined && { mediaUrl: dto.mediaUrl }),
          ...(dto.mediaCaption !== undefined && { mediaCaption: dto.mediaCaption }),
          ...(dto.templateName !== undefined && { templateName: dto.templateName }),
          ...(dto.templateParams !== undefined && { templateParams: dto.templateParams }),
          ...(dto.targetType && { targetType: dto.targetType }),
          ...(dto.targetGroupIds && { targetGroupIds: dto.targetGroupIds }),
          ...(dto.targetTags && { targetTags: dto.targetTags }),
          ...(dto.targetContactIds && { targetContactIds: dto.targetContactIds }),
          ...(dto.filters && { filters: dto.filters }),
          ...(recipientIds && { totalRecipients: recipientIds.length }),
          ...(dto.batchSize && { batchSize: dto.batchSize }),
          ...(dto.batchDelayMs && { batchDelayMs: dto.batchDelayMs }),
          ...(dto.scheduledAt !== undefined && { 
            scheduledAt: dto.scheduledAt,
            status: dto.scheduledAt ? 'SCHEDULED' : 'DRAFT',
          }),
        },
      });
    });

    // Reschedule if scheduledAt changed
    if (dto.scheduledAt) {
      await this.broadcastQueue.removeJobs(`broadcast-${id}`);
      const delay = new Date(dto.scheduledAt).getTime() - Date.now();
      if (delay > 0) {
        await this.broadcastQueue.add(
          'send-broadcast',
          { broadcastId: id, tenantId },
          { delay, jobId: `broadcast-${id}` },
        );
      }
    }

    return this.formatBroadcastResponse(updated);
  }

  async delete(tenantId: string, id: string) {
    const broadcast = await this.prisma.broadcast.findFirst({
      where: { id, tenantId },
    });

    if (!broadcast) {
      throw new NotFoundException('الحملة غير موجودة');
    }

    if (broadcast.status === 'SENDING') {
      throw new BadRequestException('لا يمكن حذف حملة قيد الإرسال');
    }

    // Remove scheduled job
    await this.broadcastQueue.removeJobs(`broadcast-${id}`);

    await this.prisma.$transaction([
      this.prisma.broadcastRecipient.deleteMany({ where: { broadcastId: id } }),
      this.prisma.broadcast.delete({ where: { id } }),
    ]);

    this.logger.log(`Broadcast deleted: ${id}`);
  }

  async send(tenantId: string, id: string) {
    const broadcast = await this.prisma.broadcast.findFirst({
      where: { id, tenantId },
    });

    if (!broadcast) {
      throw new NotFoundException('الحملة غير موجودة');
    }

    if (!['DRAFT', 'SCHEDULED'].includes(broadcast.status)) {
      throw new BadRequestException('الحملة قيد التنفيذ أو مكتملة بالفعل');
    }

    // Queue for immediate sending
    await this.broadcastQueue.add(
      'send-broadcast',
      { broadcastId: id, tenantId },
      { jobId: `broadcast-${id}` },
    );

    await this.prisma.broadcast.update({
      where: { id },
      data: { status: 'QUEUED' },
    });

    return { success: true, message: 'تم إضافة الحملة لقائمة الإرسال' };
  }

  async pause(tenantId: string, id: string) {
    const broadcast = await this.prisma.broadcast.findFirst({
      where: { id, tenantId },
    });

    if (!broadcast) {
      throw new NotFoundException('الحملة غير موجودة');
    }

    if (broadcast.status !== 'SENDING') {
      throw new BadRequestException('الحملة ليست قيد الإرسال');
    }

    // Pause the job
    const job = await this.broadcastQueue.getJob(`broadcast-${id}`);
    if (job) {
      // Note: Bull doesn't have native pause for individual jobs
      // We'll handle this in the processor
    }

    await this.prisma.broadcast.update({
      where: { id },
      data: { status: 'PAUSED', pausedAt: new Date() },
    });

    return { success: true, message: 'تم إيقاف الحملة مؤقتاً' };
  }

  async resume(tenantId: string, id: string) {
    const broadcast = await this.prisma.broadcast.findFirst({
      where: { id, tenantId },
    });

    if (!broadcast) {
      throw new NotFoundException('الحملة غير موجودة');
    }

    if (broadcast.status !== 'PAUSED') {
      throw new BadRequestException('الحملة ليست متوقفة');
    }

    await this.broadcastQueue.add(
      'send-broadcast',
      { broadcastId: id, tenantId, resume: true },
      { jobId: `broadcast-${id}-resume` },
    );

    await this.prisma.broadcast.update({
      where: { id },
      data: { status: 'SENDING', pausedAt: null },
    });

    return { success: true, message: 'تم استئناف الحملة' };
  }

  async cancel(tenantId: string, id: string) {
    const broadcast = await this.prisma.broadcast.findFirst({
      where: { id, tenantId },
    });

    if (!broadcast) {
      throw new NotFoundException('الحملة غير موجودة');
    }

    if (!['QUEUED', 'SENDING', 'PAUSED', 'SCHEDULED'].includes(broadcast.status)) {
      throw new BadRequestException('لا يمكن إلغاء هذه الحملة');
    }

    await this.broadcastQueue.removeJobs(`broadcast-${id}`);

    await this.prisma.broadcast.update({
      where: { id },
      data: { status: 'CANCELLED', cancelledAt: new Date() },
    });

    return { success: true, message: 'تم إلغاء الحملة' };
  }

  async getStats(tenantId: string) {
    const [total, sent, scheduled, stats] = await Promise.all([
      this.prisma.broadcast.count({ where: { tenantId } }),
      this.prisma.broadcast.count({ where: { tenantId, status: 'COMPLETED' } }),
      this.prisma.broadcast.count({ where: { tenantId, status: 'SCHEDULED' } }),
      this.prisma.broadcast.aggregate({
        where: { tenantId },
        _sum: {
          totalRecipients: true,
          sentCount: true,
          deliveredCount: true,
          readCount: true,
          failedCount: true,
        },
      }),
    ]);

    const totalSent = stats._sum.sentCount || 0;
    const totalDelivered = stats._sum.deliveredCount || 0;
    const totalRead = stats._sum.readCount || 0;

    return {
      totalBroadcasts: total,
      sentBroadcasts: sent,
      scheduledBroadcasts: scheduled,
      totalRecipients: stats._sum.totalRecipients || 0,
      totalSent,
      totalDelivered,
      totalRead,
      totalFailed: stats._sum.failedCount || 0,
      deliveryRate: totalSent > 0 ? ((totalDelivered / totalSent) * 100).toFixed(2) : 0,
      readRate: totalDelivered > 0 ? ((totalRead / totalDelivered) * 100).toFixed(2) : 0,
    };
  }

  // Private helpers
  private async calculateRecipients(tenantId: string, dto: Partial<CreateBroadcastDto>): Promise<string[]> {
    let contactIds: string[] = [];

    switch (dto.targetType) {
      case 'ALL':
        const allContacts = await this.prisma.contact.findMany({
          where: { tenantId, phone: { not: null } },
          select: { id: true },
        });
        contactIds = allContacts.map((c) => c.id);
        break;

      case 'GROUP':
        if (dto.targetGroupIds?.length) {
          const groupMembers = await this.prisma.contactGroupMember.findMany({
            where: { groupId: { in: dto.targetGroupIds } },
            select: { contactId: true },
          });
          contactIds = [...new Set(groupMembers.map((m) => m.contactId))];
        }
        break;

      case 'TAG':
        if (dto.targetTags?.length) {
          const taggedContacts = await this.prisma.contact.findMany({
            where: { tenantId, tags: { hasSome: dto.targetTags } },
            select: { id: true },
          });
          contactIds = taggedContacts.map((c) => c.id);
        }
        break;

      case 'CUSTOM':
        contactIds = dto.targetContactIds || [];
        break;
    }

    // Apply additional filters
    if (dto.filters && contactIds.length > 0) {
      const filters = dto.filters;
      const filteredContacts = await this.prisma.contact.findMany({
        where: {
          id: { in: contactIds },
          tenantId,
          phone: { not: null },
          ...(filters.hasOrders && { ordersCount: { gt: 0 } }),
          ...(filters.minSpent && { totalSpent: { gte: filters.minSpent } }),
          ...(filters.maxSpent && { totalSpent: { lte: filters.maxSpent } }),
          ...(filters.lastContactAfter && { lastContactAt: { gte: filters.lastContactAfter } }),
          ...(filters.lastContactBefore && { lastContactAt: { lte: filters.lastContactBefore } }),
          ...(filters.governorate?.length && { governorate: { in: filters.governorate } }),
        },
        select: { id: true },
      });
      contactIds = filteredContacts.map((c) => c.id);
    }

    return contactIds;
  }

  private formatBroadcastResponse(broadcast: any) {
    return {
      id: broadcast.id,
      name: broadcast.name,
      nameAr: broadcast.nameAr,
      description: broadcast.description,
      messageType: broadcast.messageType,
      content: broadcast.content,
      contentAr: broadcast.contentAr,
      mediaUrl: broadcast.mediaUrl,
      templateName: broadcast.templateName,
      targetType: broadcast.targetType,
      totalRecipients: broadcast.totalRecipients,
      sentCount: broadcast.sentCount,
      deliveredCount: broadcast.deliveredCount,
      readCount: broadcast.readCount,
      failedCount: broadcast.failedCount,
      status: broadcast.status,
      scheduledAt: broadcast.scheduledAt,
      startedAt: broadcast.startedAt,
      completedAt: broadcast.completedAt,
      createdAt: broadcast.createdAt,
    };
  }
}
