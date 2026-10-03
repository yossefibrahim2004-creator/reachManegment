import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Prisma } from '@prisma/client';

@Injectable()
export class SuppliersService {
  constructor(private prisma: PrismaService) {}

  async create(data: { name: string; phone?: string; address?: string }) {
    const existing = await this.prisma.supplier.findFirst({
      where: { name: data.name, deletedAt: null },
    });

    if (existing) {
      throw new ConflictException({ code: 'SUPPLIER_DUPLICATE', message: 'A supplier with this name already exists' });
    }

    return this.prisma.supplier.create({
      data: {
        name: data.name,
        phone: data.phone,
        address: data.address,
      },
    });
  }

  async quickAdd(data: { name: string; phone?: string; address?: string }) {
    return this.create(data);
  }

  async findAll(params: { search?: string; includeInactive?: boolean; page?: number; limit?: number }) {
    const { search, includeInactive = false, page = 1, limit = 25 } = params;
    const skip = (page - 1) * limit;

    const where: Prisma.SupplierWhereInput = {
      ...(includeInactive ? {} : { isActive: true, deletedAt: null }),
      ...(search && {
        name: { contains: search, mode: 'insensitive' },
      }),
    };

    const [data, total] = await Promise.all([
      this.prisma.supplier.findMany({
        where,
        include: {
          _count: {
            select: { stockReceipts: true, stockLots: true },
          },
        },
        skip,
        take: limit,
        orderBy: { name: 'asc' },
      }),
      this.prisma.supplier.count({ where }),
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
    const supplier = await this.prisma.supplier.findUnique({
      where: { id },
      include: {
        _count: {
          select: { stockReceipts: true, stockLots: true },
        },
      },
    });

    if (!supplier || supplier.deletedAt) {
      throw new NotFoundException({ code: 'SUPPLIER_NOT_FOUND', message: 'Supplier not found' });
    }

    return supplier;
  }

  async update(id: number, data: { name?: string; phone?: string; address?: string; isActive?: boolean }) {
    await this.findOne(id);

    if (data.name) {
      const existing = await this.prisma.supplier.findFirst({
        where: { name: data.name, id: { not: id }, deletedAt: null },
      });
      if (existing) {
        throw new ConflictException({ code: 'SUPPLIER_DUPLICATE', message: 'A supplier with this name already exists' });
      }
    }

    return this.prisma.supplier.update({
      where: { id },
      data,
    });
  }

  async softDelete(id: number) {
    await this.findOne(id);

    return this.prisma.supplier.update({
      where: { id },
      data: {
        isActive: false,
        deletedAt: new Date(),
      },
      select: { id: true, name: true, isActive: true },
    });
  }
}
