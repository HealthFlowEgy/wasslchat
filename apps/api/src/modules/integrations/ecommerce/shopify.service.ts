import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import * as crypto from 'crypto';

/**
 * Shopify Integration Service
 * 
 * Connects WasslChat with Shopify stores for:
 * - Product sync
 * - Order sync
 * - Inventory sync
 * - Customer sync
 * - Webhook handling
 * 
 * Shopify Admin API: https://shopify.dev/docs/api/admin-rest
 */

export interface ShopifyConfig {
  shopDomain: string;  // mystore.myshopify.com
  accessToken: string;
  apiVersion?: string;
}

export interface ShopifyProduct {
  id: number;
  title: string;
  handle: string;
  body_html: string;
  vendor: string;
  product_type: string;
  status: string;
  tags: string;
  variants: Array<{
    id: number;
    product_id: number;
    title: string;
    price: string;
    compare_at_price: string;
    sku: string;
    inventory_quantity: number;
    inventory_management: string;
    weight: number;
    weight_unit: string;
  }>;
  images: Array<{
    id: number;
    src: string;
    alt: string;
    position: number;
  }>;
  created_at: string;
  updated_at: string;
}

export interface ShopifyOrder {
  id: number;
  name: string;
  order_number: number;
  email: string;
  phone: string;
  financial_status: string;
  fulfillment_status: string;
  currency: string;
  subtotal_price: string;
  total_shipping_price_set: { shop_money: { amount: string } };
  total_discounts: string;
  total_price: string;
  customer: {
    id: number;
    email: string;
    first_name: string;
    last_name: string;
    phone: string;
  };
  billing_address: any;
  shipping_address: any;
  line_items: Array<{
    id: number;
    product_id: number;
    variant_id: number;
    title: string;
    quantity: number;
    price: string;
    sku: string;
  }>;
  created_at: string;
  updated_at: string;
}

@Injectable()
export class ShopifyService {
  private readonly logger = new Logger(ShopifyService.name);

  constructor(private readonly httpService: HttpService) {}

