import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { DashboardService } from './dashboard.service';
import { ReportsService } from './reports.service';

@Injectable()
export class AnalyticsService {
  private readonly logger = new Logger(AnalyticsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly dashboardService: DashboardService,
    private readonly reportsService: ReportsService,
  ) {}

  async getDashboard(tenantId: string, period?: string) {
    return this.dashboardService.getDashboard(tenantId, period as any);
  }

  async getSalesReport(tenantId: string, startDate: string, endDate: string) {
    return this.reportsService.getSalesReport(tenantId, new Date(startDate), new Date(endDate));
  }

  async getProductReport(tenantId: string, startDate: string, endDate: string) {
    return this.reportsService.getProductReport(tenantId, new Date(startDate), new Date(endDate));
  }

  async getCustomerReport(tenantId: string, startDate: string, endDate: string) {
    return this.reportsService.getCustomerReport(tenantId, new Date(startDate), new Date(endDate));
  }

  async getConversationReport(tenantId: string, startDate: string, endDate: string) {
    return this.reportsService.getConversationReport(tenantId, new Date(startDate), new Date(endDate));
  }

  async getRealTimeMetrics(tenantId: string) {
    const now = new Date();
    const todayStart = new Date(now.setHours(0, 0, 0, 0));

    const [
      todayOrders,
      todayRevenue,
      activeConversations,
      pendingOrders,
      onlineAgents,
    ] = await Promise.all([
      this.prisma.order.count({ where: { tenantId, createdAt: { gte: todayStart } } }),
      this.prisma.order.aggregate({
        where: { tenantId, createdAt: { gte: todayStart }, status: { in: ['CONFIRMED', 'DELIVERED'] } },
        _sum: { total: true },
      }),
      this.prisma.conversation.count({ where: { tenantId, status: 'OPEN' } }),
      this.prisma.order.count({ where: { tenantId, status: 'PENDING' } }),
      this.prisma.user.count({ where: { tenantId, isActive: true } }),
    ]);

    return {
      todayOrders,
      todayRevenue: Number(todayRevenue._sum.total) || 0,
      activeConversations,
      pendingOrders,
      onlineAgents,
      timestamp: new Date(),
    };
  }

  async trackEvent(tenantId: string, event: {
    type: string;
    entityType?: string;
    entityId?: string;
    userId?: string;
    metadata?: any;
  }) {
    // Log analytics event (could be stored in a separate analytics table or sent to external service)
    this.logger.debug(`Analytics event: ${event.type} for tenant ${tenantId}`);
    
    // For now, we'll just log it. In production, you might want to:
    // - Store in a time-series database
    // - Send to analytics service (Mixpanel, Amplitude, etc.)
    // - Store in a dedicated analytics table
  }
}
