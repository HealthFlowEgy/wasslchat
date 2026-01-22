import { Injectable, NotFoundException, BadRequestException, Logger } from '@nestjs/common';
import { Prisma } from '@wasslchat/database';
import { PrismaService } from '../../common/prisma/prisma.service';

export interface CreateContactDto {
  phone: string;
  whatsappId?: string;
  name?: string;
  nameAr?: string;
  email?: string;
  avatar?: string;
  nationalId?: string;
  dateOfBirth?: Date;
  gender?: string;
  address?: any;
  city?: string;
  governorate?: string;
  postalCode?: string;
  source?: string;
  tags?: string[];
  metadata?: any;
}

export interface ContactQueryDto {
  page?: number;
  limit?: number;
  search?: string;
  tags?: string[];
  source?: string;
  hasOrders?: boolean;
  minSpent?: number;
  maxSpent?: number;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}

@Injectable()
export class ContactsService {
  private readonly logger = new Logger(ContactsService.name);

  constructor(private readonly prisma: PrismaService) {}

  async create(tenantId: string, dto: CreateContactDto) {
    // Check if contact already exists
    const existing = await this.prisma.contact.findFirst({
      where: { tenantId, phone: dto.phone },
    });

    if (existing) {
      throw new BadRequestException('جهة الاتصال موجودة مسبقاً');
    }

    const contact = await this.prisma.contact.create({
      data: {
        tenantId,
        phone: dto.phone,
        whatsappId: dto.whatsappId || dto.phone,
        name: dto.name,
        nameAr: dto.nameAr,
        email: dto.email,
        avatar: dto.avatar,
        nationalId: dto.nationalId,
        dateOfBirth: dto.dateOfBirth,
        gender: dto.gender,
        address: dto.address,
        city: dto.city,
        governorate: dto.governorate,
        postalCode: dto.postalCode,
        source: dto.source || 'MANUAL',
        tags: dto.tags || [],
        metadata: dto.metadata || {},
        firstContactAt: new Date(),
      },
    });

    this.logger.log(`Contact created: ${contact.id}`);
    return contact;
  }

  async findAll(tenantId: string, query: ContactQueryDto) {
    const {
      page = 1, limit = 20, search, tags, source, hasOrders, minSpent, maxSpent,
      sortBy = 'createdAt', sortOrder = 'desc',
    } = query;
    const skip = (page - 1) * limit;

    const where: Prisma.ContactWhereInput = {
      tenantId,
      ...(search && {
        OR: [
          { name: { contains: search, mode: 'insensitive' } },
          { phone: { contains: search } },
          { email: { contains: search, mode: 'insensitive' } },
        ],
      }),
      ...(tags?.length && { tags: { hasSome: tags } }),
      ...(source && { source }),
      ...(hasOrders && { ordersCount: { gt: 0 } }),
      ...(minSpent && { totalSpent: { gte: minSpent } }),
      ...(maxSpent && { totalSpent: { lte: maxSpent } }),
    };

    const [contacts, total] = await Promise.all([
      this.prisma.contact.findMany({
        where, skip, take: limit,
        orderBy: { [sortBy]: sortOrder },
        include: { _count: { select: { orders: true, conversations: true } } },
      }),
      this.prisma.contact.count({ where }),
    ]);

    return {
      items: contacts.map((c) => ({
        ...c,
        totalSpent: Number(c.totalSpent),
        lifetimeValue: Number(c.lifetimeValue),
        ordersCount: c._count.orders,
        conversationsCount: c._count.conversations,
      })),
      meta: { page, limit, total, totalPages: Math.ceil(total / limit) },
    };
  }

  async findOne(tenantId: string, id: string) {
    const contact = await this.prisma.contact.findFirst({
      where: { id, tenantId },
      include: {
        orders: { take: 10, orderBy: { createdAt: 'desc' } },
        conversations: { take: 5, orderBy: { lastMessageAt: 'desc' } },
        notes: { orderBy: { createdAt: 'desc' } },
        groups: { include: { group: true } },
      },
    });

    if (!contact) {
      throw new NotFoundException('جهة الاتصال غير موجودة');
    }

    return {
      ...contact,
      totalSpent: Number(contact.totalSpent),
      lifetimeValue: Number(contact.lifetimeValue),
    };
  }

  async findByPhone(tenantId: string, phone: string) {
    return this.prisma.contact.findFirst({
      where: { tenantId, phone },
    });
  }

