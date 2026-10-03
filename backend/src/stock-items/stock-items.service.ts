import { Injectable, NotFoundException, BadRequestException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AdjustmentReviewStatus, Prisma, StockAdjustmentType } from '@prisma/client';
import { normalizeQuantity, roundQuantity } from '../common/quantity.util';

@Injectable()
export class StockItemsService {
  constructor(private prisma: PrismaService) {}

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

    const [models, total] = await Promise.all([
      this.prisma.productModel.findMany({
        where,
        include: {
          category: { select: { id: true, name: true } },
          units: {
            select: { status: true },
          },
          stockLots: {
            where: { quantityRemaining: { gt: 0 } },
            select: {
              id: true,
              quantityReceived: true,
              quantityRemaining: true,
              quantityReserved: true,
              purchasePrice: true,
              receivedDate: true,
              supplier: { select: { id: true, name: true } },
            },
            orderBy: { receivedDate: 'asc' },
          },
        },
        skip,
        take: limit,
        orderBy: { name: 'asc' },
      }),
      this.prisma.productModel.count({ where }),
    ]);

    const modelIds = models.map((m) => m.id);

    // Aggregate approved "reduction" adjustments per model and type, so the
    // inventory list can show how much stock left due to damage/loss/etc.
    const reductionTotals = modelIds.length
      ? await this.prisma.stockAdjustment.groupBy({
          by: ['productModelId', 'type'],
          where: {
            productModelId: { in: modelIds },
            status: AdjustmentReviewStatus.APPROVED,
            quantity: { lt: 0 },
          },
          _sum: { quantity: true },
        })
      : [];

    // Aggregate approved "addition" adjustments (e.g. FOUND) per model.
    const additionTotals = modelIds.length
      ? await this.prisma.stockAdjustment.groupBy({
          by: ['productModelId', 'type'],
          where: {
            productModelId: { in: modelIds },
            status: AdjustmentReviewStatus.APPROVED,
            quantity: { gt: 0 },
          },
          _sum: { quantity: true },
        })
      : [];

    const reductionsByModel = new Map<number, Record<string, number>>();
    for (const row of reductionTotals) {
      const bucket = reductionsByModel.get(row.productModelId) ?? {};
      bucket[row.type] = (bucket[row.type] ?? 0) + Math.abs(row._sum.quantity ?? 0);
      reductionsByModel.set(row.productModelId, bucket);
    }

    const additionsByModel = new Map<number, Record<string, number>>();
    for (const row of additionTotals) {
      const bucket = additionsByModel.get(row.productModelId) ?? {};
      bucket[row.type] = (bucket[row.type] ?? 0) + (row._sum.quantity ?? 0);
      additionsByModel.set(row.productModelId, bucket);
    }

    const sumValues = (obj: Record<string, number>) =>
      Object.values(obj).reduce((s, n) => s + n, 0);

