import {
  Controller, Get, Post, Put, Delete, Body, Param, Query,
  UseGuards, ParseUUIDPipe, HttpCode, HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { CategoriesService } from './categories.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles, TenantId } from '../auth/decorators/current-user.decorator';

@ApiTags('Categories')
@ApiBearerAuth('JWT-auth')
@Controller({ path: 'categories', version: '1' })
@UseGuards(JwtAuthGuard, RolesGuard)
export class CategoriesController {
  constructor(private readonly categoriesService: CategoriesService) {}

  @Post()
  @Roles('OWNER', 'ADMIN', 'MANAGER')
  @ApiOperation({ summary: 'Create new category' })
  async create(@TenantId() tenantId: string, @Body() dto: any) {
    return this.categoriesService.create(tenantId, dto);
  }

  @Get()
  @ApiOperation({ summary: 'List all categories' })
  async findAll(
    @TenantId() tenantId: string,
    @Query('includeInactive') includeInactive?: string,
  ) {
    return this.categoriesService.findAll(tenantId, includeInactive === 'true');
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get category by ID' })
  async findOne(@TenantId() tenantId: string, @Param('id', ParseUUIDPipe) id: string) {
    return this.categoriesService.findOne(tenantId, id);
  }

  @Get('slug/:slug')
  @ApiOperation({ summary: 'Get category by slug' })
  async findBySlug(@TenantId() tenantId: string, @Param('slug') slug: string) {
    return this.categoriesService.findBySlug(tenantId, slug);
  }

  @Put(':id')
  @Roles('OWNER', 'ADMIN', 'MANAGER')
  @ApiOperation({ summary: 'Update category' })
  async update(
    @TenantId() tenantId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: any,
  ) {
    return this.categoriesService.update(tenantId, id, dto);
  }

  @Delete(':id')
  @Roles('OWNER', 'ADMIN')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete category' })
  async delete(@TenantId() tenantId: string, @Param('id', ParseUUIDPipe) id: string) {
    await this.categoriesService.delete(tenantId, id);
  }

  @Post('reorder')
  @Roles('OWNER', 'ADMIN', 'MANAGER')
  @ApiOperation({ summary: 'Reorder categories' })
  async reorder(
    @TenantId() tenantId: string,
    @Body() items: Array<{ id: string; sortOrder: number }>,
  ) {
    return this.categoriesService.reorder(tenantId, items);
  }
}
