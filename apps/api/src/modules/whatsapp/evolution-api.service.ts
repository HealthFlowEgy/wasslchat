import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';

export interface SendTextMessageDto {
  number: string;
  text: string;
  delay?: number;
}

export interface SendMediaMessageDto {
  number: string;
  mediatype: 'image' | 'video' | 'audio' | 'document';
  mimetype?: string;
  caption?: string;
  media: string; // Base64 or URL
  fileName?: string;
}

export interface SendButtonMessageDto {
  number: string;
  title: string;
  description?: string;
  footer?: string;
  buttons: Array<{ buttonId: string; buttonText: { displayText: string } }>;
}

export interface SendListMessageDto {
  number: string;
  title: string;
  description: string;
  buttonText: string;
  footer?: string;
  sections: Array<{
    title: string;
    rows: Array<{ title: string; description?: string; rowId: string }>;
  }>;
}

export interface SendTemplateMessageDto {
  number: string;
  template: {
    name: string;
    language: { code: string };
    components?: any[];
  };
}

export interface InstanceInfo {
  instanceName: string;
  instanceId?: string;
  status: string;
  qrcode?: string;
  profilePicUrl?: string;
  profileName?: string;
  phoneNumber?: string;
}

@Injectable()
export class EvolutionApiService {
  private readonly logger = new Logger(EvolutionApiService.name);
  private readonly baseUrl: string;
  private readonly apiKey: string;

  constructor(
    private readonly configService: ConfigService,
    private readonly httpService: HttpService,
  ) {
    this.baseUrl = this.configService.get<string>('evolution.apiUrl', 'http://localhost:8080');
    this.apiKey = this.configService.get<string>('evolution.apiKey', '');
  }

  private get headers() {
    return {
      'Content-Type': 'application/json',
      apikey: this.apiKey,
    };
  }

  // ============= INSTANCE MANAGEMENT =============

  async createInstance(instanceName: string, options?: any): Promise<any> {
    try {
      const response = await firstValueFrom(
        this.httpService.post(
          `${this.baseUrl}/instance/create`,
          {
            instanceName,
            qrcode: true,
            integration: 'WHATSAPP-BAILEYS',
            ...options,
          },
          { headers: this.headers },
        ),
      );
      this.logger.log(`Instance created: ${instanceName}`);
      return response.data;
    } catch (error) {
      this.logger.error(`Failed to create instance: ${error.message}`);
      throw new BadRequestException('فشل في إنشاء جلسة واتساب');
    }
  }

  async deleteInstance(instanceName: string): Promise<void> {
    try {
      await firstValueFrom(
        this.httpService.delete(
          `${this.baseUrl}/instance/delete/${instanceName}`,
          { headers: this.headers },
        ),
      );
      this.logger.log(`Instance deleted: ${instanceName}`);
    } catch (error) {
      this.logger.error(`Failed to delete instance: ${error.message}`);
      throw new BadRequestException('فشل في حذف جلسة واتساب');
    }
  }

  async getInstanceStatus(instanceName: string): Promise<InstanceInfo> {
    try {
      const response = await firstValueFrom(
        this.httpService.get(
          `${this.baseUrl}/instance/connectionState/${instanceName}`,
          { headers: this.headers },
        ),
      );
      return {
        instanceName,
        status: response.data?.instance?.state || 'disconnected',
        ...response.data?.instance,
      };
    } catch (error) {
      return { instanceName, status: 'disconnected' };
    }
  }

  async connectInstance(instanceName: string): Promise<{ qrcode?: string; pairingCode?: string }> {
    try {
      const response = await firstValueFrom(
        this.httpService.get(
          `${this.baseUrl}/instance/connect/${instanceName}`,
          { headers: this.headers },
        ),
      );
      return {
        qrcode: response.data?.qrcode?.base64,
        pairingCode: response.data?.pairingCode,
      };
    } catch (error) {
      this.logger.error(`Failed to connect instance: ${error.message}`);
      throw new BadRequestException('فشل في الاتصال بواتساب');
    }
  }

  async disconnectInstance(instanceName: string): Promise<void> {
    try {
      await firstValueFrom(
        this.httpService.delete(
          `${this.baseUrl}/instance/logout/${instanceName}`,
          { headers: this.headers },
        ),
      );
      this.logger.log(`Instance disconnected: ${instanceName}`);
    } catch (error) {
      this.logger.error(`Failed to disconnect instance: ${error.message}`);
    }
  }

  async fetchInstances(): Promise<InstanceInfo[]> {
    try {
      const response = await firstValueFrom(
        this.httpService.get(
          `${this.baseUrl}/instance/fetchInstances`,
          { headers: this.headers },
        ),
      );
      return response.data || [];
    } catch (error) {
      this.logger.error(`Failed to fetch instances: ${error.message}`);
      return [];
    }
  }

  // ============= MESSAGING =============

  async sendText(instanceName: string, dto: SendTextMessageDto): Promise<any> {
    try {
      const response = await firstValueFrom(
        this.httpService.post(
          `${this.baseUrl}/message/sendText/${instanceName}`,
          {
            number: this.formatPhoneNumber(dto.number),
            text: dto.text,
            delay: dto.delay || 1000,
          },
          { headers: this.headers },
        ),
      );
      this.logger.debug(`Text message sent to ${dto.number}`);
      return response.data;
    } catch (error) {
      this.logger.error(`Failed to send text: ${error.message}`);
      throw new BadRequestException('فشل في إرسال الرسالة');
    }
  }

