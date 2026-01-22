import {
  Injectable,
  NotFoundException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { Prisma, OrderStatus, PaymentStatus, PaymentMethod } from '@wasslchat/database';
import { PrismaService } from '../../common/prisma/prisma.service';

export interface CreateOrderDto {
  contactId: string;
  items: Array<{
    productId: string;
    variantId?: string;
    quantity: number;
    discount?: number;
  }>;
  paymentMethod: string;
  shippingMethod?: string;
  shippingAddress?: any;
  billingAddress?: any;
  shippingCost?: number;
  discount?: number;
  discountCode?: string;
  taxRate?: number;
  notes?: string;
  source?: string;
  metadata?: any;
}

export interface OrderQueryDto {
  page?: number;
  limit?: number;
  search?: string;
  status?: string;
  paymentStatus?: string;
  paymentMethod?: string;
  contactId?: string;
  startDate?: string;
  endDate?: string;
  minTotal?: number;
  maxTotal?: number;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}

@Injectable()
export class OrdersService {
  private readonly logger = new Logger(OrdersService.name);

  constructor(private readonly prisma: PrismaService) {}

  async create(tenantId: string, dto: CreateOrderDto) {
    const contact = await this.prisma.contact.findFirst({
      where: { id: dto.contactId, tenantId },
    });

    if (!contact) {
      throw new BadRequestException('العميل غير موجود');
    }

    const orderItems = [];
    let subtotal = 0;

    for (const item of dto.items) {
      const product = await this.prisma.product.findFirst({
        where: { id: item.productId, tenantId, isActive: true },
      });

      if (!product) {
        throw new BadRequestException(`المنتج غير موجود: ${item.productId}`);
      }

      if (product.trackInventory && product.inventoryQty < item.quantity && !product.allowBackorder) {
        throw new BadRequestException(`الكمية غير متوفرة للمنتج: ${product.name}`);
      }

      const unitPrice = Number(product.price);
      const totalPrice = unitPrice * item.quantity;
      subtotal += totalPrice;

      orderItems.push({
        productId: product.id,
        variantId: item.variantId,
        sku: product.sku,
        productName: product.name,
        productNameAr: product.nameAr,
        productImage: product.thumbnail || product.images?.[0],
        quantity: item.quantity,
        unitPrice,
        discount: item.discount || 0,
        totalPrice: totalPrice - (item.discount || 0),
      });
    }

    const discount = dto.discount || 0;
    const shippingCost = dto.shippingCost || 0;
    const taxRate = dto.taxRate || 0.14;
    const taxAmount = (subtotal - discount) * taxRate;
    const total = subtotal - discount + shippingCost + taxAmount;
    const orderNumber = await this.generateOrderNumber(tenantId);

    const order = await this.prisma.$transaction(async (tx) => {
      const newOrder = await tx.order.create({
        data: {
          tenantId,
          contactId: dto.contactId,
          orderNumber,
          status: 'PENDING',
          subtotal,
          discount,
          discountCode: dto.discountCode,
          shippingCost,
          taxAmount,
          taxRate,
          total,
          currency: 'EGP',
          itemsCount: orderItems.length,
          paymentMethod: dto.paymentMethod as PaymentMethod,
          paymentStatus: 'PENDING',
          shippingMethod: dto.shippingMethod,
          shippingAddress: dto.shippingAddress,
          billingAddress: dto.billingAddress || dto.shippingAddress,
          notes: dto.notes,
          source: dto.source || 'WHATSAPP',
          metadata: dto.metadata || {},
          items: { create: orderItems },
        },
        include: { items: true, contact: true },
      });

      for (const item of orderItems) {
        const product = await tx.product.findUnique({ where: { id: item.productId } });
        if (product?.trackInventory) {
          await tx.product.update({
            where: { id: item.productId },
            data: { inventoryQty: { decrement: item.quantity }, soldCount: { increment: item.quantity } },
          });
        }
      }

      await tx.contact.update({
        where: { id: dto.contactId },
        data: { ordersCount: { increment: 1 }, totalSpent: { increment: total }, lastOrderAt: new Date() },
      });

      await tx.orderTimeline.create({
        data: { orderId: newOrder.id, status: 'PENDING', title: 'Order Created', titleAr: 'تم إنشاء الطلب' },
      });

      return newOrder;
    });

    this.logger.log(`Order created: ${order.orderNumber}`);
    return this.formatOrderResponse(order);
  }

  async findAll(tenantId: string, query: OrderQueryDto) {
    const { page = 1, limit = 20, search, status, paymentStatus, paymentMethod, contactId, startDate, endDate, minTotal, maxTotal, sortBy = 'createdAt', sortOrder = 'desc' } = query;
    const skip = (page - 1) * limit;

    const where: Prisma.OrderWhereInput = {
      tenantId,
      ...(search && { OR: [{ orderNumber: { contains: search, mode: 'insensitive' } }, { contact: { name: { contains: search, mode: 'insensitive' } } }] }),
      ...(status && { status: status as OrderStatus }),
      ...(paymentStatus && { paymentStatus: paymentStatus as PaymentStatus }),
      ...(paymentMethod && { paymentMethod: paymentMethod as PaymentMethod }),
      ...(contactId && { contactId }),
      ...(startDate && { createdAt: { gte: new Date(startDate) } }),
      ...(endDate && { createdAt: { lte: new Date(endDate) } }),
      ...(minTotal && { total: { gte: minTotal } }),
      ...(maxTotal && { total: { lte: maxTotal } }),
    };

    const [orders, total] = await Promise.all([
      this.prisma.order.findMany({ where, skip, take: limit, orderBy: { [sortBy]: sortOrder }, include: { contact: { select: { id: true, name: true, phone: true } }, items: true } }),
      this.prisma.order.count({ where }),
    ]);

    return { items: orders.map(this.formatOrderResponse), meta: { page, limit, total, totalPages: Math.ceil(total / limit) } };
  }

  async findOne(tenantId: string, id: string) {
    const order = await this.prisma.order.findFirst({
      where: { id, tenantId },
      include: { contact: true, items: { include: { product: true } }, payments: true, timeline: { orderBy: { createdAt: 'desc' } } },
    });
    if (!order) throw new NotFoundException('الطلب غير موجود');
    return this.formatOrderResponse(order);
  }

  async updateStatus(tenantId: string, id: string, status: OrderStatus, note?: string, userId?: string) {
    const order = await this.prisma.order.findFirst({ where: { id, tenantId } });
    if (!order) throw new NotFoundException('الطلب غير موجود');

    const statusTitles: Record<string, { en: string; ar: string }> = {
      CONFIRMED: { en: 'Order Confirmed', ar: 'تم تأكيد الطلب' },
      PROCESSING: { en: 'Processing', ar: 'قيد التجهيز' },
      SHIPPED: { en: 'Shipped', ar: 'تم الشحن' },
      DELIVERED: { en: 'Delivered', ar: 'تم التسليم' },
      CANCELLED: { en: 'Cancelled', ar: 'ملغي' },
    };
    const title = statusTitles[status] || { en: status, ar: status };

    const updated = await this.prisma.$transaction(async (tx) => {
      const updatedOrder = await tx.order.update({
        where: { id },
        data: {
          status,
          ...(status === 'CONFIRMED' && { confirmedAt: new Date() }),
          ...(status === 'SHIPPED' && { shippedAt: new Date() }),
          ...(status === 'DELIVERED' && { deliveredAt: new Date() }),
          ...(status === 'CANCELLED' && { cancelledAt: new Date(), cancellationReason: note }),
        },
        include: { contact: true, items: true },
      });

      await tx.orderTimeline.create({ data: { orderId: id, status, title: title.en, titleAr: title.ar, description: note, createdById: userId } });

      if (status === 'CANCELLED') {
        for (const item of updatedOrder.items) {
          await tx.product.update({ where: { id: item.productId }, data: { inventoryQty: { increment: item.quantity }, soldCount: { decrement: item.quantity } } });
        }
      }
      return updatedOrder;
    });

    return this.formatOrderResponse(updated);
  }

  async cancel(tenantId: string, id: string, reason?: string, userId?: string) {
    return this.updateStatus(tenantId, id, 'CANCELLED', reason, userId);
  }

  async getStats(tenantId: string, startDate?: Date, endDate?: Date) {
    const dateFilter = { ...(startDate && { gte: startDate }), ...(endDate && { lte: endDate }) };
    const where: Prisma.OrderWhereInput = { tenantId, ...(Object.keys(dateFilter).length && { createdAt: dateFilter }) };

    const [totalOrders, totalRevenue, pendingOrders, deliveredOrders, cancelledOrders, avgOrderValue] = await Promise.all([
      this.prisma.order.count({ where }),
      this.prisma.order.aggregate({ where: { ...where, status: 'DELIVERED' }, _sum: { total: true } }),
      this.prisma.order.count({ where: { ...where, status: 'PENDING' } }),
      this.prisma.order.count({ where: { ...where, status: 'DELIVERED' } }),
      this.prisma.order.count({ where: { ...where, status: 'CANCELLED' } }),
      this.prisma.order.aggregate({ where, _avg: { total: true } }),
    ]);

    return {
      totalOrders,
      totalRevenue: Number(totalRevenue._sum.total) || 0,
      pendingOrders,
      deliveredOrders,
      cancelledOrders,
      avgOrderValue: Number(avgOrderValue._avg.total) || 0,
      conversionRate: totalOrders > 0 ? ((deliveredOrders / totalOrders) * 100).toFixed(2) : 0,
    };
  }

  private async generateOrderNumber(tenantId: string): Promise<string> {
    const tenant = await this.prisma.tenant.findUnique({ where: { id: tenantId }, select: { settings: true } });
    const prefix = (tenant?.settings as any)?.orderPrefix || 'ORD';
    const today = new Date();
    const dateStr = `${today.getFullYear()}${String(today.getMonth() + 1).padStart(2, '0')}${String(today.getDate()).padStart(2, '0')}`;
    const count = await this.prisma.order.count({ where: { tenantId, createdAt: { gte: new Date(today.setHours(0, 0, 0, 0)) } } });
    return `${prefix}-${dateStr}-${String(count + 1).padStart(4, '0')}`;
  }

  private formatOrderResponse(order: any) {
    return {
      id: order.id,
      orderNumber: order.orderNumber,
      status: order.status,
      paymentStatus: order.paymentStatus,
      paymentMethod: order.paymentMethod,
      subtotal: Number(order.subtotal),
      discount: Number(order.discount),
      shippingCost: Number(order.shippingCost),
      taxAmount: Number(order.taxAmount),
      total: Number(order.total),
      currency: order.currency,
      itemsCount: order.itemsCount,
      shippingAddress: order.shippingAddress,
      trackingNumber: order.trackingNumber,
      notes: order.notes,
      source: order.source,
      contact: order.contact,
      items: order.items?.map((item: any) => ({
        id: item.id,
        productId: item.productId,
        productName: item.productName,
        productNameAr: item.productNameAr,
        productImage: item.productImage,
        quantity: item.quantity,
        unitPrice: Number(item.unitPrice),
        totalPrice: Number(item.totalPrice),
      })),
      payments: order.payments,
      timeline: order.timeline,
      createdAt: order.createdAt,
      confirmedAt: order.confirmedAt,
      deliveredAt: order.deliveredAt,
    };
  }
}