    const data = models.map((model) => {
      if (model.isSerialized) {
        const available = model.units.filter((u) => u.status === 'AVAILABLE').length;
        const reserved = model.units.filter((u) => u.status === 'RESERVED').length;
        const sold = model.units.filter((u) => u.status === 'SOLD').length;
        const damaged = model.units.filter((u) => u.status === 'DAMAGED').length;

        return {
          id: model.id,
          name: model.name,
          category: model.category,
          isSerialized: true,
          unit: model.unit,
          minStockAlert: model.minStockAlert,
          available,
          reserved,
          sold,
          damaged,
          lost: 0,
          totalReduced: damaged,
          reductionsByType: {} as Record<string, number>,
          additionsByType: {} as Record<string, number>,
          totalUnits: model.units.length,
          lots: undefined,
        };
      }

      const quantityRemaining = roundQuantity(model.stockLots.reduce((sum, lot) => sum + lot.quantityRemaining, 0));
      const quantityReserved = roundQuantity(model.stockLots.reduce((sum, lot) => sum + lot.quantityReserved, 0));
      const quantityReceived = roundQuantity(model.stockLots.reduce((sum, lot) => sum + lot.quantityReceived, 0));

      // Breakdown of approved reductions by type, e.g. { DAMAGE: 5, LOSS: 2,
      // COUNT_CORRECTION: 1 }.
      const reductionsByType = reductionsByModel.get(model.id) ?? {};
      const additionsByType = additionsByModel.get(model.id) ?? {};

      // Flat fields so the table can read the same names for serialized and
      // non-serialized rows.
      const damaged = reductionsByType['DAMAGE'] ?? 0;
      const lost = reductionsByType['LOSS'] ?? 0;
      // Every approved reduction regardless of type (so a decrease done via
      // COUNT_CORRECTION / OTHER is still visible somewhere).
      const totalReduced = sumValues(reductionsByType);

      return {
        id: model.id,
        name: model.name,
        category: model.category,
        isSerialized: false,
        unit: model.unit,
        minStockAlert: model.minStockAlert,
        quantityRemaining,
        quantityReserved,
        quantityAvailable: roundQuantity(quantityRemaining - quantityReserved),
        quantityReceived,
        damaged: damaged + lost, // kept for backward compatibility with the current table
        damagedOnly: damaged,
        lost,
        totalReduced,
        reductionsByType,
        additionsByType,
        lots: model.stockLots,
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

  async findAllAdjustments(params: {
    page?: number;
    limit?: number;
    productModelId?: number;
    status?: AdjustmentReviewStatus;
  }) {
    const { page = 1, limit = 20, productModelId, status } = params;
    const skip = (page - 1) * limit;

    const where: Prisma.StockAdjustmentWhereInput = {
      ...(productModelId && { productModelId }),
      ...(status && { status }),
    };

    const [data, total] = await Promise.all([
      this.prisma.stockAdjustment.findMany({
        where,
        include: {
          productModel: { select: { id: true, name: true } },
          employee: { select: { id: true, name: true } },
          reviewedBy: { select: { id: true, name: true } },
        },
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.stockAdjustment.count({ where }),
    ]);

    return {
      data,
      meta: { page, limit, total, totalPages: Math.ceil(total / limit) },
    };
  }

  // Adjustment types whose entire purpose is to REDUCE stock. The client
  // sends the *magnitude* only (a positive number) — the sign is never
  // trusted from the client. Names must match `enum StockAdjustmentType`.
  private static readonly REDUCTION_TYPES: StockAdjustmentType[] = ['DAMAGE', 'LOSS'];

  // Adjustment types whose entire purpose is to INCREASE stock.
  private static readonly ADDITION_TYPES: StockAdjustmentType[] = ['FOUND'];

  // COUNT_CORRECTION, RECEIVING_CORRECTION, OTHER can go either direction,
  // so the caller must pass an explicit `direction`.
  private resolveSignedQuantity(
    type: StockAdjustmentType,
    magnitude: number,
    direction?: 'INCREASE' | 'DECREASE',
  ): number {
    if (magnitude <= 0) {
      throw new BadRequestException({
        code: 'INVALID_QUANTITY',
        message: 'Quantity must be a positive number representing the amount being adjusted',
      });
    }

    if (StockItemsService.REDUCTION_TYPES.includes(type)) {
      return -magnitude;
    }

    if (StockItemsService.ADDITION_TYPES.includes(type)) {
      return magnitude;
    }

    if (direction === 'DECREASE') return -magnitude;
    if (direction === 'INCREASE') return magnitude;

    throw new BadRequestException({
      code: 'DIRECTION_REQUIRED',
      message: `Adjustment type "${type}" requires an explicit direction ("INCREASE" or "DECREASE")`,
    });
  }

  // Picks which StockLot an adjustment should be anchored to when the
  // caller doesn't supply one explicitly.
  //
  // LIMITATION: for reductions this only looks for a SINGLE lot that alone
  // covers the full amount (FIFO). If the total is enough but no single lot
  // is, this throws.
  private async resolveStockLot(
    productModelId: number,
    signedQuantity: number,
  ) {
    if (signedQuantity < 0) {
      const lot = await this.prisma.stockLot.findFirst({
        where: { productModelId, quantityRemaining: { gte: Math.abs(signedQuantity) } },
        orderBy: { receivedDate: 'asc' },
      });

      if (!lot) {
        throw new BadRequestException({
          code: 'NO_SINGLE_LOT_SUFFICIENT',
          message: 'No single stock lot holds enough remaining quantity for this reduction. Specify stockLotId manually, or split the adjustment across lots.',
        });
      }

      return lot;
    }

    const lot = await this.prisma.stockLot.findFirst({
      where: { productModelId },
      orderBy: { receivedDate: 'asc' },
    });

    if (!lot) {
      throw new NotFoundException({
        code: 'NO_STOCK_LOT_FOR_MODEL',
        message: 'This product model has no stock lots yet, so there is nothing to credit the addition to. Receive an initial shipment first, or specify stockLotId manually.',
      });
    }

    return lot;
  }

  async createAdjustment(employeeId: number, data: {
    productModelId: number;
    stockLotId?: number;
    type: StockAdjustmentType;
    quantity: number; // positive magnitude only
    direction?: 'INCREASE' | 'DECREASE'; // required only for ambiguous types
    reason: string;
  }) {
    const model = await this.prisma.productModel.findFirst({
      where: { id: data.productModelId, isActive: true, deletedAt: null },
    });

    if (!model) {
      throw new NotFoundException({ code: 'PRODUCT_MODEL_NOT_FOUND', message: 'Product model not found' });
    }

    if (model.isSerialized) {
      throw new BadRequestException({
        code: 'SERIALIZED_MODEL',
        message: 'Stock adjustments for serialized models must use the unit-level damage/restore endpoints',
      });
    }

    const signedQuantity = this.resolveSignedQuantity(data.type, normalizeQuantity(data.quantity, model.unit), data.direction);

    let lot;
    if (data.stockLotId) {
      lot = await this.prisma.stockLot.findUnique({
        where: { id: data.stockLotId },
      });

      if (!lot || lot.productModelId !== data.productModelId) {
        throw new NotFoundException({ code: 'STOCK_LOT_NOT_FOUND', message: 'Stock lot not found for this model' });
      }
    } else {
      lot = await this.resolveStockLot(data.productModelId, signedQuantity);
    }

    // Request-time convenience check only; the race-safe enforcement happens
    // atomically inside approveAdjustment.
    if (roundQuantity(lot.quantityRemaining + signedQuantity) < 0) {
      throw new BadRequestException({
        code: 'INSUFFICIENT_STOCK',
        message: `Cannot reduce below zero. Current remaining: ${lot.quantityRemaining}, requested adjustment: ${signedQuantity}`,
      });
    }

    return this.prisma.stockAdjustment.create({
      data: {
        productModelId: data.productModelId,
        stockLotId: lot.id,
        employeeId,
        type: data.type,
        quantity: signedQuantity,
        reason: data.reason,
        status: AdjustmentReviewStatus.PENDING,
      },
    });
  }

  private async getPendingAdjustment(adjustmentId: number) {
    const adjustment = await this.prisma.stockAdjustment.findUnique({
      where: { id: adjustmentId },
    });

    if (!adjustment) {
      throw new NotFoundException({ code: 'ADJUSTMENT_NOT_FOUND', message: 'Stock adjustment not found' });
    }

    if (adjustment.status !== AdjustmentReviewStatus.PENDING) {
      throw new ConflictException({
        code: 'ADJUSTMENT_ALREADY_REVIEWED',
        message: 'Stock adjustment has already been reviewed',
      });
    }

    return adjustment;
  }

  async approveAdjustment(adjustmentId: number, adminId: number) {
    const adjustment = await this.getPendingAdjustment(adjustmentId);

    const stockLotId = adjustment.stockLotId;
    if (!stockLotId) {
      throw new BadRequestException({
        code: 'STOCK_LOT_MISSING',
        message: 'This adjustment has no linked stock lot and cannot be applied to inventory. It must be corrected before it can be approved.',
      });
    }

    return this.prisma.$transaction(async (tx) => {
      const claimed = await tx.stockAdjustment.updateMany({
        where: { id: adjustmentId, status: AdjustmentReviewStatus.PENDING },
        data: {
          status: AdjustmentReviewStatus.APPROVED,
          reviewedByEmployeeId: adminId,
          reviewedAt: new Date(),
        },
      });

      if (claimed.count !== 1) {
        throw new ConflictException({
          code: 'ADJUSTMENT_ALREADY_REVIEWED',
          message: 'Stock adjustment has already been reviewed',
        });
      }

      const lotBefore = await tx.stockLot.findUnique({ where: { id: stockLotId } });
      if (!lotBefore) {
        throw new NotFoundException({ code: 'STOCK_LOT_NOT_FOUND', message: 'Stock lot not found' });
      }

      // Guard against dropping quantityRemaining below quantityReserved.
      const result = await tx.stockLot.updateMany({
        where: {
          id: stockLotId,
          // remaining + quantity >= reserved  <=>  remaining >= reserved - quantity
          quantityRemaining: { gte: roundQuantity(lotBefore.quantityReserved - adjustment.quantity) },
        },
        data: {
          quantityRemaining: { increment: adjustment.quantity },
        },
      });

      if (result.count !== 1) {
        throw new BadRequestException({
          code: 'INSUFFICIENT_STOCK',
          message: `Cannot apply adjustment: would drop remaining stock below zero or below already-reserved quantity (reserved: ${lotBefore.quantityReserved}).`,
        });
      }

      return tx.stockAdjustment.findUnique({ where: { id: adjustmentId } });
    });
  }

  async rejectAdjustment(adjustmentId: number, adminId: number, reason: string) {
    const adjustment = await this.getPendingAdjustment(adjustmentId);

    const updated = await this.prisma.stockAdjustment.updateMany({
      where: { id: adjustment.id, status: AdjustmentReviewStatus.PENDING },
      data: {
        status: AdjustmentReviewStatus.REJECTED,
        reviewedByEmployeeId: adminId,
        reviewedAt: new Date(),
        reviewNote: reason,
      },
    });
    if (updated.count !== 1) {
      throw new ConflictException({
        code: 'ADJUSTMENT_ALREADY_REVIEWED',
        message: 'Stock adjustment has already been reviewed',
      });
    }
    return this.prisma.stockAdjustment.findUnique({ where: { id: adjustment.id } });
  }
}