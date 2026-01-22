import { Controller, Get, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { Service } from './auth.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { TenantId } from '../auth/decorators/current-user.decorator';

@ApiTags('')
@ApiBearerAuth('JWT-auth')
@Controller({ path: 'auth', version: '1' })
@UseGuards(JwtAuthGuard)
export class Controller {
  constructor(private readonly service: Service) {}

  @Get()
  async findAll(@TenantId() tenantId: string) {
    return { message: ' endpoint - TODO: implement' };
  }
}
