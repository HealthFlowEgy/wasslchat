import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { OpenAiService } from './openai.service';
import { ClaudeService } from './claude.service';

/**
 * AI Response Generator
 * 
 * Orchestrates AI services to generate smart responses
 * for customer conversations, with context awareness.
 */

export interface GenerateResponseParams {
  tenantId: string;
  conversationId: string;
  customerMessage: string;
  contactId?: string;
  provider?: 'openai' | 'claude' | 'auto';
}

export interface ResponseSuggestion {
  text: string;
  confidence: number;
  intent?: string;
}

@Injectable()
export class AiResponseGenerator {
  private readonly logger = new Logger(AiResponseGenerator.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly openAiService: OpenAiService,
    private readonly claudeService: ClaudeService,
  ) {}

  /**
   * Generate smart reply suggestions
   */
  async generateSuggestions(params: GenerateResponseParams): Promise<ResponseSuggestion[]> {
    const { tenantId, conversationId, customerMessage, contactId, provider = 'auto' } = params;

    try {
      // Get conversation context
      const context = await this.buildContext(tenantId, conversationId, contactId);

      // Classify intent first
      const intentResult = await this.openAiService.classifyIntent(customerMessage);

      // Generate suggestions based on provider
      let suggestions: string[];
      
      if (provider === 'claude' || (provider === 'auto' && this.shouldUseClaude(intentResult.intent))) {
        // Use Claude for complex queries
        const response = await this.claudeService.generateCustomerResponse({
          conversationHistory: context.messages.map(m => ({
            role: m.direction === 'INBOUND' ? 'user' as const : 'assistant' as const,
            content: m.content,
          })),
          customerMessage,
          context: {
            storeName: context.tenant?.name || 'المتجر',
            productInfo: context.relevantProducts,
            orderInfo: context.recentOrders,
            tone: 'friendly',
          },
        });
        suggestions = response ? [response] : [];
      } else {
        // Use OpenAI for standard queries
        suggestions = await this.openAiService.generateReplySuggestions(
          context.conversationHistory,
          customerMessage,
          {
            productCatalog: context.relevantProducts,
            orderHistory: context.recentOrders,
            language: 'ar',
          },
        );
      }

      // Add intent-based quick replies
      const quickReplies = this.getQuickReplies(intentResult.intent);

      return [
        ...suggestions.map((text, i) => ({
          text,
          confidence: 0.9 - i * 0.1,
          intent: intentResult.intent,
        })),
        ...quickReplies.map(text => ({
          text,
          confidence: 0.7,
          intent: intentResult.intent,
        })),
      ].slice(0, 5);
    } catch (error) {
      this.logger.error(`Failed to generate suggestions: ${error.message}`);
      return this.getFallbackSuggestions();
    }
  }

  /**
   * Generate automatic response for chatbot
   */
  async generateAutoResponse(params: GenerateResponseParams): Promise<string | null> {
    const { tenantId, conversationId, customerMessage, contactId } = params;

    try {
      // Check if auto-response is enabled
      const tenant = await this.prisma.tenant.findUnique({
        where: { id: tenantId },
        select: { settings: true },
      });

      const settings = tenant?.settings as any;
      if (!settings?.aiAutoResponse) {
        return null;
      }

      // Classify intent
      const { intent, confidence } = await this.openAiService.classifyIntent(customerMessage);

      // Only auto-respond for high-confidence simple queries
      if (confidence < 0.8 || !this.canAutoRespond(intent)) {
        return null;
      }

      // Build context
      const context = await this.buildContext(tenantId, conversationId, contactId);

      // Generate response
      const response = await this.claudeService.generateCustomerResponse({
        conversationHistory: [],
        customerMessage,
        context: {
          storeName: context.tenant?.name || 'المتجر',
          productInfo: context.relevantProducts,
          orderInfo: context.recentOrders,
          policies: settings?.policies,
          tone: settings?.aiTone || 'friendly',
        },
      });

      return response || null;
    } catch (error) {
      this.logger.error(`Auto-response error: ${error.message}`);
      return null;
    }
  }

  /**
   * Analyze sentiment of conversation
   */
  async analyzeConversationSentiment(conversationId: string): Promise<{
    overall: 'positive' | 'negative' | 'neutral';
    trend: 'improving' | 'declining' | 'stable';
    alerts: string[];
  }> {
    try {
      const messages = await this.prisma.message.findMany({
        where: { conversationId, direction: 'INBOUND' },
        orderBy: { createdAt: 'desc' },
        take: 10,
      });

      if (messages.length === 0) {
        return { overall: 'neutral', trend: 'stable', alerts: [] };
      }

      // Analyze last few messages
      const sentiments = await Promise.all(
        messages.slice(0, 5).map(m => this.openAiService.analyzeSentiment(m.content)),
      );

      // Calculate overall sentiment
      const scores = sentiments.map(s => 
        s.sentiment === 'positive' ? 1 : s.sentiment === 'negative' ? -1 : 0
      );
      const avgScore = scores.reduce((a, b) => a + b, 0) / scores.length;
      const overall = avgScore > 0.3 ? 'positive' : avgScore < -0.3 ? 'negative' : 'neutral';

      // Calculate trend
      const recentScore = scores.slice(0, 2).reduce((a, b) => a + b, 0) / 2;
      const olderScore = scores.slice(2).reduce((a, b) => a + b, 0) / Math.max(scores.length - 2, 1);
      const trend = recentScore > olderScore + 0.3 ? 'improving' : 
                    recentScore < olderScore - 0.3 ? 'declining' : 'stable';

      // Generate alerts
      const alerts: string[] = [];
      if (overall === 'negative') alerts.push('العميل غير راضٍ - يحتاج اهتمام فوري');
      if (trend === 'declining') alerts.push('مستوى الرضا في انخفاض');
      if (sentiments.some(s => s.emotions.includes('غضب'))) alerts.push('العميل يظهر علامات غضب');

      return { overall, trend, alerts };
    } catch (error) {
      this.logger.error(`Sentiment analysis error: ${error.message}`);
      return { overall: 'neutral', trend: 'stable', alerts: [] };
    }
  }

