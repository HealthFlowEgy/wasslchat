import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { firstValueFrom } from 'rxjs';

/**
 * WasslBox Shipping Integration
 * 
 * WasslBox is an Egyptian last-mile delivery and fulfillment platform
 * offering same-day and next-day delivery across Egypt.
 * 
 * Features:
 * - Shipment creation
 * - Live tracking
 * - COD collection
 * - Return handling
 * - Multi-city coverage
 */

export interface WasslBoxConfig {
  apiUrl: string;
  apiKey: string;
  merchantId: string;
}

export interface CreateShipmentDto {
  orderId: string;
  orderNumber: string;
  consignee: {
    name: string;
    phone: string;
    alternatePhone?: string;
    email?: string;
    address: string;
    city: string;
    area?: string;
    governorate: string;
    postalCode?: string;
    landmark?: string;
  };
  items: Array<{
    name: string;
    sku?: string;
    quantity: number;
    price: number;
  }>;
  codAmount?: number;
  weight?: number;
  dimensions?: { length: number; width: number; height: number };
  notes?: string;
  deliveryType?: 'SAME_DAY' | 'NEXT_DAY' | 'STANDARD';
  pickupRequired?: boolean;
  pickupAddress?: any;
}

export interface ShipmentResponse {
  success: boolean;
  shipmentId?: string;
  trackingNumber?: string;
  awb?: string;
  label?: string;
  estimatedDelivery?: Date;
  cost?: number;
  error?: string;
}

export interface TrackingEvent {
  status: string;
  statusAr: string;
  description: string;
  descriptionAr: string;
  location?: string;
  timestamp: Date;
}

@Injectable()
export class WasslBoxService {
  private readonly logger = new Logger(WasslBoxService.name);
  private readonly config: WasslBoxConfig;

