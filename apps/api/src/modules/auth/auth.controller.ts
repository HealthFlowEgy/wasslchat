import { Controller, Get, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { AuthService } from './auth.service';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { TenantId } from './decorators/current-user.decorator';

@ApiTags('Auth')
@ApiBearerAuth('JWT-auth')
@Controller({ path: 'auth', version: '1' })
@UseGuards(JwtAuthGuard)
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Get()
  async findAll(@TenantId() tenantId: string) {
    return { message: 'Auth endpoint - TODO: implement' };
  }
}
