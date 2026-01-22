import {
  Controller, Get, Post, Put, Patch, Delete, Body, Param, Query,
  UseGuards, ParseUUIDPipe, HttpCode, HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { ChatbotsService } from './chatbots.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles, TenantId } from '../auth/decorators/current-user.decorator';

@ApiTags('Chatbots')
@ApiBearerAuth('JWT-auth')
@Controller({ path: 'chatbots', version: '1' })
@UseGuards(JwtAuthGuard, RolesGuard)
export class ChatbotsController {
  constructor(private readonly chatbotsService: ChatbotsService) {}

  @Post()
  @Roles('OWNER', 'ADMIN')
  @ApiOperation({ summary: 'Create chatbot flow' })
  async create(@TenantId() tenantId: string, @Body() dto: any) {
    return this.chatbotsService.create(tenantId, dto);
  }

  @Get()
  @ApiOperation({ summary: 'List all chatbot flows' })
  async findAll(
    @TenantId() tenantId: string,
    @Query('includeInactive') includeInactive?: string,
  ) {
    return this.chatbotsService.findAll(tenantId, includeInactive === 'true');
  }

  @Get('stats')
  @ApiOperation({ summary: 'Get chatbot statistics' })
  async getStats(@TenantId() tenantId: string) {
    return this.chatbotsService.getStats(tenantId);
  }

  @Get('integrations/typebots')
  @ApiOperation({ summary: 'List available Typebots' })
  async listTypebots() {
    return this.chatbotsService.listTypebots();
  }

  @Get('integrations/n8n-workflows')
  @ApiOperation({ summary: 'List n8n workflows' })
  async listN8nWorkflows(@Query('active') active?: string) {
    return this.chatbotsService.listN8nWorkflows(active === 'true' ? true : undefined);
  }

  @Post('integrations/test-n8n')
  @Roles('OWNER', 'ADMIN')
  @ApiOperation({ summary: 'Test n8n webhook' })
  async testN8nWebhook(
    @TenantId() tenantId: string,
    @Body() body: { webhookPath: string; testData?: any },
  ) {
    return this.chatbotsService.testN8nWebhook(tenantId, body.webhookPath, body.testData || {});
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get chatbot flow by ID' })
  async findOne(@TenantId() tenantId: string, @Param('id', ParseUUIDPipe) id: string) {
    return this.chatbotsService.findOne(tenantId, id);
  }

  @Put(':id')
  @Roles('OWNER', 'ADMIN')
  @ApiOperation({ summary: 'Update chatbot flow' })
  async update(
    @TenantId() tenantId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: any,
  ) {
    return this.chatbotsService.update(tenantId, id, dto);
  }

  @Delete(':id')
  @Roles('OWNER', 'ADMIN')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete chatbot flow' })
  async delete(@TenantId() tenantId: string, @Param('id', ParseUUIDPipe) id: string) {
    await this.chatbotsService.delete(tenantId, id);
  }

  @Patch(':id/toggle')
  @Roles('OWNER', 'ADMIN')
  @ApiOperation({ summary: 'Toggle chatbot flow active status' })
  async toggleActive(@TenantId() tenantId: string, @Param('id', ParseUUIDPipe) id: string) {
    return this.chatbotsService.toggleActive(tenantId, id);
  }

  @Post('reorder')
  @Roles('OWNER', 'ADMIN')
  @ApiOperation({ summary: 'Reorder chatbot flows' })
  async reorder(
    @TenantId() tenantId: string,
    @Body() items: Array<{ id: string; priority: number }>,
  ) {
    return this.chatbotsService.reorder(tenantId, items);
  }
}
