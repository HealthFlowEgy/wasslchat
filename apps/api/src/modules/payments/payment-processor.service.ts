import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { PaymentMethod } from '@wasslchat/database';
import { PrismaService } from '../../common/prisma/prisma.service';
import { HealthPayService, CreatePaymentDto as HealthPayDto } from './gateways/healthpay.service';
import { FawryService, FawryChargeRequest } from './gateways/fawry.service';
import { VodafoneCashService, VodafoneCashPaymentRequest } from './gateways/vodafone-cash.service';

export interface PaymentRequest {
  tenantId: string;
  orderId: string;
  orderNumber: string;
  amount: number;
  paymentMethod: PaymentMethod;
  customer: {
    name: string;
    email?: string;
    phone: string;
  };
  items?: Array<{
    id: string;
    name: string;
    price: number;
    quantity: number;
  }>;
  returnUrl?: string;
  callbackUrl?: string;
  metadata?: Record<string, any>;
}

export interface PaymentResult {
  success: boolean;
  paymentId?: string;
  transactionId?: string;
  referenceNumber?: string;
  paymentUrl?: string;
  qrCode?: string;
  ussdCode?: string;
  instructions?: string;
  instructionsAr?: string;
  expiresAt?: Date;
  status: string;
  message?: string;
  gateway: string;
}

@Injectable()
export class PaymentProcessorService {
  private readonly logger = new Logger(PaymentProcessorService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly healthPayService: HealthPayService,
    private readonly fawryService: FawryService,
    private readonly vodafoneCashService: VodafoneCashService,
  ) {}

  /**
   * Process payment based on selected method
   */
  async processPayment(request: PaymentRequest): Promise<PaymentResult> {
    this.logger.log(`Processing payment for order ${request.orderNumber} via ${request.paymentMethod}`);

    // Create payment record
    const payment = await this.prisma.payment.create({
      data: {
        orderId: request.orderId,
        gateway: request.paymentMethod,
        method: request.paymentMethod,
        status: 'PENDING',
        amount: request.amount,
        currency: 'EGP',
        metadata: request.metadata || {},
      },
    });

    try {
      let result: PaymentResult;

      switch (request.paymentMethod) {
        case 'HEALTHPAY':
          result = await this.processHealthPayPayment(request, payment.id);
          break;

        case 'FAWRY':
        case 'FAWRY_PAY':
          result = await this.processFawryPayment(request, payment.id);
          break;

        case 'VODAFONE_CASH':
          result = await this.processVodafoneCashPayment(request, payment.id);
          break;

        case 'COD':
          result = await this.processCODPayment(request, payment.id);
          break;

        case 'CARD':
          result = await this.processCardPayment(request, payment.id);
          break;

        case 'INSTAPAY':
          result = await this.processInstaPayPayment(request, payment.id);
          break;

        case 'BANK_TRANSFER':
          result = await this.processBankTransferPayment(request, payment.id);
          break;

        default:
          throw new BadRequestException(`طريقة الدفع غير مدعومة: ${request.paymentMethod}`);
      }

      // Update payment record with gateway response
      await this.prisma.payment.update({
        where: { id: payment.id },
        data: {
          transactionId: result.transactionId,
          referenceNumber: result.referenceNumber,
          status: result.status as any,
          gatewayResponse: result as any,
        },
      });

      return {
        ...result,
        paymentId: payment.id,
      };
    } catch (error) {
      // Update payment status to failed
      await this.prisma.payment.update({
        where: { id: payment.id },
        data: {
          status: 'FAILED',
          failureReason: error.message,
        },
      });

      throw error;
    }
  }

  /**
   * Process HealthPay payment
   */
  private async processHealthPayPayment(request: PaymentRequest, paymentId: string): Promise<PaymentResult> {
    const callbackUrl = `${process.env.API_URL}/api/v1/webhooks/payments/healthpay/${request.tenantId}`;
    
    const dto: HealthPayDto = {
      orderId: request.orderId,
      orderNumber: request.orderNumber,
      amount: request.amount,
      customerName: request.customer.name,
      customerEmail: request.customer.email,
      customerPhone: request.customer.phone,
      returnUrl: request.returnUrl,
      callbackUrl: request.callbackUrl || callbackUrl,
      metadata: { ...request.metadata, paymentId },
    };

    const response = await this.healthPayService.createPayment(dto);

    return {
      success: response.success,
      transactionId: response.transactionId,
      referenceNumber: response.referenceNumber,
      paymentUrl: response.paymentUrl,
      qrCode: response.qrCode,
      status: response.status || 'PENDING',
      message: response.message,
      gateway: 'HEALTHPAY',
      instructions: 'Complete payment via the HealthPay link or scan the QR code',
      instructionsAr: 'أكمل الدفع عبر رابط هيلث باي أو امسح رمز QR',
    };
  }

