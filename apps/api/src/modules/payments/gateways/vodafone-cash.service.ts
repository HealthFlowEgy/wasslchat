import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import * as crypto from 'crypto';

/**
 * Vodafone Cash Payment Integration
 * 
 * Vodafone Cash is Egypt's largest mobile wallet with 15M+ users
 * Supports: USSD push, QR code, and API integration
 */

export interface VodafoneCashConfig {
  apiUrl: string;
  merchantId: string;
  terminalId: string;
  secretKey: string;
  pin?: string;
}

export interface VodafoneCashPaymentRequest {
  orderId: string;
  amount: number;
  customerPhone: string;
  description?: string;
  callbackUrl?: string;
}

export interface VodafoneCashResponse {
  success: boolean;
  transactionId?: string;
  referenceNumber?: string;
  status?: string;
  message?: string;
  ussdCode?: string;
  rawResponse?: any;
}

@Injectable()
export class VodafoneCashService {
  private readonly logger = new Logger(VodafoneCashService.name);
  private readonly config: VodafoneCashConfig;

  constructor(
    private readonly configService: ConfigService,
    private readonly httpService: HttpService,
  ) {
    this.config = {
      apiUrl: configService.get<string>('VODAFONE_CASH_API_URL', 'https://api.vodafonecash.com.eg'),
      merchantId: configService.get<string>('VODAFONE_MERCHANT_ID', ''),
      terminalId: configService.get<string>('VODAFONE_TERMINAL_ID', ''),
      secretKey: configService.get<string>('VODAFONE_SECRET_KEY', ''),
      pin: configService.get<string>('VODAFONE_PIN', ''),
    };
  }

