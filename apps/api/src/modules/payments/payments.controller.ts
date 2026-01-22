import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Query,
  UseGuards,
  ParseUUIDPipe,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiResponse, ApiQuery } from '@nestjs/swagger';
import { PaymentsService } from './payments.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles, TenantId } from '../auth/decorators/current-user.decorator';

@ApiTags('Payments')
@ApiBearerAuth('JWT-auth')
@Controller({ path: 'payments', version: '1' })
@UseGuards(JwtAuthGuard, RolesGuard)
export class PaymentsController {
  constructor(private readonly paymentsService: PaymentsService) {}

  @Post('initiate/:orderId')
  @ApiOperation({ summary: 'Initiate payment for an order' })
  @ApiResponse({ status: 200, description: 'Payment initiated' })
  async initiatePayment(
    @TenantId() tenantId: string,
    @Param('orderId', ParseUUIDPipe) orderId: string,
    @Body('returnUrl') returnUrl?: string,
  ) {
    return this.paymentsService.initiatePayment(tenantId, orderId, returnUrl);
  }

  @Get()
  @ApiOperation({ summary: 'List all payments' })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({ name: 'status', required: false })
  @ApiQuery({ name: 'gateway', required: false })
  @ApiQuery({ name: 'startDate', required: false })
  @ApiQuery({ name: 'endDate', required: false })
  async findAll(
    @TenantId() tenantId: string,
    @Query() query: any,
  ) {
    return this.paymentsService.findAll(tenantId, query);
  }

  @Get('stats')
  @ApiOperation({ summary: 'Get payment statistics' })
  async getStats(
    @TenantId() tenantId: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    return this.paymentsService.getStats(
      tenantId,
      startDate ? new Date(startDate) : undefined,
      endDate ? new Date(endDate) : undefined,
    );
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get payment by ID' })
  async findOne(
    @TenantId() tenantId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.paymentsService.findOne(tenantId, id);
  }

  @Get(':id/status')
  @ApiOperation({ summary: 'Check payment status from gateway' })
  async checkStatus(
    @TenantId() tenantId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.paymentsService.checkStatus(tenantId, id);
  }

  @Post(':id/refund')
  @Roles('OWNER', 'ADMIN')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Process refund' })
  async refund(
    @TenantId() tenantId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: { amount?: number; reason?: string },
  ) {
    return this.paymentsService.refund(tenantId, id, body.amount, body.reason);
  }
}
