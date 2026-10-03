import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ProductUnitStatus, Prisma } from '@prisma/client';

@Injectable()
export class ProductUnitsService {
  constructor(private prisma: PrismaService) {}

  /**
   * Normalize barcode: trim whitespace, remove scanner suffixes
   */
  normalizeBarcode(barcode: string): string {
    return barcode
      .trim()
      .replace(/[\r\n\t]/g, '')
      .replace(/\s+/g, '');
  }

  /**
   * Lookup a single unit by barcode (for scanning workflows)
   */
  async findById(id: number) {
    const unit = await this.prisma.productUnit.findUnique({
      where: { id },
      include: {
        productModel: {
          select: {
            id: true,
            name: true,
            isSerialized: true,
            category: { select: { id: true, name: true } },
          },
        },
      },
    });

    if (!unit) {
      throw new NotFoundException({ code: 'UNIT_NOT_FOUND', message: `No unit found with id ${id}` });
    }

    return unit;
  }

  async findByBarcode(barcode: string) {
    const normalized = this.normalizeBarcode(barcode);

    const unit = await this.prisma.productUnit.findUnique({
      where: { barcode: normalized },
      include: {
        productModel: {
          select: {
            id: true,
            name: true,
            isSerialized: true,
            category: { select: { id: true, name: true } },
          },
        },
        stockReceiptItem: {
          select: {
            id: true,
            stockReceipt: { select: { id: true, date: true } },
          },
        },
        unitAssignments: {
          select: {
            id: true,
            invoiceItem: {
              select: {
                id: true,
                price: true,
                costAtSale: true,
                invoice: {
                  select: {
                    id: true,
                    invoiceNumber: true,
                    date: true,
                    status: true,
                    customer: { select: { id: true, name: true } },
                  },
                },
              },
            },
          },
          where: { reversedAt: null },
          orderBy: { scannedAt: 'desc' },
          take: 1,
        },
      },
    });

    if (!unit) {
      throw new NotFoundException({ code: 'UNIT_NOT_FOUND', message: `No unit found with barcode ${normalized}` });
    }

    return unit;
  }

  /**
   * Get unit audit log / lifecycle history
   */
  async getAuditLog(barcode: string) {
    const normalized = this.normalizeBarcode(barcode);

    const unit = await this.prisma.productUnit.findUnique({
      where: { barcode: normalized },
      select: { id: true },
    });

    if (!unit) {
      throw new NotFoundException({ code: 'UNIT_NOT_FOUND', message: `No unit found with barcode ${normalized}` });
    }

    return this.prisma.productUnitAuditLog.findMany({
      where: { productUnitId: unit.id },
      include: {
        employee: { select: { id: true, name: true } },
        invoice: { select: { id: true, invoiceNumber: true } },
      },
      orderBy: { timestamp: 'asc' },
    });
  }

