import { Module } from '@nestjs/common';
import { PaymentsService } from './tenants.service';
import { PaymentsController } from './tenants.controller';

@Module({
  controllers: [PaymentsController],
  providers: [PaymentsService],
  exports: [PaymentsService],
})
export class PaymentsModule {}
