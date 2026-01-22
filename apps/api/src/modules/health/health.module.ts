import { Module } from '@nestjs/common';
import { ConversationsService } from './health.service';
import { ConversationsController } from './health.controller';

@Module({
  controllers: [ConversationsController],
  providers: [ConversationsService],
  exports: [ConversationsService],
})
export class ConversationsModule {}
