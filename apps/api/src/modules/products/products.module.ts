import { Module } from '@nestjs/common';
import { PaymentsService } from './products.service';
import { PaymentsController } from './products.controller';

@Module({
  controllers: [PaymentsController],
  providers: [PaymentsService],
  exports: [PaymentsService],
})
export class PaymentsModule {}
