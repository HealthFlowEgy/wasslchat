import {
  Controller, Get, Post, Put, Patch, Delete, Body, Param, Query,
  UseGuards, ParseUUIDPipe, HttpCode, HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiQuery } from '@nestjs/swagger';
import { IntegrationsService } from './integrations.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles, TenantId } from '../auth/decorators/current-user.decorator';

@ApiTags('Integrations')
@ApiBearerAuth('JWT-auth')
@Controller({ path: 'integrations', version: '1' })
@UseGuards(JwtAuthGuard, RolesGuard)
export class IntegrationsController {
  constructor(private readonly integrationsService: IntegrationsService) {}

  @Post()
  @Roles('OWNER', 'ADMIN')
  @ApiOperation({ summary: 'Create integration' })
  async create(@TenantId() tenantId: string, @Body() dto: any) {
    return this.integrationsService.create(tenantId, dto);
  }

  @Post('test-connection')
  @Roles('OWNER', 'ADMIN')
  @ApiOperation({ summary: 'Test integration connection' })
  async testConnection(@Body() body: { type: string; config: any }) {
    return this.integrationsService.testConnection(body.type, body.config);
  }

  @Get()
  @ApiOperation({ summary: 'List all integrations' })
  async findAll(@TenantId() tenantId: string) {
    return this.integrationsService.findAll(tenantId);
  }

  @Get('governorates')
  @ApiOperation({ summary: 'Get Egyptian governorates' })
  async getGovernorates() {
    return this.integrationsService.getGovernorates();
  }

  @Get('cities/:governorate')
  @ApiOperation({ summary: 'Get cities for governorate' })
  async getCities(@Param('governorate') governorate: string) {
    return this.integrationsService.getCities(governorate);
  }

  @Post('shipping/rates')
  @ApiOperation({ summary: 'Get shipping rates' })
  async getShippingRates(@Body() body: any) {
    return this.integrationsService.getShippingRates(body);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get integration by ID' })
  async findOne(@TenantId() tenantId: string, @Param('id', ParseUUIDPipe) id: string) {
    return this.integrationsService.findOne(tenantId, id);
  }

  @Put(':id')
  @Roles('OWNER', 'ADMIN')
  @ApiOperation({ summary: 'Update integration' })
  async update(
    @TenantId() tenantId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: any,
  ) {
    return this.integrationsService.update(tenantId, id, dto);
  }

  @Delete(':id')
  @Roles('OWNER', 'ADMIN')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete integration' })
  async delete(@TenantId() tenantId: string, @Param('id', ParseUUIDPipe) id: string) {
    await this.integrationsService.delete(tenantId, id);
  }

  @Patch(':id/toggle')
  @Roles('OWNER', 'ADMIN')
  @ApiOperation({ summary: 'Toggle integration active status' })
  async toggleActive(@TenantId() tenantId: string, @Param('id', ParseUUIDPipe) id: string) {
    return this.integrationsService.toggleActive(tenantId, id);
  }

  @Post(':id/sync')
  @Roles('OWNER', 'ADMIN')
  @ApiOperation({ summary: 'Trigger manual sync' })
  async triggerSync(
    @TenantId() tenantId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Query('type') syncType?: 'products' | 'orders' | 'all',
  ) {
    return this.integrationsService.triggerSync(tenantId, id, syncType);
  }

  @Post('orders/:orderId/ship')
  @Roles('OWNER', 'ADMIN', 'MANAGER')
  @ApiOperation({ summary: 'Create shipment for order' })
  async createShipment(
    @TenantId() tenantId: string,
    @Param('orderId', ParseUUIDPipe) orderId: string,
    @Body('provider') provider: 'WASSLBOX' | 'BOSTA',
  ) {
    return this.integrationsService.createShipment(tenantId, orderId, provider);
  }

  @Get('orders/:orderId/tracking')
  @ApiOperation({ summary: 'Get shipment tracking' })
  async getTracking(
    @TenantId() tenantId: string,
    @Param('orderId', ParseUUIDPipe) orderId: string,
  ) {
    return this.integrationsService.getTracking(tenantId, orderId);
  }
}
