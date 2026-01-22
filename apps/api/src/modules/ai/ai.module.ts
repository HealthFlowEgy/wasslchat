import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { AiController } from './ai.controller';
import { AiService } from './ai.service';
import { OpenAiService } from './openai.service';
import { ClaudeService } from './claude.service';
import { AiResponseGenerator } from './ai-response.generator';

@Module({
  imports: [HttpModule],
  controllers: [AiController],
  providers: [AiService, OpenAiService, ClaudeService, AiResponseGenerator],
  exports: [AiService, AiResponseGenerator],
})
export class AiModule {}
