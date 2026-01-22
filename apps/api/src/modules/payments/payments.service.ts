import { Injectable, Logger, NotFoundException, BadRequestException } from '@nestjs/common';
import { Prisma, PaymentStatus } from '@wasslchat/database';
import { PrismaService } from '../../common/prisma/prisma.service';
import { PaymentProcessorService } from './payment-processor.service';

@Injectable()
export class PaymentsService {
  private readonly logger = new Logger(PaymentsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly paymentProcessor: PaymentProcessorService,
  ) {}

  /**
   * Initiate payment for an order
   */
  async initiatePayment(tenantId: string, orderId: string, returnUrl?: string) {
    const order = await this.prisma.order.findFirst({
      where: { id: orderId, tenantId },
      include: {
        contact: true,
        items: { include: { product: true } },
      },
    });

    if (!order) {
      throw new NotFoundException('الطلب غير موجود');
    }

    if (order.paymentStatus === 'PAID') {
      throw new BadRequestException('الطلب مدفوع مسبقاً');
    }

    const callbackUrl = `${process.env.API_URL}/api/v1/webhooks/payments/${tenantId}`;

    const result = await this.paymentProcessor.processPayment({
      tenantId,
      orderId: order.id,
      orderNumber: order.orderNumber,
      amount: Number(order.total),
      paymentMethod: order.paymentMethod,
      customer: {
        name: order.contact.name || 'Customer',
        email: order.contact.email,
        phone: order.contact.phone,
      },
      items: order.items.map((item) => ({
        id: item.productId,
        name: item.productName,
        price: Number(item.unitPrice),
        quantity: item.quantity,
      })),
      returnUrl,
      callbackUrl,
      metadata: { tenantId, orderId: order.id },
    });

    // Update order with payment reference
    if (result.success) {
      await this.prisma.order.update({
        where: { id: orderId },
        data: {
          paymentRef: result.referenceNumber || result.transactionId,
          paymentGateway: result.gateway,
          paymentDetails: result as any,
        },
      });
    }

    return result;
  }

  /**
   * Get payment by ID
   */
  async findOne(tenantId: string, paymentId: string) {
    const payment = await this.prisma.payment.findFirst({
      where: { id: paymentId },
      include: {
        order: {
          select: {
            id: true,
            orderNumber: true,
            tenantId: true,
          },
        },
      },
    });

    if (!payment || payment.order.tenantId !== tenantId) {
      throw new NotFoundException('الدفعة غير موجودة');
    }

    return payment;
  }

