import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Prisma } from '@prisma/client';

@Injectable()
export class CategoriesService {
  constructor(private prisma: PrismaService) {}

  async findAll(includeInactive = false) {
    return this.prisma.category.findMany({
      where: includeInactive ? {} : { isActive: true, deletedAt: null },
      include: {
        _count: {
          select: { productModels: true },
        },
      },
      orderBy: { name: 'asc' },
    });
  }

  async findOne(id: number) {
    const category = await this.prisma.category.findUnique({
      where: { id },
      include: {
        productModels: {
          where: { isActive: true, deletedAt: null },
          select: { id: true, name: true },
        },
      },
    });

    if (!category || category.deletedAt) {
      throw new NotFoundException({ code: 'CATEGORY_NOT_FOUND', message: 'Category not found' });
    }

    return category;
  }

  async create(data: { name: string }) {
    return this.prisma.category.create({
      data: { name: data.name },
      select: { id: true, name: true, isActive: true, createdAt: true },
    });
  }

  async update(id: number, data: { name?: string }) {
    await this.findOne(id);

    return this.prisma.category.update({
      where: { id },
      data,
      select: { id: true, name: true, isActive: true, updatedAt: true },
    });
  }

  async deactivate(id: number) {
    await this.findOne(id);

    return this.prisma.category.update({
      where: { id },
      data: {
        isActive: false,
        deletedAt: new Date(),
      },
      select: { id: true, name: true, isActive: true },
    });
  }
}
