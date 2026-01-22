import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { firstValueFrom } from 'rxjs';

/**
 * Bosta Shipping Integration
 * 
 * Bosta is a leading Egyptian logistics company offering:
 * - Same-day and next-day delivery
 * - Cash on delivery (COD)
 * - Return logistics
 * - Real-time tracking
 * 
 * API Docs: https://developers.bosta.co/
 */

export interface BostaConfig {
  apiUrl: string;
  apiKey: string;
}

export interface BostaDeliveryRequest {
  orderId: string;
  orderNumber: string;
  receiver: {
    firstName: string;
    lastName: string;
    phone: string;
    email?: string;
  };
  dropOffAddress: {
    firstLine: string;
    secondLine?: string;
    city: string;
    zone?: string;
    district?: string;
    buildingNumber?: string;
    floor?: string;
    apartment?: string;
  };
  type?: number; // 10: Deliver, 15: Exchange, 25: Return, 30: Cash Collection
  specs?: {
    packageDetails?: {
      itemsCount?: number;
      description?: string;
    };
    size?: 'SMALL' | 'MEDIUM' | 'LARGE' | 'X_LARGE';
    weight?: number;
  };
  cod?: number;
  notes?: string;
  allowToOpenPackage?: boolean;
  businessReference?: string;
}

export interface BostaDeliveryResponse {
  success: boolean;
  trackingNumber?: string;
  message?: string;
  data?: any;
}

@Injectable()
export class BostaService {
  private readonly logger = new Logger(BostaService.name);
  private readonly config: BostaConfig;

  constructor(
    private readonly configService: ConfigService,
    private readonly httpService: HttpService,
  ) {
    this.config = {
      apiUrl: configService.get<string>('BOSTA_API_URL', 'https://app.bosta.co/api/v2'),
      apiKey: configService.get<string>('BOSTA_API_KEY', ''),
    };
  }

  private get headers() {
    return {
      'Content-Type': 'application/json',
      'Authorization': this.config.apiKey,
    };
  }

  /**
   * Create a delivery order
   */
  async createDelivery(dto: BostaDeliveryRequest): Promise<BostaDeliveryResponse> {
    try {
      const payload = {
        type: dto.type || 10, // Default: Deliver
        specs: {
          packageDetails: {
            itemsCount: dto.specs?.packageDetails?.itemsCount || 1,
            description: dto.specs?.packageDetails?.description || 'Package',
          },
          size: dto.specs?.size || 'SMALL',
          weight: dto.specs?.weight,
        },
        notes: dto.notes,
        cod: dto.cod || 0,
        dropOffAddress: {
          firstLine: dto.dropOffAddress.firstLine,
          secondLine: dto.dropOffAddress.secondLine,
          city: this.mapToBostaCity(dto.dropOffAddress.city),
          zone: dto.dropOffAddress.zone,
          district: dto.dropOffAddress.district,
          buildingNumber: dto.dropOffAddress.buildingNumber,
          floor: dto.dropOffAddress.floor,
          apartment: dto.dropOffAddress.apartment,
        },
        receiver: {
          firstName: dto.receiver.firstName,
          lastName: dto.receiver.lastName,
          phone: this.formatEgyptianPhone(dto.receiver.phone),
          email: dto.receiver.email,
        },
        businessReference: dto.businessReference || dto.orderNumber,
        allowToOpenPackage: dto.allowToOpenPackage ?? true,
      };

      this.logger.debug(`Creating Bosta delivery: ${JSON.stringify(payload)}`);

      const response = await firstValueFrom(
        this.httpService.post(
          `${this.config.apiUrl}/deliveries`,
          payload,
          { headers: this.headers },
        ),
      );

      return {
        success: true,
        trackingNumber: response.data.trackingNumber || response.data._id,
        data: response.data,
      };
    } catch (error) {
      this.logger.error(`Bosta createDelivery error: ${error.message}`);
      const errorMsg = error.response?.data?.message || error.message;
      throw new BadRequestException(`فشل في إنشاء شحنة بوسطة: ${errorMsg}`);
    }
  }

  /**
   * Get delivery details
   */
  async getDelivery(trackingNumber: string): Promise<any> {
    try {
      const response = await firstValueFrom(
        this.httpService.get(
          `${this.config.apiUrl}/deliveries/${trackingNumber}`,
          { headers: this.headers },
        ),
      );
      return response.data;
    } catch (error) {
      this.logger.error(`Bosta getDelivery error: ${error.message}`);
      throw new BadRequestException('فشل في جلب بيانات الشحنة');
    }
  }

  /**
   * Track delivery
   */
  async trackDelivery(trackingNumber: string): Promise<{
    status: string;
    statusAr: string;
    history: Array<{
      state: string;
      stateAr: string;
      timestamp: Date;
      notes?: string;
    }>;
  }> {
    try {
      const response = await firstValueFrom(
        this.httpService.get(
          `${this.config.apiUrl}/deliveries/${trackingNumber}/tracking`,
          { headers: this.headers },
        ),
      );

      const data = response.data;
      const currentState = data.CurrentStatus?.state || data.state;

      return {
        status: currentState,
        statusAr: this.translateBostaState(currentState),
        history: (data.TransitEvents || []).map((event: any) => ({
          state: event.state,
          stateAr: this.translateBostaState(event.state),
          timestamp: new Date(event.timestamp),
          notes: event.notes,
        })),
      };
    } catch (error) {
      this.logger.error(`Bosta trackDelivery error: ${error.message}`);
      throw new BadRequestException('فشل في تتبع الشحنة');
    }
  }

