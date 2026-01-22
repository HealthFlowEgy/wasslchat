import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import * as crypto from 'crypto';

/**
 * WooCommerce Integration Service
 * 
 * Connects WasslChat with WooCommerce stores for:
 * - Product sync (import/export)
 * - Order sync (bidirectional)
 * - Inventory sync
 * - Customer sync
 * - Webhook handling
 * 
 * WooCommerce REST API: https://woocommerce.github.io/woocommerce-rest-api-docs/
 */

export interface WooCommerceConfig {
  storeUrl: string;
  consumerKey: string;
  consumerSecret: string;
  version?: string;
}

export interface WooProduct {
  id: number;
  name: string;
  slug: string;
  type: string;
  status: string;
  description: string;
  short_description: string;
  sku: string;
  price: string;
  regular_price: string;
  sale_price: string;
  stock_quantity: number;
  stock_status: string;
  manage_stock: boolean;
  categories: Array<{ id: number; name: string; slug: string }>;
  images: Array<{ id: number; src: string; alt: string }>;
  attributes: any[];
  variations: number[];
}

export interface WooOrder {
  id: number;
  number: string;
  status: string;
  currency: string;
  total: string;
  subtotal: string;
  shipping_total: string;
  discount_total: string;
  payment_method: string;
  payment_method_title: string;
  billing: {
    first_name: string;
    last_name: string;
    email: string;
    phone: string;
    address_1: string;
    address_2: string;
    city: string;
    state: string;
    postcode: string;
    country: string;
  };
  shipping: any;
  line_items: Array<{
    id: number;
    name: string;
    product_id: number;
    variation_id: number;
    quantity: number;
    subtotal: string;
    total: string;
    sku: string;
    price: number;
  }>;
  date_created: string;
  date_modified: string;
}

@Injectable()
export class WooCommerceService {
  private readonly logger = new Logger(WooCommerceService.name);

  constructor(private readonly httpService: HttpService) {}

  private getAuthHeader(config: WooCommerceConfig): string {
    const credentials = Buffer.from(`${config.consumerKey}:${config.consumerSecret}`).toString('base64');
    return `Basic ${credentials}`;
  }

  private getApiUrl(config: WooCommerceConfig, endpoint: string): string {
    const version = config.version || 'wc/v3';
    const baseUrl = config.storeUrl.replace(/\/$/, '');
    return `${baseUrl}/wp-json/${version}/${endpoint}`;
  }

  /**
   * Test connection to WooCommerce store
   */
  async testConnection(config: WooCommerceConfig): Promise<{ success: boolean; storeName?: string; error?: string }> {
    try {
      const response = await firstValueFrom(
        this.httpService.get(this.getApiUrl(config, ''), {
          headers: { Authorization: this.getAuthHeader(config) },
          timeout: 10000,
        }),
      );

      return {
        success: true,
        storeName: response.data.store?.name || 'WooCommerce Store',
      };
    } catch (error) {
      this.logger.error(`WooCommerce connection test failed: ${error.message}`);
      return {
        success: false,
        error: error.response?.data?.message || error.message,
      };
    }
  }

  // =============== PRODUCTS ===============

  /**
   * Get all products with pagination
   */
  async getProducts(config: WooCommerceConfig, params?: {
    page?: number;
    per_page?: number;
    status?: string;
    category?: number;
    search?: string;
  }): Promise<{ products: WooProduct[]; total: number; totalPages: number }> {
    try {
      const response = await firstValueFrom(
        this.httpService.get(this.getApiUrl(config, 'products'), {
          headers: { Authorization: this.getAuthHeader(config) },
          params: {
            page: params?.page || 1,
            per_page: params?.per_page || 100,
            status: params?.status || 'publish',
            category: params?.category,
            search: params?.search,
          },
        }),
      );

      return {
        products: response.data,
        total: parseInt(response.headers['x-wp-total'] || '0'),
        totalPages: parseInt(response.headers['x-wp-totalpages'] || '1'),
      };
    } catch (error) {
      this.logger.error(`Failed to get WooCommerce products: ${error.message}`);
      throw new BadRequestException('فشل في جلب المنتجات من ووكومرس');
    }
  }

  /**
   * Get single product
   */
  async getProduct(config: WooCommerceConfig, productId: number): Promise<WooProduct> {
    try {
      const response = await firstValueFrom(
        this.httpService.get(this.getApiUrl(config, `products/${productId}`), {
          headers: { Authorization: this.getAuthHeader(config) },
        }),
      );
      return response.data;
    } catch (error) {
      this.logger.error(`Failed to get WooCommerce product: ${error.message}`);
      throw new BadRequestException('فشل في جلب المنتج');
    }
  }