  /**
   * Inventory count by model (aggregated)
   */
  async getInventoryCount(params: {
    categoryId?: number;
    productModelId?: number;
    search?: string;
    page?: number;
    limit?: number;
  }) {
    const { categoryId, productModelId, search, page = 1, limit = 25 } = params;
    const skip = (page - 1) * limit;

    const where: Prisma.ProductModelWhereInput = {
      isActive: true,
      deletedAt: null,
      ...(categoryId && { categoryId }),
      ...(productModelId && { id: productModelId }),
      ...(search && {
        name: { contains: search, mode: 'insensitive' },
      }),
    };

    const models = await this.prisma.productModel.findMany({
      where,
      include: {
        category: { select: { id: true, name: true } },
        units: {
          select: { status: true },
        },
      },
      skip,
      take: limit,
      orderBy: { name: 'asc' },
    });

    const total = await this.prisma.productModel.count({ where });

    const data = models.map((model) => {
      const available = model.units.filter((u) => u.status === 'AVAILABLE').length;
      const reserved = model.units.filter((u) => u.status === 'RESERVED').length;
      const sold = model.units.filter((u) => u.status === 'SOLD').length;
      const damaged = model.units.filter((u) => u.status === 'DAMAGED').length;

      return {
        id: model.id,
        name: model.name,
        category: model.category,
        minStockAlert: model.minStockAlert,
        available,
        reserved,
        sold,
        damaged,
        totalUnits: model.units.length,
      };
    });

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

  /**
   * Mark unit as damaged (INVENTORY role only, no approval needed)
   * AVAILABLE → DAMAGED
   */
  async markDamaged(unitId: number, employeeId: number) {
    const unit = await this.prisma.productUnit.findUnique({
      where: { id: unitId },
      include: {
        productModel: { select: { id: true, name: true } },
      },
    });

    if (!unit) {
      throw new NotFoundException({ code: 'UNIT_NOT_FOUND', message: 'Unit not found' });
    }

    if (unit.status !== ProductUnitStatus.AVAILABLE) {
      throw new BadRequestException({
        code: 'INVALID_STATUS_TRANSITION',
        message: `Cannot mark as damaged: unit is currently ${unit.status}`,
      });
    }

    // Atomic update with version check
    const result = await this.prisma.productUnit.updateMany({
      where: {
        id: unitId,
        status: ProductUnitStatus.AVAILABLE,
        version: unit.version,
      },
      data: {
        status: ProductUnitStatus.DAMAGED,
        version: { increment: 1 },
      },
    });

    if (result.count === 0) {
      throw new BadRequestException({
        code: 'CONFLICT',
        message: 'Unit status changed by another operation. Please try again.',
      });
    }

    // Write audit log
    await this.prisma.productUnitAuditLog.create({
      data: {
        productUnitId: unitId,
        action: 'MARKED_DAMAGED',
        employeeId,
        notes: `Marked as damaged by inventory employee`,
        metadata: {
          modelName: unit.productModel.name,
          barcode: unit.barcode,
          from: 'AVAILABLE',
          to: 'DAMAGED',
        },
      },
    });

    return this.prisma.productUnit.findUnique({
      where: { id: unitId },
      include: {
        productModel: { select: { id: true, name: true } },
      },
    });
  }

  /**
   * Restore unit from damaged to available (INVENTORY role only)
   * DAMAGED → AVAILABLE
   */
  async restoreAvailable(unitId: number, employeeId: number) {
    const unit = await this.prisma.productUnit.findUnique({
      where: { id: unitId },
      include: {
        productModel: { select: { id: true, name: true } },
      },
    });

    if (!unit) {
      throw new NotFoundException({ code: 'UNIT_NOT_FOUND', message: 'Unit not found' });
    }

    if (unit.status !== ProductUnitStatus.DAMAGED) {
      throw new BadRequestException({
        code: 'INVALID_STATUS_TRANSITION',
        message: `Cannot restore: unit is currently ${unit.status}`,
      });
    }

    // Atomic update with version check
    const result = await this.prisma.productUnit.updateMany({
      where: {
        id: unitId,
        status: ProductUnitStatus.DAMAGED,
        version: unit.version,
      },
      data: {
        status: ProductUnitStatus.AVAILABLE,
        version: { increment: 1 },
      },
    });

    if (result.count === 0) {
      throw new BadRequestException({
        code: 'CONFLICT',
        message: 'Unit status changed by another operation. Please try again.',
      });
    }

    // Write audit log
    await this.prisma.productUnitAuditLog.create({
      data: {
        productUnitId: unitId,
        action: 'RESTORED_AVAILABLE',
        employeeId,
        notes: `Restored from damaged to available by inventory employee`,
        metadata: {
          modelName: unit.productModel.name,
          barcode: unit.barcode,
          from: 'DAMAGED',
          to: 'AVAILABLE',
        },
      },
    });

    return this.prisma.productUnit.findUnique({
      where: { id: unitId },
      include: {
        productModel: { select: { id: true, name: true } },
      },
    });
  }
}