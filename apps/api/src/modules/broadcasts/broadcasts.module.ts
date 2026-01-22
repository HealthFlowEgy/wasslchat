import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bull';
import { BroadcastsController } from './broadcasts.controller';
import { BroadcastsService } from './broadcasts.service';
import { BroadcastProcessor } from './broadcast.processor';
import { WhatsappModule } from '../whatsapp/whatsapp.module';

@Module({
  imports: [
    BullModule.registerQueue(
      { name: 'broadcasts' },
      { name: 'broadcast-messages' },
    ),
    WhatsappModule,
  ],
  controllers: [BroadcastsController],
  providers: [BroadcastsService, BroadcastProcessor],
  exports: [BroadcastsService],
})
export class BroadcastsModule {}
