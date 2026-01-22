import { Controller, Get, Post, Body, Param, Query, UseGuards, ParseUUIDPipe } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { AiService } from './ai.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { TenantId } from '../auth/decorators/current-user.decorator';

@ApiTags('AI')
@ApiBearerAuth('JWT-auth')
@Controller({ path: 'ai', version: '1' })
@UseGuards(JwtAuthGuard)
export class AiController {
  constructor(private readonly aiService: AiService) {}

  @Post('suggestions')
  @ApiOperation({ summary: 'Get AI reply suggestions' })
  async getSuggestions(
    @TenantId() tenantId: string,
    @Body() body: { conversationId: string; message: string; contactId?: string },
  ) {
    return this.aiService.getSuggestions({
      tenantId,
      conversationId: body.conversationId,
      message: body.message,
      contactId: body.contactId,
    });
  }

  @Post('sentiment')
  @ApiOperation({ summary: 'Analyze message sentiment' })
  async analyzeSentiment(@Body('text') text: string) {
    return this.aiService.analyzeSentiment(text);
  }

  @Post('intent')
  @ApiOperation({ summary: 'Classify message intent' })
  async classifyIntent(@Body('message') message: string) {
    return this.aiService.classifyIntent(message);
  }

  @Get('conversations/:id/summary')
  @ApiOperation({ summary: 'Get conversation summary' })
  async summarizeConversation(@Param('id', ParseUUIDPipe) conversationId: string) {
    return this.aiService.summarizeConversation(conversationId);
  }

  @Get('conversations/:id/sentiment')
  @ApiOperation({ summary: 'Get conversation sentiment analysis' })
  async getConversationSentiment(@Param('id', ParseUUIDPipe) conversationId: string) {
    return this.aiService.getConversationSentiment(conversationId);
  }

  @Post('product-description')
  @ApiOperation({ summary: 'Generate AI product description' })
  async generateProductDescription(
    @Body() body: { productName: string; features: string[] },
  ) {
    return this.aiService.generateProductDescription(body.productName, body.features);
  }

  @Post('broadcast-content')
  @ApiOperation({ summary: 'Generate broadcast message content' })
  async generateBroadcastContent(
    @Body() body: { purpose: 'promotion' | 'announcement' | 'reminder' | 'followup'; details: string; targetAudience?: string },
  ) {
    return this.aiService.generateBroadcastContent(body);
  }

  @Post('translate')
  @ApiOperation({ summary: 'Translate text' })
  async translate(@Body() body: { text: string; targetLanguage: 'ar' | 'en' }) {
    return this.aiService.translate(body.text, body.targetLanguage);
  }

  @Post('extract-order')
  @ApiOperation({ summary: 'Extract order info from message' })
  async extractOrderInfo(@Body('message') message: string) {
    return this.aiService.extractOrderInfo(message);
  }
}
