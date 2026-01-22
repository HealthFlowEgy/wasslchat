import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { BullModule } from '@nestjs/bull';
import { IntegrationsController } from './integrations.controller';
import { IntegrationsService } from './integrations.service';
import { WooCommerceService } from './ecommerce/woocommerce.service';
import { ShopifyService } from './ecommerce/shopify.service';
import { WasslBoxService } from './shipping/wasslbox.service';
import { BostaService } from './shipping/bosta.service';
import { IntegrationSyncProcessor } from './integration-sync.processor';

@Module({
  imports: [
    HttpModule,
    BullModule.registerQueue(
      { name: 'integration-sync' },
      { name: 'order-sync' },
    ),
  ],
  controllers: [IntegrationsController],
  providers: [
    IntegrationsService,
    WooCommerceService,
    ShopifyService,
    WasslBoxService,
    BostaService,
    IntegrationSyncProcessor,
  ],
  exports: [IntegrationsService, WooCommerceService, ShopifyService, WasslBoxService, BostaService],
})
export class IntegrationsModule {}
