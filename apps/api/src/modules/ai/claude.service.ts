import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';

/**
 * Claude (Anthropic) Integration Service
 * 
 * Provides access to Anthropic's Claude models for:
 * - Complex reasoning tasks
 * - Long-form content generation
 * - Detailed analysis
 * - Multi-turn conversations
 */

export interface ClaudeMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface ClaudeOptions {
  model?: string;
  maxTokens?: number;
  temperature?: number;
  topP?: number;
  topK?: number;
  stopSequences?: string[];
  system?: string;
}

export interface ClaudeResult {
  content: string;
  stopReason: string;
  usage: {
    inputTokens: number;
    outputTokens: number;
  };
}

@Injectable()
export class ClaudeService {
  private readonly logger = new Logger(ClaudeService.name);
  private readonly apiKey: string;
  private readonly apiUrl = 'https://api.anthropic.com/v1';
  private readonly defaultModel = 'claude-3-haiku-20240307';
  private readonly apiVersion = '2023-06-01';

  constructor(
    private readonly configService: ConfigService,
    private readonly httpService: HttpService,
  ) {
    this.apiKey = configService.get<string>('ANTHROPIC_API_KEY', '');
  }

  private get headers() {
    return {
      'Content-Type': 'application/json',
      'x-api-key': this.apiKey,
      'anthropic-version': this.apiVersion,
    };
  }

  /**
   * Generate message completion
   */
  async chat(messages: ClaudeMessage[], options: ClaudeOptions = {}): Promise<ClaudeResult> {
    try {
      const response = await firstValueFrom(
        this.httpService.post(
          `${this.apiUrl}/messages`,
          {
            model: options.model || this.defaultModel,
            max_tokens: options.maxTokens || 1024,
            messages,
            system: options.system,
            temperature: options.temperature ?? 0.7,
            top_p: options.topP,
            top_k: options.topK,
            stop_sequences: options.stopSequences,
          },
          { headers: this.headers },
        ),
      );

      const data = response.data;

      return {
        content: data.content[0]?.text || '',
        stopReason: data.stop_reason,
        usage: {
          inputTokens: data.usage.input_tokens,
          outputTokens: data.usage.output_tokens,
        },
      };
    } catch (error) {
      this.logger.error(`Claude chat error: ${error.message}`);
      throw error;
    }
  }

  /**
   * Generate smart customer service response
   */
  async generateCustomerResponse(params: {
    conversationHistory: ClaudeMessage[];
    customerMessage: string;
    context: {
      storeName: string;
      productInfo?: string;
      orderInfo?: string;
      policies?: string;
      tone?: 'formal' | 'friendly' | 'professional';
    };
  }): Promise<string> {
    const toneGuide = {
      formal: 'استخدم لغة رسمية ومهذبة',
      friendly: 'استخدم لغة ودودة وقريبة من العميل',
      professional: 'استخدم لغة مهنية ومتوازنة',
    };

    const systemPrompt = `أنت مساعد خدمة عملاء محترف لمتجر "${params.context.storeName}".

إرشادات الرد:
- ${toneGuide[params.context.tone || 'professional']}
- الرد باللغة العربية
- كن مختصراً ومفيداً (2-4 جمل كحد أقصى)
- إذا لم تعرف الإجابة، اعتذر واقترح التواصل مع فريق الدعم
- لا تختلق معلومات غير متوفرة

${params.context.productInfo ? `معلومات المنتجات:\n${params.context.productInfo}` : ''}
${params.context.orderInfo ? `معلومات الطلب:\n${params.context.orderInfo}` : ''}
${params.context.policies ? `سياسات المتجر:\n${params.context.policies}` : ''}`;

    try {
      const messages: ClaudeMessage[] = [
        ...params.conversationHistory,
        { role: 'user', content: params.customerMessage },
      ];

      const result = await this.chat(messages, {
        system: systemPrompt,
        temperature: 0.7,
        maxTokens: 500,
      });

      return result.content;
    } catch (error) {
      this.logger.error(`Failed to generate customer response: ${error.message}`);
      return '';
    }
  }

