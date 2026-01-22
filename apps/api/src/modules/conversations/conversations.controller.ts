import {
  Controller, Get, Post, Patch, Body, Param, Query,
  UseGuards, ParseUUIDPipe,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { ConversationsService } from './conversations.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { TenantId } from '../auth/decorators/current-user.decorator';

@ApiTags('Conversations')
@ApiBearerAuth('JWT-auth')
@Controller({ path: 'conversations', version: '1' })
@UseGuards(JwtAuthGuard)
export class ConversationsController {
  constructor(private readonly conversationsService: ConversationsService) {}

  @Get()
  @ApiOperation({ summary: 'List all conversations' })
  async findAll(@TenantId() tenantId: string, @Query() query: any) {
    return this.conversationsService.findAll(tenantId, query);
  }

  @Get('stats')
  @ApiOperation({ summary: 'Get conversation statistics' })
  async getStats(@TenantId() tenantId: string) {
    return this.conversationsService.getStats(tenantId);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get conversation by ID' })
  async findOne(@TenantId() tenantId: string, @Param('id', ParseUUIDPipe) id: string) {
    return this.conversationsService.findOne(tenantId, id);
  }

  @Patch(':id/assign')
  @ApiOperation({ summary: 'Assign conversation to agent' })
  async assign(
    @TenantId() tenantId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body('assigneeId') assigneeId: string | null,
  ) {
    return this.conversationsService.assign(tenantId, id, assigneeId);
  }

  @Patch(':id/status')
  @ApiOperation({ summary: 'Update conversation status' })
  async updateStatus(
    @TenantId() tenantId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body('status') status: any,
  ) {
    return this.conversationsService.updateStatus(tenantId, id, status);
  }

  @Post(':id/tags')
  @ApiOperation({ summary: 'Add tags to conversation' })
  async addTags(
    @TenantId() tenantId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body('tags') tags: string[],
  ) {
    return this.conversationsService.addTags(tenantId, id, tags);
  }

  @Get('contact/:contactId')
  @ApiOperation({ summary: 'Get conversations by contact' })
  async getByContact(
    @TenantId() tenantId: string,
    @Param('contactId', ParseUUIDPipe) contactId: string,
  ) {
    return this.conversationsService.getByContact(tenantId, contactId);
  }
}
