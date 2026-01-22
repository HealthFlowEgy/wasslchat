import { Controller, Post, Body, Param, HttpCode, Logger } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiExcludeEndpoint } from '@nestjs/swagger';
import { WhatsappService } from './whatsapp.service';

@ApiTags('Webhooks')
@Controller({ path: 'webhooks/whatsapp', version: '1' })
export class WhatsappWebhookController {
  private readonly logger = new Logger(WhatsappWebhookController.name);

  constructor(private readonly whatsappService: WhatsappService) {}

  @Post(':tenantId')
  @HttpCode(200)
  @ApiExcludeEndpoint()
  async handleWebhook(
    @Param('tenantId') tenantId: string,
    @Body() body: any,
  ) {
    try {
      const event = body.event || this.detectEvent(body);
      this.logger.debug(`Webhook: ${event} for tenant ${tenantId}`);
      
      await this.whatsappService.handleWebhook(tenantId, event, body);
      
      return { status: 'ok' };
    } catch (error) {
      this.logger.error(`Webhook error: ${error.message}`);
      return { status: 'error', message: error.message };
    }
  }

  private detectEvent(body: any): string {
    if (body.data?.connection) return 'connection.update';
    if (body.data?.messages) return 'messages.upsert';
    if (body.data?.updates) return 'messages.update';
    if (body.data?.qrcode) return 'qrcode.updated';
    return 'unknown';
  }
}
