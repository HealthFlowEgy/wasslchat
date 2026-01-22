import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import * as crypto from 'crypto';

/**
 * Fawry Payment Gateway Integration
 * 
 * Sandbox: https://atfawry.fawrystaging.com
 * Production: https://www.atfawry.com
 * Docs: https://developer.fawrystaging.com/
 * 
 * Fawry is Egypt's leading payment network with 250,000+ retail points
 * Supporting: Reference Number (Pay at Fawry), Cards, E-wallets
 */

export interface FawryConfig {
  baseUrl: string;
  merchantCode: string;
  securityKey: string;
}

export interface FawryChargeRequest {
  orderId: string;
  orderNumber: string;
  amount: number;
  currency?: string;
  customerName: string;
  customerEmail: string;
  customerPhone: string;
  customerProfileId?: string;
  description?: string;
  items: Array<{
    itemId: string;
    description: string;
    price: number;
    quantity: number;
  }>;
  paymentMethod?: 'PAYATFAWRY' | 'CARD' | 'MWALLET' | 'CASHONDELIVERY';
  returnUrl?: string;
  chargeItems?: any[];
  paymentExpiry?: number; // hours
}

export interface FawryPaymentResponse {
  success: boolean;
  referenceNumber?: string;
  merchantRefNumber?: string;
  fawryRefNumber?: string;
  paymentUrl?: string;
  expirationTime?: number;
  status?: string;
  statusCode?: string;
  statusDescription?: string;
  rawResponse?: any;
}

@Injectable()
export class FawryService {
  private readonly logger = new Logger(FawryService.name);
  private readonly config: FawryConfig;

  constructor(
    private readonly configService: ConfigService,
    private readonly httpService: HttpService,
  ) {
    this.config = {
      baseUrl: configService.get<string>('FAWRY_BASE_URL', 'https://atfawry.fawrystaging.com'),
      merchantCode: configService.get<string>('FAWRY_MERCHANT_CODE', ''),
      securityKey: configService.get<string>('FAWRY_SECURITY_KEY', ''),
    };
  }

  /**
   * Create a charge request (Pay at Fawry reference number)
   */
  async createCharge(dto: FawryChargeRequest): Promise<FawryPaymentResponse> {
    try {
      const chargeItems = dto.items.map((item) => ({
        itemId: item.itemId,
        description: item.description,
        price: item.price.toFixed(2),
        quantity: item.quantity,
      }));

      const merchantRefNum = dto.orderNumber;
      const paymentExpiry = dto.paymentExpiry || 24; // 24 hours default
      
      // Generate signature
      const signature = this.generateChargeSignature({
        merchantCode: this.config.merchantCode,
        merchantRefNum,
        customerProfileId: dto.customerProfileId || dto.customerPhone,
        paymentMethod: dto.paymentMethod || 'PAYATFAWRY',
        amount: dto.amount,
        items: chargeItems,
      });

      const payload = {
        merchantCode: this.config.merchantCode,
        merchantRefNum,
        customerMobile: this.formatEgyptianPhone(dto.customerPhone),
        customerEmail: dto.customerEmail,
        customerName: dto.customerName,
        customerProfileId: dto.customerProfileId || dto.customerPhone,
        paymentMethod: dto.paymentMethod || 'PAYATFAWRY',
        amount: dto.amount.toFixed(2),
        currencyCode: dto.currency || 'EGP',
        description: dto.description || `Payment for order #${dto.orderNumber}`,
        chargeItems,
        paymentExpiry: paymentExpiry * 3600000, // Convert to milliseconds
        signature,
      };

      this.logger.debug(`Creating Fawry charge: ${JSON.stringify(payload)}`);

      const response = await firstValueFrom(
        this.httpService.post(
          `${this.config.baseUrl}/ECommerceWeb/Fawry/payments/charge`,
          payload,
          {
            headers: { 'Content-Type': 'application/json' },
          },
        ),
      );

      const data = response.data;

      if (data.statusCode === '200' || data.type === 'ChargeResponse') {
        return {
          success: true,
          referenceNumber: data.referenceNumber,
          merchantRefNumber: data.merchantRefNumber || merchantRefNum,
          fawryRefNumber: data.fawryRefNumber,
          expirationTime: data.expirationTime,
          status: 'PENDING',
          statusCode: data.statusCode,
          statusDescription: data.statusDescription || 'Charge created successfully',
          rawResponse: data,
        };
      }

      return {
        success: false,
        status: 'FAILED',
        statusCode: data.statusCode,
        statusDescription: data.statusDescription || 'Charge creation failed',
        rawResponse: data,
      };
    } catch (error) {
      this.logger.error(`Fawry createCharge error: ${error.message}`, error.stack);
      
      const errorMessage = error.response?.data?.statusDescription || error.message;
      throw new BadRequestException(`فشل في إنشاء طلب الدفع عبر فوري: ${errorMessage}`);
    }
  }

