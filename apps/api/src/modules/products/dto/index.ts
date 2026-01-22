import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import {
  IsString,
  IsNumber,
  IsBoolean,
  IsOptional,
  IsArray,
  IsUUID,
  IsEnum,
  Min,
  Max,
  MaxLength,
  IsObject,
} from 'class-validator';
import { Type, Transform } from 'class-transformer';

// ============= CREATE DTO =============
export class CreateProductDto {
  @ApiProperty({ example: 'iPhone 15 Pro' })
  @IsString()
  @MaxLength(200)
  name: string;

  @ApiPropertyOptional({ example: 'آيفون 15 برو' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  nameAr?: string;

  @ApiPropertyOptional({ example: 'SKU-001' })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  sku?: string;

  @ApiPropertyOptional({ example: '1234567890123' })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  barcode?: string;

  @ApiPropertyOptional({ example: 'uuid' })
  @IsOptional()
  @IsUUID()
  categoryId?: string;

  @ApiPropertyOptional({ example: 'Short product description' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  shortDescription?: string;

  @ApiPropertyOptional({ example: 'وصف قصير للمنتج' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  shortDescriptionAr?: string;

  @ApiPropertyOptional({ example: 'Full product description' })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({ example: 'وصف كامل للمنتج' })
  @IsOptional()
  @IsString()
  descriptionAr?: string;

  @ApiProperty({ example: 49999.99 })
  @IsNumber()
  @Min(0)
  @Type(() => Number)
  price: number;

  @ApiPropertyOptional({ example: 54999.99 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Type(() => Number)
  compareAtPrice?: number;

  @ApiPropertyOptional({ example: 40000 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Type(() => Number)
  costPrice?: number;

  @ApiPropertyOptional({ example: 'EGP', default: 'EGP' })
  @IsOptional()
  @IsString()
  currency?: string;

  @ApiPropertyOptional({ example: 100, default: 0 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Type(() => Number)
  inventoryQty?: number;

  @ApiPropertyOptional({ example: 5, default: 5 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Type(() => Number)
  lowStockThreshold?: number;

  @ApiPropertyOptional({ example: true, default: true })
  @IsOptional()
  @IsBoolean()
  trackInventory?: boolean;

  @ApiPropertyOptional({ example: false, default: false })
  @IsOptional()
  @IsBoolean()
  allowBackorder?: boolean;

  @ApiPropertyOptional({ example: 0.5, description: 'Weight in kg' })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Type(() => Number)
  weight?: number;

  @ApiPropertyOptional({ example: { length: 10, width: 5, height: 2 } })
  @IsOptional()
  @IsObject()
  dimensions?: { length: number; width: number; height: number };

  @ApiPropertyOptional({ example: ['https://example.com/image1.jpg'] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  images?: string[];

  @ApiPropertyOptional({ example: true, default: true })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @ApiPropertyOptional({ example: false, default: false })
  @IsOptional()
  @IsBoolean()
  isFeatured?: boolean;

  @ApiPropertyOptional({ example: false, default: false })
  @IsOptional()
  @IsBoolean()
  isDigital?: boolean;

  @ApiPropertyOptional({ example: ['electronics', 'smartphones'] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  tags?: string[];

  @ApiPropertyOptional({ example: { color: 'Space Black', storage: '256GB' } })
  @IsOptional()
  @IsObject()
  attributes?: Record<string, any>;

  @ApiPropertyOptional()
  @IsOptional()
  @IsArray()
  variants?: any[];

  @ApiPropertyOptional({ example: 'iPhone 15 Pro - Best Price in Egypt' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  seoTitle?: string;

  @ApiPropertyOptional({ example: 'Buy iPhone 15 Pro at the best price' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  seoDescription?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsObject()
  metadata?: Record<string, any>;
}

// ============= UPDATE DTO =============
export class UpdateProductDto extends PartialType(CreateProductDto) {}

// ============= QUERY DTO =============
export class ProductQueryDto {
  @ApiPropertyOptional({ default: 1 })
  @IsOptional()
  @IsNumber()
  @Min(1)
  @Type(() => Number)
  page?: number = 1;

  @ApiPropertyOptional({ default: 20 })
  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(100)
  @Type(() => Number)
  limit?: number = 20;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  categoryId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(({ value }) => value === 'true')
  @IsBoolean()
  isActive?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(({ value }) => value === 'true')
  @IsBoolean()
  isFeatured?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(({ value }) => value === 'true')
  @IsBoolean()
  inStock?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  minPrice?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  maxPrice?: number;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @Transform(({ value }) => (typeof value === 'string' ? value.split(',') : value))
  tags?: string[];

  @ApiPropertyOptional({ default: 'createdAt' })
  @IsOptional()
  @IsString()
  sortBy?: string = 'createdAt';

  @ApiPropertyOptional({ default: 'desc', enum: ['asc', 'desc'] })
  @IsOptional()
  @IsEnum(['asc', 'desc'])
  sortOrder?: 'asc' | 'desc' = 'desc';
}

// ============= INVENTORY UPDATE DTO =============
export class UpdateInventoryDto {
  @ApiProperty({ example: 10 })
  @IsNumber()
  @Min(0)
  @Type(() => Number)
  quantity: number;

  @ApiProperty({ enum: ['set', 'increment', 'decrement'], example: 'increment' })
  @IsEnum(['set', 'increment', 'decrement'])
  operation: 'set' | 'increment' | 'decrement';
}

// ============= BULK UPDATE DTO =============
export class BulkUpdateStatusDto {
  @ApiProperty({ type: [String] })
  @IsArray()
  @IsUUID('4', { each: true })
  ids: string[];

  @ApiProperty({ example: true })
  @IsBoolean()
  isActive: boolean;
}

// ============= RESPONSE DTOs =============
export class CategorySummaryDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  name: string;

  @ApiPropertyOptional()
  nameAr?: string;

  @ApiProperty()
  slug: string;
}

export class ProductResponseDto {
  @ApiProperty()
  id: string;

  @ApiPropertyOptional()
  sku?: string;

  @ApiPropertyOptional()
  barcode?: string;

  @ApiProperty()
  name: string;

  @ApiPropertyOptional()
  nameAr?: string;

  @ApiProperty()
  slug: string;

  @ApiPropertyOptional()
  shortDescription?: string;

  @ApiPropertyOptional()
  shortDescriptionAr?: string;

  @ApiPropertyOptional()
  description?: string;

  @ApiPropertyOptional()
  descriptionAr?: string;

  @ApiProperty()
  price: number;

  @ApiPropertyOptional()
  compareAtPrice?: number;

  @ApiPropertyOptional()
  costPrice?: number;

  @ApiProperty()
  currency: string;

  @ApiProperty()
  inventoryQty: number;

  @ApiProperty()
  lowStockThreshold: number;

  @ApiProperty()
  trackInventory: boolean;

  @ApiProperty()
  allowBackorder: boolean;

  @ApiPropertyOptional()
  weight?: number;

  @ApiPropertyOptional()
  dimensions?: any;

  @ApiProperty({ type: [String] })
  images: string[];

  @ApiPropertyOptional()
  thumbnail?: string;

  @ApiProperty()
  isActive: boolean;

  @ApiProperty()
  isFeatured: boolean;

  @ApiProperty()
  isDigital: boolean;

  @ApiProperty({ type: [String] })
  tags: string[];

  @ApiPropertyOptional()
  attributes?: any;

  @ApiPropertyOptional()
  variants?: any[];

  @ApiPropertyOptional()
  seoTitle?: string;

  @ApiPropertyOptional()
  seoDescription?: string;

  @ApiProperty()
  viewCount: number;

  @ApiProperty()
  soldCount: number;

  @ApiPropertyOptional({ type: CategorySummaryDto })
  category?: CategorySummaryDto;

  @ApiPropertyOptional()
  whatsappCatalogId?: string;

  @ApiProperty()
  createdAt: Date;

  @ApiProperty()
  updatedAt: Date;
}

export class PaginatedProductsDto {
  @ApiProperty({ type: [ProductResponseDto] })
  items: ProductResponseDto[];

  @ApiProperty()
  meta: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

export class ProductStatsDto {
  @ApiProperty()
  total: number;

  @ApiProperty()
  active: number;

  @ApiProperty()
  inactive: number;

  @ApiProperty()
  outOfStock: number;

  @ApiProperty()
  lowStock: number;

  @ApiProperty()
  featured: number;
}
