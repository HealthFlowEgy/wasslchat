import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import * as crypto from 'crypto';

/**
 * HealthPay Payment Gateway Integration
 * 
 * Portal: https://portal.beta.healthpay.tech/login
 * API Docs: https://documenter.getpostman.com/view/22876315/2sA3QmEv3i
 * 
 * HealthPay is a CBE-licensed Payment Service Provider (PSP) in Egypt
 * supporting wallet payments, card payments, and bank transfers.
 */

export interface HealthPayConfig {
  apiUrl: string;
  apiKey: string;
  merchantId: string;
  secretKey: string;
  webhookSecret?: string;
}

export interface CreatePaymentDto {
  orderId: string;
  orderNumber: string;
  amount: number;
  currency?: string;
  customerName: string;
  customerEmail?: string;
  customerPhone: string;
  description?: string;
  returnUrl?: string;
  callbackUrl?: string;
  metadata?: Record<string, any>;
}

export interface PaymentResponse {
  success: boolean;
  transactionId?: string;
  referenceNumber?: string;
  paymentUrl?: string;
  qrCode?: string;
  status?: string;
  message?: string;
  rawResponse?: any;
}

export interface RefundDto {
  transactionId: string;
  amount: number;
  reason?: string;
}

@Injectable()
export class HealthPayService {
  private readonly logger = new Logger(HealthPayService.name);
  private readonly config: HealthPayConfig;

  constructor(
    private readonly configService: ConfigService,
    private readonly httpService: HttpService,
  ) {
    this.config = {
      apiUrl: configService.get<string>('HEALTHPAY_API_URL', 'https://api.beta.healthpay.tech'),
      apiKey: configService.get<string>('HEALTHPAY_API_KEY', ''),
      merchantId: configService.get<string>('HEALTHPAY_MERCHANT_ID', ''),
      secretKey: configService.get<string>('HEALTHPAY_SECRET_KEY', ''),
      webhookSecret: configService.get<string>('HEALTHPAY_WEBHOOK_SECRET', ''),
    };
  }