  /**
   * Create card payment (redirect to Fawry hosted page)
   */
  async createCardPayment(dto: FawryChargeRequest): Promise<FawryPaymentResponse> {
    const chargeResult = await this.createCharge({
      ...dto,
      paymentMethod: 'CARD',
    });

    if (chargeResult.success) {
      // Generate payment URL for card payments
      const paymentUrl = `${this.config.baseUrl}/ECommerceWeb/Fawry/payments/charge?` +
        `merchantCode=${this.config.merchantCode}` +
        `&merchantRefNumber=${chargeResult.merchantRefNumber}` +
        `&returnUrl=${encodeURIComponent(dto.returnUrl || '')}`;

      return {
        ...chargeResult,
        paymentUrl,
      };
    }

    return chargeResult;
  }

  /**
   * Get payment status
   */
  async getPaymentStatus(merchantRefNumber: string): Promise<FawryPaymentResponse> {
    try {
      const signature = this.generateStatusSignature(merchantRefNumber);

      const response = await firstValueFrom(
        this.httpService.get(
          `${this.config.baseUrl}/ECommerceWeb/Fawry/payments/status/v2`,
          {
            params: {
              merchantCode: this.config.merchantCode,
              merchantRefNumber,
              signature,
            },
          },
        ),
      );

      const data = response.data;

      return {
        success: data.statusCode === '200',
        referenceNumber: data.referenceNumber,
        merchantRefNumber: data.merchantRefNumber,
        fawryRefNumber: data.fawryRefNumber,
        status: this.mapFawryStatus(data.paymentStatus),
        statusCode: data.statusCode,
        statusDescription: data.statusDescription,
        rawResponse: data,
      };
    } catch (error) {
      this.logger.error(`Fawry getPaymentStatus error: ${error.message}`);
      return {
        success: false,
        status: 'UNKNOWN',
        statusDescription: 'Failed to get payment status',
      };
    }
  }

  /**
   * Process refund
   */
  async refund(referenceNumber: string, amount: number, reason?: string): Promise<FawryPaymentResponse> {
    try {
      const signature = this.generateRefundSignature(referenceNumber, amount);

      const payload = {
        merchantCode: this.config.merchantCode,
        referenceNumber,
        refundAmount: amount.toFixed(2),
        reason: reason || 'Customer refund',
        signature,
      };

      const response = await firstValueFrom(
        this.httpService.post(
          `${this.config.baseUrl}/ECommerceWeb/Fawry/payments/refund`,
          payload,
          {
            headers: { 'Content-Type': 'application/json' },
          },
        ),
      );

      const data = response.data;

      return {
        success: data.statusCode === '200',
        referenceNumber: data.fawryRefNumber,
        status: data.statusCode === '200' ? 'REFUNDED' : 'FAILED',
        statusCode: data.statusCode,
        statusDescription: data.statusDescription,
        rawResponse: data,
      };
    } catch (error) {
      this.logger.error(`Fawry refund error: ${error.message}`);
      throw new BadRequestException('فشل في معالجة الاسترداد عبر فوري');
    }
  }