  /**
   * Process Fawry payment
   */
  private async processFawryPayment(request: PaymentRequest, paymentId: string): Promise<PaymentResult> {
    const dto: FawryChargeRequest = {
      orderId: request.orderId,
      orderNumber: request.orderNumber,
      amount: request.amount,
      customerName: request.customer.name,
      customerEmail: request.customer.email || 'customer@wasslchat.com',
      customerPhone: request.customer.phone,
      items: request.items?.map((item) => ({
        itemId: item.id,
        description: item.name,
        price: item.price,
        quantity: item.quantity,
      })) || [{
        itemId: request.orderId,
        description: `Order #${request.orderNumber}`,
        price: request.amount,
        quantity: 1,
      }],
      paymentMethod: 'PAYATFAWRY',
      returnUrl: request.returnUrl,
      paymentExpiry: 24, // 24 hours
    };

    const response = await this.fawryService.createCharge(dto);

    const expiresAt = response.expirationTime 
      ? new Date(response.expirationTime) 
      : new Date(Date.now() + 24 * 60 * 60 * 1000);

    return {
      success: response.success,
      transactionId: response.fawryRefNumber,
      referenceNumber: response.referenceNumber,
      status: response.status || 'PENDING',
      expiresAt,
      gateway: 'FAWRY',
      instructions: `Pay at any Fawry outlet using reference number: ${response.referenceNumber}`,
      instructionsAr: `ادفع في أي منفذ فوري باستخدام الرقم المرجعي: ${response.referenceNumber}`,
    };
  }

  /**
   * Process Vodafone Cash payment
   */
  private async processVodafoneCashPayment(request: PaymentRequest, paymentId: string): Promise<PaymentResult> {
    const callbackUrl = `${process.env.API_URL}/api/v1/webhooks/payments/vodafone/${request.tenantId}`;

    const dto: VodafoneCashPaymentRequest = {
      orderId: request.orderId,
      amount: request.amount,
      customerPhone: request.customer.phone,
      description: `Payment for order #${request.orderNumber}`,
      callbackUrl: request.callbackUrl || callbackUrl,
    };

    const response = await this.vodafoneCashService.initiatePayment(dto);

    return {
      success: response.success,
      transactionId: response.transactionId,
      referenceNumber: response.referenceNumber,
      ussdCode: response.ussdCode,
      status: response.status || 'PENDING',
      message: response.message,
      gateway: 'VODAFONE_CASH',
      instructions: 'Confirm payment on your phone when prompted',
      instructionsAr: 'أكد الدفع على هاتفك عند الطلب',
    };
  }

  /**
   * Process Cash on Delivery
   */
  private async processCODPayment(request: PaymentRequest, paymentId: string): Promise<PaymentResult> {
    const referenceNumber = `COD-${request.orderNumber}`;

    return {
      success: true,
      referenceNumber,
      status: 'PENDING',
      gateway: 'COD',
      instructions: 'Payment will be collected upon delivery',
      instructionsAr: 'سيتم تحصيل المبلغ عند الاستلام',
    };
  }

  /**
   * Process Card payment via Fawry
   */
  private async processCardPayment(request: PaymentRequest, paymentId: string): Promise<PaymentResult> {
    const dto: FawryChargeRequest = {
      orderId: request.orderId,
      orderNumber: request.orderNumber,
      amount: request.amount,
      customerName: request.customer.name,
      customerEmail: request.customer.email || 'customer@wasslchat.com',
      customerPhone: request.customer.phone,
      items: [{
        itemId: request.orderId,
        description: `Order #${request.orderNumber}`,
        price: request.amount,
        quantity: 1,
      }],
      paymentMethod: 'CARD',
      returnUrl: request.returnUrl,
    };

    const response = await this.fawryService.createCardPayment(dto);

    return {
      success: response.success,
      transactionId: response.fawryRefNumber,
      referenceNumber: response.referenceNumber,
      paymentUrl: response.paymentUrl,
      status: response.status || 'PENDING',
      gateway: 'FAWRY_CARD',
      instructions: 'Complete card payment via the secure link',
      instructionsAr: 'أكمل الدفع بالبطاقة عبر الرابط الآمن',
    };
  }