  private get headers() {
    return {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${this.config.apiKey}`,
      'X-Merchant-ID': this.config.merchantId,
    };
  }

  /**
   * Create a new payment request
   * Generates a payment URL or QR code for the customer to complete payment
   */
  async createPayment(dto: CreatePaymentDto): Promise<PaymentResponse> {
    try {
      const payload = {
        merchant_id: this.config.merchantId,
        order_id: dto.orderId,
        order_number: dto.orderNumber,
        amount: dto.amount,
        currency: dto.currency || 'EGP',
        customer: {
          name: dto.customerName,
          email: dto.customerEmail,
          phone: this.formatEgyptianPhone(dto.customerPhone),
        },
        description: dto.description || `Payment for order #${dto.orderNumber}`,
        return_url: dto.returnUrl,
        callback_url: dto.callbackUrl,
        metadata: dto.metadata,
        signature: this.generateSignature({
          order_id: dto.orderId,
          amount: dto.amount,
          currency: dto.currency || 'EGP',
        }),
      };

      this.logger.debug(`Creating HealthPay payment: ${JSON.stringify(payload)}`);

      const response = await firstValueFrom(
        this.httpService.post(
          `${this.config.apiUrl}/v1/payments/create`,
          payload,
          { headers: this.headers },
        ),
      );

      const data = response.data;

      if (data.success || data.status === 'success') {
        return {
          success: true,
          transactionId: data.transaction_id || data.data?.transaction_id,
          referenceNumber: data.reference_number || data.data?.reference_number,
          paymentUrl: data.payment_url || data.data?.payment_url,
          qrCode: data.qr_code || data.data?.qr_code,
          status: 'PENDING',
          rawResponse: data,
        };
      }

      return {
        success: false,
        message: data.message || 'Payment creation failed',
        rawResponse: data,
      };
    } catch (error) {
      this.logger.error(`HealthPay createPayment error: ${error.message}`, error.stack);
      
      const errorMessage = error.response?.data?.message || error.message;
      throw new BadRequestException(`فشل في إنشاء طلب الدفع: ${errorMessage}`);
    }
  }

  /**
   * Create wallet payment (direct debit from HealthPay wallet)
   */
  async createWalletPayment(dto: CreatePaymentDto & { walletId: string }): Promise<PaymentResponse> {
    try {
      const payload = {
        merchant_id: this.config.merchantId,
        wallet_id: dto.walletId,
        order_id: dto.orderId,
        amount: dto.amount,
        currency: dto.currency || 'EGP',
        description: dto.description,
        callback_url: dto.callbackUrl,
        signature: this.generateSignature({
          wallet_id: dto.walletId,
          order_id: dto.orderId,
          amount: dto.amount,
        }),
      };

      const response = await firstValueFrom(
        this.httpService.post(
          `${this.config.apiUrl}/v1/wallet/debit`,
          payload,
          { headers: this.headers },
        ),
      );

      const data = response.data;

      return {
        success: data.success || data.status === 'success',
        transactionId: data.transaction_id,
        referenceNumber: data.reference_number,
        status: data.status,
        message: data.message,
        rawResponse: data,
      };
    } catch (error) {
      this.logger.error(`HealthPay wallet payment error: ${error.message}`);
      throw new BadRequestException('فشل في تنفيذ الدفع من المحفظة');
    }
  }

  /**
   * Check payment status
   */
  async getPaymentStatus(transactionId: string): Promise<PaymentResponse> {
    try {
      const response = await firstValueFrom(
        this.httpService.get(
          `${this.config.apiUrl}/v1/payments/${transactionId}/status`,
          { headers: this.headers },
        ),
      );

      const data = response.data;

      return {
        success: true,
        transactionId: data.transaction_id,
        referenceNumber: data.reference_number,
        status: this.mapPaymentStatus(data.status),
        rawResponse: data,
      };
    } catch (error) {
      this.logger.error(`HealthPay getPaymentStatus error: ${error.message}`);
      return {
        success: false,
        message: 'Failed to get payment status',
      };
    }
  }

  /**
   * Process refund
   */
  async refund(dto: RefundDto): Promise<PaymentResponse> {
    try {
      const payload = {
        merchant_id: this.config.merchantId,
        transaction_id: dto.transactionId,
        amount: dto.amount,
        reason: dto.reason || 'Customer refund',
        signature: this.generateSignature({
          transaction_id: dto.transactionId,
          amount: dto.amount,
        }),
      };

      const response = await firstValueFrom(
        this.httpService.post(
          `${this.config.apiUrl}/v1/payments/refund`,
          payload,
          { headers: this.headers },
        ),
      );

      const data = response.data;

      return {
        success: data.success || data.status === 'success',
        transactionId: data.refund_transaction_id,
        referenceNumber: data.reference_number,
        status: data.status,
        message: data.message,
        rawResponse: data,
      };
    } catch (error) {
      this.logger.error(`HealthPay refund error: ${error.message}`);
      throw new BadRequestException('فشل في معالجة الاسترداد');
    }
  }

  /**
   * Verify webhook signature
   */
  verifyWebhookSignature(payload: any, signature: string): boolean {
    if (!this.config.webhookSecret) {
      this.logger.warn('Webhook secret not configured');
      return true; // Skip verification if not configured
    }

    const calculatedSignature = this.generateWebhookSignature(payload);
    return crypto.timingSafeEqual(
      Buffer.from(signature),
      Buffer.from(calculatedSignature),
    );
  }

  /**
   * Parse webhook payload
   */
  parseWebhookPayload(payload: any) {
    return {
      event: payload.event || payload.type,
      transactionId: payload.transaction_id || payload.data?.transaction_id,
      orderId: payload.order_id || payload.data?.order_id,
      status: this.mapPaymentStatus(payload.status || payload.data?.status),
      amount: payload.amount || payload.data?.amount,
      paidAt: payload.paid_at || payload.data?.paid_at,
      referenceNumber: payload.reference_number || payload.data?.reference_number,
      raw: payload,
    };
  }

  /**
   * Get merchant balance
   */
  async getMerchantBalance(): Promise<{ available: number; pending: number; currency: string }> {
    try {
      const response = await firstValueFrom(
        this.httpService.get(
          `${this.config.apiUrl}/v1/merchant/balance`,
          { headers: this.headers },
        ),
      );

      return {
        available: response.data.available_balance || 0,
        pending: response.data.pending_balance || 0,
        currency: 'EGP',
      };
    } catch (error) {
      this.logger.error(`HealthPay getBalance error: ${error.message}`);
      return { available: 0, pending: 0, currency: 'EGP' };
    }
  }

  /**
   * List transactions
   */
  async listTransactions(params: {
    startDate?: string;
    endDate?: string;
    status?: string;
    page?: number;
    limit?: number;
  }) {
    try {
      const response = await firstValueFrom(
        this.httpService.get(
          `${this.config.apiUrl}/v1/transactions`,
          {
            headers: this.headers,
            params: {
              start_date: params.startDate,
              end_date: params.endDate,
              status: params.status,
              page: params.page || 1,
              per_page: params.limit || 20,
            },
          },
        ),
      );

      return response.data;
    } catch (error) {
      this.logger.error(`HealthPay listTransactions error: ${error.message}`);
      return { transactions: [], total: 0 };
    }
  }

  // ============= Private Helper Methods =============

  private generateSignature(data: Record<string, any>): string {
    const sortedKeys = Object.keys(data).sort();
    const signatureString = sortedKeys
      .map((key) => `${key}=${data[key]}`)
      .join('&');
    
    return crypto
      .createHmac('sha256', this.config.secretKey)
      .update(signatureString)
      .digest('hex');
  }

  private generateWebhookSignature(payload: any): string {
    const payloadString = typeof payload === 'string' 
      ? payload 
      : JSON.stringify(payload);
    
    return crypto
      .createHmac('sha256', this.config.webhookSecret)
      .update(payloadString)
      .digest('hex');
  }

  private formatEgyptianPhone(phone: string): string {
    let cleaned = phone.replace(/\D/g, '');
    
    if (cleaned.startsWith('0')) {
      cleaned = '20' + cleaned.substring(1);
    }
    
    if (!cleaned.startsWith('20') && cleaned.length === 10) {
      cleaned = '20' + cleaned;
    }
    
    return cleaned;
  }

  private mapPaymentStatus(status: string): string {
    const statusMap: Record<string, string> = {
      'pending': 'PENDING',
      'processing': 'PROCESSING',
      'completed': 'PAID',
      'paid': 'PAID',
      'success': 'PAID',
      'failed': 'FAILED',
      'cancelled': 'CANCELLED',
      'refunded': 'REFUNDED',
      'expired': 'EXPIRED',
    };
    
    return statusMap[status?.toLowerCase()] || status?.toUpperCase() || 'UNKNOWN';
  }
}
