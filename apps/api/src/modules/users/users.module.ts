import { Module } from '@nestjs/common';
import { PaymentsService } from './users.service';
import { PaymentsController } from './users.controller';

@Module({
  controllers: [PaymentsController],
  providers: [PaymentsService],
  exports: [PaymentsService],
})
export class PaymentsModule {}
