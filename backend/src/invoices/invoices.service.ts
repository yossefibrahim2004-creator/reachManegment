import { Injectable, NotFoundException, BadRequestException, ConflictException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { RealtimeService } from '../realtime/realtime.service';
import { ProductUnitStatus, Prisma, InvoiceAuditAction, InvoiceStatus, Role } from '@prisma/client';
import { normalizeQuantity, roundQuantity } from '../common/quantity.util';

type InvoiceTransactionResult = {
  invoice: Prisma.InvoiceGetPayload<{}>;
  invoiceNumber: string;
  affectedModelIds: Set<number>;
  modelInfos: Array<{ modelId: number; name: string; minStockAlert: number; isSerialized: boolean }>;
};
type InvoiceRequester = { sub: number; role: string };

@Injectable()
export class InvoicesService {
  constructor(
    private prisma: PrismaService,
    private notificationsService: NotificationsService,
    private realtimeService?: RealtimeService,
  ) {}

  private buildInclusiveDateRange(from?: string, to?: string): { gte?: Date; lte?: Date } | undefined {
    if (!from && !to) {
      return undefined;
    }

    const dateFilter: { gte?: Date; lte?: Date } = {};

    if (from) {
      const startDate = new Date(`${from}T00:00:00`);
      if (Number.isNaN(startDate.getTime())) {
        throw new BadRequestException('Invalid from date format. Use YYYY-MM-DD');
      }
      dateFilter.gte = startDate;
    }

    if (to) {
      const endDate = new Date(`${to}T23:59:59.999`);
      if (Number.isNaN(endDate.getTime())) {
        throw new BadRequestException('Invalid to date format. Use YYYY-MM-DD');
      }
      dateFilter.lte = endDate;
    }

    return dateFilter;
  }

  calculateInvoiceTotals(
    items: { price: number; quantity: number }[],
    discountPercentage = 0,
    discountAmount = 0,
  ) {
    const subtotal = items.reduce((sum, item) => sum + item.price * item.quantity, 0);
    const safePercentage = Math.max(0, Math.min(discountPercentage || 0, 100));
    const safeFixedDiscount = Math.max(0, discountAmount || 0);
    const percentageDiscount = subtotal * (safePercentage / 100);
    const total = Math.max(0, subtotal - percentageDiscount - safeFixedDiscount);

    return {
      subtotal,
      percentageDiscount,
      fixedDiscount: Math.min(safeFixedDiscount, subtotal),
      total,
    };
  }

  private async claimIdempotencyKey(employeeId: number, rawKey: string): Promise<Prisma.JsonValue | null> {
    const key = rawKey.trim();
    if (!key || key.length > 128) {
      throw new BadRequestException({ code: 'INVALID_IDEMPOTENCY_KEY', message: 'Idempotency-Key must be 1-128 characters' });
    }

    const existing = await this.prisma.idempotencyKey.findUnique({ where: { key } });
    if (existing && existing.expiresAt > new Date()) {
      if (existing.employeeId !== employeeId || existing.operation !== 'CREATE_INVOICE') {
        throw new ConflictException({ code: 'IDEMPOTENCY_KEY_CONFLICT', message: 'Idempotency-Key is already used for another operation' });
      }
      if (existing.responseBody !== null) return existing.responseBody;
      throw new ConflictException({ code: 'IDEMPOTENCY_REQUEST_IN_PROGRESS', message: 'A request with this Idempotency-Key is still processing' });
    }

    if (existing) {
      await this.prisma.idempotencyKey.deleteMany({ where: { key, expiresAt: { lte: new Date() } } });
    }

    try {
      await this.prisma.idempotencyKey.create({
        data: {
          key,
          employeeId,
          operation: 'CREATE_INVOICE',
          expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
        },
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        const concurrent = await this.prisma.idempotencyKey.findUnique({ where: { key } });
        if (concurrent?.responseBody !== null && concurrent?.responseBody !== undefined) return concurrent.responseBody;
        throw new ConflictException({ code: 'IDEMPOTENCY_REQUEST_IN_PROGRESS', message: 'A request with this Idempotency-Key is still processing' });
      }
      throw error;
    }

    return null;
  }

  private async releaseIdempotencyKey(employeeId: number, rawKey: string): Promise<void> {
    await this.prisma.idempotencyKey.deleteMany({
      where: { key: rawKey.trim(), employeeId, operation: 'CREATE_INVOICE' },
    });
  }

  async createInvoice(employeeId: number, data: {
    customerId: number;
    paymentType?: string;
    discountPercentage?: number;
    discountAmount?: number;
    items: { productModelId: number; quantity: number; price: number }[];
  }, idempotencyKey?: string) {
    const customer = await this.prisma.customer.findFirst({
      where: { id: data.customerId, isActive: true, deletedAt: null },
    });
    if (!customer) {
      throw new NotFoundException({ code: 'CUSTOMER_NOT_FOUND', message: 'Customer not found or inactive' });
    }

    if (!data.items || data.items.length === 0) {
      throw new BadRequestException({ code: 'NO_ITEMS', message: 'Invoice must have at least one item' });
    }

    const serializedItems: { productModelId: number; quantity: number; price: number; model: any }[] = [];
    const nonSerializedItems: { productModelId: number; quantity: number; price: number; model: any }[] = [];

    for (let i = 0; i < data.items.length; i++) {
      const item = data.items[i];
      if (item.price < 0) {
        throw new BadRequestException({ code: 'INVALID_PRICE', message: `Price for item ${i + 1} must be non-negative` });
      }

      const model = await this.prisma.productModel.findFirst({
        where: { id: item.productModelId, isActive: true, deletedAt: null },
      });
      if (!model) {
        throw new NotFoundException({ code: 'PRODUCT_MODEL_NOT_FOUND', message: `Product model ${item.productModelId} not found` });
      }

      item.quantity = normalizeQuantity(item.quantity, model.unit);

      if (model.isSerialized) {
        const availableCount = await this.prisma.productUnit.count({
          where: { productModelId: item.productModelId, status: ProductUnitStatus.AVAILABLE },
        });
        const sellable = availableCount - model.reservedQuantity;
        if (sellable < item.quantity) {
          throw new BadRequestException({
            code: 'INSUFFICIENT_STOCK',
            message: `Insufficient stock for ${model.name}. Available: ${sellable}, requested: ${item.quantity}`,
          });
        }
        serializedItems.push({ productModelId: item.productModelId, quantity: item.quantity, price: item.price, model });
      } else {
        const lotAgg = await this.prisma.stockLot.aggregate({
          where: { productModelId: item.productModelId, quantityRemaining: { gt: 0 } },
          _sum: { quantityRemaining: true, quantityReserved: true },
        });
        const totalRemaining = Number(lotAgg._sum?.quantityRemaining) || 0;
        const totalReserved = Number(lotAgg._sum?.quantityReserved) || 0;
        const available = totalRemaining - totalReserved;

        if (available < item.quantity) {
          throw new BadRequestException({
            code: 'INSUFFICIENT_STOCK',
            message: `Insufficient stock for ${model.name}. Available: ${available}, requested: ${item.quantity}`,
          });
        }
        nonSerializedItems.push({ productModelId: item.productModelId, quantity: item.quantity, price: item.price, model });
      }
    }

    const { subtotal, percentageDiscount, fixedDiscount, total } = this.calculateInvoiceTotals(
      data.items,
      data.discountPercentage,
      data.discountAmount,
    );

    const normalizedIdempotencyKey = idempotencyKey?.trim();
    let idempotencyClaimed = false;
    if (normalizedIdempotencyKey) {
      const existingResponse = await this.claimIdempotencyKey(employeeId, normalizedIdempotencyKey);
      if (existingResponse !== null) return existingResponse;
      idempotencyClaimed = true;
    }

    // Execute the core transaction first — authoritative stock checks run INSIDE the tx (ISS-007)
    let transactionResult: InvoiceTransactionResult;
    try {
      transactionResult = await this.prisma.$transaction(async (tx) => {
      const sequence = await tx.invoiceSequence.upsert({
        where: { id: 1 },
        update: { currentNumber: { increment: 1 } },
        create: { id: 1, currentNumber: 1 },
      });

      const nextNumber = sequence.currentNumber;
      const invoiceNumber = `INV-${String(nextNumber).padStart(6, '0')}`;

      for (const si of serializedItems) {
        const availableCount = await tx.productUnit.count({
          where: { productModelId: si.productModelId, status: ProductUnitStatus.AVAILABLE },
        });
        const updated = await tx.productModel.updateMany({
          where: {
            id: si.productModelId,
            reservedQuantity: { lte: availableCount - si.quantity },
          },
          data: { reservedQuantity: { increment: si.quantity } },
        });
        if (updated.count === 0) {
          const current = await tx.productModel.findUnique({
            where: { id: si.productModelId },
            select: { reservedQuantity: true },
          });
          const sellable = Math.max(0, availableCount - (current?.reservedQuantity ?? 0));
          throw new ConflictException({
            code: 'INSUFFICIENT_STOCK',
            message: `Insufficient stock for ${si.model.name}. Available: ${sellable}, requested: ${si.quantity}`,
          });
        }
      }

      for (const nsi of nonSerializedItems) {
        const lots = await tx.stockLot.findMany({
          where: { productModelId: nsi.productModelId, quantityRemaining: { gt: 0 } },
          orderBy: { receivedDate: 'asc' },
        });

        let remainingToReserve = nsi.quantity;
        for (const lot of lots) {
          if (remainingToReserve <= 0) break;
          const availableInLot = lot.quantityRemaining - lot.quantityReserved;
          if (availableInLot <= 0) continue;
          const toReserve = Math.min(availableInLot, remainingToReserve);
          const updated = await tx.stockLot.updateMany({
            where: {
              id: lot.id,
              quantityReserved: { lte: lot.quantityRemaining - toReserve },
            },
            data: { quantityReserved: { increment: toReserve } },
          });
          if (updated.count === 1) {
            remainingToReserve = roundQuantity(remainingToReserve - toReserve);
          }
        }

        if (remainingToReserve > 0) {
          throw new ConflictException({
            code: 'INSUFFICIENT_STOCK',
            message: `Insufficient stock for ${nsi.model.name} during reservation`,
          });
        }
      }

      const invoice = await tx.invoice.create({
        data: {
          invoiceNumber,
          customerId: data.customerId,
          employeeId,
          status: InvoiceStatus.PENDING_ACCOUNTANT,
          originalTotal: subtotal,
          currentTotal: total,
          paymentType: data.paymentType,
          discountPercentage: data.discountPercentage ?? 0,
          discountAmount: data.discountAmount ?? 0,
        },
      });

      for (const si of serializedItems) {
        await tx.invoiceItem.create({
          data: {
            invoiceId: invoice.id,
            productModelId: si.productModelId,
            quantity: si.quantity,
            price: si.price,
          },
        });
      }

      for (const nsi of nonSerializedItems) {
        await tx.invoiceItem.create({
          data: {
            invoiceId: invoice.id,
            productModelId: nsi.productModelId,
            quantity: nsi.quantity,
            price: nsi.price,
          },
        });
      }

      const invoiceItemsSummary = [...serializedItems, ...nonSerializedItems].map((si) => ({
        model: si.model.name,
        quantity: si.quantity,
        price: si.price,
      }));

      await tx.invoiceAuditLog.create({
        data: {
          invoiceId: invoice.id,
          action: InvoiceAuditAction.STOCK_RESERVED,
          employeeId,
          details: {
            itemCount: data.items.length,
            subtotal,
            percentageDiscount,
            fixedDiscount,
            total,
            invoiceNumber,
            customerName: customer.name,
            items: invoiceItemsSummary,
          },
        },
      });

      await tx.invoiceAuditLog.create({
        data: {
          invoiceId: invoice.id,
          action: InvoiceAuditAction.SENT_FOR_ACCOUNTANT_REVIEW,
          employeeId,
          details: {
            invoiceNumber,
            customerName: customer.name,
            total,
            itemCount: data.items.length,
          },
        },
      });

      const affectedModelIds = new Set<number>();
      for (const si of serializedItems) affectedModelIds.add(si.productModelId);
      for (const nsi of nonSerializedItems) affectedModelIds.add(nsi.productModelId);

      // Collect model info for post-transaction notifications
      const modelInfos: Array<{ modelId: number; name: string; minStockAlert: number; isSerialized: boolean }> = [];
      for (const modelId of affectedModelIds) {
        const model = await tx.productModel.findUnique({
          where: { id: modelId },
          select: { name: true, minStockAlert: true, isSerialized: true },
        });
        if (!model) continue;
        modelInfos.push({ modelId, name: model.name, minStockAlert: model.minStockAlert, isSerialized: model.isSerialized });
      }

      return {
        invoice,
        invoiceNumber,
        affectedModelIds,
        modelInfos,
      };
      });
    } catch (error) {
      if (idempotencyClaimed && normalizedIdempotencyKey) {
        await this.releaseIdempotencyKey(employeeId, normalizedIdempotencyKey);
      }
      throw error;
    }

    // Post-transaction notifications (only fire after successful commit)
    const { invoice, invoiceNumber, affectedModelIds, modelInfos } = transactionResult;

    const response = {
      id: invoice.id,
      invoiceNumber: invoice.invoiceNumber,
      date: invoice.date,
      status: invoice.status,
      originalTotal: invoice.originalTotal,
      currentTotal: invoice.currentTotal,
      paymentType: invoice.paymentType,
      discountPercentage: invoice.discountPercentage,
      discountAmount: invoice.discountAmount,
      itemCount: data.items.length,
    };
    if (idempotencyClaimed && normalizedIdempotencyKey) {
      await this.prisma.idempotencyKey.update({
        where: { key: normalizedIdempotencyKey },
        data: { responseStatus: 201, responseBody: response },
      });
    }

    // Check and send low-stock notifications for affected models
    for (const modelInfo of modelInfos) {
      const { modelId, name, minStockAlert, isSerialized } = modelInfo;
      if (isSerialized) {
        const availableCount = await this.prisma.productUnit.count({
          where: { productModelId: modelId, status: ProductUnitStatus.AVAILABLE },
        });
        if (availableCount <= minStockAlert) {
          await this.notificationsService.createLowStockNotification(modelId, name, availableCount, minStockAlert);
        } else {
          await this.notificationsService.resolveLowStockNotification(modelId);
        }
      } else {
        const lotAgg = await this.prisma.stockLot.aggregate({
          where: { productModelId: modelId },
          _sum: { quantityRemaining: true, quantityReserved: true },
        });
        const quantityRemaining = Number(lotAgg._sum?.quantityRemaining) || 0;
        const quantityReserved = Number(lotAgg._sum?.quantityReserved) || 0;
        const available = quantityRemaining - quantityReserved;
        if (available <= minStockAlert) {
          await this.notificationsService.createLowStockNotification(modelId, name, available, minStockAlert);
        } else {
          await this.notificationsService.resolveLowStockNotification(modelId);
        }
      }
    }

    await this.notificationsService.notifyInvoicePendingReview(invoice.id, invoiceNumber, {
      customer: customer.name,
      total: Number(total),
      itemCount: data.items.length,
    });
    this.realtimeService?.publish({
      type: 'invoice.created',
      entity: 'Invoice',
      entityId: invoice.id,
      roles: [Role.ADMIN, Role.ACCOUNTANT],
      payload: { status: invoice.status },
    });

    return response;
  }

  async confirmInvoice(invoiceId: number, employeeId: number) {
    const invoice = await this.prisma.invoice.findUnique({
      where: { id: invoiceId },
      include: {
        customer: { select: { name: true } },
        items: {
          include: {
            productModel: { select: { id: true, name: true, isSerialized: true } },
          },
        },
      },
    });

    if (!invoice) {
      throw new NotFoundException({ code: 'INVOICE_NOT_FOUND', message: 'Invoice not found' });
    }

    if (invoice.status !== InvoiceStatus.PENDING_ACCOUNTANT) {
      throw new BadRequestException({ code: 'INVALID_STATUS', message: `Cannot confirm invoice in status ${invoice.status}` });
    }

    const result = await this.prisma.$transaction(async (tx) => {
      const claimed = await tx.invoice.updateMany({
        where: { id: invoiceId, status: InvoiceStatus.PENDING_ACCOUNTANT },
        data: {
          status: InvoiceStatus.CONFIRMED,
          confirmedByEmployeeId: employeeId,
          confirmedAt: new Date(),
        },
      });

      if (claimed.count !== 1) {
        throw new ConflictException({
          code: 'INVALID_STATUS',
          message: 'Invoice was already processed by another employee',
        });
      }

      for (const item of invoice.items) {
        if (item.productModelId && item.quantity && item.productModel && !item.productModel.isSerialized) {
          const lots = await tx.stockLot.findMany({
            where: { productModelId: item.productModelId, quantityReserved: { gt: 0 } },
            orderBy: { receivedDate: 'asc' },
          });

          let remainingToConsume = item.quantity;
          for (const lot of lots) {
            if (remainingToConsume <= 0) break;
            const toConsume = Math.min(lot.quantityReserved, remainingToConsume);

            await tx.stockLot.update({
              where: { id: lot.id },
              data: {
                quantityRemaining: { decrement: toConsume },
                quantityReserved: { decrement: toConsume },
              },
            });

            const unitCost = lot.purchasePrice;
            const totalCost = unitCost ? Number(unitCost) * toConsume : null;

            await tx.stockConsumption.create({
              data: {
                invoiceItemId: item.id,
                stockLotId: lot.id,
                quantity: toConsume,
                unitCost: unitCost,
                totalCost: totalCost,
              },
            });

            remainingToConsume = roundQuantity(remainingToConsume - toConsume);
          }

          if (remainingToConsume > 0) {
            throw new ConflictException({
              code: 'STOCK_CONFLICT',
              message: `Insufficient reserved stock for lot consumption`,
            });
          }

          const totalCostSum = await tx.stockConsumption.aggregate({
            where: { invoiceItemId: item.id },
            _sum: { totalCost: true },
          });

          await tx.invoiceItem.update({
            where: { id: item.id },
            data: {
              costAtSale: totalCostSum._sum?.totalCost ? Number(totalCostSum._sum.totalCost) / item.quantity : null,
              cogsStatus: totalCostSum._sum?.totalCost ? 'FINAL' : 'PENDING',
            },
          });
        }
      }

      await tx.invoiceAuditLog.create({
        data: {
          invoiceId,
          action: InvoiceAuditAction.CONFIRMED,
          employeeId,
          details: {
            invoiceNumber: invoice.invoiceNumber,
            customerName: invoice.customer?.name,
            total: Number(invoice.currentTotal),
            itemCount: invoice.items.length,
            items: invoice.items.map((item) => ({
              model: item.productModel?.name,
              quantity: item.quantity,
              price: item.price,
            })),
          },
        },
      });

      return { invoiceNumber: invoice.invoiceNumber, salesEmployeeId: invoice.employeeId };
    });

    const invoiceDetails = {
      customer: invoice.customer?.name,
      total: Number(invoice.currentTotal),
      itemCount: invoice.items.length,
    };
    await this.notificationsService.notifyInvoiceConfirmed(invoiceId, result.invoiceNumber, result.salesEmployeeId, invoiceDetails);
    this.realtimeService?.publish({
      type: 'invoice.confirmed',
      entity: 'Invoice',
      entityId: invoiceId,
      roles: [Role.ADMIN, Role.SALES, Role.INVENTORY],
      employeeIds: [result.salesEmployeeId],
      payload: { status: InvoiceStatus.CONFIRMED },
    });

    return { id: invoiceId, status: InvoiceStatus.CONFIRMED };
  }

  async rejectInvoice(invoiceId: number, employeeId: number, reason: string) {
    const invoice = await this.prisma.invoice.findUnique({
      where: { id: invoiceId },
      include: {
        customer: { select: { name: true } },
        items: {
          include: {
            productModel: { select: { id: true, isSerialized: true, name: true } },
          },
        },
      },
    });

    if (!invoice) {
      throw new NotFoundException({ code: 'INVOICE_NOT_FOUND', message: 'Invoice not found' });
    }

    if (invoice.status !== InvoiceStatus.PENDING_ACCOUNTANT) {
      throw new BadRequestException({ code: 'INVALID_STATUS', message: `Cannot reject invoice in status ${invoice.status}` });
    }

    const result = await this.prisma.$transaction(async (tx) => {
      const claimed = await tx.invoice.updateMany({
        where: { id: invoiceId, status: InvoiceStatus.PENDING_ACCOUNTANT },
        data: {
          status: InvoiceStatus.CANCELLED,
          rejectedByEmployeeId: employeeId,
          rejectedAt: new Date(),
          rejectionReason: reason,
        },
      });

      if (claimed.count !== 1) {
        throw new ConflictException({
          code: 'INVALID_STATUS',
          message: 'Invoice was already processed by another employee',
        });
      }

      for (const item of invoice.items) {
        if (item.productModel && item.productModel.isSerialized && item.productModelId && item.quantity) {
          await tx.productModel.update({
            where: { id: item.productModelId },
            data: { reservedQuantity: { decrement: item.quantity } },
          });
        }

        if (item.productModelId && item.quantity && item.productModel && !item.productModel.isSerialized) {
          const lots = await tx.stockLot.findMany({
            where: { productModelId: item.productModelId, quantityReserved: { gt: 0 } },
            orderBy: { receivedDate: 'asc' },
          });

          let remainingToRelease = item.quantity;
          for (const lot of lots) {
            if (remainingToRelease <= 0) break;
            const toRelease = Math.min(lot.quantityReserved, remainingToRelease);

            await tx.stockLot.update({
              where: { id: lot.id },
              data: { quantityReserved: { decrement: toRelease } },
            });

            remainingToRelease = roundQuantity(remainingToRelease - toRelease);
          }
        }
      }

      await tx.invoiceAuditLog.create({
        data: {
          invoiceId,
          action: InvoiceAuditAction.STOCK_RESERVATION_RELEASED,
          employeeId,
          details: {
            reason,
            invoiceNumber: invoice.invoiceNumber,
            customerName: invoice.customer?.name,
            total: Number(invoice.currentTotal),
            items: invoice.items.map((item) => ({
              model: item.productModel?.name,
              quantity: item.quantity,
            })),
          },
        },
      });

      await tx.invoiceAuditLog.create({
        data: {
          invoiceId,
          action: InvoiceAuditAction.REJECTED,
          employeeId,
          details: {
            reason,
            invoiceNumber: invoice.invoiceNumber,
            customerName: invoice.customer?.name,
            total: Number(invoice.currentTotal),
            itemCount: invoice.items.length,
          },
        },
      });

      const affectedModelIds = new Set<number>();
      for (const item of invoice.items) {
        if (item.productModelId) affectedModelIds.add(item.productModelId);
      }

      return { affectedModelIds };
    });

    await this.notificationsService.notifyInvoiceRejected(invoiceId, invoice.invoiceNumber, invoice.employeeId, reason, {
      customer: invoice.customer?.name,
      total: Number(invoice.currentTotal),
      itemCount: invoice.items.length,
    });

    for (const modelId of result.affectedModelIds) {
      const model = await this.prisma.productModel.findUnique({
        where: { id: modelId },
        select: { name: true, minStockAlert: true, isSerialized: true },
      });
      if (!model) continue;

      if (model.isSerialized) {
        const availableCount = await this.prisma.productUnit.count({
          where: { productModelId: modelId, status: ProductUnitStatus.AVAILABLE },
        });
        if (availableCount <= model.minStockAlert) {
          await this.notificationsService.createLowStockNotification(modelId, model.name, availableCount, model.minStockAlert);
        } else {
          await this.notificationsService.resolveLowStockNotification(modelId);
        }
      } else {
        const lots = await this.prisma.stockLot.findMany({
          where: { productModelId: modelId },
          select: { quantityRemaining: true, quantityReserved: true },
        });
        const availableQty = lots.reduce((sum, l) => sum + l.quantityRemaining - l.quantityReserved, 0);
        if (availableQty <= model.minStockAlert) {
          await this.notificationsService.createLowStockNotification(modelId, model.name, availableQty, model.minStockAlert);
        } else {
          await this.notificationsService.resolveLowStockNotification(modelId);
        }
      }
    }

    this.realtimeService?.publish({
      type: 'invoice.rejected',
      entity: 'Invoice',
      entityId: invoiceId,
      roles: [Role.ADMIN],
      employeeIds: [invoice.employeeId],
      payload: { status: InvoiceStatus.CANCELLED },
    });

    return { id: invoiceId, status: InvoiceStatus.CANCELLED };
  }

  async findPendingReview(params: { page?: number; limit?: number }) {
    const { page = 1, limit = 25 } = params;
    const skip = (page - 1) * limit;

    const where: Prisma.InvoiceWhereInput = { status: InvoiceStatus.PENDING_ACCOUNTANT };

    const [data, total] = await Promise.all([
      this.prisma.invoice.findMany({
        where,
        include: {
          customer: { select: { id: true, name: true } },
          employee: { select: { id: true, name: true } },
          items: { select: { id: true } },
        },
        skip,
        take: limit,
        orderBy: { date: 'asc' },
      }),
      this.prisma.invoice.count({ where }),
    ]);

    return {
      data: data.map((inv) => ({ ...inv, itemCount: inv.items.length, items: undefined })),
      meta: { page, limit, total, totalPages: Math.ceil(total / limit) },
    };
  }

  async findDeliveryQueue(params: { page?: number; limit?: number }) {
    const { page = 1, limit = 25 } = params;
    const skip = (page - 1) * limit;

    const where: Prisma.InvoiceWhereInput = { status: InvoiceStatus.CONFIRMED };

    const [data, total] = await Promise.all([
      this.prisma.invoice.findMany({
        where,
        include: {
          customer: { select: { id: true, name: true, phone: true } },
          employee: { select: { id: true, name: true } },
          items: {
            include: {
              productModel: { select: { id: true, name: true, isSerialized: true } },
            },
          },
        },
        skip,
        take: limit,
        orderBy: { confirmedAt: 'asc' },
      }),
      this.prisma.invoice.count({ where }),
    ]);

    return {
      data: data.map((inv) => ({
        ...inv,
        itemCount: inv.items.length,
      })),
      meta: { page, limit, total, totalPages: Math.ceil(total / limit) },
    };
  }

  async findOne(id: number, requester?: InvoiceRequester) {
    const invoice = await this.prisma.invoice.findUnique({
      where: { id },
      include: {
        customer: { select: { id: true, name: true, type: true, phone: true } },
        employee: { select: { id: true, name: true } },
        confirmedBy: { select: { id: true, name: true } },
        rejectedBy: { select: { id: true, name: true } },
        deliveredBy: { select: { id: true, name: true } },
        items: {
          include: {
            productModel: {
              select: { id: true, name: true, isSerialized: true },
            },
            unitAssignments: {
              where: { reversedAt: null },
              include: {
                productUnit: {
                  select: { id: true, barcode: true, status: true },
                },
              },
            },
            consumptions: {
              include: {
                stockLot: {
                  select: { id: true, purchasePrice: true, supplier: { select: { name: true } } },
                },
              },
            },
          },
        },
        priceAdjustments: true,
        returns: {
          include: { items: true },
        },
        changeRequests: {
          include: {
            items: true,
            requestedBy: { select: { id: true, name: true } },
            reviewedBy: { select: { id: true, name: true } },
          },
          orderBy: { createdAt: 'desc' },
        },
        auditLogs: {
          include: {
            employee: { select: { id: true, name: true } },
          },
          orderBy: { timestamp: 'desc' },
        },
      },
    });

    if (!invoice) {
      throw new NotFoundException({ code: 'INVOICE_NOT_FOUND', message: 'Invoice not found' });
    }

    if (requester?.role === Role.SALES && invoice.employee.id !== requester.sub) {
      throw new ForbiddenException({ code: 'FORBIDDEN_RESOURCE', message: 'You cannot access this invoice' });
    }
    if (
      requester?.role === Role.INVENTORY &&
      invoice.status !== InvoiceStatus.CONFIRMED &&
      invoice.status !== InvoiceStatus.DELIVERED
    ) {
      throw new ForbiddenException({ code: 'FORBIDDEN_RESOURCE', message: 'You cannot access this invoice' });
    }

    return invoice;
  }

  async findAll(params: {
    search?: string;
    number?: string;
    barcode?: string;
    from?: string;
    to?: string;
    dateFrom?: string;
    dateTo?: string;
    customerId?: number;
    employeeId?: number;
    requester?: InvoiceRequester;
    status?: InvoiceStatus;
    page?: number;
    limit?: number;
  }) {
    const { search, number, barcode, customerId, employeeId, status, requester, page = 1, limit = 25 } = params;
    const skip = (page - 1) * limit;
    const from = params.from || params.dateFrom;
    const to = params.to || params.dateTo;
    const dateFilter = this.buildInclusiveDateRange(from, to);

    const clean = (value?: string) => (value ?? '').trim();
    const explicitBarcode = clean(barcode);
    const searchTerm = clean(search);
    // A bare `search` term is a unit barcode when it matches one, otherwise an invoice number.
    const numberTerm = clean(number) || (explicitBarcode ? '' : searchTerm);
    const unitTerm = explicitBarcode || searchTerm;

    const baseWhere: Prisma.InvoiceWhereInput = {
      ...(customerId && { customerId }),
      ...(employeeId && { employeeId }),
      ...(status && { status }),
      ...(dateFilter ? { date: dateFilter } : {}),
    };
    if (requester?.role === Role.SALES) {
      baseWhere.employeeId = requester.sub;
    }
    if (requester?.role === Role.INVENTORY) {
      baseWhere.status = { in: [InvoiceStatus.CONFIRMED, InvoiceStatus.DELIVERED] };
    }

    const emptyResult = (hint?: 'UNIT_NOT_FOUND' | 'UNIT_NOT_IN_ANY_INVOICE') => ({
      data: [],
      meta: { page, limit, total: 0, totalPages: 0, ...(hint && { hint }) },
    });

    if (unitTerm) {
      const normalizedBarcode = unitTerm.replace(/[\r\n\t]/g, '').replace(/\s+/g, '');
      const unit = await this.prisma.productUnit.findUnique({
        where: { barcode: normalizedBarcode },
        select: { id: true },
      });

      if (unit) {
        const assignments = await this.prisma.invoiceItemUnitAssignment.findMany({
          where: { productUnitId: unit.id, reversedAt: null },
          select: { invoiceItem: { select: { invoiceId: true } } },
        });

        const invoiceIds = [...new Set(assignments.map((a) => a.invoiceItem.invoiceId))];

        if (invoiceIds.length === 0) {
          return emptyResult('UNIT_NOT_IN_ANY_INVOICE');
        }

        const where: Prisma.InvoiceWhereInput = { ...baseWhere, id: { in: invoiceIds } };

        const [data, total] = await Promise.all([
          this.prisma.invoice.findMany({
            where,
            include: {
              customer: { select: { id: true, name: true } },
              employee: { select: { id: true, name: true } },
              items: { select: { id: true } },
            },
            skip,
            take: limit,
            orderBy: { date: 'desc' },
          }),
          this.prisma.invoice.count({ where }),
        ]);

        return {
          data: data.map((inv) => ({ ...inv, itemCount: inv.items.length, items: undefined })),
          meta: { page, limit, total, totalPages: Math.ceil(total / limit) },
        };
      }

      // An explicit barcode lookup never degrades into an unfiltered list.
      if (explicitBarcode) {
        return emptyResult('UNIT_NOT_FOUND');
      }
    }

    const where: Prisma.InvoiceWhereInput = {
      ...baseWhere,
      ...(numberTerm && { invoiceNumber: { contains: numberTerm, mode: 'insensitive' } }),
    };

    const [data, total] = await Promise.all([
      this.prisma.invoice.findMany({
        where,
        include: {
          customer: { select: { id: true, name: true } },
          employee: { select: { id: true, name: true } },
          items: { select: { id: true } },
        },
        skip,
        take: limit,
        orderBy: { date: 'desc' },
      }),
      this.prisma.invoice.count({ where }),
    ]);

    return {
      data: data.map((inv) => ({ ...inv, itemCount: inv.items.length, items: undefined })),
      meta: { page, limit, total, totalPages: Math.ceil(total / limit) },
    };
  }

  async getAuditLog(invoiceId: number, requester?: InvoiceRequester) {
    const invoice = await this.prisma.invoice.findUnique({
      where: { id: invoiceId },
      select: { id: true, employeeId: true, status: true },
    });

    if (!invoice) {
      throw new NotFoundException({ code: 'INVOICE_NOT_FOUND', message: 'Invoice not found' });
    }
    if (requester?.role === Role.SALES && invoice.employeeId !== requester.sub) {
      throw new ForbiddenException({ code: 'FORBIDDEN_RESOURCE', message: 'You cannot access this invoice audit' });
    }
    if (
      requester?.role === Role.INVENTORY &&
      invoice.status !== InvoiceStatus.CONFIRMED &&
      invoice.status !== InvoiceStatus.DELIVERED
    ) {
      throw new ForbiddenException({ code: 'FORBIDDEN_RESOURCE', message: 'You cannot access this invoice audit' });
    }

    return this.prisma.invoiceAuditLog.findMany({
      where: { invoiceId },
      include: {
        employee: { select: { id: true, name: true } },
      },
      orderBy: { timestamp: 'asc' },
    });
  }
}