  /**
   * Analyze and extract order information from message
   */
  async extractOrderInfo(message: string): Promise<{
    hasOrderIntent: boolean;
    products: Array<{ name: string; quantity: number }>;
    address?: string;
    phone?: string;
    paymentMethod?: string;
    notes?: string;
  }> {
    const systemPrompt = `حلل الرسالة التالية واستخرج معلومات الطلب إن وجدت.
أرجع JSON بالتنسيق:
{
  "hasOrderIntent": true/false,
  "products": [{"name": "اسم المنتج", "quantity": 1}],
  "address": "العنوان إن وجد",
  "phone": "رقم الهاتف إن وجد",
  "paymentMethod": "طريقة الدفع إن ذكرت",
  "notes": "أي ملاحظات أخرى"
}

إذا لم يكن هناك نية شراء، أرجع hasOrderIntent: false مع باقي الحقول فارغة.`;

    try {
      const result = await this.chat(
        [{ role: 'user', content: message }],
        { system: systemPrompt, temperature: 0.3, maxTokens: 500 },
      );

      return JSON.parse(result.content);
    } catch (error) {
      this.logger.error(`Order extraction error: ${error.message}`);
      return { hasOrderIntent: false, products: [] };
    }
  }

  /**
   * Generate FAQ answers based on knowledge base
   */
  async answerFAQ(question: string, knowledgeBase: string): Promise<{
    answer: string;
    confidence: number;
    sources: string[];
  }> {
    const systemPrompt = `أنت مساعد ذكي للإجابة على أسئلة العملاء.
استخدم المعلومات التالية فقط للإجابة:

${knowledgeBase}

إرشادات:
- إذا كانت الإجابة موجودة في المعلومات، أجب بثقة
- إذا لم تجد الإجابة، اعترف بذلك
- أرجع JSON:
{
  "answer": "الإجابة",
  "confidence": 0.0-1.0,
  "sources": ["مصدر المعلومة"]
}`;

    try {
      const result = await this.chat(
        [{ role: 'user', content: question }],
        { system: systemPrompt, temperature: 0.3, maxTokens: 500 },
      );

      return JSON.parse(result.content);
    } catch (error) {
      this.logger.error(`FAQ answer error: ${error.message}`);
      return { answer: '', confidence: 0, sources: [] };
    }
  }

  /**
   * Generate broadcast message content
   */
  async generateBroadcastContent(params: {
    purpose: 'promotion' | 'announcement' | 'reminder' | 'followup';
    details: string;
    targetAudience?: string;
    includeEmoji?: boolean;
  }): Promise<{ message: string; messageAr: string }> {
    const purposeGuide = {
      promotion: 'رسالة ترويجية جذابة لعرض أو خصم',
      announcement: 'إعلان مهم للعملاء',
      reminder: 'تذكير ودي للعميل',
      followup: 'متابعة بعد الشراء أو الاستفسار',
    };

    const systemPrompt = `اكتب رسالة واتساب قصيرة وجذابة.
النوع: ${purposeGuide[params.purpose]}
${params.targetAudience ? `الجمهور: ${params.targetAudience}` : ''}
${params.includeEmoji ? 'استخدم إيموجي مناسبة' : 'بدون إيموجي'}

الرسالة يجب أن تكون:
- قصيرة (2-3 جمل)
- واضحة ومباشرة
- تحفز على التفاعل

أرجع JSON:
{
  "message": "English message",
  "messageAr": "الرسالة بالعربية"
}`;

    try {
      const result = await this.chat(
        [{ role: 'user', content: params.details }],
        { system: systemPrompt, temperature: 0.8, maxTokens: 400 },
      );

      return JSON.parse(result.content);
    } catch (error) {
      this.logger.error(`Broadcast content error: ${error.message}`);
      return { message: '', messageAr: '' };
    }
  }

  /**
   * Translate text between Arabic and English
   */
  async translate(text: string, targetLanguage: 'ar' | 'en'): Promise<string> {
    const systemPrompt = targetLanguage === 'ar'
      ? 'ترجم النص التالي إلى العربية بشكل طبيعي ودقيق. أرجع الترجمة فقط بدون أي شرح.'
      : 'Translate the following text to English naturally and accurately. Return only the translation.';

    try {
      const result = await this.chat(
        [{ role: 'user', content: text }],
        { system: systemPrompt, temperature: 0.3, maxTokens: 1000 },
      );

      return result.content;
    } catch (error) {
      this.logger.error(`Translation error: ${error.message}`);
      return text;
    }
  }
}
