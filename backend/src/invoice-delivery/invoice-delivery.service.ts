import { Injectable, NotFoundException, BadRequestException, ConflictException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { RealtimeService } from '../realtime/realtime.service';
import { Prisma, ProductUnitStatus, InvoiceStatus, InvoiceAuditAction, ProductUnitAuditAction, Role } from '@prisma/client';

@Injectable()
export class InvoiceDeliveryService {
  constructor(
    private prisma: PrismaService,
    private notificationsService: NotificationsService,
    private realtimeService?: RealtimeService,
  ) {}

  normalizeBarcode(barcode: string): string {
    return barcode.trim().replace(/[\r\n\t]/g, '').replace(/\s+/g, '');
  }

  async getDeliveryDetails(invoiceId: number) {
    const invoice = await this.prisma.invoice.findUnique({
      where: { id: invoiceId },
      include: {
        items: {
          where: { productModel: { isSerialized: true } },
          include: {
            productModel: { select: { id: true, name: true, isSerialized: true } },
            unitAssignments: {
              where: { reversedAt: null },
              include: {
                productUnit: { select: { id: true, barcode: true, status: true } },
                scannedBy: { select: { id: true, name: true } },
              },
              orderBy: { scannedAt: 'asc' },
            },
          },
        },
      },
    });

    if (!invoice) {
      throw new NotFoundException({ code: 'INVOICE_NOT_FOUND', message: 'Invoice not found' });
    }

    if (invoice.status !== InvoiceStatus.CONFIRMED && invoice.status !== InvoiceStatus.DELIVERED) {
      throw new BadRequestException({ code: 'INVALID_STATUS', message: 'Invoice must be CONFIRMED or DELIVERED' });
    }

    const serializedLines = invoice.items.filter((item) => item.productModel.isSerialized).map((item) => {
      const assignments = item.unitAssignments.filter((a) => a.reversedAt === null);
      return {
        invoiceItemId: item.id,
        productModelId: item.productModel.id,
        productModelName: item.productModel.name,
        requiredQuantity: item.quantity,
        scannedQuantity: assignments.length,
        scannedUnits: assignments.map((a) => ({
          productUnitId: a.productUnitId,
          barcode: a.productUnit.barcode,
          scannedAt: a.scannedAt,
          scannedBy: a.scannedBy?.name,
        })),
      };
    });

    return {
      invoiceId: invoice.id,
      invoiceNumber: invoice.invoiceNumber,
      status: invoice.status,
      serializedLines,
    };
  }

  async scanBarcode(invoiceId: number, employeeId: number, barcode: string) {
    const normalized = this.normalizeBarcode(barcode);

    const invoice = await this.prisma.invoice.findUnique({
      where: { id: invoiceId },
      include: {
        items: {
          where: { productModel: { isSerialized: true } },
          include: {
            productModel: { select: { id: true, name: true, isSerialized: true } },
            unitAssignments: { where: { reversedAt: null } },
          },
        },
      },
    });

    if (!invoice) {
      throw new NotFoundException({ code: 'INVOICE_NOT_FOUND', message: 'Invoice not found' });
    }

    if (invoice.status !== InvoiceStatus.CONFIRMED) {
      throw new BadRequestException({ code: 'INVOICE_NOT_CONFIRMED', message: 'Invoice must be confirmed before scanning' });
    }

    // Find the unit
    const unit = await this.prisma.productUnit.findUnique({
      where: { barcode: normalized },
      include: { productModel: { select: { id: true, name: true, isSerialized: true } } },
    });

    if (!unit) {
      throw new NotFoundException({ code: 'SERIAL_NOT_FOUND', message: `Serial number ${normalized} not found`, barcode: normalized });
    }

    // Rule 2: Must belong to the correct ProductModel
    const matchingLine = invoice.items.find((item) => item.productModelId === unit.productModelId);
    if (!matchingLine) {
      throw new BadRequestException({ code: 'SERIAL_WRONG_MODEL', message: `Serial belongs to ${unit.productModel.name}, not required by this invoice`, model: unit.productModel.name, barcode: unit.barcode });
    }

    // Rule 3: Must be AVAILABLE
    if (unit.status !== ProductUnitStatus.AVAILABLE) {
      throw new ConflictException({ code: 'SERIAL_NOT_AVAILABLE', message: `Unit is ${unit.status}, not AVAILABLE`, unitStatus: unit.status, barcode: unit.barcode });
    }

    // Rule 4: Not already sold/delivered (covered by status check above)

    // Rule 5: Not already scanned into this invoice
    const alreadyScanned = matchingLine.unitAssignments.some((a) => a.productUnitId === unit.id && !a.reversedAt);
    if (alreadyScanned) {
      throw new ConflictException({ code: 'SERIAL_ALREADY_SCANNED_THIS_INVOICE', message: `This serial has already been scanned for this invoice`, barcode: unit.barcode });
    }

    // Rule 6: Not assigned to another active invoice
    const activeAssignment = await this.prisma.invoiceItemUnitAssignment.findFirst({
      where: {
        productUnitId: unit.id,
        reversedAt: null,
        invoiceItem: { invoice: { status: { in: [InvoiceStatus.CONFIRMED] } } },
      },
    });
    if (activeAssignment) {
      throw new ConflictException({ code: 'SERIAL_ASSIGNED_ELSEWHERE', message: 'This unit is already assigned to another active invoice', barcode: unit.barcode });
    }

    // Rule 7: Would not exceed required quantity
    if (matchingLine.unitAssignments.length >= matchingLine.quantity) {
      throw new BadRequestException({ code: 'SCANNED_QUANTITY_EXCEEDS_REQUIRED', message: `Required quantity (${matchingLine.quantity}) already reached for this line`, line: matchingLine.productModel.name, required: matchingLine.quantity, scanned: matchingLine.unitAssignments.length });
    }

    // All validations passed - perform the scan
    const result = await this.prisma.$transaction(async (tx) => {
      // Update ProductUnit status: AVAILABLE -> RESERVED
      const updateResult = await tx.productUnit.updateMany({
        where: { id: unit.id, status: ProductUnitStatus.AVAILABLE, version: unit.version },
        data: { status: ProductUnitStatus.RESERVED, version: { increment: 1 } },
      });

      if (updateResult.count === 0) {
        throw new ConflictException({ code: 'SERIAL_NOT_AVAILABLE', message: 'Unit status changed by another operation' });
      }

      // Create InvoiceItemUnitAssignment
      const assignment = await tx.invoiceItemUnitAssignment.create({
        data: {
          invoiceItemId: matchingLine.id,
          productUnitId: unit.id,
          scannedByEmployeeId: employeeId,
        },
        include: {
          productUnit: { select: { id: true, barcode: true } },
          scannedBy: { select: { id: true, name: true } },
        },
      });

      // Decrement ProductModel.reservedQuantity
      await tx.productModel.update({
        where: { id: unit.productModelId },
        data: { reservedQuantity: { decrement: 1 } },
      });

      // Audit: InvoiceAuditLog UNIT_SCANNED
      await tx.invoiceAuditLog.create({
        data: {
          invoiceId,
          action: InvoiceAuditAction.UNIT_SCANNED,
          employeeId,
          details: {
            barcode: unit.barcode,
            productUnitId: unit.id,
            invoiceItemId: matchingLine.id,
            modelName: unit.productModel.name,
            invoiceNumber: invoice.invoiceNumber,
            from: 'AVAILABLE',
            to: 'RESERVED',
            lineScanned: matchingLine.unitAssignments.length + 1,
            lineRequired: matchingLine.quantity,
          },
        },
      });

      // Audit: ProductUnitAuditLog ALLOCATED_TO_INVOICE
      await tx.productUnitAuditLog.create({
        data: {
          productUnitId: unit.id,
          invoiceId,
          action: ProductUnitAuditAction.ALLOCATED_TO_INVOICE,
          employeeId,
          notes: `Scanned for delivery on invoice ${invoice.invoiceNumber}`,
          metadata: {
            modelName: unit.productModel.name,
            barcode: unit.barcode,
            invoiceNumber: invoice.invoiceNumber,
            from: 'AVAILABLE',
            to: 'RESERVED',
          },
        },
      });

      return {
        productUnitId: unit.id,
        barcode: unit.barcode,
        scannedAt: assignment.scannedAt,
        invoiceItemId: matchingLine.id,
        lineRequired: matchingLine.quantity,
        lineScanned: matchingLine.unitAssignments.length + 1,
      };
    });

    const availableCount = await this.prisma.productUnit.count({
      where: { productModelId: unit.productModelId, status: ProductUnitStatus.AVAILABLE },
    });
    const model = await this.prisma.productModel.findUnique({
      where: { id: unit.productModelId },
      select: { name: true, minStockAlert: true },
    });
    if (model && availableCount <= model.minStockAlert) {
      await this.notificationsService.createLowStockNotification(
        unit.productModelId,
        model.name,
        availableCount,
        model.minStockAlert,
      );
    } else if (model) {
      await this.notificationsService.resolveLowStockNotification(unit.productModelId);
    }

    this.realtimeService?.publish({
      type: 'invoice.delivery.scan',
      entity: 'Invoice',
      entityId: invoiceId,
      roles: [Role.ADMIN, Role.INVENTORY],
      payload: { productUnitId: unit.id },
    });

    return result;
  }

  async unscanBarcode(invoiceId: number, employeeId: number, productUnitId: number) {
    const invoice = await this.prisma.invoice.findUnique({
      where: { id: invoiceId },
      include: {
        items: {
          where: { productModel: { isSerialized: true } },
          include: {
            productModel: { select: { id: true, name: true } },
            unitAssignments: {
              where: { reversedAt: null },
              include: { productUnit: { select: { barcode: true } } },
            },
          },
        },
      },
    });

    if (!invoice) {
      throw new NotFoundException({ code: 'INVOICE_NOT_FOUND', message: 'Invoice not found' });
    }

    if (invoice.status !== InvoiceStatus.CONFIRMED) {
      throw new BadRequestException({ code: 'INVOICE_ALREADY_DELIVERED', message: 'Cannot unscan after invoice is delivered' });
    }

    // Find the assignment
    let targetItem: Prisma.InvoiceItemGetPayload<{
      include: {
        productModel: { select: { id: true; name: true } };
        unitAssignments: {
          where: { reversedAt: null };
          include: { productUnit: { select: { barcode: true } } };
        };
      };
    }> | null = null;
    let targetAssignment: Prisma.InvoiceItemGetPayload<{
      include: {
        productModel: { select: { id: true; name: true } };
        unitAssignments: {
          where: { reversedAt: null };
          include: { productUnit: { select: { barcode: true } } };
        };
      };
    }>['unitAssignments'][number] | null = null;

    for (const item of invoice.items) {
      const assignment = item.unitAssignments.find((a) => a.productUnitId === productUnitId && !a.reversedAt);
      if (assignment) {
        targetItem = item;
        targetAssignment = assignment;
        break;
      }
    }

  /*   if (!targetAssignment) {
      throw new NotFoundException({ code: 'ASSIGNMENT_NOT_FOUND', message: 'No active scan found for this unit in this invoice' });
    } */
if (!targetAssignment || !targetItem) {
  throw new NotFoundException({
    code: 'ASSIGNMENT_NOT_FOUND',
    message: 'No active scan found for this unit in this invoice',
  });
}

    return this.prisma.$transaction(async (tx) => {
      // Claim the assignment and unit together so a retry cannot increment aggregate reservation twice.
      const claimedAssignment = await tx.invoiceItemUnitAssignment.updateMany({
        where: { id: targetAssignment.id, reversedAt: null },
        data: { reversedAt: new Date(), reversedByEmployeeId: employeeId },
      });
      if (claimedAssignment.count !== 1) {
        throw new ConflictException({ code: 'ASSIGNMENT_ALREADY_REVERSED', message: 'This scan was already reversed' });
      }

      // Update ProductUnit: RESERVED -> AVAILABLE
      const releasedUnit = await tx.productUnit.updateMany({
        where: { id: productUnitId, status: ProductUnitStatus.RESERVED },
        data: { status: ProductUnitStatus.AVAILABLE, version: { increment: 1 } },
      });
      if (releasedUnit.count !== 1) {
        throw new ConflictException({ code: 'SERIAL_NOT_RESERVED', message: 'The serialized unit is no longer reserved' });
      }

      // Increment ProductModel.reservedQuantity
      await tx.productModel.update({
        where: { id: targetItem.productModelId },
        data: { reservedQuantity: { increment: 1 } },
      });

      // Audit: InvoiceAuditLog UNIT_SCAN_REVERSED
      await tx.invoiceAuditLog.create({
        data: {
          invoiceId,
          action: InvoiceAuditAction.UNIT_SCAN_REVERSED,
          employeeId,
          details: {
            barcode: targetAssignment.productUnit?.barcode || `unit-${productUnitId}`,
            productUnitId,
            invoiceItemId: targetItem.id,
            modelName: targetItem.productModel?.name,
            invoiceNumber: invoice.invoiceNumber,
            from: 'RESERVED',
            to: 'AVAILABLE',
          },
        },
      });

      // Audit: ProductUnitAuditLog ALLOCATION_RELEASED
      await tx.productUnitAuditLog.create({
        data: {
          productUnitId,
          invoiceId,
          action: ProductUnitAuditAction.ALLOCATION_RELEASED,
          employeeId,
          notes: `Scan reversed for invoice ${invoice.invoiceNumber}`,
          metadata: {
            modelName: targetItem.productModel?.name,
            barcode: targetAssignment.productUnit?.barcode || null,
            invoiceNumber: invoice.invoiceNumber,
            from: 'RESERVED',
            to: 'AVAILABLE',
          },
        },
      });

      return { success: true, reversedProductUnitId: productUnitId };
    });
  }

  async deliverInvoice(invoiceId: number, employeeId: number) {
    const invoice = await this.prisma.invoice.findUnique({
      where: { id: invoiceId },
      include: {
        items: {
          where: { productModel: { isSerialized: true } },
          include: {
            productModel: { select: { id: true, name: true, isSerialized: true } },
            unitAssignments: {
              where: { reversedAt: null },
              include: { productUnit: { select: { barcode: true } } },
            },
          },
        },
      },
    });

    if (!invoice) {
      throw new NotFoundException({ code: 'INVOICE_NOT_FOUND', message: 'Invoice not found' });
    }

    if (invoice.status !== InvoiceStatus.CONFIRMED) {
      throw new BadRequestException({ code: 'INVOICE_NOT_CONFIRMED', message: 'Only confirmed invoices can be delivered' });
    }

    // Check all serialized lines are fully scanned
    for (const item of invoice.items) {
      if (item.unitAssignments.length < item.quantity) {
        throw new BadRequestException({
          code: 'DELIVERY_INCOMPLETE',
          message: `Line "${item.productModel.name}" requires ${item.quantity} units but only ${item.unitAssignments.length} scanned`,
          line: item.productModel.name,
          required: item.quantity,
          scanned: item.unitAssignments.length,
        });
      }
    }

    // Perform delivery
    const result = await this.prisma.$transaction(async (tx) => {
      const assignedUnitIds: number[] = [];

      const claimed = await tx.invoice.updateMany({
        where: { id: invoiceId, status: InvoiceStatus.CONFIRMED },
        data: {
          status: InvoiceStatus.DELIVERED,
          deliveredByEmployeeId: employeeId,
          deliveredAt: new Date(),
        },
      });

      if (claimed.count !== 1) {
        throw new ConflictException({
          code: 'INVOICE_ALREADY_DELIVERED',
          message: 'Invoice was delivered by another employee',
        });
      }

      for (const item of invoice.items) {
        for (const assignment of item.unitAssignments) {
          // Update ProductUnit: RESERVED -> SOLD
          const updateResult = await tx.productUnit.updateMany({
            where: { id: assignment.productUnitId, status: ProductUnitStatus.RESERVED },
            data: { status: ProductUnitStatus.SOLD, version: { increment: 1 } },
          });

          if (updateResult.count === 0) {
            throw new ConflictException({ code: 'UNIT_CONFLICT', message: `Unit ${assignment.productUnitId} status changed by another operation` });
          }

          assignedUnitIds.push(assignment.productUnitId);

          // Audit: ProductUnitAuditLog SOLD
          await tx.productUnitAuditLog.create({
            data: {
              productUnitId: assignment.productUnitId,
              invoiceId,
              action: ProductUnitAuditAction.SOLD,
              employeeId,
              notes: `Delivered via invoice ${invoice.invoiceNumber}`,
              metadata: {
                modelName: item.productModel.name,
                barcode: assignment.productUnit?.barcode ?? null,
                invoiceNumber: invoice.invoiceNumber,
                from: 'RESERVED',
                to: 'SOLD',
              },
            },
          });
        }

        // Resolve costAtSale: sum of purchase prices of assigned units
        if (item.productModel.isSerialized) {
          const units = await tx.productUnit.findMany({
            where: { id: { in: item.unitAssignments.map((a) => a.productUnitId) } },
            select: { purchasePrice: true },
          });
          const hasPendingCost = units.some((unit) => unit.purchasePrice === null);
          const totalCost = units.reduce((sum, u) => sum + Number(u.purchasePrice || 0), 0);
          await tx.invoiceItem.update({
            where: { id: item.id },
            data: {
              costAtSale: hasPendingCost ? null : totalCost / item.quantity,
              cogsStatus: hasPendingCost ? 'PENDING' : 'FINAL',
            },
          });
        }
      }

      // Audit: InvoiceAuditLog DELIVERED
      await tx.invoiceAuditLog.create({
        data: {
          invoiceId,
          action: InvoiceAuditAction.DELIVERED,
          employeeId,
          details: {
            assignedUnitIds,
            invoiceNumber: invoice.invoiceNumber,
            unitCount: assignedUnitIds.length,
            items: invoice.items.map((item) => ({
              model: item.productModel.name,
              quantity: item.quantity,
            })),
          },
        },
      });

      return { id: invoiceId, status: InvoiceStatus.DELIVERED, assignedUnitIds };
    });

    await this.notificationsService.resolveDeliveryNotification(invoiceId);
    this.realtimeService?.publish({
      type: 'invoice.delivered',
      entity: 'Invoice',
      entityId: invoiceId,
      roles: [Role.ADMIN, Role.ACCOUNTANT, Role.INVENTORY],
      payload: { status: InvoiceStatus.DELIVERED },
    });

    return result;
  }
}