  /**
   * Initiate payment request
   * Sends USSD push notification to customer's phone
   */
  async initiatePayment(dto: VodafoneCashPaymentRequest): Promise<VodafoneCashResponse> {
    try {
      const customerPhone = this.formatVodafoneNumber(dto.customerPhone);
      
      // Validate Vodafone number
      if (!this.isVodafoneNumber(customerPhone)) {
        throw new BadRequestException('رقم الهاتف ليس رقم فودافون');
      }

      const timestamp = Date.now();
      const signature = this.generateSignature({
        merchantId: this.config.merchantId,
        orderId: dto.orderId,
        amount: dto.amount,
        customerPhone,
        timestamp,
      });

      const payload = {
        merchant_id: this.config.merchantId,
        terminal_id: this.config.terminalId,
        order_id: dto.orderId,
        amount: dto.amount.toFixed(2),
        currency: 'EGP',
        customer_msisdn: customerPhone,
        description: dto.description || 'Payment',
        callback_url: dto.callbackUrl,
        timestamp,
        signature,
      };

      this.logger.debug(`Initiating Vodafone Cash payment: ${JSON.stringify(payload)}`);

      const response = await firstValueFrom(
        this.httpService.post(
          `${this.config.apiUrl}/api/v1/merchant/payment/initiate`,
          payload,
          {
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${this.config.secretKey}`,
            },
          },
        ),
      );

      const data = response.data;

      if (data.success || data.status === 'SUCCESS') {
        return {
          success: true,
          transactionId: data.transaction_id,
          referenceNumber: data.reference_number,
          status: 'PENDING',
          message: 'تم إرسال طلب الدفع. يرجى تأكيد الدفع من هاتفك',
          ussdCode: data.ussd_code,
          rawResponse: data,
        };
      }

      return {
        success: false,
        status: 'FAILED',
        message: data.message || 'فشل في إرسال طلب الدفع',
        rawResponse: data,
      };
    } catch (error) {
      this.logger.error(`Vodafone Cash initiate error: ${error.message}`);
      
      if (error instanceof BadRequestException) {
        throw error;
      }
      
      throw new BadRequestException('فشل في إنشاء طلب الدفع عبر فودافون كاش');
    }
  }

  /**
   * Check payment status
   */
  async getPaymentStatus(transactionId: string): Promise<VodafoneCashResponse> {
    try {
      const response = await firstValueFrom(
        this.httpService.get(
          `${this.config.apiUrl}/api/v1/merchant/payment/status/${transactionId}`,
          {
            headers: {
              'Authorization': `Bearer ${this.config.secretKey}`,
            },
          },
        ),
      );

      const data = response.data;

      return {
        success: true,
        transactionId: data.transaction_id,
        referenceNumber: data.reference_number,
        status: this.mapVodafoneStatus(data.status),
        rawResponse: data,
      };
    } catch (error) {
      this.logger.error(`Vodafone Cash status error: ${error.message}`);
      return {
        success: false,
        status: 'UNKNOWN',
        message: 'Failed to get payment status',
      };
    }
  }

  /**
   * Process refund
   */
  async refund(transactionId: string, amount: number, reason?: string): Promise<VodafoneCashResponse> {
    try {
      const payload = {
        merchant_id: this.config.merchantId,
        transaction_id: transactionId,
        amount: amount.toFixed(2),
        reason: reason || 'Refund',
        pin: this.config.pin,
      };

      const response = await firstValueFrom(
        this.httpService.post(
          `${this.config.apiUrl}/api/v1/merchant/payment/refund`,
          payload,
          {
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${this.config.secretKey}`,
            },
          },
        ),
      );

      const data = response.data;

      return {
        success: data.success || data.status === 'SUCCESS',
        transactionId: data.refund_transaction_id,
        status: data.success ? 'REFUNDED' : 'FAILED',
        message: data.message,
        rawResponse: data,
      };
    } catch (error) {
      this.logger.error(`Vodafone Cash refund error: ${error.message}`);
      throw new BadRequestException('فشل في معالجة الاسترداد');
    }
  }

  /**
   * Verify callback signature
   */
  verifyCallbackSignature(payload: any, signature: string): boolean {
    const calculatedSignature = this.generateSignature({
      transactionId: payload.transaction_id,
      orderId: payload.order_id,
      amount: payload.amount,
      status: payload.status,
    });

    return calculatedSignature === signature;
  }

  /**
   * Parse callback payload
   */
  parseCallbackPayload(payload: any) {
    return {
      transactionId: payload.transaction_id,
      orderId: payload.order_id,
      amount: parseFloat(payload.amount),
      status: this.mapVodafoneStatus(payload.status),
      customerPhone: payload.customer_msisdn,
      paidAt: payload.paid_at,
      referenceNumber: payload.reference_number,
    };
  }

  // ============= Private Helper Methods =============

  private generateSignature(data: Record<string, any>): string {
    const sortedKeys = Object.keys(data).sort();
    const signatureString = sortedKeys
      .map((key) => `${key}=${data[key]}`)
      .join('&') + `&secret=${this.config.secretKey}`;

    return crypto
      .createHash('sha256')
      .update(signatureString)
      .digest('hex');
  }

  private formatVodafoneNumber(phone: string): string {
    let cleaned = phone.replace(/\D/g, '');

    // Remove country code if present
    if (cleaned.startsWith('20')) {
      cleaned = '0' + cleaned.substring(2);
    }

    // Add leading zero if missing
    if (!cleaned.startsWith('0')) {
      cleaned = '0' + cleaned;
    }

    return cleaned;
  }

  private isVodafoneNumber(phone: string): boolean {
    // Vodafone Egypt prefixes: 010, 011, 012
    const vodafonePrefixes = ['010', '011', '012'];
    return vodafonePrefixes.some((prefix) => phone.startsWith(prefix));
  }

  private mapVodafoneStatus(status: string): string {
    const statusMap: Record<string, string> = {
      'PENDING': 'PENDING',
      'INITIATED': 'PENDING',
      'SUCCESS': 'PAID',
      'PAID': 'PAID',
      'COMPLETED': 'PAID',
      'FAILED': 'FAILED',
      'CANCELLED': 'CANCELLED',
      'EXPIRED': 'EXPIRED',
      'REFUNDED': 'REFUNDED',
    };

    return statusMap[status?.toUpperCase()] || status?.toUpperCase() || 'UNKNOWN';
  }
}