  /**
   * Update delivery
   */
  async updateDelivery(trackingNumber: string, updates: Partial<BostaDeliveryRequest>): Promise<any> {
    try {
      const response = await firstValueFrom(
        this.httpService.patch(
          `${this.config.apiUrl}/deliveries/${trackingNumber}`,
          updates,
          { headers: this.headers },
        ),
      );
      return response.data;
    } catch (error) {
      this.logger.error(`Bosta updateDelivery error: ${error.message}`);
      throw new BadRequestException('فشل في تحديث الشحنة');
    }
  }

  /**
   * Terminate (cancel) delivery
   */
  async terminateDelivery(trackingNumber: string): Promise<{ success: boolean }> {
    try {
      await firstValueFrom(
        this.httpService.delete(
          `${this.config.apiUrl}/deliveries/${trackingNumber}`,
          { headers: this.headers },
        ),
      );
      return { success: true };
    } catch (error) {
      this.logger.error(`Bosta terminateDelivery error: ${error.message}`);
      throw new BadRequestException('فشل في إلغاء الشحنة');
    }
  }

  /**
   * Get cities list
   */
  async getCities(): Promise<Array<{ name: string; nameAr: string; zones?: any[] }>> {
    try {
      const response = await firstValueFrom(
        this.httpService.get(
          `${this.config.apiUrl}/cities`,
          { headers: this.headers },
        ),
      );
      return response.data;
    } catch (error) {
      this.logger.error(`Bosta getCities error: ${error.message}`);
      return [];
    }
  }

  /**
   * Get zones for a city
   */
  async getZones(cityId: string): Promise<any[]> {
    try {
      const response = await firstValueFrom(
        this.httpService.get(
          `${this.config.apiUrl}/cities/${cityId}/zones`,
          { headers: this.headers },
        ),
      );
      return response.data;
    } catch (error) {
      this.logger.error(`Bosta getZones error: ${error.message}`);
      return [];
    }
  }

  /**
   * Print AWB (shipping label)
   */
  async printAwb(trackingNumbers: string[]): Promise<string> {
    try {
      const response = await firstValueFrom(
        this.httpService.post(
          `${this.config.apiUrl}/deliveries/awb`,
          { trackingNumbers },
          { headers: this.headers },
        ),
      );
      return response.data.url || response.data;
    } catch (error) {
      this.logger.error(`Bosta printAwb error: ${error.message}`);
      throw new BadRequestException('فشل في طباعة بوليصة الشحن');
    }
  }

  /**
   * Calculate shipping price
   */
  async calculatePrice(params: {
    type: number;
    cod?: number;
    size?: string;
    dropOffCity: string;
  }): Promise<{ price: number }> {
    try {
      const response = await firstValueFrom(
        this.httpService.post(
          `${this.config.apiUrl}/pricing/shipment`,
          params,
          { headers: this.headers },
        ),
      );
      return { price: response.data.price || response.data };
    } catch (error) {
      this.logger.error(`Bosta calculatePrice error: ${error.message}`);
      return { price: 0 };
    }
  }

  /**
   * Handle Bosta webhook
   */
  parseWebhookPayload(payload: any): {
    event: string;
    trackingNumber: string;
    businessReference: string;
    state: string;
    stateAr: string;
    timestamp: Date;
    notes?: string;
  } {
    return {
      event: payload.event || 'delivery.state_update',
      trackingNumber: payload.trackingNumber || payload.delivery?.trackingNumber,
      businessReference: payload.businessReference || payload.delivery?.businessReference,
      state: payload.state || payload.CurrentStatus?.state,
      stateAr: this.translateBostaState(payload.state || payload.CurrentStatus?.state),
      timestamp: new Date(payload.timestamp || payload.updatedAt),
      notes: payload.notes,
    };
  }

  // ============= Private Helpers =============

  private formatEgyptianPhone(phone: string): string {
    let cleaned = phone.replace(/\D/g, '');
    if (cleaned.startsWith('20')) {
      cleaned = '0' + cleaned.substring(2);
    }
    if (!cleaned.startsWith('0')) {
      cleaned = '0' + cleaned;
    }
    return cleaned;
  }

  private mapToBostaCity(city: string): string {
    // Map common city names to Bosta format
    const cityMap: Record<string, string> = {
      'القاهرة': 'Cairo',
      'الجيزة': 'Giza',
      'الإسكندرية': 'Alexandria',
      'المنصورة': 'Mansoura',
      'طنطا': 'Tanta',
      'الزقازيق': 'Zagazig',
      'دمياط': 'Damietta',
      'بورسعيد': 'Port Said',
      'السويس': 'Suez',
      'الإسماعيلية': 'Ismailia',
      'أسيوط': 'Assiut',
      'سوهاج': 'Sohag',
      'الأقصر': 'Luxor',
      'أسوان': 'Aswan',
    };
    return cityMap[city] || city;
  }

  private translateBostaState(state: string): string {
    const stateMap: Record<string, string> = {
      'TICKET_CREATED': 'تم إنشاء الطلب',
      'PACKAGE_RECEIVED': 'تم استلام الطرد',
      'NOT_YET_SHIPPED': 'لم يتم الشحن بعد',
      'IN_TRANSIT': 'في الطريق',
      'OUT_FOR_DELIVERY': 'جاري التوصيل',
      'DELIVERED': 'تم التسليم',
      'WAITING_FOR_CUSTOMER_ACTION': 'في انتظار العميل',
      'DELIVERY_FAILED': 'فشل التوصيل',
      'RETURNED_TO_BUSINESS': 'مرتجع للتاجر',
      'TERMINATED': 'ملغي',
      'EXCEPTION': 'استثناء',
    };
    return stateMap[state?.toUpperCase()] || state || 'غير محدد';
  }
}
