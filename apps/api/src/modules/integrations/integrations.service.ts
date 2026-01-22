import { Injectable, NotFoundException, BadRequestException, Logger } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bull';
import { Queue } from 'bull';
import { PrismaService } from '../../common/prisma/prisma.service';
import { WooCommerceService } from './ecommerce/woocommerce.service';
import { ShopifyService } from './ecommerce/shopify.service';
import { WasslBoxService } from './shipping/wasslbox.service';
import { BostaService } from './shipping/bosta.service';

export interface CreateIntegrationDto {
  type: 'WOOCOMMERCE' | 'SHOPIFY' | 'WASSLBOX' | 'BOSTA' | 'CUSTOM';
  name: string;
  config: Record<string, any>;
  syncProducts?: boolean;
  syncOrders?: boolean;
  syncInventory?: boolean;
}

@Injectable()
export class IntegrationsService {
  private readonly logger = new Logger(IntegrationsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly wooCommerceService: WooCommerceService,
    private readonly shopifyService: ShopifyService,
    private readonly wasslBoxService: WasslBoxService,
    private readonly bostaService: BostaService,
    @InjectQueue('integration-sync') private readonly syncQueue: Queue,
  ) {}

  async create(tenantId: string, dto: CreateIntegrationDto) {
    const connectionResult = await this.testConnection(dto.type, dto.config);
    if (!connectionResult.success) {
      throw new BadRequestException(`فشل الاتصال: ${connectionResult.error}`);
    }

    const integration = await this.prisma.integration.create({
      data: {
        tenantId,
        type: dto.type,
        name: dto.name || connectionResult.name || dto.type,
        config: dto.config,
        syncProducts: dto.syncProducts ?? true,
        syncOrders: dto.syncOrders ?? true,
        syncInventory: dto.syncInventory ?? true,
        isActive: true,
      },
    });

    if (dto.syncProducts || dto.syncOrders) {
      await this.syncQueue.add('initial-sync', { integrationId: integration.id, tenantId }, { delay: 5000 });
    }

    return integration;
  }

  async testConnection(type: string, config: Record<string, any>) {
    switch (type) {
      case 'WOOCOMMERCE':
        return this.wooCommerceService.testConnection({
          storeUrl: config.storeUrl,
          consumerKey: config.consumerKey,
          consumerSecret: config.consumerSecret,
        });
      case 'SHOPIFY':
        return this.shopifyService.testConnection({
          shopDomain: config.shopDomain,
          accessToken: config.accessToken,
        });
      default:
        return { success: true, name: type };
    }
  }

  async findAll(tenantId: string) {
    return this.prisma.integration.findMany({ where: { tenantId }, orderBy: { createdAt: 'desc' } });
  }

  async findOne(tenantId: string, id: string) {
    const integration = await this.prisma.integration.findFirst({ where: { id, tenantId } });
    if (!integration) throw new NotFoundException('التكامل غير موجود');
    return integration;
  }

  async update(tenantId: string, id: string, dto: Partial<CreateIntegrationDto>) {
    await this.findOne(tenantId, id);
    return this.prisma.integration.update({
      where: { id },
      data: {
        ...(dto.name && { name: dto.name }),
        ...(dto.config && { config: dto.config }),
        ...(dto.syncProducts !== undefined && { syncProducts: dto.syncProducts }),
        ...(dto.syncOrders !== undefined && { syncOrders: dto.syncOrders }),
      },
    });
  }

  async delete(tenantId: string, id: string) {
    await this.findOne(tenantId, id);
    await this.prisma.integration.delete({ where: { id } });
  }

  async toggleActive(tenantId: string, id: string) {
    const integration = await this.findOne(tenantId, id);
    return this.prisma.integration.update({
      where: { id },
      data: { isActive: !integration.isActive },
    });
  }

  async triggerSync(tenantId: string, id: string, syncType: 'products' | 'orders' | 'all' = 'all') {
    const integration = await this.findOne(tenantId, id);
    if (!integration.isActive) throw new BadRequestException('التكامل غير نشط');
    await this.syncQueue.add('manual-sync', { integrationId: id, tenantId, syncType });
    return { success: true, message: 'تم بدء المزامنة' };
  }

