import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bull';
import { OrdersController } from './orders.controller';
import { OrdersService } from './orders.service';
import { OrdersWebhookController } from './orders-webhook.controller';

@Module({
  imports: [
    BullModule.registerQueue({ name: 'orders' }),
  ],
  controllers: [OrdersController, OrdersWebhookController],
  providers: [OrdersService],
  exports: [OrdersService],
})
export class OrdersModule {}