  /**
   * Verify webhook/callback signature
   */
  verifyCallbackSignature(
    fawryRefNumber: string,
    merchantRefNumber: string,
    paymentAmount: number,
    orderAmount: number,
    orderStatus: string,
    paymentMethod: string,
    paymentRefrenceNumber: string,
    receivedSignature: string,
  ): boolean {
    const signatureString = 
      fawryRefNumber +
      merchantRefNumber +
      paymentAmount.toFixed(2) +
      orderAmount.toFixed(2) +
      orderStatus +
      paymentMethod +
      (paymentRefrenceNumber || '') +
      this.config.securityKey;

    const calculatedSignature = crypto
      .createHash('sha256')
      .update(signatureString)
      .digest('hex');

    return calculatedSignature.toLowerCase() === receivedSignature.toLowerCase();
  }

  /**
   * Parse callback/webhook payload
   */
  parseCallbackPayload(payload: any) {
    return {
      fawryRefNumber: payload.fawryRefNumber,
      merchantRefNumber: payload.merchantRefNumber,
      orderAmount: parseFloat(payload.orderAmount),
      paymentAmount: parseFloat(payload.paymentAmount),
      orderStatus: payload.orderStatus,
      paymentMethod: payload.paymentMethod,
      paymentTime: payload.paymentTime,
      customerMobile: payload.customerMobile,
      customerMail: payload.customerMail,
      paymentRefrenceNumber: payload.paymentRefrenceNumber,
      status: this.mapFawryStatus(payload.orderStatus),
    };
  }

  // ============= Private Helper Methods =============

  private generateChargeSignature(data: {
    merchantCode: string;
    merchantRefNum: string;
    customerProfileId: string;
    paymentMethod: string;
    amount: number;
    items: any[];
  }): string {
    // Build items string
    const itemsString = data.items
      .map((item) => `${item.itemId}${item.quantity}${parseFloat(item.price).toFixed(2)}`)
      .join('');

    const signatureString =
      data.merchantCode +
      data.merchantRefNum +
      data.customerProfileId +
      data.paymentMethod +
      data.amount.toFixed(2) +
      itemsString +
      this.config.securityKey;

    return crypto
      .createHash('sha256')
      .update(signatureString)
      .digest('hex');
  }

  private generateStatusSignature(merchantRefNumber: string): string {
    const signatureString =
      this.config.merchantCode +
      merchantRefNumber +
      this.config.securityKey;

    return crypto
      .createHash('sha256')
      .update(signatureString)
      .digest('hex');
  }

  private generateRefundSignature(referenceNumber: string, amount: number): string {
    const signatureString =
      this.config.merchantCode +
      referenceNumber +
      amount.toFixed(2) +
      this.config.securityKey;

    return crypto
      .createHash('sha256')
      .update(signatureString)
      .digest('hex');
  }

  private formatEgyptianPhone(phone: string): string {
    let cleaned = phone.replace(/\D/g, '');
    
    // Ensure it starts with 01 for Egyptian mobile
    if (cleaned.startsWith('20')) {
      cleaned = '0' + cleaned.substring(2);
    }
    
    if (!cleaned.startsWith('0')) {
      cleaned = '0' + cleaned;
    }
    
    return cleaned;
  }

  private mapFawryStatus(status: string): string {
    const statusMap: Record<string, string> = {
      'NEW': 'PENDING',
      'UNPAID': 'PENDING',
      'PAID': 'PAID',
      'CANCELED': 'CANCELLED',
      'CANCELLED': 'CANCELLED',
      'REFUNDED': 'REFUNDED',
      'EXPIRED': 'EXPIRED',
      'FAILED': 'FAILED',
      'PARTIAL_REFUNDED': 'PARTIALLY_REFUNDED',
    };
    
    return statusMap[status?.toUpperCase()] || status?.toUpperCase() || 'UNKNOWN';
  }
}
