import { Injectable, NotFoundException, BadRequestException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { RealtimeService } from '../realtime/realtime.service';
import { Prisma, ProductUnitStatus, StockReceiptStatus, Role } from '@prisma/client';
import { normalizeQuantity } from '../common/quantity.util';

@Injectable()
export class StockReceiptsService {
  constructor(
    private prisma: PrismaService,
    private notificationsService: NotificationsService,
    private realtimeService?: RealtimeService,
  ) {}

  normalizeBarcode(barcode: string): string {
    return barcode
      .trim()
      .replace(/[\r\n\t]/g, '')
      .replace(/\s+/g, '');
  }

  async receiveShipment(employeeId: number, data: {
    categoryId: number;
    productModelId: number;
    supplierId?: number;
    newSupplierName?: string;
    barcodes?: string[];
    nonSerialized?: { quantity: number };
  }) {
    const category = await this.prisma.category.findFirst({
      where: { id: data.categoryId, isActive: true, deletedAt: null },
    });
    if (!category) {
      throw new NotFoundException({ code: 'CATEGORY_NOT_FOUND', message: 'Category not found or inactive' });
    }

    const model = await this.prisma.productModel.findFirst({
      where: { id: data.productModelId, isActive: true, deletedAt: null, categoryId: data.categoryId },
    });
    if (!model) {
      throw new NotFoundException({ code: 'PRODUCT_MODEL_NOT_FOUND', message: 'Product model not found or inactive' });
    }

    let supplierId = data.supplierId;

    if (data.newSupplierName) {
      if (supplierId) {
        throw new BadRequestException({ code: 'CONFLICTING_SUPPLIER', message: 'Provide either supplierId or newSupplierName, not both' });
      }
      const newSupplier = await this.prisma.supplier.create({
        data: { name: data.newSupplierName, isActive: true },
      });
      supplierId = newSupplier.id;
    }

    if (!supplierId) {
      throw new BadRequestException({ code: 'SUPPLIER_REQUIRED', message: 'supplierId or newSupplierName is required' });
    }

    const supplier = await this.prisma.supplier.findFirst({
      where: { id: supplierId, isActive: true, deletedAt: null },
    });
    if (!supplier) {
      throw new NotFoundException({ code: 'SUPPLIER_NOT_FOUND', message: 'Supplier not found or inactive' });
    }

    if (model.isSerialized) {
      return this.receiveSerialized(employeeId, model, supplier, data.barcodes || []);
    } else {
      if (!data.nonSerialized || !data.nonSerialized.quantity) {
        throw new BadRequestException({ code: 'QUANTITY_REQUIRED', message: 'Positive quantity is required for non-serialized items' });
      }
      const quantity = normalizeQuantity(data.nonSerialized.quantity, model.unit);
      return this.receiveNonSerialized(employeeId, model, supplier, quantity);
    }
  }

  private async receiveSerialized(
    employeeId: number,
    model: { id: number; name: string; minStockAlert: number },
    supplier: { id: number; name: string },
    barcodes: string[],
  ) {
    if (barcodes.length === 0) {
      throw new BadRequestException({ code: 'BARCODES_REQUIRED', message: 'At least one barcode is required for serialized items' });
    }

    const normalizedBarcodes = barcodes.map((b) => this.normalizeBarcode(b));

    const uniqueBarcodes = new Set(normalizedBarcodes);
    if (uniqueBarcodes.size !== normalizedBarcodes.length) {
      throw new BadRequestException({ code: 'BARCODE_DUPLICATE_IN_REQUEST', message: 'Duplicate barcodes found in the request' });
    }

    const existingUnits = await this.prisma.productUnit.findMany({
      where: { barcode: { in: normalizedBarcodes } },
      select: { barcode: true },
    });

    if (existingUnits.length > 0) {
      throw new ConflictException({
        code: 'BARCODE_ALREADY_REGISTERED',
        message: `These barcodes already exist: ${existingUnits.map((u) => u.barcode).join(', ')}`,
      });
    }

    const transactionResult = await this.prisma.$transaction(async (tx) => {
      const receipt = await tx.stockReceipt.create({
        data: {
          employeeId,
          supplierId: supplier.id,
          status: StockReceiptStatus.PENDING_PRICING,
        },
      });

      const units = await Promise.all(
        normalizedBarcodes.map((barcode) =>
          tx.productUnit.create({
            data: {
              productModelId: model.id,
              barcode,
              status: ProductUnitStatus.AVAILABLE,
              receivedDate: new Date(),
            },
          }),
        ),
      );

      await Promise.all(
        units.map((unit) =>
          tx.stockReceiptItem.create({
            data: {
              stockReceiptId: receipt.id,
              productUnitId: unit.id,
            },
          }),
        ),
      );

      await Promise.all(
        units.map((unit) =>
          tx.productUnitAuditLog.create({
            data: {
              productUnitId: unit.id,
              action: 'RECEIVED',
              employeeId,
              notes: `Received in receipt #${receipt.id}`,
              metadata: {
                modelName: model.name,
                barcode: unit.barcode,
                receiptId: receipt.id,
                supplierName: supplier.name,
                from: null,
                to: 'AVAILABLE',
              },
            },
          }),
        ),
      );

      const availableCount = await tx.productUnit.count({
        where: { productModelId: model.id, status: ProductUnitStatus.AVAILABLE },
      });

      return {
        receipt,
        units,
        availableCount,
      };
    });

    // Post-transaction notifications
    const { receipt, units, availableCount } = transactionResult;

    if (availableCount <= model.minStockAlert) {
      await this.notificationsService.createLowStockNotification(model.id, model.name, availableCount, model.minStockAlert);
    } else {
      await this.notificationsService.resolveLowStockNotification(model.id);
    }

    await this.notificationsService.notifyStockPendingPricing(receipt.id, {
      model: model.name,
      quantity: units.length,
      supplier: supplier.name,
      receivingType: 'serialized',
    });
    this.realtimeService?.publish({
      type: 'stock.receipt.created',
      entity: 'StockReceipt',
      entityId: receipt.id,
      roles: [Role.ADMIN],
      payload: { status: receipt.status },
    });

    return {
      receipt: { id: receipt.id, date: receipt.date, employeeId: receipt.employeeId, status: receipt.status },
      itemsCreated: units.length,
      model: { id: model.id, name: model.name },
      type: 'serialized' as const,
    };
  }

  private async receiveNonSerialized(
    employeeId: number,
    model: { id: number; name: string; minStockAlert: number },
    supplier: { id: number; name: string },
    quantity: number,
  ) {
    const transactionResult = await this.prisma.$transaction(async (tx) => {
      const receipt = await tx.stockReceipt.create({
        data: {
          employeeId,
          supplierId: supplier.id,
          status: StockReceiptStatus.PENDING_PRICING,
        },
      });

      const stockLot = await tx.stockLot.create({
        data: {
          productModelId: model.id,
          stockReceiptId: receipt.id,
          supplierId: supplier.id,
          quantityReceived: quantity,
          quantityRemaining: quantity,
          quantityReserved: 0,
          receivedDate: new Date(),
        },
      });

      return {
        receipt,
        stockLot,
      };
    });

    // Post-transaction notifications
    const { receipt } = transactionResult;
    await this.notificationsService.notifyStockPendingPricing(receipt.id, {
      model: model.name,
      quantity,
      supplier: supplier.name,
      receivingType: 'non-serialized',
    });
    this.realtimeService?.publish({
      type: 'stock.receipt.created',
      entity: 'StockReceipt',
      entityId: receipt.id,
      roles: [Role.ADMIN],
      payload: { status: receipt.status },
    });

    return {
      receipt: { id: receipt.id, date: receipt.date, employeeId: receipt.employeeId, status: receipt.status },
      stockLot: { id: transactionResult.stockLot.id, quantityReceived: transactionResult.stockLot.quantityReceived, quantityRemaining: transactionResult.stockLot.quantityRemaining },
      model: { id: model.id, name: model.name },
      type: 'non-serialized' as const,
    };
  }

  async priceReceipt(receiptId: number, adminId: number, prices: { productUnitId?: number; stockLotId?: number; purchasePrice: number }[]) {
    const receipt = await this.prisma.stockReceipt.findUnique({
      where: { id: receiptId },
      include: {
        items: true,
        stockLots: true,
      },
    });

    if (!receipt) {
      throw new NotFoundException({ code: 'RECEIPT_NOT_FOUND', message: 'Receipt not found' });
    }

    if (receipt.status !== StockReceiptStatus.PENDING_PRICING) {
      throw new BadRequestException({ code: 'INVALID_STATUS', message: 'Receipt is not in PENDING_PRICING status' });
    }

    const transactionResult = await this.prisma.$transaction(async (tx) => {
      for (const price of prices) {
        if (price.productUnitId) {
          const receiptItem = receipt.items.find((i) => i.productUnitId === price.productUnitId);
          if (!receiptItem) {
            throw new BadRequestException({ code: 'INVALID_RECEIPT_ITEM', message: `Product unit ${price.productUnitId} not in this receipt` });
          }

          await tx.productUnit.update({
            where: { id: price.productUnitId },
            data: { purchasePrice: price.purchasePrice },
          });

          const affectedItems = await tx.invoiceItem.findMany({
            where: {
              unitAssignments: {
                some: { productUnitId: price.productUnitId, reversedAt: null },
              },
            },
            select: {
              id: true,
              quantity: true,
              unitAssignments: {
                where: { reversedAt: null },
                select: { productUnit: { select: { purchasePrice: true } } },
              },
            },
          });

          for (const invoiceItem of affectedItems) {
            const purchasePrices = invoiceItem.unitAssignments.map((assignment) => assignment.productUnit.purchasePrice);
            const hasPendingCost = purchasePrices.some((purchasePrice) => purchasePrice === null);
            const totalCost = purchasePrices.reduce((sum, purchasePrice) => sum + Number(purchasePrice || 0), 0);
            await tx.invoiceItem.update({
              where: { id: invoiceItem.id },
              data: {
                costAtSale: hasPendingCost ? null : totalCost / invoiceItem.quantity,
                cogsStatus: hasPendingCost ? 'PENDING' : 'FINAL',
              },
            });
          }
        }

        if (price.stockLotId) {
          const stockLot = receipt.stockLots.find((l) => l.id === price.stockLotId);
          if (!stockLot) {
            throw new BadRequestException({ code: 'INVALID_STOCK_LOT', message: `Stock lot ${price.stockLotId} not in this receipt` });
          }

          await tx.stockLot.update({
            where: { id: price.stockLotId },
            data: { purchasePrice: price.purchasePrice },
          });

          // Resolve any pending StockConsumption records for this lot
          const consumptions = await tx.stockConsumption.findMany({
            where: {
              stockLotId: price.stockLotId,
              unitCost: null,
            },
          });

          for (const consumption of consumptions) {
            const totalCost = Number(price.purchasePrice) * consumption.quantity;
            await tx.stockConsumption.update({
              where: { id: consumption.id },
              data: {
                unitCost: price.purchasePrice,
                totalCost,
              },
            });
          }

          // Recalculate costAtSale on affected InvoiceItems
          const affectedInvoiceItemIds = [...new Set(consumptions.map((c) => c.invoiceItemId))];
          for (const invoiceItemId of affectedInvoiceItemIds) {
            const agg = await tx.stockConsumption.aggregate({
              where: { invoiceItemId },
              _sum: { totalCost: true },
            });
            const invoiceItem = await tx.invoiceItem.findUnique({
              where: { id: invoiceItemId },
              select: { quantity: true },
            });
            if (invoiceItem && agg._sum?.totalCost) {
              await tx.invoiceItem.update({
                where: { id: invoiceItemId },
                data: {
                  costAtSale: Number(agg._sum.totalCost) / (invoiceItem.quantity || 1),
                  cogsStatus: 'FINAL',
                },
              });
            }
          }
        }
      }

      await tx.stockReceipt.update({
        where: { id: receiptId },
        data: {
          status: StockReceiptStatus.PRICED,
          pricedByEmployeeId: adminId,
          pricedAt: new Date(),
        },
      });

      return { id: receiptId, status: StockReceiptStatus.PRICED };
    });

    // Post-transaction notifications
    await this.notificationsService.resolveStockPricingNotification(receiptId);
    this.realtimeService?.publish({
      type: 'stock.receipt.priced',
      entity: 'StockReceipt',
      entityId: receiptId,
      roles: [Role.ADMIN],
      payload: { status: StockReceiptStatus.PRICED },
    });

    return transactionResult;
  }

  async findPendingPricing(page = 1, limit = 25) {
    const skip = (page - 1) * limit;

    const where: Prisma.StockReceiptWhereInput = { status: StockReceiptStatus.PENDING_PRICING };

    const [data, total] = await Promise.all([
      this.prisma.stockReceipt.findMany({
        where,
        include: {
          employee: { select: { id: true, name: true } },
          supplier: { select: { id: true, name: true } },
          items: {
            include: {
              productUnit: {
                select: {
                  id: true,
                  barcode: true,
                  status: true,
                  purchasePrice: true,
                  productModel: {
                    select: {
                      id: true,
                      name: true,
                      isSerialized: true,
                      category: { select: { id: true, name: true } },
                    },
                  },
                },
              },
            },
          },
          stockLots: {
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
          },
        },
        skip,
        take: limit,
        orderBy: { date: 'asc' },
      }),
      this.prisma.stockReceipt.count({ where }),
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
    const receipt = await this.prisma.stockReceipt.findUnique({
      where: { id },
      include: {
        employee: { select: { id: true, name: true } },
        supplier: { select: { id: true, name: true } },
        pricedBy: { select: { id: true, name: true } },
        items: {
          include: {
            productUnit: {
              select: { id: true, barcode: true, status: true, receivedDate: true, purchasePrice: true },
            },
          },
        },
        stockLots: {
          include: {
            productModel: { select: { id: true, name: true } },
          },
        },
      },
    });

    if (!receipt) {
      throw new NotFoundException({ code: 'RECEIPT_NOT_FOUND', message: 'Receipt not found' });
    }

    return receipt;
  }

  async findAll(params: {
    from?: string;
    to?: string;
    employeeId?: number;
    status?: StockReceiptStatus;
    page?: number;
    limit?: number;
  }) {
    const { from, to, employeeId, status, page = 1, limit = 25 } = params;
    const skip = (page - 1) * limit;

    const where: Prisma.StockReceiptWhereInput = {
      ...(employeeId && { employeeId }),
      ...(status && { status }),
      ...(from || to
        ? {
            date: {
              ...(from && { gte: new Date(from) }),
              ...(to && { lte: new Date(to) }),
            },
          }
        : {}),
    };

    const [data, total] = await Promise.all([
      this.prisma.stockReceipt.findMany({
        where,
        include: {
          employee: { select: { id: true, name: true } },
          supplier: { select: { id: true, name: true } },
          items: { select: { id: true } },
          stockLots: { select: { id: true, quantityReceived: true } },
        },
        skip,
        take: limit,
        orderBy: { date: 'desc' },
      }),
      this.prisma.stockReceipt.count({ where }),
    ]);

    return {
      data: data.map((r) => ({
        ...r,
        itemCount: r.items.length,
        totalQuantity: r.stockLots.length > 0
          ? r.stockLots.reduce((sum, lot) => sum + lot.quantityReceived, 0)
          : r.items.length,
        items: undefined,
        stockLots: undefined,
      })),
      meta: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }
}
