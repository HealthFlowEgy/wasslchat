import { Controller, Get, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { ConversationsService } from './health.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { TenantId } from '../auth/decorators/current-user.decorator';

@ApiTags('Conversations')
@ApiBearerAuth('JWT-auth')
@Controller({ path: 'health', version: '1' })
@UseGuards(JwtAuthGuard)
export class ConversationsController {
  constructor(private readonly service: ConversationsService) {}

  @Get()
  async findAll(@TenantId() tenantId: string) {
    return { message: 'Conversations endpoint - TODO: implement' };
  }
}
