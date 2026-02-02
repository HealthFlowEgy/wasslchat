import { Controller, Get, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { TenantsService } from './tenants.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { TenantId } from '../auth/decorators/current-user.decorator';

@ApiTags('Tenants')
@ApiBearerAuth('JWT-auth')
@Controller({ path: 'tenants', version: '1' })
@UseGuards(JwtAuthGuard)
export class TenantsController {
  constructor(private readonly tenantsService: TenantsService) {}

  @Get()
  async findAll(@TenantId() tenantId: string) {
    return { message: 'Tenants endpoint - TODO: implement' };
  }
}
