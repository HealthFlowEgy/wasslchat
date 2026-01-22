import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { BullModule } from '@nestjs/bull';
import { WhatsappService } from './whatsapp.service';
import { WhatsappController } from './whatsapp.controller';
import { EvolutionApiService } from './evolution-api.service';
import { WhatsappWebhookController } from './whatsapp-webhook.controller';

@Module({
  imports: [
    HttpModule,
    BullModule.registerQueue(
      { name: 'whatsapp-messages' },
      { name: 'whatsapp-broadcasts' },
    ),
  ],
  controllers: [WhatsappController, WhatsappWebhookController],
  providers: [WhatsappService, EvolutionApiService],
  exports: [WhatsappService, EvolutionApiService],
})
export class WhatsappModule {}