  private getApiUrl(config: ShopifyConfig, endpoint: string): string {
    const version = config.apiVersion || '2024-01';
    const domain = config.shopDomain.replace(/^https?:\/\//, '').replace(/\/$/, '');
    return `https://${domain}/admin/api/${version}/${endpoint}`;
  }

  private getHeaders(config: ShopifyConfig) {
    return {
      'X-Shopify-Access-Token': config.accessToken,
      'Content-Type': 'application/json',
    };
  }

  /**
   * Test connection to Shopify store
   */
  async testConnection(config: ShopifyConfig): Promise<{ success: boolean; shopName?: string; error?: string }> {
    try {
      const response = await firstValueFrom(
        this.httpService.get(this.getApiUrl(config, 'shop.json'), {
          headers: this.getHeaders(config),
          timeout: 10000,
        }),
      );

      return {
        success: true,
        shopName: response.data.shop?.name,
      };
    } catch (error) {
      this.logger.error(`Shopify connection test failed: ${error.message}`);
      return {
        success: false,
        error: error.response?.data?.errors || error.message,
      };
    }
  }

  // =============== PRODUCTS ===============

  /**
   * Get all products with pagination
   */
  async getProducts(config: ShopifyConfig, params?: {
    limit?: number;
    since_id?: number;
    status?: string;
    collection_id?: number;
  }): Promise<{ products: ShopifyProduct[]; nextPageInfo?: string }> {
    try {
      const response = await firstValueFrom(
        this.httpService.get(this.getApiUrl(config, 'products.json'), {
          headers: this.getHeaders(config),
          params: {
            limit: params?.limit || 250,
            since_id: params?.since_id,
            status: params?.status || 'active',
            collection_id: params?.collection_id,
          },
        }),
      );

      // Extract pagination info from Link header
      const linkHeader = response.headers['link'];
      let nextPageInfo;
      if (linkHeader) {
        const match = linkHeader.match(/page_info=([^>&]+).*rel="next"/);
        if (match) nextPageInfo = match[1];
      }

      return {
        products: response.data.products,
        nextPageInfo,
      };
    } catch (error) {
      this.logger.error(`Failed to get Shopify products: ${error.message}`);
      throw new BadRequestException('فشل في جلب المنتجات من شوبيفاي');
    }
  }

  /**
   * Get single product
   */
  async getProduct(config: ShopifyConfig, productId: number): Promise<ShopifyProduct> {
    try {
      const response = await firstValueFrom(
        this.httpService.get(this.getApiUrl(config, `products/${productId}.json`), {
          headers: this.getHeaders(config),
        }),
      );
      return response.data.product;
    } catch (error) {
      this.logger.error(`Failed to get Shopify product: ${error.message}`);
      throw new BadRequestException('فشل في جلب المنتج');
    }
  }

  /**
   * Update inventory level
   */
  async updateInventory(config: ShopifyConfig, inventoryItemId: number, locationId: number, quantity: number): Promise<void> {
    try {
      await firstValueFrom(
        this.httpService.post(
          this.getApiUrl(config, 'inventory_levels/set.json'),
          {
            location_id: locationId,
            inventory_item_id: inventoryItemId,
            available: quantity,
          },
          { headers: this.getHeaders(config) },
        ),
      );
    } catch (error) {
      this.logger.error(`Failed to update Shopify inventory: ${error.message}`);
      throw new BadRequestException('فشل في تحديث المخزون');
    }
  }

  /**
   * Get inventory locations
   */
  async getLocations(config: ShopifyConfig): Promise<any[]> {
    try {
      const response = await firstValueFrom(
        this.httpService.get(this.getApiUrl(config, 'locations.json'), {
          headers: this.getHeaders(config),
        }),
      );
      return response.data.locations;
    } catch (error) {
      this.logger.error(`Failed to get Shopify locations: ${error.message}`);
      return [];
    }
  }

  // =============== ORDERS ===============

  /**
   * Get all orders with pagination
   */
  async getOrders(config: ShopifyConfig, params?: {
    limit?: number;
    since_id?: number;
    status?: string;
    financial_status?: string;
    fulfillment_status?: string;
    created_at_min?: string;
    created_at_max?: string;
  }): Promise<{ orders: ShopifyOrder[]; nextPageInfo?: string }> {
    try {
      const response = await firstValueFrom(
        this.httpService.get(this.getApiUrl(config, 'orders.json'), {
          headers: this.getHeaders(config),
          params: {
            limit: params?.limit || 250,
            since_id: params?.since_id,
            status: params?.status || 'any',
            financial_status: params?.financial_status,
            fulfillment_status: params?.fulfillment_status,
            created_at_min: params?.created_at_min,
            created_at_max: params?.created_at_max,
          },
        }),
      );

      const linkHeader = response.headers['link'];
      let nextPageInfo;
      if (linkHeader) {
        const match = linkHeader.match(/page_info=([^>&]+).*rel="next"/);
        if (match) nextPageInfo = match[1];
      }

      return {
        orders: response.data.orders,
        nextPageInfo,
      };
    } catch (error) {
      this.logger.error(`Failed to get Shopify orders: ${error.message}`);
      throw new BadRequestException('فشل في جلب الطلبات');
    }
  }

  /**
   * Get single order
   */
  async getOrder(config: ShopifyConfig, orderId: number): Promise<ShopifyOrder> {
    try {
      const response = await firstValueFrom(
        this.httpService.get(this.getApiUrl(config, `orders/${orderId}.json`), {
          headers: this.getHeaders(config),
        }),
      );
      return response.data.order;
    } catch (error) {
      this.logger.error(`Failed to get Shopify order: ${error.message}`);
      throw new BadRequestException('فشل في جلب الطلب');
    }
  }

  /**
   * Create fulfillment (ship order)
   */
  async createFulfillment(config: ShopifyConfig, orderId: number, fulfillment: {
    locationId: number;
    trackingNumber?: string;
    trackingCompany?: string;
    trackingUrl?: string;
    lineItems?: Array<{ id: number; quantity: number }>;
  }): Promise<any> {
    try {
      const response = await firstValueFrom(
        this.httpService.post(
          this.getApiUrl(config, `orders/${orderId}/fulfillments.json`),
          {
            fulfillment: {
              location_id: fulfillment.locationId,
              tracking_number: fulfillment.trackingNumber,
              tracking_company: fulfillment.trackingCompany,
              tracking_url: fulfillment.trackingUrl,
              line_items: fulfillment.lineItems,
              notify_customer: true,
            },
          },
          { headers: this.getHeaders(config) },
        ),
      );
      return response.data.fulfillment;
    } catch (error) {
      this.logger.error(`Failed to create Shopify fulfillment: ${error.message}`);
      throw new BadRequestException('فشل في تحديث حالة الشحن');
    }
  }

  /**
   * Cancel order
   */
  async cancelOrder(config: ShopifyConfig, orderId: number, reason?: string): Promise<ShopifyOrder> {
    try {
      const response = await firstValueFrom(
        this.httpService.post(
          this.getApiUrl(config, `orders/${orderId}/cancel.json`),
          { reason },
          { headers: this.getHeaders(config) },
        ),
      );
      return response.data.order;
    } catch (error) {
      this.logger.error(`Failed to cancel Shopify order: ${error.message}`);
      throw new BadRequestException('فشل في إلغاء الطلب');
    }
  }

  // =============== COLLECTIONS ===============

  /**
   * Get collections
   */
  async getCollections(config: ShopifyConfig): Promise<any[]> {
    try {
      const [customCollections, smartCollections] = await Promise.all([
        firstValueFrom(
          this.httpService.get(this.getApiUrl(config, 'custom_collections.json'), {
            headers: this.getHeaders(config),
          }),
        ),
        firstValueFrom(
          this.httpService.get(this.getApiUrl(config, 'smart_collections.json'), {
            headers: this.getHeaders(config),
          }),
        ),
      ]);

      return [
        ...customCollections.data.custom_collections,
        ...smartCollections.data.smart_collections,
      ];
    } catch (error) {
      this.logger.error(`Failed to get Shopify collections: ${error.message}`);
      return [];
    }
  }

  // =============== WEBHOOKS ===============

  /**
   * Create webhook
   */
  async createWebhook(config: ShopifyConfig, address: string, topic: string): Promise<any> {
    try {
      const response = await firstValueFrom(
        this.httpService.post(
          this.getApiUrl(config, 'webhooks.json'),
          {
            webhook: {
              topic,
              address,
              format: 'json',
            },
          },
          { headers: this.getHeaders(config) },
        ),
      );
      return response.data.webhook;
    } catch (error) {
      this.logger.error(`Failed to create Shopify webhook: ${error.message}`);
      throw new BadRequestException('فشل في إنشاء Webhook');
    }
  }

  /**
   * Verify webhook signature
   */
  verifyWebhookSignature(body: string, signature: string, secret: string): boolean {
    const calculatedSignature = crypto
      .createHmac('sha256', secret)
      .update(body)
      .digest('base64');
    return calculatedSignature === signature;
  }

  // =============== CONVERSION HELPERS ===============

  /**
   * Convert Shopify product to WasslChat format
   */
  convertToWasslChatProduct(shopifyProduct: ShopifyProduct, tenantId: string): any {
    const variant = shopifyProduct.variants[0];
    
    return {
      tenantId,
      externalId: String(shopifyProduct.id),
      externalSource: 'SHOPIFY',
      name: shopifyProduct.title,
      slug: shopifyProduct.handle,
      description: shopifyProduct.body_html?.replace(/<[^>]*>/g, ''),
      sku: variant?.sku,
      price: parseFloat(variant?.price) || 0,
      compareAtPrice: variant?.compare_at_price ? parseFloat(variant.compare_at_price) : null,
      inventoryQty: variant?.inventory_quantity || 0,
      trackInventory: variant?.inventory_management === 'shopify',
      isActive: shopifyProduct.status === 'active',
      images: shopifyProduct.images?.map(img => img.src) || [],
      thumbnail: shopifyProduct.images?.[0]?.src,
      tags: shopifyProduct.tags?.split(',').map(t => t.trim()).filter(Boolean) || [],
      vendor: shopifyProduct.vendor,
      productType: shopifyProduct.product_type,
      variants: shopifyProduct.variants.length > 1 ? shopifyProduct.variants.map(v => ({
        externalId: String(v.id),
        title: v.title,
        sku: v.sku,
        price: parseFloat(v.price),
        compareAtPrice: v.compare_at_price ? parseFloat(v.compare_at_price) : null,
        inventoryQty: v.inventory_quantity,
        weight: v.weight,
        weightUnit: v.weight_unit,
      })) : undefined,
    };
  }

  /**
   * Convert Shopify order to WasslChat format
   */
  convertToWasslChatOrder(shopifyOrder: ShopifyOrder): any {
    return {
      externalId: String(shopifyOrder.id),
      externalSource: 'SHOPIFY',
      orderNumber: shopifyOrder.name,
      status: this.mapShopifyOrderStatus(shopifyOrder.fulfillment_status, shopifyOrder.financial_status),
      paymentStatus: this.mapShopifyPaymentStatus(shopifyOrder.financial_status),
      subtotal: parseFloat(shopifyOrder.subtotal_price),
      shippingCost: parseFloat(shopifyOrder.total_shipping_price_set?.shop_money?.amount || '0'),
      discount: parseFloat(shopifyOrder.total_discounts),
      total: parseFloat(shopifyOrder.total_price),
      currency: shopifyOrder.currency,
      customer: {
        name: shopifyOrder.customer 
          ? `${shopifyOrder.customer.first_name} ${shopifyOrder.customer.last_name}`.trim()
          : 'Guest',
        email: shopifyOrder.email || shopifyOrder.customer?.email,
        phone: shopifyOrder.phone || shopifyOrder.customer?.phone,
      },
      shippingAddress: shopifyOrder.shipping_address ? {
        name: `${shopifyOrder.shipping_address.first_name} ${shopifyOrder.shipping_address.last_name}`.trim(),
        address1: shopifyOrder.shipping_address.address1,
        address2: shopifyOrder.shipping_address.address2,
        city: shopifyOrder.shipping_address.city,
        state: shopifyOrder.shipping_address.province,
        postcode: shopifyOrder.shipping_address.zip,
        country: shopifyOrder.shipping_address.country,
        phone: shopifyOrder.shipping_address.phone,
      } : undefined,
      items: shopifyOrder.line_items.map(item => ({
        externalProductId: String(item.product_id),
        externalVariantId: String(item.variant_id),
        name: item.title,
        sku: item.sku,
        quantity: item.quantity,
        unitPrice: parseFloat(item.price),
        totalPrice: parseFloat(item.price) * item.quantity,
      })),
      createdAt: new Date(shopifyOrder.created_at),
    };
  }

  private mapShopifyOrderStatus(fulfillmentStatus: string, financialStatus: string): string {
    if (financialStatus === 'refunded') return 'REFUNDED';
    if (financialStatus === 'voided') return 'CANCELLED';
    
    const statusMap: Record<string, string> = {
      'fulfilled': 'DELIVERED',
      'partial': 'SHIPPED',
      'null': financialStatus === 'paid' ? 'CONFIRMED' : 'PENDING',
    };
    return statusMap[fulfillmentStatus || 'null'] || 'PENDING';
  }

  private mapShopifyPaymentStatus(financialStatus: string): string {
    const statusMap: Record<string, string> = {
      'pending': 'PENDING',
      'authorized': 'PENDING',
      'paid': 'PAID',
      'partially_paid': 'PARTIALLY_PAID',
      'refunded': 'REFUNDED',
      'partially_refunded': 'PARTIALLY_REFUNDED',
      'voided': 'CANCELLED',
    };
    return statusMap[financialStatus] || 'PENDING';
  }
}
