import {
  Controller,
  Get,
  Post,
  Delete,
  Body,
  Param,
  UseGuards,
  ParseUUIDPipe,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { WhatsappService } from './whatsapp.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles, TenantId } from '../auth/decorators/current-user.decorator';

@ApiTags('WhatsApp')
@ApiBearerAuth('JWT-auth')
@Controller({ path: 'whatsapp', version: '1' })
@UseGuards(JwtAuthGuard, RolesGuard)
export class WhatsappController {
  constructor(private readonly whatsappService: WhatsappService) {}

  // ============= SESSION MANAGEMENT =============

  @Post('sessions')
  @Roles('OWNER', 'ADMIN')
  @ApiOperation({ summary: 'Create new WhatsApp session' })
  async createSession(
    @TenantId() tenantId: string,
    @Body('instanceName') instanceName: string,
  ) {
    return this.whatsappService.createSession(tenantId, instanceName);
  }

  @Get('sessions')
  @ApiOperation({ summary: 'List all WhatsApp sessions' })
  async getSessions(@TenantId() tenantId: string) {
    return this.whatsappService.getSessions(tenantId);
  }

  @Get('sessions/:id')
  @ApiOperation({ summary: 'Get session details' })
  async getSession(
    @TenantId() tenantId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.whatsappService.getSession(tenantId, id);
  }

  @Post('sessions/:id/connect')
  @Roles('OWNER', 'ADMIN')
  @ApiOperation({ summary: 'Connect session (get QR code)' })
  async connectSession(
    @TenantId() tenantId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.whatsappService.connectSession(tenantId, id);
  }

  @Post('sessions/:id/disconnect')
  @Roles('OWNER', 'ADMIN')
  @ApiOperation({ summary: 'Disconnect session' })
  async disconnectSession(
    @TenantId() tenantId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.whatsappService.disconnectSession(tenantId, id);
  }

  @Delete('sessions/:id')
  @Roles('OWNER', 'ADMIN')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete session' })
  async deleteSession(
    @TenantId() tenantId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    await this.whatsappService.deleteSession(tenantId, id);
  }

  // ============= MESSAGING =============

  @Post('send/text')
  @ApiOperation({ summary: 'Send text message' })
  async sendText(
    @TenantId() tenantId: string,
    @Body() body: { to: string; text: string },
  ) {
    return this.whatsappService.sendTextMessage(tenantId, body.to, body.text);
  }

  @Post('send/media')
  @ApiOperation({ summary: 'Send media message' })
  async sendMedia(
    @TenantId() tenantId: string,
    @Body() body: {
      to: string;
      mediaType: 'image' | 'video' | 'audio' | 'document';
      media: string;
      caption?: string;
      fileName?: string;
    },
  ) {
    return this.whatsappService.sendMediaMessage(
      tenantId,
      body.to,
      body.mediaType,
      body.media,
      body.caption,
      body.fileName,
    );
  }

  @Post('send/buttons')
  @ApiOperation({ summary: 'Send button message' })
  async sendButtons(
    @TenantId() tenantId: string,
    @Body() body: {
      to: string;
      title: string;
      description: string;
      buttons: Array<{ id: string; text: string }>;
      footer?: string;
    },
  ) {
    return this.whatsappService.sendButtonMessage(
      tenantId,
      body.to,
      body.title,
      body.description,
      body.buttons,
      body.footer,
    );
  }

  @Post('send/list')
  @ApiOperation({ summary: 'Send list message' })
  async sendList(
    @TenantId() tenantId: string,
    @Body() body: {
      to: string;
      title: string;
      description: string;
      buttonText: string;
      sections: Array<{
        title: string;
        rows: Array<{ id: string; title: string; description?: string }>;
      }>;
      footer?: string;
    },
  ) {
    return this.whatsappService.sendListMessage(
      tenantId,
      body.to,
      body.title,
      body.description,
      body.buttonText,
      body.sections,
      body.footer,
    );
  }

  @Post('send/template')
  @ApiOperation({ summary: 'Send template message' })
  async sendTemplate(
    @TenantId() tenantId: string,
    @Body() body: {
      to: string;
      templateName: string;
      params?: Record<string, string>;
    },
  ) {
    return this.whatsappService.sendTemplateMessage(
      tenantId,
      body.to,
      body.templateName,
      body.params,
    );
  }
}