  async update(tenantId: string, id: string, dto: Partial<CreateContactDto>) {
    const contact = await this.prisma.contact.findFirst({ where: { id, tenantId } });
    if (!contact) throw new NotFoundException('جهة الاتصال غير موجودة');

    return this.prisma.contact.update({
      where: { id },
      data: {
        ...(dto.name !== undefined && { name: dto.name }),
        ...(dto.nameAr !== undefined && { nameAr: dto.nameAr }),
        ...(dto.email !== undefined && { email: dto.email }),
        ...(dto.avatar !== undefined && { avatar: dto.avatar }),
        ...(dto.nationalId !== undefined && { nationalId: dto.nationalId }),
        ...(dto.dateOfBirth !== undefined && { dateOfBirth: dto.dateOfBirth }),
        ...(dto.gender !== undefined && { gender: dto.gender }),
        ...(dto.address !== undefined && { address: dto.address }),
        ...(dto.city !== undefined && { city: dto.city }),
        ...(dto.governorate !== undefined && { governorate: dto.governorate }),
        ...(dto.postalCode !== undefined && { postalCode: dto.postalCode }),
        ...(dto.tags !== undefined && { tags: dto.tags }),
        ...(dto.metadata !== undefined && { metadata: dto.metadata }),
      },
    });
  }

  async delete(tenantId: string, id: string) {
    const contact = await this.prisma.contact.findFirst({ where: { id, tenantId } });
    if (!contact) throw new NotFoundException('جهة الاتصال غير موجودة');

    // Check for orders
    const ordersCount = await this.prisma.order.count({ where: { contactId: id } });
    if (ordersCount > 0) {
      throw new BadRequestException('لا يمكن حذف جهة اتصال لديها طلبات');
    }

    await this.prisma.contact.delete({ where: { id } });
  }

  async addNote(tenantId: string, contactId: string, content: string, userId?: string) {
    const contact = await this.prisma.contact.findFirst({ where: { id: contactId, tenantId } });
    if (!contact) throw new NotFoundException('جهة الاتصال غير موجودة');

    return this.prisma.contactNote.create({
      data: { contactId, content, createdById: userId },
    });
  }

  async addToGroup(tenantId: string, contactId: string, groupId: string) {
    const contact = await this.prisma.contact.findFirst({ where: { id: contactId, tenantId } });
    if (!contact) throw new NotFoundException('جهة الاتصال غير موجودة');

    const group = await this.prisma.contactGroup.findFirst({ where: { id: groupId, tenantId } });
    if (!group) throw new NotFoundException('المجموعة غير موجودة');

    return this.prisma.contactGroupMember.upsert({
      where: { contactId_groupId: { contactId, groupId } },
      create: { contactId, groupId },
      update: {},
    });
  }

  async removeFromGroup(tenantId: string, contactId: string, groupId: string) {
    await this.prisma.contactGroupMember.deleteMany({
      where: { contactId, groupId },
    });
  }

  async updateTags(tenantId: string, id: string, tags: string[]) {
    const contact = await this.prisma.contact.findFirst({ where: { id, tenantId } });
    if (!contact) throw new NotFoundException('جهة الاتصال غير موجودة');

    return this.prisma.contact.update({
      where: { id },
      data: { tags },
    });
  }

  async getStats(tenantId: string) {
    const [total, withOrders, newThisMonth, totalSpent] = await Promise.all([
      this.prisma.contact.count({ where: { tenantId } }),
      this.prisma.contact.count({ where: { tenantId, ordersCount: { gt: 0 } } }),
      this.prisma.contact.count({
        where: { tenantId, createdAt: { gte: new Date(new Date().setDate(1)) } },
      }),
      this.prisma.contact.aggregate({ where: { tenantId }, _sum: { totalSpent: true } }),
    ]);

    return {
      total,
      withOrders,
      newThisMonth,
      totalSpent: Number(totalSpent._sum.totalSpent) || 0,
      conversionRate: total > 0 ? ((withOrders / total) * 100).toFixed(2) : 0,
    };
  }

  // Contact Groups
  async createGroup(tenantId: string, data: { name: string; nameAr?: string; description?: string; isAutomatic?: boolean; filters?: any }) {
    return this.prisma.contactGroup.create({
      data: { tenantId, ...data },
    });
  }

  async getGroups(tenantId: string) {
    return this.prisma.contactGroup.findMany({
      where: { tenantId },
      include: { _count: { select: { members: true } } },
      orderBy: { createdAt: 'desc' },
    });
  }

  async deleteGroup(tenantId: string, groupId: string) {
    const group = await this.prisma.contactGroup.findFirst({ where: { id: groupId, tenantId } });
    if (!group) throw new NotFoundException('المجموعة غير موجودة');

    await this.prisma.$transaction([
      this.prisma.contactGroupMember.deleteMany({ where: { groupId } }),
      this.prisma.contactGroup.delete({ where: { id: groupId } }),
    ]);
  }
}
