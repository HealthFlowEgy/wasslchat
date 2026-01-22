import { Injectable, Logger } from '@nestjs/common';
import { OpenAiService } from './openai.service';
import { ClaudeService } from './claude.service';
import { AiResponseGenerator } from './ai-response.generator';

@Injectable()
export class AiService {
  private readonly logger = new Logger(AiService.name);

  constructor(
    private readonly openAiService: OpenAiService,
    private readonly claudeService: ClaudeService,
    private readonly responseGenerator: AiResponseGenerator,
  ) {}

  /**
   * Generate reply suggestions for a message
   */
  async getSuggestions(params: {
    tenantId: string;
    conversationId: string;
    message: string;
    contactId?: string;
  }) {
    return this.responseGenerator.generateSuggestions({
      tenantId: params.tenantId,
      conversationId: params.conversationId,
      customerMessage: params.message,
      contactId: params.contactId,
    });
  }

  /**
   * Analyze message sentiment
   */
  async analyzeSentiment(text: string) {
    return this.openAiService.analyzeSentiment(text);
  }

  /**
   * Classify message intent
   */
  async classifyIntent(message: string) {
    return this.openAiService.classifyIntent(message);
  }

  /**
   * Summarize a conversation
   */
  async summarizeConversation(conversationId: string) {
    return this.responseGenerator.summarizeForHandoff(conversationId);
  }

  /**
   * Generate product description
   */
  async generateProductDescription(productName: string, features: string[]) {
    return this.openAiService.generateProductDescription(productName, features);
  }

  /**
   * Generate broadcast content
   */
  async generateBroadcastContent(params: {
    purpose: 'promotion' | 'announcement' | 'reminder' | 'followup';
    details: string;
    targetAudience?: string;
  }) {
    return this.claudeService.generateBroadcastContent({
      ...params,
      includeEmoji: true,
    });
  }

  /**
   * Translate text
   */
  async translate(text: string, targetLanguage: 'ar' | 'en') {
    return this.claudeService.translate(text, targetLanguage);
  }

  /**
   * Extract order information from message
   */
  async extractOrderInfo(message: string) {
    return this.claudeService.extractOrderInfo(message);
  }

  /**
   * Analyze conversation sentiment
   */
  async getConversationSentiment(conversationId: string) {
    return this.responseGenerator.analyzeConversationSentiment(conversationId);
  }
}
