import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class ExpenseCategoriesService {
  constructor(private prisma: PrismaService) {}

  async findAll() {
    return this.prisma.expenseCategory.findMany({
      where: { isActive: true, deletedAt: null },
      orderBy: { name: 'asc' },
    });
  }

  async findOne(id: number) {
    const category = await this.prisma.expenseCategory.findUnique({ where: { id } });
    if (!category || category.deletedAt || !category.isActive) {
      throw new NotFoundException({ code: 'EXPENSE_CATEGORY_NOT_FOUND', message: 'Expense category not found' });
    }
    return category;
  }

  async create(data: { name: string }) {
    const trimmed = data.name.trim();
    const existing = await this.prisma.expenseCategory.findFirst({
      where: { name: trimmed, isActive: true, deletedAt: null },
    });

    if (existing) {
      throw new ConflictException({ code: 'EXPENSE_CATEGORY_DUPLICATE', message: 'Expense category already exists' });
    }

    return this.prisma.expenseCategory.create({
      data: { name: trimmed },
    });
  }

  async update(id: number, data: { name: string }) {
    await this.findOne(id);
    const trimmed = data.name.trim();

    if (!trimmed) {
      throw new ConflictException({ code: 'INVALID_NAME', message: 'Expense category name is required' });
    }

    return this.prisma.expenseCategory.update({
      where: { id },
      data: { name: trimmed },
    });
  }

  async deactivate(id: number) {
    await this.findOne(id);
    return this.prisma.expenseCategory.update({
      where: { id },
      data: { isActive: false, deletedAt: new Date() },
    });
  }
}
