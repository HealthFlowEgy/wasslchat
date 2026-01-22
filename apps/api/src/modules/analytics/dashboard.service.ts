import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';

export interface DashboardMetrics {
  overview: {
    totalRevenue: number;
    totalOrders: number;
    totalContacts: number;
    totalConversations: number;
    avgOrderValue: number;
    conversionRate: number;
  };
  revenueChart: Array<{ date: string; revenue: number; orders: number }>;
  ordersByStatus: Array<{ status: string; count: number }>;
  topProducts: Array<{ id: string; name: string; sold: number; revenue: number }>;
  topCustomers: Array<{ id: string; name: string; orders: number; spent: number }>;
  recentOrders: any[];
  conversationMetrics: {
    total: number;
    open: number;
    resolved: number;
    avgResponseTime: number;
    automationRate: number;
  };
  broadcastMetrics: {
    sent: number;
    delivered: number;
    read: number;
    deliveryRate: number;
    readRate: number;
  };
}

@Injectable()
export class DashboardService {
  private readonly logger = new Logger(DashboardService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Get complete dashboard metrics
   */
  async getDashboard(tenantId: string, period: 'today' | 'week' | 'month' | 'year' = 'month'): Promise<DashboardMetrics> {
    const { startDate, endDate } = this.getDateRange(period);

    const [
      overview,
      revenueChart,
      ordersByStatus,
      topProducts,
      topCustomers,
      recentOrders,
      conversationMetrics,
      broadcastMetrics,
    ] = await Promise.all([
      this.getOverviewMetrics(tenantId, startDate, endDate),
      this.getRevenueChart(tenantId, startDate, endDate, period),
      this.getOrdersByStatus(tenantId, startDate, endDate),
      this.getTopProducts(tenantId, startDate, endDate, 10),
      this.getTopCustomers(tenantId, startDate, endDate, 10),
      this.getRecentOrders(tenantId, 10),
      this.getConversationMetrics(tenantId, startDate, endDate),
      this.getBroadcastMetrics(tenantId, startDate, endDate),
    ]);

    return {
      overview,
      revenueChart,
      ordersByStatus,
      topProducts,
      topCustomers,
      recentOrders,
      conversationMetrics,
      broadcastMetrics,
    };
  }

  /**
   * Overview metrics (cards)
   */
  async getOverviewMetrics(tenantId: string, startDate: Date, endDate: Date) {
    const [
      revenueData,
      ordersCount,
      contactsCount,
      conversationsCount,
      previousRevenue,
      previousOrders,
    ] = await Promise.all([
      this.prisma.order.aggregate({
        where: { tenantId, status: 'DELIVERED', createdAt: { gte: startDate, lte: endDate } },
        _sum: { total: true },
        _count: true,
      }),
      this.prisma.order.count({
        where: { tenantId, createdAt: { gte: startDate, lte: endDate } },
      }),
      this.prisma.contact.count({
        where: { tenantId, createdAt: { gte: startDate, lte: endDate } },
      }),
      this.prisma.conversation.count({
        where: { tenantId, createdAt: { gte: startDate, lte: endDate } },
      }),
      // Previous period for comparison
      this.prisma.order.aggregate({
        where: {
          tenantId,
          status: 'DELIVERED',
          createdAt: {
            gte: new Date(startDate.getTime() - (endDate.getTime() - startDate.getTime())),
            lt: startDate,
          },
        },
        _sum: { total: true },
      }),
      this.prisma.order.count({
        where: {
          tenantId,
          createdAt: {
            gte: new Date(startDate.getTime() - (endDate.getTime() - startDate.getTime())),
            lt: startDate,
          },
        },
      }),
    ]);

    const totalRevenue = Number(revenueData._sum.total) || 0;
    const deliveredOrders = revenueData._count || 0;
    const avgOrderValue = deliveredOrders > 0 ? totalRevenue / deliveredOrders : 0;
    const conversionRate = ordersCount > 0 && contactsCount > 0 
      ? (deliveredOrders / contactsCount) * 100 
      : 0;

    // Calculate growth percentages
    const prevRevenue = Number(previousRevenue._sum.total) || 0;
    const revenueGrowth = prevRevenue > 0 ? ((totalRevenue - prevRevenue) / prevRevenue) * 100 : 0;
    const ordersGrowth = previousOrders > 0 ? ((ordersCount - previousOrders) / previousOrders) * 100 : 0;

    return {
      totalRevenue,
      totalOrders: ordersCount,
      totalContacts: contactsCount,
      totalConversations: conversationsCount,
      avgOrderValue,
      conversionRate,
      revenueGrowth: Math.round(revenueGrowth * 100) / 100,
      ordersGrowth: Math.round(ordersGrowth * 100) / 100,
    };
  }

  /**
   * Revenue chart data
   */
  async getRevenueChart(tenantId: string, startDate: Date, endDate: Date, period: string) {
    const orders = await this.prisma.order.findMany({
      where: {
        tenantId,
        status: { in: ['DELIVERED', 'CONFIRMED', 'SHIPPED'] },
        createdAt: { gte: startDate, lte: endDate },
      },
      select: { createdAt: true, total: true },
      orderBy: { createdAt: 'asc' },
    });

    // Group by date based on period
    const groupedData = new Map<string, { revenue: number; orders: number }>();
    const dateFormat = period === 'today' ? 'hour' : period === 'year' ? 'month' : 'day';

    for (const order of orders) {
      const key = this.formatDateKey(order.createdAt, dateFormat);
      const existing = groupedData.get(key) || { revenue: 0, orders: 0 };
      groupedData.set(key, {
        revenue: existing.revenue + Number(order.total),
        orders: existing.orders + 1,
      });
    }

    // Fill gaps and convert to array
    const result: Array<{ date: string; revenue: number; orders: number }> = [];
    const currentDate = new Date(startDate);

    while (currentDate <= endDate) {
      const key = this.formatDateKey(currentDate, dateFormat);
      const data = groupedData.get(key) || { revenue: 0, orders: 0 };
      result.push({ date: key, ...data });

      // Increment based on period
      if (dateFormat === 'hour') {
        currentDate.setHours(currentDate.getHours() + 1);
      } else if (dateFormat === 'day') {
        currentDate.setDate(currentDate.getDate() + 1);
      } else {
        currentDate.setMonth(currentDate.getMonth() + 1);
      }
    }

    return result;
  }

  /**
   * Orders by status breakdown
   */
  async getOrdersByStatus(tenantId: string, startDate: Date, endDate: Date) {
    const result = await this.prisma.order.groupBy({
      by: ['status'],
      where: { tenantId, createdAt: { gte: startDate, lte: endDate } },
      _count: true,
    });

    return result.map((r) => ({
      status: r.status,
      statusAr: this.translateOrderStatus(r.status),
      count: r._count,
    }));
  }

  /**
   * Top selling products
   */
  async getTopProducts(tenantId: string, startDate: Date, endDate: Date, limit: number) {
    const items = await this.prisma.orderItem.groupBy({
      by: ['productId', 'productName'],
      where: {
        order: { tenantId, createdAt: { gte: startDate, lte: endDate }, status: { not: 'CANCELLED' } },
      },
      _sum: { quantity: true, totalPrice: true },
      orderBy: { _sum: { quantity: 'desc' } },
      take: limit,
    });

    return items.map((item) => ({
      id: item.productId,
      name: item.productName,
      sold: item._sum.quantity || 0,
      revenue: Number(item._sum.totalPrice) || 0,
    }));
  }

  /**
   * Top customers by spending
   */
  async getTopCustomers(tenantId: string, startDate: Date, endDate: Date, limit: number) {
    const contacts = await this.prisma.contact.findMany({
      where: {
        tenantId,
        orders: { some: { createdAt: { gte: startDate, lte: endDate }, status: 'DELIVERED' } },
      },
      select: {
        id: true,
        name: true,
        phone: true,
        _count: { select: { orders: true } },
        orders: {
          where: { createdAt: { gte: startDate, lte: endDate }, status: 'DELIVERED' },
          select: { total: true },
        },
      },
      orderBy: { totalSpent: 'desc' },
      take: limit,
    });

    return contacts.map((c) => ({
      id: c.id,
      name: c.name || c.phone,
      orders: c._count.orders,
      spent: c.orders.reduce((sum, o) => sum + Number(o.total), 0),
    }));
  }

  /**
   * Recent orders
   */
  async getRecentOrders(tenantId: string, limit: number) {
    return this.prisma.order.findMany({
      where: { tenantId },
      orderBy: { createdAt: 'desc' },
      take: limit,
      include: {
        contact: { select: { id: true, name: true, phone: true } },
      },
    });
  }

  /**
   * Conversation metrics
   */
  async getConversationMetrics(tenantId: string, startDate: Date, endDate: Date) {
    const [total, open, resolved, avgResponseTime, automatedCount] = await Promise.all([
      this.prisma.conversation.count({
        where: { tenantId, createdAt: { gte: startDate, lte: endDate } },
      }),
      this.prisma.conversation.count({
        where: { tenantId, status: 'OPEN', createdAt: { gte: startDate, lte: endDate } },
      }),
      this.prisma.conversation.count({
        where: { tenantId, status: 'RESOLVED', createdAt: { gte: startDate, lte: endDate } },
      }),
      this.prisma.conversation.aggregate({
        where: { tenantId, createdAt: { gte: startDate, lte: endDate } },
        _avg: { firstResponseTime: true },
      }),
      this.prisma.conversation.count({
        where: { tenantId, createdAt: { gte: startDate, lte: endDate }, isAutomated: true },
      }),
    ]);

    return {
      total,
      open,
      resolved,
      avgResponseTime: avgResponseTime._avg.firstResponseTime || 0,
      automationRate: total > 0 ? (automatedCount / total) * 100 : 0,
    };
  }

  /**
   * Broadcast metrics
   */
  async getBroadcastMetrics(tenantId: string, startDate: Date, endDate: Date) {
    const broadcasts = await this.prisma.broadcast.aggregate({
      where: { tenantId, createdAt: { gte: startDate, lte: endDate }, status: 'COMPLETED' },
      _sum: { sentCount: true, deliveredCount: true, readCount: true },
    });

    const sent = broadcasts._sum.sentCount || 0;
    const delivered = broadcasts._sum.deliveredCount || 0;
    const read = broadcasts._sum.readCount || 0;

    return {
      sent,
      delivered,
      read,
      deliveryRate: sent > 0 ? (delivered / sent) * 100 : 0,
      readRate: delivered > 0 ? (read / delivered) * 100 : 0,
    };
  }

  // ============= Helpers =============

  private getDateRange(period: string): { startDate: Date; endDate: Date } {
    const endDate = new Date();
    let startDate: Date;

    switch (period) {
      case 'today':
        startDate = new Date();
        startDate.setHours(0, 0, 0, 0);
        break;
      case 'week':
        startDate = new Date();
        startDate.setDate(startDate.getDate() - 7);
        break;
      case 'year':
        startDate = new Date();
        startDate.setFullYear(startDate.getFullYear() - 1);
        break;
      case 'month':
      default:
        startDate = new Date();
        startDate.setMonth(startDate.getMonth() - 1);
        break;
    }

    return { startDate, endDate };
  }

  private formatDateKey(date: Date, format: string): string {
    const d = new Date(date);
    if (format === 'hour') {
      return `${d.getHours()}:00`;
    } else if (format === 'day') {
      return d.toISOString().split('T')[0];
    } else {
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    }
  }

  private translateOrderStatus(status: string): string {
    const map: Record<string, string> = {
      PENDING: 'قيد الانتظار',
      CONFIRMED: 'مؤكد',
      PROCESSING: 'قيد التجهيز',
      SHIPPED: 'تم الشحن',
      DELIVERED: 'تم التسليم',
      CANCELLED: 'ملغي',
      REFUNDED: 'مسترد',
    };
    return map[status] || status;
  }
}
