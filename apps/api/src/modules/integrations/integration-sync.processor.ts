import { Process, Processor, OnQueueCompleted, OnQueueFailed } from '@nestjs/bull';
import { Logger } from '@nestjs/common';
import { Job } from 'bull';
import { IntegrationsService } from './integrations.service';

@Processor('integration-sync')
export class IntegrationSyncProcessor {
  private readonly logger = new Logger(IntegrationSyncProcessor.name);

  constructor(private readonly integrationsService: IntegrationsService) {}

  @Process('initial-sync')
  async handleInitialSync(job: Job<{ integrationId: string; tenantId: string }>) {
    const { integrationId, tenantId } = job.data;
    this.logger.log(`Starting initial sync for integration ${integrationId}`);

    try {
      await this.integrationsService.syncProducts(tenantId, integrationId);
      return { success: true };
    } catch (error) {
      this.logger.error(`Initial sync failed: ${error.message}`);
      throw error;
    }
  }

  @Process('manual-sync')
  async handleManualSync(job: Job<{ integrationId: string; tenantId: string; syncType: string }>) {
    const { integrationId, tenantId, syncType } = job.data;
    this.logger.log(`Starting manual sync (${syncType}) for integration ${integrationId}`);

    try {
      if (syncType === 'products' || syncType === 'all') {
        await this.integrationsService.syncProducts(tenantId, integrationId);
      }
      return { success: true };
    } catch (error) {
      this.logger.error(`Manual sync failed: ${error.message}`);
      throw error;
    }
  }

  @OnQueueCompleted()
  onCompleted(job: Job, result: any) {
    this.logger.log(`Sync job ${job.id} completed`);
  }

  @OnQueueFailed()
  onFailed(job: Job, error: Error) {
    this.logger.error(`Sync job ${job.id} failed: ${error.message}`);
  }
}
