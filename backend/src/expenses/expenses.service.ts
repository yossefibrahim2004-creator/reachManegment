import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Prisma } from '@prisma/client';

@Injectable()
export class ExpensesService {
  constructor(private prisma: PrismaService) {}

  // --- Expense Categories ---

  async createCategory(data: { name: string }) {
    return this.prisma.expenseCategory.create({
      data: { name: data.name },
    });
  }

  async findAllCategories() {
    return this.prisma.expenseCategory.findMany({
      where: { deletedAt: null, isActive: true },
      orderBy: { name: 'asc' },
    });
  }

  async updateCategory(id: number, data: { name: string }) {
    const category = await this.prisma.expenseCategory.findUnique({ where: { id } });
    if (!category || category.deletedAt) {
      throw new NotFoundException({ code: 'CATEGORY_NOT_FOUND', message: 'Category not found' });
    }
    return this.prisma.expenseCategory.update({
      where: { id },
      data: { name: data.name },
    });
  }

  async deleteCategory(id: number) {
    const category = await this.prisma.expenseCategory.findUnique({ where: { id } });
    if (!category || category.deletedAt) {
      throw new NotFoundException({ code: 'CATEGORY_NOT_FOUND', message: 'Category not found' });
    }

    // Check if category has active expenses
    const expenseCount = await this.prisma.expense.count({
      where: { categoryId: id },
    });

    if (expenseCount > 0) {
      // Soft delete
      await this.prisma.expenseCategory.update({
        where: { id },
        data: { deletedAt: new Date(), isActive: false },
      });
    } else {
      // Hard delete if no expenses
      await this.prisma.expenseCategory.delete({ where: { id } });
    }

    return { deleted: true };
  }

  // --- Expenses ---

  async create(data: {
    categoryId: number;
    amount: number;
    date?: string;
    description: string;
  }, employeeId: number) {
    const category = await this.prisma.expenseCategory.findUnique({
      where: { id: data.categoryId },
    });
    if (!category || !category.isActive || category.deletedAt) {
      throw new NotFoundException({ code: 'CATEGORY_NOT_FOUND', message: 'Category not found' });
    }

    return this.prisma.expense.create({
      data: {
        categoryId: data.categoryId,
        employeeId,
        amount: data.amount,
        date: data.date ? new Date(data.date) : new Date(),
        description: data.description,
      },
      include: { category: { select: { id: true, name: true } } },
    });
  }

  async findAll(params: {
    categoryId?: number;
    startDate?: string;
    endDate?: string;
    page?: number;
    limit?: number;
  }) {
    const { categoryId, startDate, endDate, page = 1, limit = 25 } = params;
    const skip = (page - 1) * limit;

    const where: Prisma.ExpenseWhereInput = { deletedAt: null };
    if (categoryId) where.categoryId = categoryId;
    if (startDate || endDate) {
      where.date = {};
      if (startDate) (where.date as any).gte = new Date(startDate);
      if (endDate) (where.date as any).lte = new Date(endDate);
    }

    const [data, total] = await Promise.all([
      this.prisma.expense.findMany({
        where,
        include: {
          category: { select: { id: true, name: true } },
          employee: { select: { id: true, name: true } },
        },
        skip,
        take: limit,
        orderBy: { date: 'desc' },
      }),
      this.prisma.expense.count({ where }),
    ]);

    return {
      data,
      meta: { page, limit, total, totalPages: Math.ceil(total / limit) },
    };
  }

  async findOne(id: number) {
    const expense = await this.prisma.expense.findFirst({
      where: { id, deletedAt: null },
      include: {
        category: { select: { id: true, name: true } },
        employee: { select: { id: true, name: true } },
      },
    });
    if (!expense) {
      throw new NotFoundException({ code: 'EXPENSE_NOT_FOUND', message: 'Expense not found' });
    }
    return expense;
  }

  async update(id: number, data: {
    categoryId?: number;
    amount?: number;
    date?: string;
    description?: string;
  }) {
    const expense = await this.prisma.expense.findFirst({ where: { id, deletedAt: null } });
    if (!expense) {
      throw new NotFoundException({ code: 'EXPENSE_NOT_FOUND', message: 'Expense not found' });
    }

    if (data.categoryId) {
      const category = await this.prisma.expenseCategory.findUnique({
        where: { id: data.categoryId },
      });
      if (!category || !category.isActive || category.deletedAt) {
        throw new NotFoundException({ code: 'CATEGORY_NOT_FOUND', message: 'Category not found' });
      }
    }

    return this.prisma.expense.update({
      where: { id },
      data: {
        ...(data.categoryId && { categoryId: data.categoryId }),
        ...(data.amount !== undefined && { amount: data.amount }),
        ...(data.date && { date: new Date(data.date) }),
        ...(data.description !== undefined && { description: data.description }),
      },
      include: { category: { select: { id: true, name: true } } },
    });
  }

  async remove(id: number) {
    const expense = await this.prisma.expense.findUnique({ where: { id } });
    if (!expense || expense.deletedAt) {
      throw new NotFoundException({ code: 'EXPENSE_NOT_FOUND', message: 'Expense not found' });
    }
    await this.prisma.expense.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
    return { deleted: true };
  }
}
