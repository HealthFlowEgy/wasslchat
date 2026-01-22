import { Injectable, NotFoundException, BadRequestException, Logger } from '@nestjs/common';
import { Prisma } from '@wasslchat/database';
import slugify from 'slugify';
import { PrismaService } from '../../common/prisma/prisma.service';

export interface CreateCategoryDto {
  name: string;
  nameAr?: string;
  slug?: string;
  description?: string;
  descriptionAr?: string;
  parentId?: string;
  image?: string;
  icon?: string;
  sortOrder?: number;
  isActive?: boolean;
  metadata?: any;
}

@Injectable()
export class CategoriesService {
  private readonly logger = new Logger(CategoriesService.name);

  constructor(private readonly prisma: PrismaService) {}

  async create(tenantId: string, dto: CreateCategoryDto) {
    const slug = dto.slug || await this.generateUniqueSlug(tenantId, dto.name);

    if (dto.parentId) {
      const parent = await this.prisma.category.findFirst({
        where: { id: dto.parentId, tenantId },
      });
      if (!parent) throw new BadRequestException('التصنيف الأب غير موجود');
    }

    const category = await this.prisma.category.create({
      data: {
        tenantId,
        name: dto.name,
        nameAr: dto.nameAr,
        slug,
        description: dto.description,
        descriptionAr: dto.descriptionAr,
        parentId: dto.parentId,
        image: dto.image,
        icon: dto.icon,
        sortOrder: dto.sortOrder || 0,
        isActive: dto.isActive ?? true,
        metadata: dto.metadata || {},
      },
    });

    this.logger.log(`Category created: ${category.id}`);
    return category;
  }

  async findAll(tenantId: string, includeInactive = false) {
    const where: Prisma.CategoryWhereInput = {
      tenantId,
      ...(!includeInactive && { isActive: true }),
    };

    const categories = await this.prisma.category.findMany({
      where,
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
      include: {
        _count: { select: { products: true } },
        children: {
          where: includeInactive ? {} : { isActive: true },
          orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
          include: { _count: { select: { products: true } } },
        },
      },
    });

    // Build tree structure
    const rootCategories = categories.filter((c) => !c.parentId);
    return rootCategories.map((c) => ({
      ...c,
      productsCount: c._count.products,
      children: c.children.map((child) => ({
        ...child,
        productsCount: child._count.products,
      })),
    }));
  }

  async findOne(tenantId: string, id: string) {
    const category = await this.prisma.category.findFirst({
      where: { id, tenantId },
      include: {
        parent: true,
        children: true,
        products: { take: 10, where: { isActive: true }, orderBy: { createdAt: 'desc' } },
        _count: { select: { products: true } },
      },
    });

    if (!category) throw new NotFoundException('التصنيف غير موجود');
    return { ...category, productsCount: category._count.products };
  }

  async findBySlug(tenantId: string, slug: string) {
    const category = await this.prisma.category.findFirst({
      where: { tenantId, slug },
      include: { _count: { select: { products: true } } },
    });

    if (!category) throw new NotFoundException('التصنيف غير موجود');
    return { ...category, productsCount: category._count.products };
  }

  async update(tenantId: string, id: string, dto: Partial<CreateCategoryDto>) {
    const category = await this.prisma.category.findFirst({ where: { id, tenantId } });
    if (!category) throw new NotFoundException('التصنيف غير موجود');

    let slug = category.slug;
    if (dto.name && dto.name !== category.name) {
      slug = await this.generateUniqueSlug(tenantId, dto.name, id);
    }

    if (dto.parentId && dto.parentId !== category.parentId) {
      if (dto.parentId === id) {
        throw new BadRequestException('لا يمكن تعيين التصنيف كأب لنفسه');
      }
      const parent = await this.prisma.category.findFirst({
        where: { id: dto.parentId, tenantId },
      });
      if (!parent) throw new BadRequestException('التصنيف الأب غير موجود');
    }

    return this.prisma.category.update({
      where: { id },
      data: {
        ...(dto.name && { name: dto.name, slug }),
        ...(dto.nameAr !== undefined && { nameAr: dto.nameAr }),
        ...(dto.description !== undefined && { description: dto.description }),
        ...(dto.descriptionAr !== undefined && { descriptionAr: dto.descriptionAr }),
        ...(dto.parentId !== undefined && { parentId: dto.parentId }),
        ...(dto.image !== undefined && { image: dto.image }),
        ...(dto.icon !== undefined && { icon: dto.icon }),
        ...(dto.sortOrder !== undefined && { sortOrder: dto.sortOrder }),
        ...(dto.isActive !== undefined && { isActive: dto.isActive }),
        ...(dto.metadata !== undefined && { metadata: dto.metadata }),
      },
    });
  }

  async delete(tenantId: string, id: string) {
    const category = await this.prisma.category.findFirst({
      where: { id, tenantId },
      include: { _count: { select: { products: true, children: true } } },
    });

    if (!category) throw new NotFoundException('التصنيف غير موجود');

    if (category._count.children > 0) {
      throw new BadRequestException('لا يمكن حذف تصنيف لديه تصنيفات فرعية');
    }

    if (category._count.products > 0) {
      // Move products to uncategorized or deactivate
      await this.prisma.product.updateMany({
        where: { categoryId: id },
        data: { categoryId: null },
      });
    }

    await this.prisma.category.delete({ where: { id } });
    this.logger.log(`Category deleted: ${id}`);
  }

  async reorder(tenantId: string, items: Array<{ id: string; sortOrder: number }>) {
    await this.prisma.$transaction(
      items.map((item) =>
        this.prisma.category.updateMany({
          where: { id: item.id, tenantId },
          data: { sortOrder: item.sortOrder },
        }),
      ),
    );
    return { success: true };
  }

  private async generateUniqueSlug(tenantId: string, name: string, excludeId?: string): Promise<string> {
    const baseSlug = slugify(name, { lower: true, strict: true, locale: 'ar' });
    let slug = baseSlug;
    let counter = 1;

    while (true) {
      const existing = await this.prisma.category.findFirst({
        where: { tenantId, slug, ...(excludeId && { NOT: { id: excludeId } }) },
      });
      if (!existing) return slug;
      slug = `${baseSlug}-${counter}`;
      counter++;
    }
  }
}
