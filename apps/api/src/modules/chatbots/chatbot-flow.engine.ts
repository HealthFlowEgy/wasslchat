import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { TypebotService } from './typebot.service';
import { N8nService } from './n8n.service';

/**
 * Chatbot Flow Engine
 * 
 * Handles incoming messages and routes them through the appropriate
 * chatbot flow (Typebot, n8n, or built-in flows).
 */

export interface IncomingMessage {
  tenantId: string;
  contactId: string;
  contactPhone: string;
  contactName?: string;
  conversationId: string;
  messageId: string;
  content: string;
  contentType: string;
  metadata?: any;
}

export interface OutgoingMessage {
  type: 'text' | 'image' | 'video' | 'audio' | 'buttons' | 'list' | 'template';
  content?: string;
  url?: string;
  caption?: string;
  buttons?: Array<{ id: string; text: string }>;
  sections?: Array<{ title: string; rows: Array<{ id: string; title: string; description?: string }> }>;
  buttonText?: string;
  templateName?: string;
  templateParams?: Record<string, string>;
  expectsReply?: boolean;
}

export interface FlowResult {
  handled: boolean;
  messages: OutgoingMessage[];
  handoffToAgent?: boolean;
  endSession?: boolean;
  metadata?: any;
}

@Injectable()
export class ChatbotFlowEngine {
  private readonly logger = new Logger(ChatbotFlowEngine.name);
  
  // In-memory session store (should use Redis in production)
  private sessions: Map<string, any> = new Map();

  constructor(
    private readonly prisma: PrismaService,
    private readonly typebotService: TypebotService,
    private readonly n8nService: N8nService,
  ) {}