  /**
   * Update product stock
   */
  async updateProductStock(config: WooCommerceConfig, productId: number, quantity: number): Promise<WooProduct> {
    try {
      const response = await firstValueFrom(
        this.httpService.put(
          this.getApiUrl(config, `products/${productId}`),
          { stock_quantity: quantity, manage_stock: true },
          { headers: { Authorization: this.getAuthHeader(config) } },
        ),
      );
      return response.data;
    } catch (error) {
      this.logger.error(`Failed to update WooCommerce product stock: ${error.message}`);
      throw new BadRequestException('فشل في تحديث المخزون');
    }
  }

  /**
   * Create product in WooCommerce
   */
  async createProduct(config: WooCommerceConfig, product: Partial<WooProduct>): Promise<WooProduct> {
    try {
      const response = await firstValueFrom(
        this.httpService.post(
          this.getApiUrl(config, 'products'),
          product,
          { headers: { Authorization: this.getAuthHeader(config) } },
        ),
      );
      return response.data;
    } catch (error) {
      this.logger.error(`Failed to create WooCommerce product: ${error.message}`);
      throw new BadRequestException('فشل في إنشاء المنتج');
    }
  }

  // =============== ORDERS ===============

  /**
   * Get all orders with pagination
   */
  async getOrders(config: WooCommerceConfig, params?: {
    page?: number;
    per_page?: number;
    status?: string;
    after?: string;
    before?: string;
  }): Promise<{ orders: WooOrder[]; total: number; totalPages: number }> {
    try {
      const response = await firstValueFrom(
        this.httpService.get(this.getApiUrl(config, 'orders'), {
          headers: { Authorization: this.getAuthHeader(config) },
          params: {
            page: params?.page || 1,
            per_page: params?.per_page || 100,
            status: params?.status,
            after: params?.after,
            before: params?.before,
          },
        }),
      );

      return {
        orders: response.data,
        total: parseInt(response.headers['x-wp-total'] || '0'),
        totalPages: parseInt(response.headers['x-wp-totalpages'] || '1'),
      };
    } catch (error) {
      this.logger.error(`Failed to get WooCommerce orders: ${error.message}`);
      throw new BadRequestException('فشل في جلب الطلبات');
    }
  }

  /**
   * Get single order
   */
  async getOrder(config: WooCommerceConfig, orderId: number): Promise<WooOrder> {
    try {
      const response = await firstValueFrom(
        this.httpService.get(this.getApiUrl(config, `orders/${orderId}`), {
          headers: { Authorization: this.getAuthHeader(config) },
        }),
      );
      return response.data;
    } catch (error) {
      this.logger.error(`Failed to get WooCommerce order: ${error.message}`);
      throw new BadRequestException('فشل في جلب الطلب');
    }
  }

  /**
   * Update order status
   */
  async updateOrderStatus(config: WooCommerceConfig, orderId: number, status: string): Promise<WooOrder> {
    try {
      const response = await firstValueFrom(
        this.httpService.put(
          this.getApiUrl(config, `orders/${orderId}`),
          { status },
          { headers: { Authorization: this.getAuthHeader(config) } },
        ),
      );
      return response.data;
    } catch (error) {
      this.logger.error(`Failed to update WooCommerce order status: ${error.message}`);
      throw new BadRequestException('فشل في تحديث حالة الطلب');
    }
  }

  /**
   * Create order in WooCommerce
   */
  async createOrder(config: WooCommerceConfig, order: Partial<WooOrder>): Promise<WooOrder> {
    try {
      const response = await firstValueFrom(
        this.httpService.post(
          this.getApiUrl(config, 'orders'),
          order,
          { headers: { Authorization: this.getAuthHeader(config) } },
        ),
      );
      return response.data;
    } catch (error) {
      this.logger.error(`Failed to create WooCommerce order: ${error.message}`);
      throw new BadRequestException('فشل في إنشاء الطلب');
    }
  }

  // =============== CATEGORIES ===============

  /**
   * Get all categories
   */
  async getCategories(config: WooCommerceConfig): Promise<any[]> {
    try {
      const response = await firstValueFrom(
        this.httpService.get(this.getApiUrl(config, 'products/categories'), {
          headers: { Authorization: this.getAuthHeader(config) },
          params: { per_page: 100 },
        }),
      );
      return response.data;
    } catch (error) {
      this.logger.error(`Failed to get WooCommerce categories: ${error.message}`);
      return [];
    }
  }

  // =============== CUSTOMERS ===============

  /**
   * Get customer by email
   */
  async getCustomerByEmail(config: WooCommerceConfig, email: string): Promise<any | null> {
    try {
      const response = await firstValueFrom(
        this.httpService.get(this.getApiUrl(config, 'customers'), {
          headers: { Authorization: this.getAuthHeader(config) },
          params: { email },
        }),
      );
      return response.data[0] || null;
    } catch (error) {
      this.logger.error(`Failed to get WooCommerce customer: ${error.message}`);
      return null;
    }
  }

