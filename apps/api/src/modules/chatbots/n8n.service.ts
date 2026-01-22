import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';

/**
 * n8n Workflow Automation Integration
 * 
 * n8n is an open-source workflow automation tool that can be used
 * for complex business logic, integrations, and automation.
 * 
 * Self-hosted: https://n8n.io
 * Docs: https://docs.n8n.io
 */

export interface N8nWorkflow {
  id: string;
  name: string;
  active: boolean;
  nodes: any[];
  connections: any;
  settings?: any;
  tags?: string[];
}

export interface N8nExecutionResult {
  executionId: string;
  finished: boolean;
  mode: string;
  startedAt: Date;
  stoppedAt?: Date;
  data?: {
    resultData?: {
      runData?: any;
      lastNodeExecuted?: string;
    };
  };
  error?: any;
}

export interface WebhookTriggerResult {
  success: boolean;
  executionId?: string;
  data?: any;
  error?: string;
}

@Injectable()
export class N8nService {
  private readonly logger = new Logger(N8nService.name);
  private readonly baseUrl: string;
  private readonly apiKey: string;

  constructor(
    private readonly configService: ConfigService,
    private readonly httpService: HttpService,
  ) {
    this.baseUrl = configService.get<string>('N8N_API_URL', 'http://localhost:5678');
    this.apiKey = configService.get<string>('N8N_API_KEY', '');
  }

  private get headers() {
    return {
      'Content-Type': 'application/json',
      'X-N8N-API-KEY': this.apiKey,
    };
  }

  /**
   * Trigger a webhook-based workflow
   */
  async triggerWebhook(
    webhookPath: string,
    data: any,
    method: 'GET' | 'POST' = 'POST',
  ): Promise<WebhookTriggerResult> {
    try {
      const url = `${this.baseUrl}/webhook/${webhookPath}`;
      
      const response = method === 'POST'
        ? await firstValueFrom(
            this.httpService.post(url, data, { headers: { 'Content-Type': 'application/json' } }),
          )
        : await firstValueFrom(
            this.httpService.get(url, { params: data }),
          );

      this.logger.debug(`n8n webhook triggered: ${webhookPath}`);
      
      return {
        success: true,
        data: response.data,
      };
    } catch (error) {
      this.logger.error(`Failed to trigger n8n webhook: ${error.message}`);
      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * Trigger a test webhook (for development)
   */
  async triggerTestWebhook(
    webhookPath: string,
    data: any,
  ): Promise<WebhookTriggerResult> {
    try {
      const url = `${this.baseUrl}/webhook-test/${webhookPath}`;
      
      const response = await firstValueFrom(
        this.httpService.post(url, data, { headers: { 'Content-Type': 'application/json' } }),
      );

      return {
        success: true,
        data: response.data,
      };
    } catch (error) {
      this.logger.error(`Failed to trigger n8n test webhook: ${error.message}`);
      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * Execute a workflow by ID
   */
  async executeWorkflow(workflowId: string, data?: any): Promise<N8nExecutionResult | null> {
    try {
      const response = await firstValueFrom(
        this.httpService.post(
          `${this.baseUrl}/api/v1/workflows/${workflowId}/execute`,
          data ? { data } : {},
          { headers: this.headers },
        ),
      );

      return response.data;
    } catch (error) {
      this.logger.error(`Failed to execute n8n workflow: ${error.message}`);
      return null;
    }
  }

  /**
   * Get workflow details
   */
  async getWorkflow(workflowId: string): Promise<N8nWorkflow | null> {
    try {
      const response = await firstValueFrom(
        this.httpService.get(
          `${this.baseUrl}/api/v1/workflows/${workflowId}`,
          { headers: this.headers },
        ),
      );
      return response.data;
    } catch (error) {
      this.logger.error(`Failed to get n8n workflow: ${error.message}`);
      return null;
    }
  }

  /**
   * List all workflows
   */
  async listWorkflows(active?: boolean): Promise<N8nWorkflow[]> {
    try {
      const response = await firstValueFrom(
        this.httpService.get(
          `${this.baseUrl}/api/v1/workflows`,
          {
            headers: this.headers,
            params: active !== undefined ? { active } : {},
          },
        ),
      );
      return response.data.data || [];
    } catch (error) {
      this.logger.error(`Failed to list n8n workflows: ${error.message}`);
      return [];
    }
  }

  /**
   * Activate a workflow
   */
  async activateWorkflow(workflowId: string): Promise<boolean> {
    try {
      await firstValueFrom(
        this.httpService.post(
          `${this.baseUrl}/api/v1/workflows/${workflowId}/activate`,
          {},
          { headers: this.headers },
        ),
      );
      return true;
    } catch (error) {
      this.logger.error(`Failed to activate n8n workflow: ${error.message}`);
      return false;
    }
  }

  /**
   * Deactivate a workflow
   */
  async deactivateWorkflow(workflowId: string): Promise<boolean> {
    try {
      await firstValueFrom(
        this.httpService.post(
          `${this.baseUrl}/api/v1/workflows/${workflowId}/deactivate`,
          {},
          { headers: this.headers },
        ),
      );
      return true;
    } catch (error) {
      this.logger.error(`Failed to deactivate n8n workflow: ${error.message}`);
      return false;
    }
  }

  /**
   * Get execution history
   */
  async getExecutions(workflowId?: string, limit = 20): Promise<N8nExecutionResult[]> {
    try {
      const response = await firstValueFrom(
        this.httpService.get(
          `${this.baseUrl}/api/v1/executions`,
          {
            headers: this.headers,
            params: {
              ...(workflowId && { workflowId }),
              limit,
            },
          },
        ),
      );
      return response.data.data || [];
    } catch (error) {
      this.logger.error(`Failed to get n8n executions: ${error.message}`);
      return [];
    }
  }

  /**
   * Get execution details
   */
  async getExecution(executionId: string): Promise<N8nExecutionResult | null> {
    try {
      const response = await firstValueFrom(
        this.httpService.get(
          `${this.baseUrl}/api/v1/executions/${executionId}`,
          { headers: this.headers },
        ),
      );
      return response.data;
    } catch (error) {
      this.logger.error(`Failed to get n8n execution: ${error.message}`);
      return null;
    }
  }

  /**
   * Create a WasslChat-specific webhook for chatbot integration
   */
  buildChatbotWebhookPayload(data: {
    tenantId: string;
    contactId: string;
    contactPhone: string;
    contactName?: string;
    conversationId: string;
    message: string;
    messageType: string;
    metadata?: any;
  }) {
    return {
      event: 'chatbot_message',
      timestamp: new Date().toISOString(),
      tenant: {
        id: data.tenantId,
      },
      contact: {
        id: data.contactId,
        phone: data.contactPhone,
        name: data.contactName,
      },
      conversation: {
        id: data.conversationId,
      },
      message: {
        content: data.message,
        type: data.messageType,
      },
      metadata: data.metadata || {},
    };
  }
}
