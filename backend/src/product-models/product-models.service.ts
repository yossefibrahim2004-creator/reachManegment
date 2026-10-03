import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Prisma, UnitOfMeasure } from '@prisma/client';

@Injectable()
export class ProductModelsService {
  constructor(private prisma: PrismaService) {}

  async findAll(params: {
    categoryId?: number;
    search?: string;
    includeInactive?: boolean;
    page?: number;
    limit?: number;
  }) {
    const { categoryId, search, includeInactive = false, page = 1, limit = 25 } = params;
    const skip = (page - 1) * limit;

    const where: Prisma.ProductModelWhereInput = {
      ...(includeInactive ? {} : { isActive: true, deletedAt: null }),
      ...(categoryId && { categoryId }),
      ...(search && {
        name: { contains: search, mode: 'insensitive' },
      }),
    };

    const [data, total] = await Promise.all([
      this.prisma.productModel.findMany({
        where,
        include: {
          category: { select: { id: true, name: true } },
          _count: {
            select: {
              units: {
                where: { status: 'AVAILABLE' },
              },
            },
          },
        },
        skip,
        take: limit,
        orderBy: { name: 'asc' },
      }),
      this.prisma.productModel.count({ where }),
    ]);

    return {
      data,
      meta: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async findOne(id: number) {
    const model = await this.prisma.productModel.findUnique({
      where: { id },
      include: {
        category: { select: { id: true, name: true } },
        _count: {
          select: {
            units: true,
          },
        },
      },
    });

    if (!model || model.deletedAt) {
      throw new NotFoundException({ code: 'PRODUCT_MODEL_NOT_FOUND', message: 'Product model not found' });
    }

    return model;
  }

  async create(data: {
    categoryId: number;
    name: string;
    minStockAlert?: number;
    isSerialized?: boolean;
    unit?: UnitOfMeasure;
  }) {
    // Verify category exists and is active
    const category = await this.prisma.category.findFirst({
      where: { id: data.categoryId, isActive: true, deletedAt: null },
    });

    if (!category) {
      throw new NotFoundException({ code: 'CATEGORY_NOT_FOUND', message: 'Category not found or inactive' });
    }

    // Check for duplicate name within category
    const existing = await this.prisma.productModel.findFirst({
      where: { categoryId: data.categoryId, name: data.name },
    });

    if (existing) {
      throw new ConflictException({ code: 'MODEL_DUPLICATE', message: 'A model with this name already exists in this category' });
    }

    const unit = data.unit ?? UnitOfMeasure.PIECE;
    const isSerialized = unit === UnitOfMeasure.METER ? false : (data.isSerialized ?? true);

    return this.prisma.productModel.create({
      data: {
        categoryId: data.categoryId,
        name: data.name,
        minStockAlert: data.minStockAlert ?? 0,
        isSerialized,
        unit,
      },
      include: {
        category: { select: { id: true, name: true } },
      },
    });
  }

  async update(
    id: number,
    data: {
      name?: string;
      minStockAlert?: number;
      categoryId?: number;
      isSerialized?: boolean;
      unit?: UnitOfMeasure;
    },
  ) {
    const existing = await this.findOne(id);

    if (data.categoryId) {
      const category = await this.prisma.category.findFirst({
        where: { id: data.categoryId, isActive: true, deletedAt: null },
      });
      if (!category) {
        throw new NotFoundException({ code: 'CATEGORY_NOT_FOUND', message: 'Category not found or inactive' });
      }
    }

    const unit = data.unit ?? existing.unit;
    const isSerialized = unit === UnitOfMeasure.METER ? false : data.isSerialized ?? existing.isSerialized;

    if (existing.isSerialized && !isSerialized) {
      const unitCount = await this.prisma.productUnit.count({ where: { productModelId: id } });
      if (unitCount > 0) {
        throw new ConflictException({
          code: 'MODEL_HAS_UNITS',
          message: 'This product already has barcode units, so it cannot be switched to quantity-based stock.',
        });
      }
    }

    return this.prisma.productModel.update({
      where: { id },
      data: {
        ...data,
        unit,
        isSerialized,
      },
      include: {
        category: { select: { id: true, name: true } },
      },
    });
  }

  async deactivate(id: number) {
    await this.findOne(id);

    return this.prisma.productModel.update({
      where: { id },
      data: {
        isActive: false,
        deletedAt: new Date(),
      },
      select: { id: true, name: true, isActive: true },
    });
  }
}