  async sendMedia(instanceName: string, dto: SendMediaMessageDto): Promise<any> {
    try {
      const response = await firstValueFrom(
        this.httpService.post(
          `${this.baseUrl}/message/sendMedia/${instanceName}`,
          {
            number: this.formatPhoneNumber(dto.number),
            mediatype: dto.mediatype,
            mimetype: dto.mimetype,
            caption: dto.caption,
            media: dto.media,
            fileName: dto.fileName,
          },
          { headers: this.headers },
        ),
      );
      return response.data;
    } catch (error) {
      this.logger.error(`Failed to send media: ${error.message}`);
      throw new BadRequestException('فشل في إرسال الوسائط');
    }
  }

  async sendButtons(instanceName: string, dto: SendButtonMessageDto): Promise<any> {
    try {
      const response = await firstValueFrom(
        this.httpService.post(
          `${this.baseUrl}/message/sendButtons/${instanceName}`,
          {
            number: this.formatPhoneNumber(dto.number),
            title: dto.title,
            description: dto.description,
            footer: dto.footer,
            buttons: dto.buttons,
          },
          { headers: this.headers },
        ),
      );
      return response.data;
    } catch (error) {
      this.logger.error(`Failed to send buttons: ${error.message}`);
      throw new BadRequestException('فشل في إرسال الأزرار');
    }
  }

  async sendList(instanceName: string, dto: SendListMessageDto): Promise<any> {
    try {
      const response = await firstValueFrom(
        this.httpService.post(
          `${this.baseUrl}/message/sendList/${instanceName}`,
          {
            number: this.formatPhoneNumber(dto.number),
            title: dto.title,
            description: dto.description,
            buttonText: dto.buttonText,
            footer: dto.footer,
            sections: dto.sections,
          },
          { headers: this.headers },
        ),
      );
      return response.data;
    } catch (error) {
      this.logger.error(`Failed to send list: ${error.message}`);
      throw new BadRequestException('فشل في إرسال القائمة');
    }
  }

  async sendTemplate(instanceName: string, dto: SendTemplateMessageDto): Promise<any> {
    try {
      const response = await firstValueFrom(
        this.httpService.post(
          `${this.baseUrl}/message/sendTemplate/${instanceName}`,
          {
            number: this.formatPhoneNumber(dto.number),
            template: dto.template,
          },
          { headers: this.headers },
        ),
      );
      return response.data;
    } catch (error) {
      this.logger.error(`Failed to send template: ${error.message}`);
      throw new BadRequestException('فشل في إرسال قالب الرسالة');
    }
  }

  async sendReaction(instanceName: string, messageId: string, reaction: string): Promise<any> {
    try {
      const response = await firstValueFrom(
        this.httpService.post(
          `${this.baseUrl}/message/sendReaction/${instanceName}`,
          { key: { id: messageId }, reaction },
          { headers: this.headers },
        ),
      );
      return response.data;
    } catch (error) {
      this.logger.error(`Failed to send reaction: ${error.message}`);
    }
  }

  // ============= CONTACTS & PROFILE =============

  async checkNumberExists(instanceName: string, number: string): Promise<boolean> {
    try {
      const response = await firstValueFrom(
        this.httpService.post(
          `${this.baseUrl}/chat/whatsappNumbers/${instanceName}`,
          { numbers: [this.formatPhoneNumber(number)] },
          { headers: this.headers },
        ),
      );
      return response.data?.[0]?.exists || false;
    } catch (error) {
      return false;
    }
  }

  async getProfilePicture(instanceName: string, number: string): Promise<string | null> {
    try {
      const response = await firstValueFrom(
        this.httpService.post(
          `${this.baseUrl}/chat/fetchProfilePictureUrl/${instanceName}`,
          { number: this.formatPhoneNumber(number) },
          { headers: this.headers },
        ),
      );
      return response.data?.profilePictureUrl || null;
    } catch (error) {
      return null;
    }
  }

  // ============= WEBHOOKS =============

  async setWebhook(instanceName: string, webhookUrl: string, events?: string[]): Promise<void> {
    try {
      await firstValueFrom(
        this.httpService.post(
          `${this.baseUrl}/webhook/set/${instanceName}`,
          {
            webhook: {
              enabled: true,
              url: webhookUrl,
              webhookByEvents: true,
              webhookBase64: false,
              events: events || [
                'QRCODE_UPDATED',
                'CONNECTION_UPDATE',
                'MESSAGES_SET',
                'MESSAGES_UPSERT',
                'MESSAGES_UPDATE',
                'SEND_MESSAGE',
              ],
            },
          },
          { headers: this.headers },
        ),
      );
      this.logger.log(`Webhook set for ${instanceName}: ${webhookUrl}`);
    } catch (error) {
      this.logger.error(`Failed to set webhook: ${error.message}`);
    }
  }

  // ============= HELPERS =============

  private formatPhoneNumber(number: string): string {
    // Remove any non-digit characters
    let cleaned = number.replace(/\D/g, '');
    
    // Handle Egyptian numbers
    if (cleaned.startsWith('0')) {
      cleaned = '20' + cleaned.substring(1);
    }
    
    // Ensure it has country code
    if (!cleaned.startsWith('20') && cleaned.length === 10) {
      cleaned = '20' + cleaned;
    }
    
    return cleaned;
  }
}
