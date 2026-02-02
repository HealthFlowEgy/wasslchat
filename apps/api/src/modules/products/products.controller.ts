import { Controller, Get, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { ProductsService } from './products.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { TenantId } from '../auth/decorators/current-user.decorator';

@ApiTags('Products')
@ApiBearerAuth('JWT-auth')
@Controller({ path: 'products', version: '1' })
@UseGuards(JwtAuthGuard)
export class ProductsController {
  constructor(private readonly productsService: ProductsService) {}

  @Get()
  async findAll(@TenantId() tenantId: string) {
    return { message: 'Products endpoint - TODO: implement' };
  }
}