  constructor(
    private readonly configService: ConfigService,
    private readonly httpService: HttpService,
  ) {
    this.config = {
      apiUrl: configService.get<string>('WASSLBOX_API_URL', 'https://api.wasslbox.com'),
      apiKey: configService.get<string>('WASSLBOX_API_KEY', ''),
      merchantId: configService.get<string>('WASSLBOX_MERCHANT_ID', ''),
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
   * Create a new shipment
   */
  async createShipment(dto: CreateShipmentDto): Promise<ShipmentResponse> {
    try {
      const payload = {
        merchant_id: this.config.merchantId,
        reference_id: dto.orderId,
        order_number: dto.orderNumber,
        consignee: {
          name: dto.consignee.name,
          phone: this.formatEgyptianPhone(dto.consignee.phone),
          alternate_phone: dto.consignee.alternatePhone 
            ? this.formatEgyptianPhone(dto.consignee.alternatePhone) 
            : undefined,
          email: dto.consignee.email,
          address: dto.consignee.address,
          city: dto.consignee.city,
          area: dto.consignee.area,
          governorate: dto.consignee.governorate,
          postal_code: dto.consignee.postalCode,
          landmark: dto.consignee.landmark,
        },
        items: dto.items.map((item) => ({
          name: item.name,
          sku: item.sku,
          quantity: item.quantity,
          price: item.price,
        })),
        cod_amount: dto.codAmount || 0,
        weight: dto.weight || 0.5,
        dimensions: dto.dimensions,
        notes: dto.notes,
        delivery_type: dto.deliveryType || 'STANDARD',
        pickup_required: dto.pickupRequired || false,
        pickup_address: dto.pickupAddress,
      };

      this.logger.debug(`Creating WasslBox shipment: ${JSON.stringify(payload)}`);

      const response = await firstValueFrom(
        this.httpService.post(
          `${this.config.apiUrl}/v1/shipments`,
          payload,
          { headers: this.headers },
        ),
      );

      const data = response.data;

      if (data.success || data.status === 'success') {
        return {
          success: true,
          shipmentId: data.shipment_id || data.data?.shipment_id,
          trackingNumber: data.tracking_number || data.data?.tracking_number,
          awb: data.awb || data.data?.awb,
          label: data.label_url || data.data?.label_url,
          estimatedDelivery: data.estimated_delivery 
            ? new Date(data.estimated_delivery) 
            : undefined,
          cost: data.shipping_cost || data.data?.shipping_cost,
        };
      }

      return {
        success: false,
        error: data.message || 'فشل في إنشاء الشحنة',
      };
    } catch (error) {
      this.logger.error(`WasslBox createShipment error: ${error.message}`);
      throw new BadRequestException('فشل في إنشاء شحنة واصل بوكس');
    }
  }

  /**
   * Get shipment tracking
   */
  async getTracking(trackingNumber: string): Promise<{
    status: string;
    statusAr: string;
    events: TrackingEvent[];
    currentLocation?: string;
    estimatedDelivery?: Date;
  }> {
    try {
      const response = await firstValueFrom(
        this.httpService.get(
          `${this.config.apiUrl}/v1/tracking/${trackingNumber}`,
          { headers: this.headers },
        ),
      );

      const data = response.data;
      const events = (data.events || data.data?.events || []).map((event: any) => ({
        status: event.status,
        statusAr: this.translateStatus(event.status),
        description: event.description,
        descriptionAr: event.description_ar || this.translateStatus(event.status),
        location: event.location,
        timestamp: new Date(event.timestamp),
      }));

      return {
        status: data.status || data.data?.status,
        statusAr: this.translateStatus(data.status || data.data?.status),
        events,
        currentLocation: data.current_location || data.data?.current_location,
        estimatedDelivery: data.estimated_delivery 
          ? new Date(data.estimated_delivery) 
          : undefined,
      };
    } catch (error) {
      this.logger.error(`WasslBox tracking error: ${error.message}`);
      throw new BadRequestException('فشل في جلب معلومات التتبع');
    }
  }

  /**
   * Cancel shipment
   */
  async cancelShipment(trackingNumber: string, reason?: string): Promise<{ success: boolean; message?: string }> {
    try {
      const response = await firstValueFrom(
        this.httpService.post(
          `${this.config.apiUrl}/v1/shipments/${trackingNumber}/cancel`,
          { reason },
          { headers: this.headers },
        ),
      );

      return {
        success: response.data.success || response.data.status === 'success',
        message: response.data.message,
      };
    } catch (error) {
      this.logger.error(`WasslBox cancel error: ${error.message}`);
      throw new BadRequestException('فشل في إلغاء الشحنة');
    }
  }

  /**
   * Calculate shipping cost
   */
  async calculateCost(params: {
    fromGovernorate: string;
    toGovernorate: string;
    toCity: string;
    weight: number;
    codAmount?: number;
    deliveryType?: 'SAME_DAY' | 'NEXT_DAY' | 'STANDARD';
  }): Promise<{
    cost: number;
    codFee: number;
    totalCost: number;
    estimatedDays: number;
  }> {
    try {
      const response = await firstValueFrom(
        this.httpService.post(
          `${this.config.apiUrl}/v1/calculate`,
          {
            from_governorate: params.fromGovernorate,
            to_governorate: params.toGovernorate,
            to_city: params.toCity,
            weight: params.weight,
            cod_amount: params.codAmount || 0,
            delivery_type: params.deliveryType || 'STANDARD',
          },
          { headers: this.headers },
        ),
      );

      const data = response.data;

      return {
        cost: data.shipping_cost || 0,
        codFee: data.cod_fee || 0,
        totalCost: data.total_cost || 0,
        estimatedDays: data.estimated_days || 3,
      };
    } catch (error) {
      this.logger.error(`WasslBox calculate error: ${error.message}`);
      throw new BadRequestException('فشل في حساب تكلفة الشحن');
    }
  }

  /**
   * Get available cities/areas for a governorate
   */
  async getCities(governorate: string): Promise<Array<{ name: string; nameAr: string; areas?: string[] }>> {
    try {
      const response = await firstValueFrom(
        this.httpService.get(
          `${this.config.apiUrl}/v1/cities`,
          {
            headers: this.headers,
            params: { governorate },
          },
        ),
      );

      return response.data.cities || response.data.data?.cities || [];
    } catch (error) {
      this.logger.error(`WasslBox getCities error: ${error.message}`);
      return [];
    }
  }

  /**
   * Get list of supported governorates
   */
  async getGovernorates(): Promise<Array<{ code: string; name: string; nameAr: string }>> {
    try {
      const response = await firstValueFrom(
        this.httpService.get(
          `${this.config.apiUrl}/v1/governorates`,
          { headers: this.headers },
        ),
      );

      return response.data.governorates || response.data.data?.governorates || [];
    } catch (error) {
      this.logger.error(`WasslBox getGovernorates error: ${error.message}`);
      // Return default Egyptian governorates
      return this.getDefaultGovernorates();
    }
  }

  /**
   * Request pickup
   */
  async requestPickup(params: {
    shipmentIds: string[];
    pickupDate: Date;
    pickupAddress?: any;
    notes?: string;
  }): Promise<{ success: boolean; pickupId?: string; message?: string }> {
    try {
      const response = await firstValueFrom(
        this.httpService.post(
          `${this.config.apiUrl}/v1/pickups`,
          {
            merchant_id: this.config.merchantId,
            shipment_ids: params.shipmentIds,
            pickup_date: params.pickupDate.toISOString(),
            pickup_address: params.pickupAddress,
            notes: params.notes,
          },
          { headers: this.headers },
        ),
      );

      return {
        success: response.data.success,
        pickupId: response.data.pickup_id,
        message: response.data.message,
      };
    } catch (error) {
      this.logger.error(`WasslBox requestPickup error: ${error.message}`);
      throw new BadRequestException('فشل في طلب الاستلام');
    }
  }

  /**
   * Get shipping label (AWB)
   */
  async getLabel(trackingNumber: string, format: 'PDF' | 'ZPL' = 'PDF'): Promise<string> {
    try {
      const response = await firstValueFrom(
        this.httpService.get(
          `${this.config.apiUrl}/v1/shipments/${trackingNumber}/label`,
          {
            headers: this.headers,
            params: { format },
          },
        ),
      );

      return response.data.label_url || response.data.data?.label_url;
    } catch (error) {
      this.logger.error(`WasslBox getLabel error: ${error.message}`);
      throw new BadRequestException('فشل في جلب بوليصة الشحن');
    }
  }

  /**
   * Handle webhook from WasslBox
   */
  parseWebhookPayload(payload: any): {
    event: string;
    trackingNumber: string;
    orderId: string;
    status: string;
    statusAr: string;
    timestamp: Date;
    location?: string;
    notes?: string;
  } {
    return {
      event: payload.event || payload.type,
      trackingNumber: payload.tracking_number || payload.data?.tracking_number,
      orderId: payload.reference_id || payload.data?.reference_id,
      status: payload.status || payload.data?.status,
      statusAr: this.translateStatus(payload.status || payload.data?.status),
      timestamp: new Date(payload.timestamp || payload.data?.timestamp),
      location: payload.location || payload.data?.location,
      notes: payload.notes || payload.data?.notes,
    };
  }

  // ============= Private Helpers =============

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

  private translateStatus(status: string): string {
    const statusMap: Record<string, string> = {
      'CREATED': 'تم إنشاء الشحنة',
      'PENDING': 'في انتظار الاستلام',
      'PICKED_UP': 'تم الاستلام',
      'IN_TRANSIT': 'في الطريق',
      'OUT_FOR_DELIVERY': 'جاري التوصيل',
      'DELIVERED': 'تم التسليم',
      'RETURNED': 'مرتجع',
      'CANCELLED': 'ملغي',
      'FAILED': 'فشل التوصيل',
      'ON_HOLD': 'معلق',
    };
    return statusMap[status?.toUpperCase()] || status || 'غير محدد';
  }

  private getDefaultGovernorates(): Array<{ code: string; name: string; nameAr: string }> {
    return [
      { code: 'CAI', name: 'Cairo', nameAr: 'القاهرة' },
      { code: 'GIZ', name: 'Giza', nameAr: 'الجيزة' },
      { code: 'ALX', name: 'Alexandria', nameAr: 'الإسكندرية' },
      { code: 'QAL', name: 'Qalyubia', nameAr: 'القليوبية' },
      { code: 'SHR', name: 'Sharqia', nameAr: 'الشرقية' },
      { code: 'DKH', name: 'Dakahlia', nameAr: 'الدقهلية' },
      { code: 'GHR', name: 'Gharbia', nameAr: 'الغربية' },
      { code: 'MNF', name: 'Monufia', nameAr: 'المنوفية' },
      { code: 'BHR', name: 'Beheira', nameAr: 'البحيرة' },
      { code: 'KFS', name: 'Kafr El Sheikh', nameAr: 'كفر الشيخ' },
      { code: 'DMT', name: 'Damietta', nameAr: 'دمياط' },
      { code: 'PTS', name: 'Port Said', nameAr: 'بور سعيد' },
      { code: 'ISM', name: 'Ismailia', nameAr: 'الإسماعيلية' },
      { code: 'SUZ', name: 'Suez', nameAr: 'السويس' },
      { code: 'FYM', name: 'Faiyum', nameAr: 'الفيوم' },
      { code: 'BNS', name: 'Beni Suef', nameAr: 'بني سويف' },
      { code: 'MNY', name: 'Minya', nameAr: 'المنيا' },
      { code: 'AST', name: 'Asyut', nameAr: 'أسيوط' },
      { code: 'SHG', name: 'Sohag', nameAr: 'سوهاج' },
      { code: 'QNA', name: 'Qena', nameAr: 'قنا' },
      { code: 'LXR', name: 'Luxor', nameAr: 'الأقصر' },
      { code: 'ASN', name: 'Aswan', nameAr: 'أسوان' },
      { code: 'RSA', name: 'Red Sea', nameAr: 'البحر الأحمر' },
      { code: 'MTR', name: 'Matrouh', nameAr: 'مطروح' },
      { code: 'NWV', name: 'New Valley', nameAr: 'الوادي الجديد' },
      { code: 'NSN', name: 'North Sinai', nameAr: 'شمال سيناء' },
      { code: 'SSN', name: 'South Sinai', nameAr: 'جنوب سيناء' },
    ];
  }
}
