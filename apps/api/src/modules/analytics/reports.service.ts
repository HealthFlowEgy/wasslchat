import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';

export interface SalesReport {
  summary: {
    totalRevenue: number;
    totalOrders: number;
    avgOrderValue: number;
    totalItems: number;
    totalDiscount: number;
    totalShipping: number;
    netRevenue: number;
  };
  byDate: Array<{ date: string; revenue: number; orders: number; items: number }>;
  byPaymentMethod: Array<{ method: string; count: number; revenue: number }>;
  bySource: Array<{ source: string; count: number; revenue: number }>;
  byGovernorate: Array<{ governorate: string; count: number; revenue: number }>;
}

export interface ProductReport {
  summary: {
    totalProducts: number;
    activeProducts: number;
    outOfStock: number;
    lowStock: number;
    totalValue: number;
  };
  topSelling: Array<{ id: string; name: string; sold: number; revenue: number; stock: number }>;
  lowPerforming: Array<{ id: string; name: string; sold: number; views: number; stock: number }>;
  byCategory: Array<{ category: string; products: number; sold: number; revenue: number }>;
  inventoryAlerts: Array<{ id: string; name: string; stock: number; threshold: number }>;
}

export interface CustomerReport {
  summary: {
    totalCustomers: number;
    newCustomers: number;
    returningCustomers: number;
    avgLifetimeValue: number;
    avgOrdersPerCustomer: number;
  };
  segments: Array<{ segment: string; count: number; avgSpent: number }>;
  byGovernorate: Array<{ governorate: string; count: number; avgSpent: number }>;
  retention: Array<{ cohort: string; month1: number; month2: number; month3: number }>;
  rfm: {
    champions: number;
    loyalCustomers: number;
    potentialLoyalists: number;
    atRisk: number;
    cantLoseThem: number;
    hibernating: number;
    lost: number;
  };
}

export interface ConversationReport {
  summary: {
    totalConversations: number;
    avgResponseTime: number;
    resolutionRate: number;
    automationRate: number;
    satisfaction: number;
  };
  byAgent: Array<{ agent: string; conversations: number; avgResponseTime: number; resolved: number }>;
  byHour: Array<{ hour: number; conversations: number }>;
  byDay: Array<{ day: string; conversations: number }>;
  topIntents: Array<{ intent: string; count: number }>;
}