  async syncProducts(tenantId: string, integrationId: string) {
    const integration = await this.findOne(tenantId, integrationId);
    const config = integration.config as any;
    let syncedCount = 0;

    if (integration.type === 'WOOCOMMERCE') {
      const { products } = await this.wooCommerceService.getProducts(
        { storeUrl: config.storeUrl, consumerKey: config.consumerKey, consumerSecret: config.consumerSecret },
        { per_page: 100 },
      );
      for (const p of products) {
        const data = this.wooCommerceService.convertToWasslChatProduct(p, tenantId);
        await this.prisma.product.upsert({
          where: { tenantId_externalId_externalSource: { tenantId, externalId: data.externalId, externalSource: 'WOOCOMMERCE' } },
          create: data,
          update: data,
        });
        syncedCount++;
      }
    } else if (integration.type === 'SHOPIFY') {
      const { products } = await this.shopifyService.getProducts(
        { shopDomain: config.shopDomain, accessToken: config.accessToken },
      );
      for (const p of products) {
        const data = this.shopifyService.convertToWasslChatProduct(p, tenantId);
        await this.prisma.product.upsert({
          where: { tenantId_externalId_externalSource: { tenantId, externalId: data.externalId, externalSource: 'SHOPIFY' } },
          create: data,
          update: data,
        });
        syncedCount++;
      }
    }

    await this.prisma.integration.update({ where: { id: integrationId }, data: { lastSyncAt: new Date() } });
    return { syncedCount };
  }

  async createShipment(tenantId: string, orderId: string, provider: 'WASSLBOX' | 'BOSTA') {
    const order = await this.prisma.order.findFirst({
      where: { id: orderId, tenantId },
      include: { contact: true, items: true },
    });
    if (!order) throw new NotFoundException('الطلب غير موجود');

    const addr = order.shippingAddress as any;

    if (provider === 'WASSLBOX') {
      const result = await this.wasslBoxService.createShipment({
        orderId: order.id,
        orderNumber: order.orderNumber,
        consignee: {
          name: order.contact.name || 'Customer',
          phone: order.contact.phone,
          address: addr?.address1 || '',
          city: addr?.city || '',
          governorate: addr?.state || '',
        },
        items: order.items.map((i) => ({ name: i.productName, quantity: i.quantity, price: Number(i.unitPrice) })),
        codAmount: order.paymentMethod === 'COD' ? Number(order.total) : 0,
      });
      if (result.success) {
        await this.prisma.order.update({
          where: { id: orderId },
          data: { trackingNumber: result.trackingNumber, shippingCarrier: 'WASSLBOX', status: 'SHIPPED', shippedAt: new Date() },
        });
      }
      return result;
    } else {
      const names = (order.contact.name || '').split(' ');
      const result = await this.bostaService.createDelivery({
        orderId: order.id,
        orderNumber: order.orderNumber,
        receiver: { firstName: names[0] || 'Customer', lastName: names.slice(1).join(' ') || '', phone: order.contact.phone },
        dropOffAddress: { firstLine: addr?.address1 || '', city: addr?.city || 'Cairo' },
        cod: order.paymentMethod === 'COD' ? Number(order.total) : 0,
      });
      if (result.success) {
        await this.prisma.order.update({
          where: { id: orderId },
          data: { trackingNumber: result.trackingNumber, shippingCarrier: 'BOSTA', status: 'SHIPPED', shippedAt: new Date() },
        });
      }
      return result;
    }
  }

  async getTracking(tenantId: string, orderId: string) {
    const order = await this.prisma.order.findFirst({ where: { id: orderId, tenantId } });
    if (!order?.trackingNumber) throw new NotFoundException('لا يوجد رقم تتبع');
    
    if (order.shippingCarrier === 'WASSLBOX') return this.wasslBoxService.getTracking(order.trackingNumber);
    if (order.shippingCarrier === 'BOSTA') return this.bostaService.trackDelivery(order.trackingNumber);
    throw new BadRequestException('مزود الشحن غير مدعوم');
  }

  async getShippingRates(params: { toGovernorate: string; toCity: string; weight: number; codAmount?: number }) {
    const rates = [];
    try {
      const wasslbox = await this.wasslBoxService.calculateCost({
        fromGovernorate: 'CAI', toGovernorate: params.toGovernorate, toCity: params.toCity,
        weight: params.weight, codAmount: params.codAmount,
      });
      rates.push({ provider: 'WASSLBOX', name: 'واصل بوكس', cost: wasslbox.totalCost, estimatedDays: wasslbox.estimatedDays });
    } catch {}
    try {
      const bosta = await this.bostaService.calculatePrice({ type: 10, cod: params.codAmount, dropOffCity: params.toCity });
      rates.push({ provider: 'BOSTA', name: 'بوسطة', cost: bosta.price, estimatedDays: 2 });
    } catch {}
    return rates.sort((a, b) => a.cost - b.cost);
  }

  async getGovernorates() {
    return this.wasslBoxService.getGovernorates();
  }

  async getCities(governorate: string) {
    return this.wasslBoxService.getCities(governorate);
  }
}
