import { Module } from '@nestjs/common';
import { AnalyticsController } from './analytics.controller';
import { AnalyticsService } from './analytics.service';
import { DashboardService } from './dashboard.service';
import { ReportsService } from './reports.service';

@Module({
  controllers: [AnalyticsController],
  providers: [AnalyticsService, DashboardService, ReportsService],
  exports: [AnalyticsService, DashboardService],
})
export class AnalyticsModule {}