  /**
   * Process an incoming message through the chatbot flow
   */
  async processMessage(message: IncomingMessage): Promise<FlowResult> {
    this.logger.debug(`Processing message for conversation ${message.conversationId}`);

    // Get tenant chatbot settings
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: message.tenantId },
      include: { chatbotFlows: { where: { isActive: true }, orderBy: { priority: 'desc' } } },
    });

    if (!tenant || !tenant.chatbotFlows?.length) {
      return { handled: false, messages: [] };
    }

    // Check for existing session
    const sessionKey = `${message.tenantId}:${message.contactId}`;
    let session = this.sessions.get(sessionKey);

    // Find matching flow
    for (const flow of tenant.chatbotFlows) {
      const shouldHandle = await this.shouldHandleMessage(flow, message, session);
      
      if (shouldHandle) {
        const result = await this.executeFlow(flow, message, session);
        
        // Update session
        if (result.metadata?.session) {
          this.sessions.set(sessionKey, result.metadata.session);
        }
        
        if (result.endSession) {
          this.sessions.delete(sessionKey);
        }

        return result;
      }
    }

    return { handled: false, messages: [] };
  }

  /**
   * Check if a flow should handle the message
   */
  private async shouldHandleMessage(
    flow: any,
    message: IncomingMessage,
    session?: any,
  ): Promise<boolean> {
    // If there's an active session for this flow, continue it
    if (session?.flowId === flow.id) {
      return true;
    }

    // Check trigger conditions
    const triggers = flow.triggers || {};

    // Keyword triggers
    if (triggers.keywords?.length) {
      const lowerContent = message.content.toLowerCase();
      const matched = triggers.keywords.some((kw: string) => 
        lowerContent.includes(kw.toLowerCase())
      );
      if (matched) return true;
    }

    // Pattern triggers (regex)
    if (triggers.patterns?.length) {
      for (const pattern of triggers.patterns) {
        try {
          const regex = new RegExp(pattern, 'i');
          if (regex.test(message.content)) return true;
        } catch {}
      }
    }

    // Intent triggers (simple matching)
    if (triggers.intents?.length) {
      const intent = this.detectIntent(message.content);
      if (triggers.intents.includes(intent)) return true;
    }

    // First message trigger
    if (triggers.onFirstMessage) {
      const messageCount = await this.prisma.message.count({
        where: { conversation: { contactId: message.contactId } },
      });
      if (messageCount <= 1) return true;
    }

    // All messages trigger (catch-all)
    if (triggers.allMessages) {
      return true;
    }

    return false;
  }

  /**
   * Execute a chatbot flow
   */
  private async executeFlow(
    flow: any,
    message: IncomingMessage,
    session?: any,
  ): Promise<FlowResult> {
    const flowType = flow.flowType || 'BUILTIN';

    switch (flowType) {
      case 'TYPEBOT':
        return this.executeTypebotFlow(flow, message, session);
      
      case 'N8N':
        return this.executeN8nFlow(flow, message);
      
      case 'BUILTIN':
      default:
        return this.executeBuiltinFlow(flow, message, session);
    }
  }

  /**
   * Execute Typebot flow
   */
  private async executeTypebotFlow(
    flow: any,
    message: IncomingMessage,
    session?: any,
  ): Promise<FlowResult> {
    try {
      let response;

      if (session?.typebotSessionId) {
        // Continue existing session
        response = await this.typebotService.continueSession(
          session.typebotSessionId,
          message.content,
        );
      } else {
        // Start new session
        response = await this.typebotService.startSession(
          flow.typebotId,
          {
            contactPhone: message.contactPhone,
            contactName: message.contactName,
            contactId: message.contactId,
          },
        );
      }

      const messages = this.typebotService.convertToWhatsAppMessages(response.messages);
      
      // Check for handoff action
      const handoffAction = response.clientSideActions?.find(
        (a: any) => a.type === 'chatwoot' || a.type === 'handoff'
      );

      return {
        handled: true,
        messages,
        handoffToAgent: !!handoffAction,
        endSession: !response.input, // End if no more input expected
        metadata: {
          session: {
            flowId: flow.id,
            typebotSessionId: response.sessionId,
          },
        },
      };
    } catch (error) {
      this.logger.error(`Typebot flow error: ${error.message}`);
      return { handled: false, messages: [] };
    }
  }

  /**
   * Execute n8n workflow
   */
  private async executeN8nFlow(
    flow: any,
    message: IncomingMessage,
  ): Promise<FlowResult> {
    try {
      const webhookPath = flow.n8nWebhookPath || `wasslchat/${flow.id}`;
      
      const payload = this.n8nService.buildChatbotWebhookPayload({
        tenantId: message.tenantId,
        contactId: message.contactId,
        contactPhone: message.contactPhone,
        contactName: message.contactName,
        conversationId: message.conversationId,
        message: message.content,
        messageType: message.contentType,
        metadata: message.metadata,
      });

      const result = await this.n8nService.triggerWebhook(webhookPath, payload);

      if (!result.success || !result.data) {
        return { handled: false, messages: [] };
      }

      // Parse n8n response
      const responseData = result.data;
      const messages: OutgoingMessage[] = [];

      if (responseData.messages) {
        messages.push(...responseData.messages);
      } else if (responseData.message) {
        messages.push({ type: 'text', content: responseData.message });
      } else if (typeof responseData === 'string') {
        messages.push({ type: 'text', content: responseData });
      }

      return {
        handled: true,
        messages,
        handoffToAgent: responseData.handoff === true,
        endSession: responseData.endSession === true,
      };
    } catch (error) {
      this.logger.error(`n8n flow error: ${error.message}`);
      return { handled: false, messages: [] };
    }
  }

  /**
   * Execute built-in flow
   */
  private async executeBuiltinFlow(
    flow: any,
    message: IncomingMessage,
    session?: any,
  ): Promise<FlowResult> {
    const steps = flow.steps || [];
    const currentStepIndex = session?.currentStepIndex || 0;
    
    if (currentStepIndex >= steps.length) {
      return { handled: true, messages: [], endSession: true };
    }

    const step = steps[currentStepIndex];
    const messages: OutgoingMessage[] = [];

    // Process step
    switch (step.type) {
      case 'message':
        messages.push({
          type: 'text',
          content: this.interpolateVariables(step.content, {
            contactName: message.contactName,
            contactPhone: message.contactPhone,
          }),
        });
        break;

      case 'buttons':
        messages.push({
          type: 'buttons',
          content: step.content,
          buttons: step.buttons,
        });
        break;

      case 'list':
        messages.push({
          type: 'list',
          content: step.content,
          buttonText: step.buttonText || 'اختر',
          sections: step.sections,
        });
        break;

      case 'input':
        messages.push({
          type: 'text',
          content: step.prompt,
          expectsReply: true,
        });
        break;

      case 'condition':
        // Simple condition handling
        const conditionMet = this.evaluateCondition(step.condition, message, session);
        const nextStep = conditionMet ? step.thenStep : step.elseStep;
        // Recursively process
        break;

      case 'handoff':
        return {
          handled: true,
          messages: step.message ? [{ type: 'text', content: step.message }] : [],
          handoffToAgent: true,
        };

      case 'end':
        return {
          handled: true,
          messages: step.message ? [{ type: 'text', content: step.message }] : [],
          endSession: true,
        };
    }

    // Move to next step if not expecting input
    const nextStepIndex = step.type === 'input' ? currentStepIndex : currentStepIndex + 1;

    return {
      handled: true,
      messages,
      endSession: nextStepIndex >= steps.length,
      metadata: {
        session: {
          flowId: flow.id,
          currentStepIndex: nextStepIndex,
          variables: session?.variables || {},
        },
      },
    };
  }

  /**
   * Simple intent detection
   */
  private detectIntent(content: string): string {
    const lowerContent = content.toLowerCase();
    
    const intents: Record<string, string[]> = {
      'greeting': ['مرحبا', 'السلام', 'اهلا', 'hi', 'hello', 'صباح', 'مساء'],
      'order_status': ['طلبي', 'الطلب', 'شحن', 'توصيل', 'تتبع', 'order', 'track'],
      'product_inquiry': ['سعر', 'منتج', 'متوفر', 'price', 'product', 'available'],
      'support': ['مساعدة', 'مشكلة', 'شكوى', 'help', 'problem', 'issue'],
      'payment': ['دفع', 'فلوس', 'حساب', 'فوري', 'pay', 'payment'],
      'thanks': ['شكرا', 'thanks', 'thank you'],
      'goodbye': ['باي', 'bye', 'مع السلامة'],
    };

    for (const [intent, keywords] of Object.entries(intents)) {
      if (keywords.some(kw => lowerContent.includes(kw))) {
        return intent;
      }
    }

    return 'unknown';
  }

  /**
   * Interpolate variables in template string
   */
  private interpolateVariables(template: string, variables: Record<string, any>): string {
    return template.replace(/\{\{(\w+)\}\}/g, (match, key) => {
      return variables[key] !== undefined ? String(variables[key]) : match;
    });
  }

  /**
   * Evaluate a simple condition
   */
  private evaluateCondition(
    condition: any,
    message: IncomingMessage,
    session?: any,
  ): boolean {
    if (!condition) return true;

    const { field, operator, value } = condition;
    const actualValue = this.getFieldValue(field, message, session);

    switch (operator) {
      case 'equals':
        return actualValue === value;
      case 'contains':
        return String(actualValue).includes(value);
      case 'startsWith':
        return String(actualValue).startsWith(value);
      case 'endsWith':
        return String(actualValue).endsWith(value);
      case 'matches':
        return new RegExp(value, 'i').test(String(actualValue));
      default:
        return true;
    }
  }

  private getFieldValue(field: string, message: IncomingMessage, session?: any): any {
    switch (field) {
      case 'message':
        return message.content;
      case 'messageType':
        return message.contentType;
      default:
        return session?.variables?.[field];
    }
  }

  /**
   * End a chatbot session
   */
  endSession(tenantId: string, contactId: string): void {
    const sessionKey = `${tenantId}:${contactId}`;
    this.sessions.delete(sessionKey);
  }

  /**
   * Get session info
   */
  getSession(tenantId: string, contactId: string): any {
    const sessionKey = `${tenantId}:${contactId}`;
    return this.sessions.get(sessionKey);
  }
}
