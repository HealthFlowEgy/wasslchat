import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { BullModule } from '@nestjs/bull';
import { ChatbotsController } from './chatbots.controller';
import { ChatbotsService } from './chatbots.service';
import { TypebotService } from './typebot.service';
import { N8nService } from './n8n.service';
import { ChatbotFlowEngine } from './chatbot-flow.engine';

@Module({
  imports: [
    HttpModule,
    BullModule.registerQueue({ name: 'chatbot-messages' }),
  ],
  controllers: [ChatbotsController],
  providers: [
    ChatbotsService,
    TypebotService,
    N8nService,
    ChatbotFlowEngine,
  ],
  exports: [ChatbotsService, ChatbotFlowEngine],
})
export class ChatbotsModule {}
