import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';

/**
 * OpenAI Integration Service
 * 
 * Provides access to OpenAI's GPT models for:
 * - Smart reply suggestions
 * - Message summarization
 * - Sentiment analysis
 * - Product descriptions
 * - Intent classification
 */

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface CompletionOptions {
  model?: string;
  temperature?: number;
  maxTokens?: number;
  topP?: number;
  frequencyPenalty?: number;
  presencePenalty?: number;
  stop?: string[];
}

export interface CompletionResult {
  content: string;
  finishReason: string;
  usage: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
}

@Injectable()
export class OpenAiService {
  private readonly logger = new Logger(OpenAiService.name);
  private readonly apiKey: string;
  private readonly apiUrl = 'https://api.openai.com/v1';
  private readonly defaultModel = 'gpt-4o-mini';

  constructor(
    private readonly configService: ConfigService,
    private readonly httpService: HttpService,
  ) {
    this.apiKey = configService.get<string>('OPENAI_API_KEY', '');
  }

  private get headers() {
    return {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${this.apiKey}`,
    };
  }

  /**
   * Generate chat completion
   */
  async chat(messages: ChatMessage[], options: CompletionOptions = {}): Promise<CompletionResult> {
    try {
      const response = await firstValueFrom(
        this.httpService.post(
          `${this.apiUrl}/chat/completions`,
          {
            model: options.model || this.defaultModel,
            messages,
            temperature: options.temperature ?? 0.7,
            max_tokens: options.maxTokens || 1000,
            top_p: options.topP ?? 1,
            frequency_penalty: options.frequencyPenalty ?? 0,
            presence_penalty: options.presencePenalty ?? 0,
            stop: options.stop,
          },
          { headers: this.headers },
        ),
      );

      const choice = response.data.choices[0];
      const usage = response.data.usage;

      return {
        content: choice.message.content,
        finishReason: choice.finish_reason,
        usage: {
          promptTokens: usage.prompt_tokens,
          completionTokens: usage.completion_tokens,
          totalTokens: usage.total_tokens,
        },
      };
    } catch (error) {
      this.logger.error(`OpenAI chat error: ${error.message}`);
      throw error;
    }
  }

  /**
   * Generate smart reply suggestions
   */
  async generateReplySuggestions(
    conversationHistory: string,
    customerMessage: string,
    context: { productCatalog?: string; orderHistory?: string; language?: string },
  ): Promise<string[]> {
    const systemPrompt = `أنت مساعد خدمة عملاء محترف لمتجر إلكتروني مصري. 
مهمتك توليد 3 ردود مقترحة مختصرة ومفيدة للعميل.
الردود يجب أن تكون:
- باللغة ${context.language || 'العربية'}
- مهذبة وودودة
- مختصرة (جملة أو جملتين)
- مفيدة وعملية

${context.productCatalog ? `معلومات المنتجات:\n${context.productCatalog}` : ''}
${context.orderHistory ? `سجل طلبات العميل:\n${context.orderHistory}` : ''}

أرجع الردود في شكل JSON array فقط، بدون أي نص إضافي.
مثال: ["رد 1", "رد 2", "رد 3"]`;

    const userPrompt = `المحادثة السابقة:
${conversationHistory}

رسالة العميل الأخيرة:
${customerMessage}

اقترح 3 ردود مناسبة:`;

    try {
      const result = await this.chat(
        [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        { temperature: 0.8, maxTokens: 500 },
      );

      // Parse JSON response
      const suggestions = JSON.parse(result.content);
      return Array.isArray(suggestions) ? suggestions.slice(0, 3) : [];
    } catch (error) {
      this.logger.error(`Failed to generate reply suggestions: ${error.message}`);
      return [];
    }
  }

  /**
   * Analyze sentiment of a message
   */
  async analyzeSentiment(text: string): Promise<{
    sentiment: 'positive' | 'negative' | 'neutral';
    confidence: number;
    emotions: string[];
  }> {
    const systemPrompt = `حلل المشاعر في النص التالي وأرجع النتيجة كـ JSON بالتنسيق:
{
  "sentiment": "positive" | "negative" | "neutral",
  "confidence": 0.0-1.0,
  "emotions": ["emotion1", "emotion2"]
}
الأحاسيس الممكنة: سعادة، غضب، إحباط، رضا، قلق، حماس، حزن`;

    try {
      const result = await this.chat(
        [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: text },
        ],
        { temperature: 0.3, maxTokens: 200 },
      );

      return JSON.parse(result.content);
    } catch (error) {
      this.logger.error(`Sentiment analysis error: ${error.message}`);
      return { sentiment: 'neutral', confidence: 0.5, emotions: [] };
    }
  }

  /**
   * Classify message intent
   */
  async classifyIntent(message: string): Promise<{
    intent: string;
    confidence: number;
    entities: Record<string, string>;
  }> {
    const systemPrompt = `صنف نية الرسالة التالية. النوايا الممكنة:
- greeting: تحية
- product_inquiry: استفسار عن منتج
- price_inquiry: استفسار عن السعر
- order_status: حالة الطلب
- shipping_inquiry: استفسار عن الشحن
- complaint: شكوى
- return_request: طلب إرجاع
- payment_issue: مشكلة دفع
- support: طلب مساعدة
- thanks: شكر
- goodbye: وداع
- other: أخرى

أرجع JSON:
{
  "intent": "intent_name",
  "confidence": 0.0-1.0,
  "entities": {"entity_type": "value"}
}`;

    try {
      const result = await this.chat(
        [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: message },
        ],
        { temperature: 0.2, maxTokens: 200 },
      );

      return JSON.parse(result.content);
    } catch (error) {
      this.logger.error(`Intent classification error: ${error.message}`);
      return { intent: 'other', confidence: 0.5, entities: {} };
    }
  }

  /**
   * Summarize conversation
   */
  async summarizeConversation(messages: string[]): Promise<string> {
    const systemPrompt = `لخص المحادثة التالية في 2-3 جمل قصيرة باللغة العربية. ركز على:
- موضوع المحادثة الرئيسي
- أي طلبات أو مشاكل مذكورة
- الحالة الحالية`;

    try {
      const result = await this.chat(
        [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: messages.join('\n---\n') },
        ],
        { temperature: 0.5, maxTokens: 300 },
      );

      return result.content;
    } catch (error) {
      this.logger.error(`Summarization error: ${error.message}`);
      return '';
    }
  }

  /**
   * Generate product description
   */
  async generateProductDescription(
    productName: string,
    features: string[],
    targetAudience?: string,
  ): Promise<{ description: string; descriptionAr: string }> {
    const systemPrompt = `أنت كاتب محتوى متخصص في وصف المنتجات للمتاجر الإلكترونية.
اكتب وصفاً جذاباً ومقنعاً للمنتج باللغتين العربية والإنجليزية.
الوصف يجب أن يكون:
- 2-3 جمل
- يبرز الفوائد الرئيسية
- جذاب للقارئ
- مناسب لـ SEO

أرجع JSON:
{
  "description": "English description",
  "descriptionAr": "الوصف بالعربية"
}`;

    const userPrompt = `المنتج: ${productName}
المميزات: ${features.join(', ')}
${targetAudience ? `الجمهور المستهدف: ${targetAudience}` : ''}`;

    try {
      const result = await this.chat(
        [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        { temperature: 0.7, maxTokens: 500 },
      );

      return JSON.parse(result.content);
    } catch (error) {
      this.logger.error(`Product description error: ${error.message}`);
      return { description: '', descriptionAr: '' };
    }
  }

  /**
   * Generate embeddings for text
   */
  async generateEmbedding(text: string): Promise<number[]> {
    try {
      const response = await firstValueFrom(
        this.httpService.post(
          `${this.apiUrl}/embeddings`,
          {
            model: 'text-embedding-3-small',
            input: text,
          },
          { headers: this.headers },
        ),
      );

      return response.data.data[0].embedding;
    } catch (error) {
      this.logger.error(`Embedding error: ${error.message}`);
      return [];
    }
  }
}
