import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';

/**
 * Typebot Integration Service
 * 
 * Typebot is an open-source chatbot builder that allows creating
 * conversational flows with a visual drag-and-drop interface.
 * 
 * Self-hosted: https://typebot.io
 * Docs: https://docs.typebot.io
 */

export interface TypebotSession {
  sessionId: string;
  typebotId: string;
  currentBlockId?: string;
  variables: Record<string, any>;
  answers: any[];
}

export interface TypebotMessage {
  type: 'text' | 'image' | 'video' | 'audio' | 'file' | 'choice' | 'input';
  content?: string;
  richText?: any[];
  url?: string;
  items?: Array<{ id: string; content: string }>;
  inputType?: 'text' | 'email' | 'phone' | 'number' | 'date' | 'url';
  placeholder?: string;
  options?: {
    isLong?: boolean;
    labels?: { button?: string; placeholder?: string };
  };
}

export interface TypebotResponse {
  sessionId: string;
  messages: TypebotMessage[];
  input?: {
    type: string;
    options?: any;
  };
  clientSideActions?: any[];
  logs?: any[];
}

@Injectable()
export class TypebotService {
  private readonly logger = new Logger(TypebotService.name);
  private readonly baseUrl: string;
  private readonly apiToken: string;

  constructor(
    private readonly configService: ConfigService,
    private readonly httpService: HttpService,
  ) {
    this.baseUrl = configService.get<string>('TYPEBOT_API_URL', 'http://localhost:3001');
    this.apiToken = configService.get<string>('TYPEBOT_API_TOKEN', '');
  }

  private get headers() {
    return {
      'Content-Type': 'application/json',
      ...(this.apiToken && { 'Authorization': `Bearer ${this.apiToken}` }),
    };
  }

  /**
   * Start a new Typebot session
   */
  async startSession(
    typebotId: string,
    prefilledVariables?: Record<string, any>,
  ): Promise<TypebotResponse> {
    try {
      const response = await firstValueFrom(
        this.httpService.post(
          `${this.baseUrl}/api/v1/typebots/${typebotId}/startChat`,
          {
            prefilledVariables: prefilledVariables || {},
          },
          { headers: this.headers },
        ),
      );

      this.logger.debug(`Typebot session started: ${response.data.sessionId}`);
      return response.data;
    } catch (error) {
      this.logger.error(`Failed to start Typebot session: ${error.message}`);
      throw new BadRequestException('فشل في بدء المحادثة الآلية');
    }
  }

  /**
   * Continue an existing Typebot session with user input
   */
  async continueSession(
    sessionId: string,
    message: string,
  ): Promise<TypebotResponse> {
    try {
      const response = await firstValueFrom(
        this.httpService.post(
          `${this.baseUrl}/api/v1/sessions/${sessionId}/continueChat`,
          { message },
          { headers: this.headers },
        ),
      );

      return response.data;
    } catch (error) {
      this.logger.error(`Failed to continue Typebot session: ${error.message}`);
      throw new BadRequestException('فشل في متابعة المحادثة');
    }
  }

  /**
   * Get session state
   */
  async getSessionState(sessionId: string): Promise<TypebotSession | null> {
    try {
      const response = await firstValueFrom(
        this.httpService.get(
          `${this.baseUrl}/api/v1/sessions/${sessionId}`,
          { headers: this.headers },
        ),
      );
      return response.data;
    } catch (error) {
      return null;
    }
  }

  /**
   * Delete/end a session
   */
  async endSession(sessionId: string): Promise<void> {
    try {
      await firstValueFrom(
        this.httpService.delete(
          `${this.baseUrl}/api/v1/sessions/${sessionId}`,
          { headers: this.headers },
        ),
      );
      this.logger.debug(`Typebot session ended: ${sessionId}`);
    } catch (error) {
      this.logger.warn(`Failed to end Typebot session: ${error.message}`);
    }
  }

  /**
   * List available typebots
   */
  async listTypebots(workspaceId?: string): Promise<any[]> {
    try {
      const response = await firstValueFrom(
        this.httpService.get(
          `${this.baseUrl}/api/v1/typebots`,
          {
            headers: this.headers,
            params: workspaceId ? { workspaceId } : {},
          },
        ),
      );
      return response.data.typebots || [];
    } catch (error) {
      this.logger.error(`Failed to list typebots: ${error.message}`);
      return [];
    }
  }

  /**
   * Get typebot details
   */
  async getTypebot(typebotId: string): Promise<any> {
    try {
      const response = await firstValueFrom(
        this.httpService.get(
          `${this.baseUrl}/api/v1/typebots/${typebotId}`,
          { headers: this.headers },
        ),
      );
      return response.data.typebot;
    } catch (error) {
      this.logger.error(`Failed to get typebot: ${error.message}`);
      return null;
    }
  }

  /**
   * Convert Typebot messages to WhatsApp format
   */
  convertToWhatsAppMessages(messages: TypebotMessage[]): any[] {
    return messages.map((msg) => {
      switch (msg.type) {
        case 'text':
          return {
            type: 'text',
            content: this.extractTextContent(msg),
          };

        case 'image':
          return {
            type: 'image',
            url: msg.url,
            caption: msg.content,
          };

        case 'video':
          return {
            type: 'video',
            url: msg.url,
            caption: msg.content,
          };

        case 'audio':
          return {
            type: 'audio',
            url: msg.url,
          };

        case 'choice':
          // Convert to WhatsApp buttons or list
          const items = msg.items || [];
          if (items.length <= 3) {
            return {
              type: 'buttons',
              content: msg.content || 'اختر أحد الخيارات:',
              buttons: items.map((item) => ({
                id: item.id,
                text: item.content,
              })),
            };
          } else {
            return {
              type: 'list',
              content: msg.content || 'اختر أحد الخيارات:',
              buttonText: 'عرض الخيارات',
              sections: [{
                title: 'الخيارات',
                rows: items.map((item) => ({
                  id: item.id,
                  title: item.content,
                })),
              }],
            };
          }

        case 'input':
          return {
            type: 'text',
            content: msg.placeholder || msg.content || 'الرجاء إدخال البيانات:',
            expectsReply: true,
            inputType: msg.inputType,
          };

        default:
          return {
            type: 'text',
            content: msg.content || '',
          };
      }
    });
  }

  /**
   * Extract text content from richText or content
   */
  private extractTextContent(msg: TypebotMessage): string {
    if (msg.content) return msg.content;
    
    if (msg.richText && Array.isArray(msg.richText)) {
      return msg.richText
        .map((block: any) => {
          if (block.children) {
            return block.children
              .map((child: any) => child.text || '')
              .join('');
          }
          return block.text || '';
        })
        .join('\n');
    }
    
    return '';
  }
}