@Injectable()
export class ReportsService {
  private readonly logger = new Logger(ReportsService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Generate sales report
   */
  async getSalesReport(tenantId: string, startDate: Date, endDate: Date): Promise<SalesReport> {
    const orders = await this.prisma.order.findMany({
      where: {
        tenantId,
        createdAt: { gte: startDate, lte: endDate },
        status: { not: 'CANCELLED' },
      },
      include: { items: true, contact: { select: { governorate: true } } },
    });

    // Summary
    const summary = {
      totalRevenue: orders.reduce((sum, o) => sum + Number(o.total), 0),
      totalOrders: orders.length,
      avgOrderValue: orders.length > 0 ? orders.reduce((sum, o) => sum + Number(o.total), 0) / orders.length : 0,
      totalItems: orders.reduce((sum, o) => sum + o.itemsCount, 0),
      totalDiscount: orders.reduce((sum, o) => sum + Number(o.discount), 0),
      totalShipping: orders.reduce((sum, o) => sum + Number(o.shippingCost), 0),
      netRevenue: orders.filter(o => o.status === 'DELIVERED').reduce((sum, o) => sum + Number(o.total), 0),
    };

    // By date
    const byDateMap = new Map<string, { revenue: number; orders: number; items: number }>();
    for (const order of orders) {
      const date = order.createdAt.toISOString().split('T')[0];
      const existing = byDateMap.get(date) || { revenue: 0, orders: 0, items: 0 };
      byDateMap.set(date, {
        revenue: existing.revenue + Number(order.total),
        orders: existing.orders + 1,
        items: existing.items + order.itemsCount,
      });
    }
    const byDate = Array.from(byDateMap.entries())
      .map(([date, data]) => ({ date, ...data }))
      .sort((a, b) => a.date.localeCompare(b.date));

    // By payment method
    const byPaymentMethodMap = new Map<string, { count: number; revenue: number }>();
    for (const order of orders) {
      const method = order.paymentMethod || 'UNKNOWN';
      const existing = byPaymentMethodMap.get(method) || { count: 0, revenue: 0 };
      byPaymentMethodMap.set(method, {
        count: existing.count + 1,
        revenue: existing.revenue + Number(order.total),
      });
    }
    const byPaymentMethod = Array.from(byPaymentMethodMap.entries())
      .map(([method, data]) => ({ method, ...data }));

    // By source
    const bySourceMap = new Map<string, { count: number; revenue: number }>();
    for (const order of orders) {
      const source = order.source || 'DIRECT';
      const existing = bySourceMap.get(source) || { count: 0, revenue: 0 };
      bySourceMap.set(source, {
        count: existing.count + 1,
        revenue: existing.revenue + Number(order.total),
      });
    }
    const bySource = Array.from(bySourceMap.entries())
      .map(([source, data]) => ({ source, ...data }));

    // By governorate
    const byGovernorateMap = new Map<string, { count: number; revenue: number }>();
    for (const order of orders) {
      const gov = order.contact?.governorate || 'غير محدد';
      const existing = byGovernorateMap.get(gov) || { count: 0, revenue: 0 };
      byGovernorateMap.set(gov, {
        count: existing.count + 1,
        revenue: existing.revenue + Number(order.total),
      });
    }
    const byGovernorate = Array.from(byGovernorateMap.entries())
      .map(([governorate, data]) => ({ governorate, ...data }))
      .sort((a, b) => b.revenue - a.revenue);

    return { summary, byDate, byPaymentMethod, bySource, byGovernorate };
  }

  /**
   * Generate product performance report
   */
  async getProductReport(tenantId: string, startDate: Date, endDate: Date): Promise<ProductReport> {
    const [products, orderItems, categories] = await Promise.all([
      this.prisma.product.findMany({
        where: { tenantId },
        include: { category: { select: { name: true } } },
      }),
      this.prisma.orderItem.findMany({
        where: {
          order: { tenantId, createdAt: { gte: startDate, lte: endDate }, status: { not: 'CANCELLED' } },
        },
        select: { productId: true, quantity: true, totalPrice: true },
      }),
      this.prisma.category.findMany({
        where: { tenantId },
        include: { _count: { select: { products: true } } },
      }),
    ]);

    // Summary
    const activeProducts = products.filter(p => p.isActive).length;
    const outOfStock = products.filter(p => p.trackInventory && p.inventoryQty <= 0).length;
    const lowStock = products.filter(p => p.trackInventory && p.inventoryQty > 0 && p.inventoryQty <= (p.lowStockThreshold || 5)).length;
    const totalValue = products.reduce((sum, p) => sum + Number(p.price) * (p.inventoryQty || 0), 0);

    const summary = {
      totalProducts: products.length,
      activeProducts,
      outOfStock,
      lowStock,
      totalValue,
    };

    // Aggregate sales by product
    const salesByProduct = new Map<string, { sold: number; revenue: number }>();
    for (const item of orderItems) {
      const existing = salesByProduct.get(item.productId) || { sold: 0, revenue: 0 };
      salesByProduct.set(item.productId, {
        sold: existing.sold + item.quantity,
        revenue: existing.revenue + Number(item.totalPrice),
      });
    }

    // Top selling
    const topSelling = products
      .map(p => ({
        id: p.id,
        name: p.name,
        sold: salesByProduct.get(p.id)?.sold || 0,
        revenue: salesByProduct.get(p.id)?.revenue || 0,
        stock: p.inventoryQty || 0,
      }))
      .sort((a, b) => b.sold - a.sold)
      .slice(0, 10);

    // Low performing (active but low sales)
    const lowPerforming = products
      .filter(p => p.isActive)
      .map(p => ({
        id: p.id,
        name: p.name,
        sold: salesByProduct.get(p.id)?.sold || 0,
        views: p.viewCount || 0,
        stock: p.inventoryQty || 0,
      }))
      .sort((a, b) => a.sold - b.sold)
      .slice(0, 10);

    // By category
    const categoryMap = new Map<string, { products: number; sold: number; revenue: number }>();
    for (const product of products) {
      const catName = product.category?.name || 'بدون تصنيف';
      const sales = salesByProduct.get(product.id) || { sold: 0, revenue: 0 };
      const existing = categoryMap.get(catName) || { products: 0, sold: 0, revenue: 0 };
      categoryMap.set(catName, {
        products: existing.products + 1,
        sold: existing.sold + sales.sold,
        revenue: existing.revenue + sales.revenue,
      });
    }
    const byCategory = Array.from(categoryMap.entries())
      .map(([category, data]) => ({ category, ...data }))
      .sort((a, b) => b.revenue - a.revenue);

    // Inventory alerts
    const inventoryAlerts = products
      .filter(p => p.trackInventory && p.inventoryQty <= (p.lowStockThreshold || 5))
      .map(p => ({
        id: p.id,
        name: p.name,
        stock: p.inventoryQty || 0,
        threshold: p.lowStockThreshold || 5,
      }))
      .sort((a, b) => a.stock - b.stock);

    return { summary, topSelling, lowPerforming, byCategory, inventoryAlerts };
  }

  /**
   * Generate customer analytics report
   */
  async getCustomerReport(tenantId: string, startDate: Date, endDate: Date): Promise<CustomerReport> {
    const [contacts, newContacts, orders] = await Promise.all([
      this.prisma.contact.findMany({
        where: { tenantId },
        select: {
          id: true,
          createdAt: true,
          ordersCount: true,
          totalSpent: true,
          lastOrderAt: true,
          governorate: true,
        },
      }),
      this.prisma.contact.count({
        where: { tenantId, createdAt: { gte: startDate, lte: endDate } },
      }),
      this.prisma.order.findMany({
        where: { tenantId, createdAt: { gte: startDate, lte: endDate }, status: 'DELIVERED' },
        select: { contactId: true },
      }),
    ]);

    // Summary
    const totalCustomers = contacts.length;
    const returningCustomers = contacts.filter(c => c.ordersCount > 1).length;
    const avgLifetimeValue = totalCustomers > 0
      ? contacts.reduce((sum, c) => sum + Number(c.totalSpent), 0) / totalCustomers
      : 0;
    const avgOrdersPerCustomer = totalCustomers > 0
      ? contacts.reduce((sum, c) => sum + c.ordersCount, 0) / totalCustomers
      : 0;

    const summary = {
      totalCustomers,
      newCustomers: newContacts,
      returningCustomers,
      avgLifetimeValue,
      avgOrdersPerCustomer,
    };

    // Segments by spending
    const segments = [
      { segment: 'VIP (>5000 EGP)', count: contacts.filter(c => Number(c.totalSpent) > 5000).length, avgSpent: 0 },
      { segment: 'Regular (1000-5000 EGP)', count: contacts.filter(c => Number(c.totalSpent) >= 1000 && Number(c.totalSpent) <= 5000).length, avgSpent: 0 },
      { segment: 'Occasional (<1000 EGP)', count: contacts.filter(c => Number(c.totalSpent) > 0 && Number(c.totalSpent) < 1000).length, avgSpent: 0 },
      { segment: 'No Purchase', count: contacts.filter(c => Number(c.totalSpent) === 0).length, avgSpent: 0 },
    ];

    // By governorate
    const govMap = new Map<string, { count: number; totalSpent: number }>();
    for (const contact of contacts) {
      const gov = contact.governorate || 'غير محدد';
      const existing = govMap.get(gov) || { count: 0, totalSpent: 0 };
      govMap.set(gov, {
        count: existing.count + 1,
        totalSpent: existing.totalSpent + Number(contact.totalSpent),
      });
    }
    const byGovernorate = Array.from(govMap.entries())
      .map(([governorate, data]) => ({
        governorate,
        count: data.count,
        avgSpent: data.count > 0 ? data.totalSpent / data.count : 0,
      }))
      .sort((a, b) => b.count - a.count);

    // RFM Analysis (simplified)
    const now = new Date();
    const rfm = {
      champions: 0,
      loyalCustomers: 0,
      potentialLoyalists: 0,
      atRisk: 0,
      cantLoseThem: 0,
      hibernating: 0,
      lost: 0,
    };

    for (const contact of contacts) {
      const daysSinceLastOrder = contact.lastOrderAt
        ? Math.floor((now.getTime() - contact.lastOrderAt.getTime()) / (1000 * 60 * 60 * 24))
        : 999;
      const orderCount = contact.ordersCount;
      const totalSpent = Number(contact.totalSpent);

      if (daysSinceLastOrder <= 30 && orderCount >= 5 && totalSpent >= 3000) {
        rfm.champions++;
      } else if (daysSinceLastOrder <= 60 && orderCount >= 3) {
        rfm.loyalCustomers++;
      } else if (daysSinceLastOrder <= 30 && orderCount <= 2) {
        rfm.potentialLoyalists++;
      } else if (daysSinceLastOrder > 60 && daysSinceLastOrder <= 120 && orderCount >= 3) {
        rfm.atRisk++;
      } else if (daysSinceLastOrder > 60 && totalSpent >= 3000) {
        rfm.cantLoseThem++;
      } else if (daysSinceLastOrder > 120 && daysSinceLastOrder <= 365) {
        rfm.hibernating++;
      } else if (daysSinceLastOrder > 365 || orderCount === 0) {
        rfm.lost++;
      }
    }

    return { summary, segments, byGovernorate, retention: [], rfm };
  }

  /**
   * Generate conversation analytics report
   */
  async getConversationReport(tenantId: string, startDate: Date, endDate: Date): Promise<ConversationReport> {
    const conversations = await this.prisma.conversation.findMany({
      where: { tenantId, createdAt: { gte: startDate, lte: endDate } },
      include: { assignee: { select: { firstName: true, lastName: true } } },
    });

    // Summary
    const totalConversations = conversations.length;
    const resolved = conversations.filter(c => c.status === 'RESOLVED').length;
    const automated = conversations.filter(c => c.isAutomated).length;
    const avgResponseTime = conversations.length > 0
      ? conversations.reduce((sum, c) => sum + (c.firstResponseTime || 0), 0) / conversations.length
      : 0;

    const summary = {
      totalConversations,
      avgResponseTime,
      resolutionRate: totalConversations > 0 ? (resolved / totalConversations) * 100 : 0,
      automationRate: totalConversations > 0 ? (automated / totalConversations) * 100 : 0,
      satisfaction: 0, // Would need rating data
    };

    // By agent
    const agentMap = new Map<string, { conversations: number; totalResponseTime: number; resolved: number }>();
    for (const conv of conversations.filter(c => c.assignee)) {
      const agentName = `${conv.assignee.firstName} ${conv.assignee.lastName}`.trim();
      const existing = agentMap.get(agentName) || { conversations: 0, totalResponseTime: 0, resolved: 0 };
      agentMap.set(agentName, {
        conversations: existing.conversations + 1,
        totalResponseTime: existing.totalResponseTime + (conv.firstResponseTime || 0),
        resolved: existing.resolved + (conv.status === 'RESOLVED' ? 1 : 0),
      });
    }
    const byAgent = Array.from(agentMap.entries())
      .map(([agent, data]) => ({
        agent,
        conversations: data.conversations,
        avgResponseTime: data.conversations > 0 ? data.totalResponseTime / data.conversations : 0,
        resolved: data.resolved,
      }));

    // By hour
    const hourMap = new Map<number, number>();
    for (const conv of conversations) {
      const hour = conv.createdAt.getHours();
      hourMap.set(hour, (hourMap.get(hour) || 0) + 1);
    }
    const byHour = Array.from({ length: 24 }, (_, i) => ({
      hour: i,
      conversations: hourMap.get(i) || 0,
    }));

    // By day of week
    const dayNames = ['الأحد', 'الإثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];
    const dayMap = new Map<number, number>();
    for (const conv of conversations) {
      const day = conv.createdAt.getDay();
      dayMap.set(day, (dayMap.get(day) || 0) + 1);
    }
    const byDay = Array.from({ length: 7 }, (_, i) => ({
      day: dayNames[i],
      conversations: dayMap.get(i) || 0,
    }));

    return { summary, byAgent, byHour, byDay, topIntents: [] };
  }

  /**
   * Export report as CSV
   */
  generateCSV(data: any[], headers: string[]): string {
    const headerRow = headers.join(',');
    const rows = data.map(row => headers.map(h => `"${row[h] || ''}"`).join(','));
    return [headerRow, ...rows].join('\n');
  }
}
