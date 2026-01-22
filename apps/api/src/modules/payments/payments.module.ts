import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { BullModule } from '@nestjs/bull';
import { PaymentsController } from './payments.controller';
import { PaymentsService } from './payments.service';
import { PaymentWebhookController } from './payment-webhook.controller';
import { HealthPayService } from './gateways/healthpay.service';
import { FawryService } from './gateways/fawry.service';
import { VodafoneCashService } from './gateways/vodafone-cash.service';
import { PaymentProcessorService } from './payment-processor.service';

@Module({
  imports: [
    HttpModule,
    BullModule.registerQueue({ name: 'payments' }),
  ],
  controllers: [PaymentsController, PaymentWebhookController],
  providers: [
    PaymentsService,
    PaymentProcessorService,
    HealthPayService,
    FawryService,
    VodafoneCashService,
  ],
  exports: [PaymentsService, PaymentProcessorService],
})
export class PaymentsModule {}