  /**
   * Summarize conversation for agent handoff
   */
  async summarizeForHandoff(conversationId: string): Promise<{
    summary: string;
    mainIssue: string;
    customerMood: string;
    suggestedAction: string;
  }> {
    try {
      const messages = await this.prisma.message.findMany({
        where: { conversationId },
        orderBy: { createdAt: 'asc' },
        take: 20,
      });

      const conversation = await this.prisma.conversation.findUnique({
        where: { id: conversationId },
        include: { contact: { select: { name: true, phone: true, ordersCount: true } } },
      });

      const messageTexts = messages.map(m => 
        `${m.direction === 'INBOUND' ? 'العميل' : 'الموظف'}: ${m.content}`
      );

      const summary = await this.openAiService.summarizeConversation(messageTexts);
      const sentiment = await this.analyzeConversationSentiment(conversationId);

      return {
        summary,
        mainIssue: 'استفسار عام', // Would be extracted from intent
        customerMood: sentiment.overall === 'positive' ? 'راضٍ' : 
                      sentiment.overall === 'negative' ? 'غير راضٍ' : 'محايد',
        suggestedAction: sentiment.alerts.length > 0 ? sentiment.alerts[0] : 'متابعة عادية',
      };
    } catch (error) {
      this.logger.error(`Handoff summary error: ${error.message}`);
      return {
        summary: 'لم يتم تلخيص المحادثة',
        mainIssue: 'غير محدد',
        customerMood: 'غير محدد',
        suggestedAction: 'مراجعة المحادثة',
      };
    }
  }

  // ============= Private Helpers =============

  private async buildContext(tenantId: string, conversationId: string, contactId?: string) {
    const [tenant, conversation, contact, products] = await Promise.all([
      this.prisma.tenant.findUnique({ where: { id: tenantId }, select: { name: true, settings: true } }),
      this.prisma.conversation.findUnique({
        where: { id: conversationId },
        include: { messages: { take: 10, orderBy: { createdAt: 'desc' } } },
      }),
      contactId ? this.prisma.contact.findUnique({
        where: { id: contactId },
        include: { orders: { take: 3, orderBy: { createdAt: 'desc' } } },
      }) : null,
      this.prisma.product.findMany({
        where: { tenantId, isActive: true },
        take: 10,
        select: { name: true, price: true, inventoryQty: true },
      }),
    ]);

    const messages = conversation?.messages?.reverse() || [];
    const conversationHistory = messages.map(m => 
      `${m.direction === 'INBOUND' ? 'العميل' : 'أنت'}: ${m.content}`
    ).join('\n');

    const relevantProducts = products.map(p => 
      `- ${p.name}: ${p.price} جنيه ${p.inventoryQty <= 0 ? '(غير متوفر)' : ''}`
    ).join('\n');

    const recentOrders = contact?.orders?.map(o => 
      `طلب #${o.orderNumber}: ${o.status} - ${o.total} جنيه`
    ).join('\n') || '';

    return { tenant, messages, conversationHistory, relevantProducts, recentOrders };
  }

  private shouldUseClaude(intent: string): boolean {
    // Use Claude for complex intents that need reasoning
    const complexIntents = ['complaint', 'return_request', 'payment_issue', 'support'];
    return complexIntents.includes(intent);
  }

  private canAutoRespond(intent: string): boolean {
    // Only auto-respond to simple queries
    const simpleIntents = ['greeting', 'thanks', 'goodbye', 'product_inquiry', 'price_inquiry'];
    return simpleIntents.includes(intent);
  }

  private getQuickReplies(intent: string): string[] {
    const quickReplies: Record<string, string[]> = {
      greeting: ['أهلاً بك! كيف يمكنني مساعدتك؟', 'مرحباً! سعيد بخدمتك'],
      thanks: ['العفو! سعدت بخدمتك', 'شكراً لك! لا تتردد في التواصل معنا'],
      goodbye: ['مع السلامة! نتطلع لخدمتك مجدداً', 'وداعاً! شكراً لتواصلك معنا'],
      order_status: ['سأتحقق من حالة طلبك حالاً', 'يرجى إعطائي رقم الطلب للمتابعة'],
      shipping_inquiry: ['الشحن يستغرق 2-3 أيام عمل', 'يمكنك تتبع طلبك من خلال رابط التتبع'],
    };
    return quickReplies[intent] || [];
  }

  private getFallbackSuggestions(): ResponseSuggestion[] {
    return [
      { text: 'كيف يمكنني مساعدتك؟', confidence: 0.5 },
      { text: 'سأتحقق من ذلك وأعود إليك', confidence: 0.5 },
      { text: 'هل يمكنك توضيح المزيد من التفاصيل؟', confidence: 0.5 },
    ];
  }
}