  // =============== WEBHOOKS ===============

  /**
   * Create webhook for order events
   */
  async createWebhook(config: WooCommerceConfig, deliveryUrl: string, topic: string): Promise<any> {
    try {
      const response = await firstValueFrom(
        this.httpService.post(
          this.getApiUrl(config, 'webhooks'),
          {
            name: `WasslChat - ${topic}`,
            topic,
            delivery_url: deliveryUrl,
            status: 'active',
            secret: crypto.randomBytes(32).toString('hex'),
          },
          { headers: { Authorization: this.getAuthHeader(config) } },
        ),
      );
      return response.data;
    } catch (error) {
      this.logger.error(`Failed to create WooCommerce webhook: ${error.message}`);
      throw new BadRequestException('فشل في إنشاء Webhook');
    }
  }

  /**
   * Verify webhook signature
   */
  verifyWebhookSignature(payload: string, signature: string, secret: string): boolean {
    const calculatedSignature = crypto
      .createHmac('sha256', secret)
      .update(payload)
      .digest('base64');
    return calculatedSignature === signature;
  }

  // =============== CONVERSION HELPERS ===============

  /**
   * Convert WooCommerce product to WasslChat format
   */
  convertToWasslChatProduct(wooProduct: WooProduct, tenantId: string): any {
    return {
      tenantId,
      externalId: String(wooProduct.id),
      externalSource: 'WOOCOMMERCE',
      name: wooProduct.name,
      slug: wooProduct.slug,
      description: wooProduct.description?.replace(/<[^>]*>/g, ''), // Strip HTML
      shortDescription: wooProduct.short_description?.replace(/<[^>]*>/g, ''),
      sku: wooProduct.sku,
      price: parseFloat(wooProduct.price) || 0,
      compareAtPrice: parseFloat(wooProduct.regular_price) || null,
      salePrice: wooProduct.sale_price ? parseFloat(wooProduct.sale_price) : null,
      inventoryQty: wooProduct.stock_quantity || 0,
      trackInventory: wooProduct.manage_stock,
      isActive: wooProduct.status === 'publish',
      images: wooProduct.images?.map(img => img.src) || [],
      thumbnail: wooProduct.images?.[0]?.src,
    };
  }

  /**
   * Convert WooCommerce order to WasslChat format
   */
  convertToWasslChatOrder(wooOrder: WooOrder): any {
    return {
      externalId: String(wooOrder.id),
      externalSource: 'WOOCOMMERCE',
      orderNumber: wooOrder.number,
      status: this.mapWooOrderStatus(wooOrder.status),
      subtotal: parseFloat(wooOrder.subtotal),
      shippingCost: parseFloat(wooOrder.shipping_total),
      discount: parseFloat(wooOrder.discount_total),
      total: parseFloat(wooOrder.total),
      currency: wooOrder.currency,
      paymentMethod: wooOrder.payment_method,
      customer: {
        name: `${wooOrder.billing.first_name} ${wooOrder.billing.last_name}`.trim(),
        email: wooOrder.billing.email,
        phone: wooOrder.billing.phone,
      },
      shippingAddress: {
        name: `${wooOrder.shipping.first_name || wooOrder.billing.first_name} ${wooOrder.shipping.last_name || wooOrder.billing.last_name}`.trim(),
        address1: wooOrder.shipping.address_1 || wooOrder.billing.address_1,
        address2: wooOrder.shipping.address_2 || wooOrder.billing.address_2,
        city: wooOrder.shipping.city || wooOrder.billing.city,
        state: wooOrder.shipping.state || wooOrder.billing.state,
        postcode: wooOrder.shipping.postcode || wooOrder.billing.postcode,
        country: wooOrder.shipping.country || wooOrder.billing.country,
        phone: wooOrder.billing.phone,
      },
      items: wooOrder.line_items.map(item => ({
        externalProductId: String(item.product_id),
        name: item.name,
        sku: item.sku,
        quantity: item.quantity,
        unitPrice: item.price,
        totalPrice: parseFloat(item.total),
      })),
      createdAt: new Date(wooOrder.date_created),
    };
  }

  private mapWooOrderStatus(status: string): string {
    const statusMap: Record<string, string> = {
      'pending': 'PENDING',
      'processing': 'PROCESSING',
      'on-hold': 'PENDING',
      'completed': 'DELIVERED',
      'cancelled': 'CANCELLED',
      'refunded': 'REFUNDED',
      'failed': 'CANCELLED',
    };
    return statusMap[status] || 'PENDING';
  }
}
