import {
  Controller,
  Post,
  Body,
  Param,
  Headers,
  HttpCode,
  Logger,
  RawBodyRequest,
  Req,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiExcludeEndpoint } from '@nestjs/swagger';
import { Request } from 'express';
import { PaymentsService } from './payments.service';
import { HealthPayService } from './gateways/healthpay.service';
import { FawryService } from './gateways/fawry.service';
import { VodafoneCashService } from './gateways/vodafone-cash.service';

@ApiTags('Webhooks')
@Controller({ path: 'webhooks/payments', version: '1' })
export class PaymentWebhookController {
  private readonly logger = new Logger(PaymentWebhookController.name);

  constructor(
    private readonly paymentsService: PaymentsService,
    private readonly healthPayService: HealthPayService,
    private readonly fawryService: FawryService,
    private readonly vodafoneCashService: VodafoneCashService,
  ) {}

  /**
   * HealthPay Webhook
   */
  @Post('healthpay/:tenantId')
  @HttpCode(200)
  @ApiExcludeEndpoint()
  async handleHealthPayWebhook(
    @Param('tenantId') tenantId: string,
    @Body() payload: any,
    @Headers('x-healthpay-signature') signature: string,
  ) {
    this.logger.log(`HealthPay webhook for tenant ${tenantId}`);
    this.logger.debug(`Payload: ${JSON.stringify(payload)}`);

    try {
      // Verify signature
      if (signature && !this.healthPayService.verifyWebhookSignature(payload, signature)) {
        this.logger.warn('Invalid HealthPay webhook signature');
        return { status: 'invalid_signature' };
      }

      // Parse and process
      const parsed = this.healthPayService.parseWebhookPayload(payload);
      const result = await this.paymentsService.handleWebhook(tenantId, 'HEALTHPAY', parsed);

      return { status: 'ok', ...result };
    } catch (error) {
      this.logger.error(`HealthPay webhook error: ${error.message}`);
      return { status: 'error', message: error.message };
    }
  }

  /**
   * Fawry Callback/Webhook
   */
  @Post('fawry/:tenantId')
  @HttpCode(200)
  @ApiExcludeEndpoint()
  async handleFawryWebhook(
    @Param('tenantId') tenantId: string,
    @Body() payload: any,
  ) {
    this.logger.log(`Fawry webhook for tenant ${tenantId}`);
    this.logger.debug(`Payload: ${JSON.stringify(payload)}`);

    try {
      // Verify Fawry callback signature
      const isValid = this.fawryService.verifyCallbackSignature(
        payload.fawryRefNumber,
        payload.merchantRefNumber,
        parseFloat(payload.paymentAmount || '0'),
        parseFloat(payload.orderAmount || '0'),
        payload.orderStatus,
        payload.paymentMethod,
        payload.paymentRefrenceNumber,
        payload.messageSignature,
      );

      if (!isValid) {
        this.logger.warn('Invalid Fawry callback signature');
        return { status: 'invalid_signature' };
      }

      // Parse and process
      const parsed = this.fawryService.parseCallbackPayload(payload);
      const result = await this.paymentsService.handleWebhook(tenantId, 'FAWRY', {
        ...parsed,
        referenceNumber: payload.merchantRefNumber,
        transactionId: payload.fawryRefNumber,
        status: parsed.status,
      });

      return { status: 'ok', ...result };
    } catch (error) {
      this.logger.error(`Fawry webhook error: ${error.message}`);
      return { status: 'error', message: error.message };
    }
  }

  /**
   * Vodafone Cash Webhook
   */
  @Post('vodafone/:tenantId')
  @HttpCode(200)
  @ApiExcludeEndpoint()
  async handleVodafoneCashWebhook(
    @Param('tenantId') tenantId: string,
    @Body() payload: any,
    @Headers('x-signature') signature: string,
  ) {
    this.logger.log(`Vodafone Cash webhook for tenant ${tenantId}`);
    this.logger.debug(`Payload: ${JSON.stringify(payload)}`);

    try {
      // Verify signature
      if (signature && !this.vodafoneCashService.verifyCallbackSignature(payload, signature)) {
        this.logger.warn('Invalid Vodafone Cash webhook signature');
        return { status: 'invalid_signature' };
      }

      // Parse and process
      const parsed = this.vodafoneCashService.parseCallbackPayload(payload);
      const result = await this.paymentsService.handleWebhook(tenantId, 'VODAFONE_CASH', {
        ...parsed,
        status: parsed.status,
      });

      return { status: 'ok', ...result };
    } catch (error) {
      this.logger.error(`Vodafone Cash webhook error: ${error.message}`);
      return { status: 'error', message: error.message };
    }
  }

  /**
   * Generic payment webhook (routes based on gateway header)
   */
  @Post(':tenantId')
  @HttpCode(200)
  @ApiExcludeEndpoint()
  async handleGenericWebhook(
    @Param('tenantId') tenantId: string,
    @Body() payload: any,
    @Headers('x-gateway') gateway: string,
    @Headers('x-signature') signature: string,
  ) {
    this.logger.log(`Generic payment webhook: ${gateway} for tenant ${tenantId}`);

    try {
      const gatewayUpper = gateway?.toUpperCase() || 'UNKNOWN';
      const result = await this.paymentsService.handleWebhook(
        tenantId,
        gatewayUpper,
        payload,
        signature,
      );

      return { status: 'ok', ...result };
    } catch (error) {
      this.logger.error(`Webhook error: ${error.message}`);
      return { status: 'error', message: error.message };
    }
  }
}