  /**
   * List payments for tenant
   */
  async findAll(tenantId: string, query: {
    page?: number;
    limit?: number;
    status?: PaymentStatus;
    gateway?: string;
    startDate?: string;
    endDate?: string;
    orderId?: string;
  }) {
    const { page = 1, limit = 20, status, gateway, startDate, endDate, orderId } = query;
    const skip = (page - 1) * limit;

    const where: Prisma.PaymentWhereInput = {
      order: { tenantId },
      ...(status && { status }),
      ...(gateway && { gateway }),
      ...(orderId && { orderId }),
      ...(startDate && { createdAt: { gte: new Date(startDate) } }),
      ...(endDate && { createdAt: { lte: new Date(endDate) } }),
    };

    const [payments, total] = await Promise.all([
      this.prisma.payment.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          order: {
            select: {
              orderNumber: true,
              contact: { select: { name: true, phone: true } },
            },
          },
        },
      }),
      this.prisma.payment.count({ where }),
    ]);

    return {
      items: payments,
      meta: { page, limit, total, totalPages: Math.ceil(total / limit) },
    };
  }

  /**
   * Check payment status
   */
  async checkStatus(tenantId: string, paymentId: string) {
    const payment = await this.findOne(tenantId, paymentId);
    return this.paymentProcessor.getPaymentStatus(payment.id);
  }

  /**
   * Process refund
   */
  async refund(tenantId: string, paymentId: string, amount?: number, reason?: string) {
    const payment = await this.findOne(tenantId, paymentId);
    return this.paymentProcessor.processRefund(payment.id, amount, reason);
  }

  /**
   * Handle payment webhook
   */
  async handleWebhook(
    tenantId: string,
    gateway: string,
    payload: any,
    signature?: string,
  ) {
    this.logger.log(`Payment webhook received: ${gateway} for tenant ${tenantId}`);

    // Find payment by reference or transaction ID
    const referenceNumber = payload.referenceNumber || payload.reference_number || 
                           payload.merchantRefNumber || payload.order_id;
    const transactionId = payload.transactionId || payload.transaction_id || 
                         payload.fawryRefNumber;

    const payment = await this.prisma.payment.findFirst({
      where: {
        OR: [
          { referenceNumber },
          { transactionId },
        ],
        order: { tenantId },
      },
      include: {
        order: true,
      },
    });

    if (!payment) {
      this.logger.warn(`Payment not found for webhook: ${referenceNumber || transactionId}`);
      return { success: false, message: 'Payment not found' };
    }

    // Determine new status from webhook payload
    let newStatus: PaymentStatus = 'PENDING';
    const payloadStatus = payload.status || payload.orderStatus || payload.paymentStatus;

    const statusMap: Record<string, PaymentStatus> = {
      'PAID': 'PAID',
      'SUCCESS': 'PAID',
      'COMPLETED': 'PAID',
      'FAILED': 'FAILED',
      'CANCELLED': 'CANCELLED',
      'CANCELED': 'CANCELLED',
      'EXPIRED': 'EXPIRED',
      'REFUNDED': 'REFUNDED',
    };

    newStatus = statusMap[payloadStatus?.toUpperCase()] || 'PENDING';

    // Update payment status
    await this.prisma.payment.update({
      where: { id: payment.id },
      data: {
        status: newStatus,
        ...(newStatus === 'PAID' && { paidAt: new Date() }),
        gatewayResponse: {
          ...(payment.gatewayResponse as any || {}),
          webhook: payload,
        },
      },
    });

    // Update order status if payment is confirmed
    if (newStatus === 'PAID') {
      await this.prisma.$transaction(async (tx) => {
        // Update order
        await tx.order.update({
          where: { id: payment.orderId },
          data: {
            paymentStatus: 'PAID',
            paidAt: new Date(),
            status: payment.order.status === 'PENDING' ? 'CONFIRMED' : payment.order.status,
            confirmedAt: payment.order.status === 'PENDING' ? new Date() : payment.order.confirmedAt,
          },
        });

        // Add timeline entry
        await tx.orderTimeline.create({
          data: {
            orderId: payment.orderId,
            status: 'PAID',
            title: 'Payment Confirmed',
            titleAr: 'تم تأكيد الدفع',
            description: `Payment of ${payment.amount} EGP confirmed via ${gateway}`,
            descriptionAr: `تم تأكيد دفع ${payment.amount} جنيه عبر ${gateway}`,
            metadata: { paymentId: payment.id, gateway },
          },
        });
      });

      // TODO: Send WhatsApp notification to customer
      this.logger.log(`Payment confirmed for order ${payment.order.orderNumber}`);
    }

    return {
      success: true,
      paymentId: payment.id,
      orderId: payment.orderId,
      status: newStatus,
    };
  }

  /**
   * Get payment statistics
   */
  async getStats(tenantId: string, startDate?: Date, endDate?: Date) {
    const dateFilter = {
      ...(startDate && { gte: startDate }),
      ...(endDate && { lte: endDate }),
    };

    const where: Prisma.PaymentWhereInput = {
      order: { tenantId },
      ...(Object.keys(dateFilter).length && { createdAt: dateFilter }),
    };

    const [
      totalPayments,
      totalAmount,
      paidPayments,
      paidAmount,
      pendingPayments,
      failedPayments,
      refundedAmount,
      byGateway,
    ] = await Promise.all([
      this.prisma.payment.count({ where }),
      this.prisma.payment.aggregate({
        where,
        _sum: { amount: true },
      }),
      this.prisma.payment.count({ where: { ...where, status: 'PAID' } }),
      this.prisma.payment.aggregate({
        where: { ...where, status: 'PAID' },
        _sum: { amount: true },
      }),
      this.prisma.payment.count({ where: { ...where, status: 'PENDING' } }),
      this.prisma.payment.count({ where: { ...where, status: 'FAILED' } }),
      this.prisma.payment.aggregate({
        where: { ...where, status: 'REFUNDED' },
        _sum: { refundAmount: true },
      }),
      this.prisma.payment.groupBy({
        by: ['gateway'],
        where: { ...where, status: 'PAID' },
        _count: true,
        _sum: { amount: true },
      }),
    ]);

    return {
      totalPayments,
      totalAmount: Number(totalAmount._sum.amount) || 0,
      paidPayments,
      paidAmount: Number(paidAmount._sum.amount) || 0,
      pendingPayments,
      failedPayments,
      refundedAmount: Number(refundedAmount._sum.refundAmount) || 0,
      successRate: totalPayments > 0 ? (paidPayments / totalPayments * 100).toFixed(2) : 0,
      byGateway: byGateway.map((g) => ({
        gateway: g.gateway,
        count: g._count,
        amount: Number(g._sum.amount) || 0,
      })),
    };
  }
}