  /**
   * Process InstaPay payment
   */
  private async processInstaPayPayment(request: PaymentRequest, paymentId: string): Promise<PaymentResult> {
    // InstaPay uses HealthPay as aggregator
    const callbackUrl = `${process.env.API_URL}/api/v1/webhooks/payments/healthpay/${request.tenantId}`;
    
    const dto: HealthPayDto = {
      orderId: request.orderId,
      orderNumber: request.orderNumber,
      amount: request.amount,
      customerName: request.customer.name,
      customerEmail: request.customer.email,
      customerPhone: request.customer.phone,
      returnUrl: request.returnUrl,
      callbackUrl: request.callbackUrl || callbackUrl,
      metadata: { 
        ...request.metadata, 
        paymentId,
        paymentMethod: 'INSTAPAY',
      },
    };

    const response = await this.healthPayService.createPayment(dto);

    return {
      success: response.success,
      transactionId: response.transactionId,
      referenceNumber: response.referenceNumber,
      paymentUrl: response.paymentUrl,
      qrCode: response.qrCode,
      status: response.status || 'PENDING',
      gateway: 'INSTAPAY',
      instructions: 'Complete payment via InstaPay',
      instructionsAr: 'أكمل الدفع عبر إنستا باي',
    };
  }

  /**
   * Process Bank Transfer payment
   */
  private async processBankTransferPayment(request: PaymentRequest, paymentId: string): Promise<PaymentResult> {
    const referenceNumber = `BT-${request.orderNumber}`;

    // Get merchant bank details from tenant settings
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: request.tenantId },
      select: { settings: true },
    });

    const bankDetails = (tenant?.settings as any)?.bankDetails || {
      bankName: 'البنك الأهلي المصري',
      accountName: 'شركة واصل شات',
      accountNumber: 'XXXX-XXXX-XXXX-XXXX',
      iban: 'EG00 0000 0000 0000 0000 0000 0000',
    };

    return {
      success: true,
      referenceNumber,
      status: 'PENDING',
      gateway: 'BANK_TRANSFER',
      instructions: `Transfer ${request.amount} EGP to:\nBank: ${bankDetails.bankName}\nAccount: ${bankDetails.accountNumber}\nReference: ${referenceNumber}`,
      instructionsAr: `حوّل ${request.amount} جنيه إلى:\nالبنك: ${bankDetails.bankName}\nرقم الحساب: ${bankDetails.accountNumber}\nالمرجع: ${referenceNumber}`,
    };
  }

  /**
   * Get payment status
   */
  async getPaymentStatus(paymentId: string): Promise<PaymentResult> {
    const payment = await this.prisma.payment.findUnique({
      where: { id: paymentId },
    });

    if (!payment) {
      throw new BadRequestException('Payment not found');
    }

    let gatewayStatus;

    switch (payment.gateway) {
      case 'HEALTHPAY':
        if (payment.transactionId) {
          gatewayStatus = await this.healthPayService.getPaymentStatus(payment.transactionId);
        }
        break;

      case 'FAWRY':
      case 'FAWRY_PAY':
        if (payment.referenceNumber) {
          gatewayStatus = await this.fawryService.getPaymentStatus(payment.referenceNumber);
        }
        break;

      case 'VODAFONE_CASH':
        if (payment.transactionId) {
          gatewayStatus = await this.vodafoneCashService.getPaymentStatus(payment.transactionId);
        }
        break;
    }

    return {
      success: true,
      paymentId: payment.id,
      transactionId: payment.transactionId,
      referenceNumber: payment.referenceNumber,
      status: gatewayStatus?.status || payment.status,
      gateway: payment.gateway,
    };
  }

  /**
   * Process refund
   */
  async processRefund(paymentId: string, amount?: number, reason?: string): Promise<PaymentResult> {
    const payment = await this.prisma.payment.findUnique({
      where: { id: paymentId },
    });

    if (!payment) {
      throw new BadRequestException('Payment not found');
    }

    if (payment.status !== 'PAID') {
      throw new BadRequestException('Can only refund paid payments');
    }

    const refundAmount = amount || Number(payment.amount);
    let result;

    switch (payment.gateway) {
      case 'HEALTHPAY':
        result = await this.healthPayService.refund({
          transactionId: payment.transactionId,
          amount: refundAmount,
          reason,
        });
        break;

      case 'FAWRY':
      case 'FAWRY_PAY':
        result = await this.fawryService.refund(payment.referenceNumber, refundAmount, reason);
        break;

      case 'VODAFONE_CASH':
        result = await this.vodafoneCashService.refund(payment.transactionId, refundAmount, reason);
        break;

      case 'COD':
      case 'BANK_TRANSFER':
        // Manual refund process
        result = { success: true, status: 'PENDING_MANUAL' };
        break;

      default:
        throw new BadRequestException('Refund not supported for this payment method');
    }

    // Update payment record
    if (result.success) {
      await this.prisma.payment.update({
        where: { id: paymentId },
        data: {
          status: refundAmount >= Number(payment.amount) ? 'REFUNDED' : 'PARTIALLY_REFUNDED',
          refundedAt: new Date(),
          refundAmount,
        },
      });
    }

    return {
      success: result.success,
      paymentId,
      status: result.status,
      gateway: payment.gateway,
      message: result.message,
    };
  }
}
