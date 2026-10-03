import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class CustomersService {
  constructor(private prisma: PrismaService) {}

  async findAll(params?: { page?: number; limit?: number; search?: string }) {
    const page = Number(params?.page) > 0 ? Number(params?.page) : 1;
    const limit = Number(params?.limit) > 0 ? Number(params?.limit) : 20;
    const search = params?.search?.trim();

    const where: any = { deletedAt: null };
    if (search) {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { phone: { contains: search, mode: 'insensitive' } },
      ];
    }

    const [items, total] = await Promise.all([
      this.prisma.customer.findMany({
        where,
        orderBy: { name: 'asc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.customer.count({ where }),
    ]);

    return {
      data: items,
      meta: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit) || 1,
      },
    };
  }

  async findOne(id: number) {
    const customer = await this.prisma.customer.findUnique({ where: { id } });
    if (!customer || customer.deletedAt) {
      throw new NotFoundException({ code: 'CUSTOMER_NOT_FOUND', message: 'Customer not found' });
    }
    return customer;
  }

  async create(data: { name: string; type: any; phone?: string }) {
    return this.prisma.customer.create({ data });
  }

  async update(id: number, data: { name?: string; type?: any; phone?: string }) {
    await this.findOne(id);
    return this.prisma.customer.update({ where: { id }, data });
  }

  async deactivate(id: number) {
    await this.findOne(id);
    return this.prisma.customer.update({
      where: { id },
      data: { isActive: false, deletedAt: new Date() },
    });
  }
}
