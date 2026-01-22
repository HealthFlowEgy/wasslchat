import {
  Controller, Get, Post, Put, Delete, Body, Param, Query,
  UseGuards, ParseUUIDPipe, HttpCode, HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiQuery } from '@nestjs/swagger';
import { BroadcastsService } from './broadcasts.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles, TenantId } from '../auth/decorators/current-user.decorator';

@ApiTags('Broadcasts')
@ApiBearerAuth('JWT-auth')
@Controller({ path: 'broadcasts', version: '1' })
@UseGuards(JwtAuthGuard, RolesGuard)
export class BroadcastsController {
  constructor(private readonly broadcastsService: BroadcastsService) {}

  @Post()
  @Roles('OWNER', 'ADMIN', 'MANAGER')
  @ApiOperation({ summary: 'Create broadcast campaign' })
  async create(@TenantId() tenantId: string, @Body() dto: any) {
    return this.broadcastsService.create(tenantId, dto);
  }

  @Get()
  @ApiOperation({ summary: 'List all broadcast campaigns' })
  @ApiQuery({ name: 'page', required: false })
  @ApiQuery({ name: 'limit', required: false })
  @ApiQuery({ name: 'status', required: false })
  @ApiQuery({ name: 'search', required: false })
  async findAll(@TenantId() tenantId: string, @Query() query: any) {
    return this.broadcastsService.findAll(tenantId, query);
  }

  @Get('stats')
  @ApiOperation({ summary: 'Get broadcast statistics' })
  async getStats(@TenantId() tenantId: string) {
    return this.broadcastsService.getStats(tenantId);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get broadcast by ID' })
  async findOne(@TenantId() tenantId: string, @Param('id', ParseUUIDPipe) id: string) {
    return this.broadcastsService.findOne(tenantId, id);
  }

  @Get(':id/recipients')
  @ApiOperation({ summary: 'Get broadcast recipients' })
  @ApiQuery({ name: 'page', required: false })
  @ApiQuery({ name: 'limit', required: false })
  @ApiQuery({ name: 'status', required: false })
  async getRecipients(
    @TenantId() tenantId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Query() query: any,
  ) {
    return this.broadcastsService.getRecipients(tenantId, id, query);
  }

  @Put(':id')
  @Roles('OWNER', 'ADMIN', 'MANAGER')
  @ApiOperation({ summary: 'Update broadcast' })
  async update(
    @TenantId() tenantId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: any,
  ) {
    return this.broadcastsService.update(tenantId, id, dto);
  }

  @Delete(':id')
  @Roles('OWNER', 'ADMIN')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete broadcast' })
  async delete(@TenantId() tenantId: string, @Param('id', ParseUUIDPipe) id: string) {
    await this.broadcastsService.delete(tenantId, id);
  }

  @Post(':id/send')
  @Roles('OWNER', 'ADMIN', 'MANAGER')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Send broadcast immediately' })
  async send(@TenantId() tenantId: string, @Param('id', ParseUUIDPipe) id: string) {
    return this.broadcastsService.send(tenantId, id);
  }

  @Post(':id/pause')
  @Roles('OWNER', 'ADMIN', 'MANAGER')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Pause broadcast' })
  async pause(@TenantId() tenantId: string, @Param('id', ParseUUIDPipe) id: string) {
    return this.broadcastsService.pause(tenantId, id);
  }

  @Post(':id/resume')
  @Roles('OWNER', 'ADMIN', 'MANAGER')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Resume broadcast' })
  async resume(@TenantId() tenantId: string, @Param('id', ParseUUIDPipe) id: string) {
    return this.broadcastsService.resume(tenantId, id);
  }

  @Post(':id/cancel')
  @Roles('OWNER', 'ADMIN')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Cancel broadcast' })
  async cancel(@TenantId() tenantId: string, @Param('id', ParseUUIDPipe) id: string) {
    return this.broadcastsService.cancel(tenantId, id);
  }
}
