import { Injectable, NotFoundException, BadRequestException, ConflictException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { RealtimeService } from '../realtime/realtime.service';
import { ProductUnitStatus, Prisma, ChangeRequestStatus, InvoiceAuditAction, ChangeRequestItemAction, Role } from '@prisma/client';
import { CreateInvoiceChangeRequestInput } from './dto/invoice-change-request.types';
import { normalizeQuantity, roundQuantity } from '../common/quantity.util';

type ChangeRequestWithItems = Prisma.InvoiceChangeRequestGetPayload<{
  include: { items: true; invoice: { include: { items: true } } };
}>;
type ChangeRequestRequester = { sub: number; role: string };
type ChangeRequestItemRow = ChangeRequestWithItems['items'][number];
type ActionGroups = {
  returns: ChangeRequestItemRow[];
  adds: ChangeRequestItemRow[];
  prices: ChangeRequestItemRow[];
  isEmpty: boolean;
};

@Injectable()
export class InvoiceChangeRequestsService {
  constructor(
    private prisma: PrismaService,
    private notificationsService: NotificationsService,
    private realtimeService?: RealtimeService,
  ) {}

  private async claimIdempotencyKey(employeeId: number, rawKey: string): Promise<Prisma.JsonValue | null> {
    const key = rawKey.trim();
    if (!key || key.length > 128) {
      throw new BadRequestException({ code: 'INVALID_IDEMPOTENCY_KEY', message: 'Idempotency-Key must be 1-128 characters' });
    }
    const existing = await this.prisma.idempotencyKey.findUnique({ where: { key } });
    if (existing && existing.expiresAt > new Date()) {
      if (existing.employeeId !== employeeId || existing.operation !== 'CREATE_CHANGE_REQUEST') {
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
          operation: 'CREATE_CHANGE_REQUEST',
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
    await this.prisma.idempotencyKey.deleteMany({ where: { key: rawKey.trim(), employeeId, operation: 'CREATE_CHANGE_REQUEST' } });
  }

  /**
   * Create a change request for an invoice (Section 11)
   * Sales/Inventory/Admin submit, Admin reviews
   */
  async create(invoiceId: number, employeeId: number, data: CreateInvoiceChangeRequestInput, idempotencyKey?: string) {
    // Verify invoice exists
    const invoice = await this.prisma.invoice.findUnique({
      where: { id: invoiceId },
      include: {
        items: {
          include: { productModel: { select: { id: true, name: true, isSerialized: true, unit: true } } },
        },
        changeRequests: {
          where: { status: ChangeRequestStatus.PENDING },
          select: { id: true },
        },
      },
    });

    if (!invoice) {
      throw new NotFoundException({ code: 'INVOICE_NOT_FOUND', message: 'Invoice not found' });
    }

    if (invoice.status !== 'CONFIRMED' && invoice.status !== 'DELIVERED') {
      throw new BadRequestException({
        code: 'INVALID_INVOICE_STATUS',
        message: 'Change requests can only be created on CONFIRMED or DELIVERED invoices',
      });
    }

    // Check for existing pending requests on same invoice items
    if (invoice.changeRequests.length > 0) {
      throw new ConflictException({
        code: 'CHANGE_REQUEST_CONFLICT',
        message: 'There is already a pending change request on this invoice',
      });
    }

    // Validate items
    if (!data.items || data.items.length === 0) {
      throw new BadRequestException({ code: 'NO_ITEMS', message: 'Change request must have at least one item action' });
    }

    const normalizedIdempotencyKey = idempotencyKey?.trim();
    let idempotencyClaimed = false;
    if (normalizedIdempotencyKey) {
      const existingResponse = await this.claimIdempotencyKey(employeeId, normalizedIdempotencyKey);
      if (existingResponse !== null) return existingResponse;
      idempotencyClaimed = true;
    }

    // Validate each item action
    const itemsSummary: string[] = [];
    // Running total of non-serialized quantity requested on each line within this request.
    const requestedQtyByInvoiceItem = new Map<number, number>();
    for (const item of data.items) {
      if (item.action === ChangeRequestItemAction.RETURN_ITEM || item.action === ChangeRequestItemAction.REMOVE_ITEM) {
        if (!item.invoiceItemId) {
          throw new BadRequestException({ code: 'MISSING_INVOICE_ITEM', message: 'invoiceItemId is required for return/remove actions' });
        }
        // Verify the invoice item belongs to this invoice
        const invoiceItem = invoice.items.find((i) => i.id === item.invoiceItemId);
        if (!invoiceItem) {
          throw new BadRequestException({ code: 'INVALID_INVOICE_ITEM', message: `Invoice item ${item.invoiceItemId} does not belong to this invoice` });
        }

        if (invoiceItem.productModel.isSerialized) {
          // Serialized lines are returned by referencing the specific sold unit.
          if (item.quantity != null) {
            throw new BadRequestException({
              code: 'SERIALIZED_RETURN_UNIT_ONLY',
              message: 'Serialized items must be returned by productUnitId, not quantity',
            });
          }
          if (!item.productUnitId) {
            throw new BadRequestException({ code: 'MISSING_PRODUCT_UNIT', message: 'productUnitId is required to return a serialized item' });
          }
          const assignment = await this.prisma.invoiceItemUnitAssignment.findFirst({
            where: { invoiceItemId: item.invoiceItemId, productUnitId: item.productUnitId, reversedAt: null },
            select: { id: true },
          });
          if (!assignment) {
            throw new BadRequestException({
              code: 'ASSIGNMENT_NOT_FOUND',
              message: 'The requested unit is not actively assigned to this invoice item',
            });
          }
          const existingReturn = await this.prisma.invoiceReturnItem.findFirst({
            where: { productUnitId: item.productUnitId },
          });
          if (existingReturn) {
            throw new BadRequestException({ code: 'UNIT_ALREADY_RETURNED', message: 'This unit has already been returned' });
          }
          itemsSummary.push(`${invoiceItem.productModel?.name ?? `item#${item.invoiceItemId}`} (return)`);
        } else {
          // Non-serialized lines are returned by quantity.
          if (item.productUnitId) {
            throw new BadRequestException({
              code: 'NON_SERIALIZED_RETURN',
              message: 'Non-serialized items must be returned by quantity, not productUnitId',
            });
          }
          if (!item.quantity || item.quantity <= 0) {
            throw new BadRequestException({
              code: 'MISSING_RETURN_QUANTITY',
              message: 'A positive quantity is required to return a non-serialized item',
            });
          }
          const returnQuantity = normalizeQuantity(item.quantity, invoiceItem.productModel.unit);
          const priorRows = await this.prisma.invoiceReturnItem.findMany({
            where: { invoiceItemId: item.invoiceItemId },
            select: { quantity: true },
          });
          const alreadyReturned =
            priorRows.reduce((sum, row) => sum + (row.quantity ?? 1), 0) +
            (requestedQtyByInvoiceItem.get(item.invoiceItemId) ?? 0);
          if (roundQuantity(alreadyReturned + returnQuantity) > invoiceItem.quantity) {
            throw new BadRequestException({
              code: 'OVER_RETURN',
              message: `Cannot return ${returnQuantity} unit(s) of invoice item ${item.invoiceItemId}: only ${Math.max(
                0,
                invoiceItem.quantity - alreadyReturned,
              )} of ${invoiceItem.quantity} sold unit(s) remain returnable`,
            });
          }
          requestedQtyByInvoiceItem.set(item.invoiceItemId, roundQuantity(alreadyReturned + returnQuantity));
          itemsSummary.push(`${invoiceItem.productModel?.name ?? `item#${item.invoiceItemId}`} ×${returnQuantity} (return)`);
        }
        if (item.proposedPrice != null) {
          throw new BadRequestException({ code: 'UNEXPECTED_FIELD', message: 'proposedPrice is not allowed on return/remove actions' });
        }
        continue;
      }

      if (item.action === ChangeRequestItemAction.ADD_ITEM) {
        if (item.invoiceItemId || item.productUnitId) {
          throw new BadRequestException({
            code: 'UNEXPECTED_FIELD',
            message: 'invoiceItemId/productUnitId are not allowed on add-item actions',
          });
        }
        if (!item.productModelId || !item.quantity || item.quantity <= 0) {
          throw new BadRequestException({ code: 'MISSING_PRODUCT_MODEL', message: 'productModelId and positive quantity are required for add-item action' });
        }
        if (item.proposedPrice != null && (!Number.isFinite(item.proposedPrice) || item.proposedPrice < 0)) {
          throw new BadRequestException({ code: 'INVALID_PRICE', message: 'Proposed price must be a non-negative number' });
        }
        const model = await this.prisma.productModel.findFirst({
          where: { id: item.productModelId, isActive: true, deletedAt: null },
        });
        if (!model) {
          throw new NotFoundException({ code: 'PRODUCT_MODEL_NOT_FOUND', message: `Product model ${item.productModelId} not found` });
        }
        item.quantity = normalizeQuantity(item.quantity, model.unit);
        itemsSummary.push(`${model.name} × ${item.quantity}${item.proposedPrice != null ? ` @ ${item.proposedPrice}` : ''} (add)`);
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
        }
      }

      if (item.action === ChangeRequestItemAction.CHANGE_PRICE) {
        if (item.productUnitId || item.productModelId || item.quantity != null) {
          throw new BadRequestException({
            code: 'UNEXPECTED_FIELD',
            message: 'productUnitId/productModelId/quantity are not allowed on price-change actions',
          });
        }
        if (!item.invoiceItemId || item.proposedPrice == null || !Number.isFinite(item.proposedPrice)) {
          throw new BadRequestException({ code: 'MISSING_PRICE_DATA', message: 'invoiceItemId and proposedPrice are required for price change' });
        }
        if (item.proposedPrice < 0) {
          throw new BadRequestException({ code: 'INVALID_PRICE', message: 'Proposed price must be non-negative' });
        }
        const invoiceItem = invoice.items.find((i) => i.id === item.invoiceItemId);
        if (!invoiceItem) {
          throw new BadRequestException({ code: 'INVALID_INVOICE_ITEM', message: `Invoice item ${item.invoiceItemId} does not belong to this invoice` });
        }
        itemsSummary.push(`${invoiceItem.productModel?.name ?? `item#${item.invoiceItemId}`}: → ${item.proposedPrice}`);
      }
    }

    // Create change request with items in a transaction
    let request: Prisma.InvoiceChangeRequestGetPayload<{ include: { items: true; requestedBy: { select: { id: true; name: true } } } }>;
    try {
      request = await this.prisma.$transaction(async (tx) => {
      const request = await tx.invoiceChangeRequest.create({
        data: {
          invoiceId,
          requestedByEmployeeId: employeeId,
          type: data.type,
          reason: data.reason,
          proposedCustomerId: data.proposedCustomerId,
          items: {
            create: data.items.map((item) => ({
              action: item.action,
              invoiceItemId: item.invoiceItemId,
              productUnitId: item.productUnitId,
              productModelId: item.productModelId,
              quantity: item.quantity,
              proposedPrice: item.proposedPrice,
              notes: item.notes,
            })),
          },
        },
        include: {
          items: true,
          requestedBy: { select: { id: true, name: true } },
        },
      });

      // Write audit log
      await tx.invoiceAuditLog.create({
        data: {
          invoiceId,
          action: InvoiceAuditAction.CHANGE_REQUEST_CREATED,
          employeeId,
          details: {
            requestId: request.id,
            type: data.type,
            itemCount: data.items.length,
            invoiceNumber: invoice.invoiceNumber,
            reason: data.reason ?? null,
            items: itemsSummary,
          },
        },
      });

      // Notify admins about new change request
      const admins = await tx.employee.findMany({
        where: { role: 'ADMIN', isActive: true, deletedAt: null },
        select: { id: true },
      });

      for (const admin of admins) {
        await tx.notification.create({
          data: {
            employeeId: admin.id,
            type: 'CHANGE_REQUEST',
            title: `New Change Request on Invoice`,
            message: `A ${data.type.toLowerCase().replace('_', ' ')} request has been submitted for invoice ${invoice.invoiceNumber}. Details: ${itemsSummary.join(', ')}.`,
            payload: {
              invoice: invoice.invoiceNumber,
              type: data.type,
              itemCount: data.items.length,
              itemsSummary: itemsSummary.join(', '),
              reason: data.reason ?? '',
            },
            entityType: 'InvoiceChangeRequest',
            entityId: String(request.id),
          },
        });
      }

      return request;
      });
    } catch (error) {
      if (idempotencyClaimed && normalizedIdempotencyKey) await this.releaseIdempotencyKey(employeeId, normalizedIdempotencyKey);
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException({ code: 'CHANGE_REQUEST_CONFLICT', message: 'There is already a pending change request on this invoice' });
      }
      throw error;
    }

    if (idempotencyClaimed && normalizedIdempotencyKey) {
      await this.prisma.idempotencyKey.update({
        where: { key: normalizedIdempotencyKey },
        data: { responseStatus: 201, responseBody: request },
      });
    }

    this.realtimeService?.publish({
      type: 'invoice.change-request.created',
      entity: 'InvoiceChangeRequest',
      entityId: request.id,
      roles: [Role.ADMIN],
      payload: { invoiceId, status: ChangeRequestStatus.PENDING },
    });

    return request;
  }

  /**
   * List change requests with filters.
   *
   * Scope is enforced server-side: only an ADMIN user can see requests they
   * did not create. Everyone else is always pinned to their own requests.
   */
  async findAll(params: {
    status?: ChangeRequestStatus;
    page?: number;
    limit?: number;
    scope?: 'mine' | 'all';
    user?: ChangeRequestRequester;
  }) {
    const { status, page = 1, limit = 25, user, scope } = params;
    const skip = (page - 1) * limit;

    const where: Prisma.InvoiceChangeRequestWhereInput = {
      ...(status && { status }),
    };
    const privileged = user?.role === Role.ADMIN;
    const wantsAll = privileged && scope !== 'mine';
    if (!wantsAll) {
      // No user (internal call) → match nothing rather than leak requests.
      where.requestedByEmployeeId = user?.sub ?? -1;
    }

    const [data, total] = await Promise.all([
      this.prisma.invoiceChangeRequest.findMany({
        where,
        include: {
          invoice: { select: { id: true, invoiceNumber: true, currentTotal: true } },
          requestedBy: { select: { id: true, name: true } },
          reviewedBy: { select: { id: true, name: true } },
          items: true,
        },
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.invoiceChangeRequest.count({ where }),
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

  /**
   * Get change request by ID
   */
  async findOne(id: number, user?: ChangeRequestRequester) {
    const request = await this.prisma.invoiceChangeRequest.findUnique({
      where: { id },
      include: {
        invoice: {
          include: {
            items: {
              include: {
                productModel: { select: { id: true, name: true, isSerialized: true, unit: true } },
                unitAssignments: {
                  where: { reversedAt: null },
                  include: { productUnit: { select: { id: true, barcode: true, status: true } } },
                },
              },
            },
          },
        },
        requestedBy: { select: { id: true, name: true } },
        reviewedBy: { select: { id: true, name: true } },
        items: {
          include: {
            invoiceItem: {
              include: {
                productModel: { select: { id: true, name: true, isSerialized: true, unit: true } },
                unitAssignments: {
                  where: { reversedAt: null },
                  include: { productUnit: { select: { id: true, barcode: true } } },
                },
              },
            },
            productUnit: { select: { id: true, barcode: true, status: true } },
          },
        },
      },
    });

    if (!request) {
      throw new NotFoundException({ code: 'CHANGE_REQUEST_NOT_FOUND', message: 'Change request not found' });
    }
    if (
      (user?.role === Role.SALES || user?.role === Role.INVENTORY) &&
      request.requestedByEmployeeId !== user.sub
    ) {
      throw new ForbiddenException({ code: 'FORBIDDEN_RESOURCE', message: 'You cannot access this change request' });
    }

    return request;
  }

  /**
   * Approve a change request.
   *
   * A request may legitimately combine ADD_ITEM, REMOVE_ITEM/RETURN_ITEM and
   * CHANGE_PRICE actions. EVERY action group present is applied, in a single
   * transaction: if any group fails validation at approval time the whole
   * approval rolls back (never partially applied).
   */
  async approve(requestId: number, adminId: number, adminNote?: string) {
    const request = await this.prisma.invoiceChangeRequest.findUnique({
      where: { id: requestId },
      include: {
        items: true,
        invoice: { include: { items: true } },
      },
    });

    if (!request) {
      throw new NotFoundException({ code: 'CHANGE_REQUEST_NOT_FOUND', message: 'Change request not found' });
    }

    if (request.status !== ChangeRequestStatus.PENDING) {
      throw new BadRequestException({
        code: 'CHANGE_REQUEST_ALREADY_REVIEWED',
        message: 'This request has already been reviewed',
      });
    }

    if (this.classifyActions(request.items).isEmpty) {
      throw new BadRequestException({ code: 'INVALID_REQUEST', message: 'No valid actions found in request' });
    }

    return this.prisma.$transaction(async (tx) => {
      // Claim + re-read mutable state inside the transaction (closes review races).
      const fresh = await this.claimAndReload(tx, requestId, adminId, adminNote);
      const groups = this.classifyActions(fresh.items);
      if (groups.isEmpty) {
        throw new BadRequestException({ code: 'INVALID_REQUEST', message: 'No valid actions found in request' });
      }

      // Add-only requests keep their existing auto-reject-on-insufficient-stock
      // behavior; a mixed request must be all-or-nothing instead.
      const addOnly = groups.returns.length === 0 && groups.prices.length === 0;

      const results: Record<string, unknown> = { id: fresh.id, status: 'APPROVED' };

      // Returns run first so returned units/stock are available to any add.
      if (groups.returns.length > 0) {
        Object.assign(results, await this.applyReturnActions(tx, fresh, adminId, adminNote));
      }
      if (groups.adds.length > 0) {
        Object.assign(results, await this.applyAddActions(tx, fresh, adminId, adminNote, { allowAutoReject: addOnly }));
      }
      if (groups.prices.length > 0) {
        Object.assign(results, await this.applyPriceActions(tx, fresh, adminId, adminNote));
      }

      return results;
    });
  }

  private classifyActions(items: ChangeRequestItemRow[]): ActionGroups {
    const returns = items.filter(
      (i) => i.action === ChangeRequestItemAction.RETURN_ITEM || i.action === ChangeRequestItemAction.REMOVE_ITEM,
    );
    const adds = items.filter((i) => i.action === ChangeRequestItemAction.ADD_ITEM);
    const prices = items.filter((i) => i.action === ChangeRequestItemAction.CHANGE_PRICE);
    return { returns, adds, prices, isEmpty: returns.length === 0 && adds.length === 0 && prices.length === 0 };
  }

  /**
   * Claim the PENDING request (single-winner) and re-read it with fresh invoice state.
   * Must be called inside the approval transaction.
   */
  private async claimAndReload(
    tx: Prisma.TransactionClient,
    requestId: number,
    adminId: number,
    adminNote?: string,
  ): Promise<ChangeRequestWithItems> {
    const claimed = await tx.invoiceChangeRequest.updateMany({
      where: { id: requestId, status: ChangeRequestStatus.PENDING },
      data: { status: ChangeRequestStatus.APPROVED, reviewedByAdminId: adminId, reviewDate: new Date(), adminNote },
    });
    if (claimed.count !== 1) {
      throw new ConflictException({ code: 'CHANGE_REQUEST_ALREADY_REVIEWED', message: 'This request has already been reviewed' });
    }
    const request = await tx.invoiceChangeRequest.findUnique({
      where: { id: requestId },
      include: { items: true, invoice: { include: { items: true } } },
    });
    if (!request) throw new NotFoundException({ code: 'CHANGE_REQUEST_NOT_FOUND', message: 'Change request not found' });
    return request;
  }

  /**
   * Reject a change request
   */
  async reject(requestId: number, adminId: number, adminNote: string) {
    const request = await this.prisma.invoiceChangeRequest.findUnique({
      where: { id: requestId },
      include: {
        invoice: { select: { id: true, invoiceNumber: true, currentTotal: true } },
        items: true,
      },
    });

    if (!request) {
      throw new NotFoundException({ code: 'CHANGE_REQUEST_NOT_FOUND', message: 'Change request not found' });
    }

    if (request.status !== ChangeRequestStatus.PENDING) {
      throw new BadRequestException({
        code: 'CHANGE_REQUEST_ALREADY_REVIEWED',
        message: 'This request has already been reviewed',
      });
    }

    return this.prisma.$transaction(async (tx) => {
      const claimed = await tx.invoiceChangeRequest.updateMany({
        where: { id: requestId, status: ChangeRequestStatus.PENDING },
        data: {
          status: ChangeRequestStatus.REJECTED,
          reviewedByAdminId: adminId,
          reviewDate: new Date(),
          adminNote,
        },
      });
      if (claimed.count !== 1) {
        throw new ConflictException({ code: 'CHANGE_REQUEST_ALREADY_REVIEWED', message: 'This request has already been reviewed' });
      }
      const request = await tx.invoiceChangeRequest.findUnique({
        where: { id: requestId },
        include: { invoice: { select: { id: true, invoiceNumber: true, currentTotal: true } }, items: true },
      });
      if (!request) throw new NotFoundException({ code: 'CHANGE_REQUEST_NOT_FOUND', message: 'Change request not found' });
      // Mark request as rejected

      // Write audit log
      await tx.invoiceAuditLog.create({
        data: {
          invoiceId: request.invoiceId,
          action: InvoiceAuditAction.CHANGE_REQUEST_REJECTED,
          employeeId: adminId,
          details: {
            requestId,
            reason: adminNote,
            invoiceNumber: request.invoice.invoiceNumber,
            type: request.type,
            itemCount: request.items.length,
          },
        },
      });

      // Notify requester
      await tx.notification.create({
        data: {
          employeeId: request.requestedByEmployeeId,
          type: 'CHANGE_REQUEST_REJECTED',
          title: `Change Request Rejected`,
          message: `Your change request on invoice ${request.invoice.invoiceNumber} has been rejected. Reason: ${adminNote || 'N/A'}`,
          payload: {
            invoice: request.invoice.invoiceNumber,
            reason: adminNote || '',
            type: request.type,
            itemCount: request.items.length,
          },
          entityType: 'InvoiceChangeRequest',
          entityId: String(requestId),
        },
      });

      return { id: requestId, status: 'REJECTED' };
    });
  }

  /**
   * Return approval transaction (Section 10.4)
   *
   * Refunds use the effective line price (after any InvoicePriceAdjustment) scaled
   * by the invoice payment ratio currentTotal/adjustedSubtotal so invoice-level
   * discounts are allocated proportionally (ISS-004/ISS-022). currentTotal is
   * floored at 0 after the refund decrement.
   */
  private async approveReturnTransaction(staleRequest: ChangeRequestWithItems, adminId: number, adminNote?: string) {
    return this.prisma.$transaction(async (tx) => {
      const request = await this.claimAndReload(tx, staleRequest.id, adminId, adminNote);
      return this.applyReturnActions(tx, request, adminId, adminNote);
    });
  }

  /**
   * Return/removal approval group — runs inside an already-claimed transaction.
   *
   * Serialized lines return a specific sold unit (productUnitId → AVAILABLE).
   * Non-serialized lines return a quantity, which is added back to stock.
   *
   * Refunds use the effective line price (after any InvoicePriceAdjustment) scaled
   * by the invoice payment ratio currentTotal/adjustedSubtotal so invoice-level
   * discounts are allocated proportionally (ISS-004/ISS-022). currentTotal is
   * floored at 0 after the refund decrement.
   */
  private async applyReturnActions(
    tx: Prisma.TransactionClient,
    request: ChangeRequestWithItems,
    adminId: number,
    adminNote?: string,
  ) {
    interface ReturnPlan {
      invoiceItemId: number;
      productModelId: number;
      modelName: string;
      soldQuantity: number;
      price: unknown;
      quantity: number;
      serialized: boolean;
      productUnitId?: number;
      assignmentId?: number;
      unit?: { id: number; status: ProductUnitStatus; version: number; barcode: string };
      refundAmount: number;
    }

    // 1. Classify and validate every return/removal row
    const returnRows = request.items.filter(
      (i) => i.action === ChangeRequestItemAction.RETURN_ITEM || i.action === ChangeRequestItemAction.REMOVE_ITEM,
    );
    if (returnRows.length === 0) {
      return {};
    }

    const plans: ReturnPlan[] = [];
    const requestedQtyByInvoiceItem = new Map<number, number>();

    for (const row of returnRows) {
      if (!row.invoiceItemId) {
        throw new BadRequestException({ code: 'INVALID_RETURN_ITEM', message: 'A return item must identify an invoice item' });
      }

      const invoiceItem = await tx.invoiceItem.findUnique({
        where: { id: row.invoiceItemId },
        include: {
          productModel: { select: { id: true, name: true, isSerialized: true, unit: true } },
          unitAssignments: {
            where: { reversedAt: null },
            include: { productUnit: { select: { id: true, status: true, version: true, barcode: true } } },
          },
        },
      });

      if (!invoiceItem) {
        throw new BadRequestException({ code: 'INVALID_INVOICE_ITEM', message: `Invoice item ${row.invoiceItemId} not found` });
      }

      if (invoiceItem.productModel.isSerialized) {
        // ── Serialized: return one specific sold unit ──
        if (row.quantity != null) {
          throw new BadRequestException({
            code: 'SERIALIZED_RETURN_UNIT_ONLY',
            message: 'Serialized items must be returned by productUnitId, not quantity',
          });
        }
        if (!row.productUnitId) {
          throw new BadRequestException({ code: 'MISSING_PRODUCT_UNIT', message: 'productUnitId is required to return a serialized item' });
        }

        const assignment = invoiceItem.unitAssignments.find((candidate) => candidate.productUnitId === row.productUnitId);
        if (!assignment) {
          throw new BadRequestException({ code: 'ASSIGNMENT_NOT_FOUND', message: 'The requested unit is not actively assigned to this invoice item' });
        }

        const productUnit = assignment.productUnit;
        if (productUnit.status !== ProductUnitStatus.SOLD) {
          throw new BadRequestException({ code: 'UNIT_NOT_SOLD', message: `Unit ${productUnit.barcode} is not currently SOLD` });
        }

        // Verify this specific unit is not already returned (ISS-005: by productUnitId)
        const existingReturn = await tx.invoiceReturnItem.findFirst({
          where: { invoiceItemId: row.invoiceItemId, productUnitId: row.productUnitId },
        });
        if (existingReturn) {
          throw new BadRequestException({ code: 'UNIT_ALREADY_RETURNED', message: `Unit ${productUnit.barcode} has already been returned` });
        }

        plans.push({
          invoiceItemId: row.invoiceItemId,
          productModelId: invoiceItem.productModelId,
          modelName: invoiceItem.productModel.name,
          soldQuantity: invoiceItem.quantity,
          price: invoiceItem.price,
          quantity: 1,
          serialized: true,
          productUnitId: row.productUnitId,
          assignmentId: assignment.id,
          unit: productUnit,
          refundAmount: 0,
        });
      } else {
        // ── Non-serialized: return a quantity ──
        if (row.productUnitId) {
          throw new BadRequestException({
            code: 'NON_SERIALIZED_RETURN',
            message: 'Non-serialized items must be returned by quantity, not productUnitId',
          });
        }
        const quantity = row.quantity;
        if (!quantity || quantity <= 0) {
          throw new BadRequestException({
            code: 'MISSING_RETURN_QUANTITY',
            message: 'A positive quantity is required to return a non-serialized item',
          });
        }
        const returnQuantity = normalizeQuantity(quantity, invoiceItem.productModel.unit);
        requestedQtyByInvoiceItem.set(row.invoiceItemId, roundQuantity((requestedQtyByInvoiceItem.get(row.invoiceItemId) ?? 0) + returnQuantity));
        plans.push({
          invoiceItemId: row.invoiceItemId,
          productModelId: invoiceItem.productModelId,
          modelName: invoiceItem.productModel.name,
          soldQuantity: invoiceItem.quantity,
          price: invoiceItem.price,
          quantity: returnQuantity,
          serialized: false,
          refundAmount: 0,
        });
      }
    }

    // 2. Outstanding-quantity guard (approval-time re-check of the create-time rule)
    for (const [invoiceItemId, requestedQty] of requestedQtyByInvoiceItem) {
      const line = plans.find((p) => p.invoiceItemId === invoiceItemId);
      if (!line) continue;
      const priorRows = await tx.invoiceReturnItem.findMany({
        where: { invoiceItemId },
        select: { quantity: true },
      });
      const alreadyReturned = priorRows.reduce((sum, r) => sum + (r.quantity ?? 1), 0);
      if (roundQuantity(alreadyReturned + requestedQty) > line.soldQuantity) {
        throw new BadRequestException({
          code: 'OVER_RETURN',
          message: `Cannot return ${requestedQty} unit(s) of invoice item ${invoiceItemId}: only ${Math.max(
            0,
            line.soldQuantity - alreadyReturned,
          )} of ${line.soldQuantity} sold unit(s) remain returnable`,
        });
      }
    }

      // Pricing snapshot for discount-aware refund math (ISS-004/ISS-022)
      const pricing = await tx.invoice.findUnique({
        where: { id: request.invoiceId },
        select: {
          currentTotal: true,
          items: {
            select: {
              id: true,
              quantity: true,
              price: true,
              priceAdjustments: {
                orderBy: { createdAt: 'desc' },
                take: 1,
                select: { newPrice: true },
              },
            },
          },
        },
      });
      if (!pricing) {
        throw new NotFoundException({ code: 'INVOICE_NOT_FOUND', message: 'Invoice not found' });
      }

      const round2 = (n: number) => Math.round(n * 100) / 100;
      const effectivePriceById = new Map<number, number>();
      let adjustedSubtotal = 0;
      for (const item of pricing.items) {
        const effective =
          item.priceAdjustments.length > 0
            ? Number(item.priceAdjustments[0].newPrice)
            : Number(item.price);
        effectivePriceById.set(item.id, effective);
        adjustedSubtotal += effective * item.quantity;
      }
      const currentTotal = Number(pricing.currentTotal);
      // Share of each list-price unit that the customer actually paid after discounts.
      const paymentRatio = adjustedSubtotal > 0 ? currentTotal / adjustedSubtotal : 0;

      let refundTotal = 0;
      const returnedItems: { model: string; barcode: string; refund: number }[] = [];

      // 6. Discount-aware refunds (ISS-004) + unit/stock release
      for (const plan of plans) {
        const effectivePrice = effectivePriceById.get(plan.invoiceItemId) ?? Number(plan.price);
        // Serialized: refund per unit; non-serialized: refund per quantity returned.
        const refundAmount = round2(effectivePrice * paymentRatio * plan.quantity);
        plan.refundAmount = refundAmount;
        refundTotal = round2(refundTotal + refundAmount);
        returnedItems.push({
          model: plan.modelName,
          barcode: plan.serialized ? plan.unit!.barcode : `×${plan.quantity}`,
          refund: refundAmount,
        });

        if (plan.serialized) {
          // 9. Change ProductUnit SOLD → AVAILABLE (atomic with version check)
          const productUnit = plan.unit!;
          const updateResult = await tx.productUnit.updateMany({
            where: {
              id: productUnit.id,
              status: ProductUnitStatus.SOLD,
              version: productUnit.version,
            },
            data: {
              status: ProductUnitStatus.AVAILABLE,
              version: { increment: 1 },
            },
          });

          if (updateResult.count === 0) {
            throw new ConflictException({
              code: 'CONFLICT',
              message: `Unit ${productUnit.barcode} status changed by another operation`,
            });
          }

          await tx.invoiceItemUnitAssignment.update({
            where: { id: plan.assignmentId! },
            data: { reversedAt: new Date(), reversedByEmployeeId: adminId },
          });

          // 11. Write ProductUnitAuditLog(RETURNED)
          await tx.productUnitAuditLog.create({
            data: {
              productUnitId: productUnit.id,
              action: 'RETURNED',
              invoiceId: request.invoiceId,
              employeeId: adminId,
              notes: `Returned via change request #${request.id}`,
              metadata: {
                modelName: plan.modelName,
                barcode: productUnit.barcode,
                invoiceNumber: request.invoice.invoiceNumber,
                refund: refundAmount,
                from: 'SOLD',
                to: 'AVAILABLE',
              },
            },
          });
        } else {
          // Put the returned quantity back into stock (or un-reserve it).
          await this.restoreNonSerializedStock(tx, plan.invoiceItemId, plan.productModelId, plan.quantity);
        }
      }

      // 7. Create InvoiceReturn with per-row refund amounts (ISS-004)
      const invoiceReturn = await tx.invoiceReturn.create({
        data: {
          invoiceId: request.invoiceId,
          requestedById: request.requestedByEmployeeId,
          approvedById: adminId,
          reason: request.reason,
          refundTotal,
          requestId: request.id,
          items: {
            create: plans.map((plan) => ({
              invoiceItemId: plan.invoiceItemId,
              productUnitId: plan.productUnitId ?? null,
              quantity: plan.quantity,
              refundAmount: plan.refundAmount,
            })),
          },
        },
      });
      void invoiceReturn;

      // 12. Update Invoice.currentTotal, floored at 0 (ISS-022)
      const newTotal = Math.max(0, round2(currentTotal - refundTotal));
      await tx.invoice.update({
        where: { id: request.invoiceId },
        data: {
          currentTotal: newTotal,
        },
      });

      // 13. Write InvoiceAuditLog
      const isFullReturn = plans.length === request.invoice.items.length;
      await tx.invoiceAuditLog.create({
        data: {
          invoiceId: request.invoiceId,
          action: isFullReturn
            ? InvoiceAuditAction.FULL_RETURNED
            : InvoiceAuditAction.PARTIAL_RETURNED,
          employeeId: adminId,
          details: {
            requestId: request.id,
            refundTotal,
            itemsReturned: plans.length,
            invoiceNumber: request.invoice.invoiceNumber,
            newTotal,
            reason: request.reason ?? null,
            adminNote: adminNote ?? null,
            items: returnedItems,
          },
        },
      });

      // 15. Create approval notification
      await tx.notification.create({
        data: {
          employeeId: request.requestedByEmployeeId,
          type: 'RETURN_APPROVED',
          title: `Return Approved`,
          message: `Your return request for invoice ${request.invoice.invoiceNumber} has been approved. Refund: ${refundTotal}. Details: ${returnedItems.map((r) => `${r.model} (${r.barcode})`).join(', ')}`,
          payload: {
            invoice: request.invoice.invoiceNumber,
            refund: refundTotal,
            count: plans.length,
            itemsSummary: returnedItems.map((r) => `${r.model} (${r.barcode})`).join(', '),
            reason: request.reason ?? '',
          },
          entityType: 'InvoiceChangeRequest',
          entityId: String(request.id),
        },
      });

      // 16. Recalculate low-stock state for every touched model
      const touchedModelIds = [...new Set(plans.map((p) => p.productModelId))];
      for (const productModelId of touchedModelIds) {
        const model = await tx.productModel.findUnique({
          where: { id: productModelId },
          select: { name: true, minStockAlert: true },
        });
        if (!model) continue;

        const serialized = plans.some((p) => p.productModelId === productModelId && p.serialized);
        let availableCount = 0;
        if (serialized) {
          availableCount = await tx.productUnit.count({
            where: { productModelId, status: ProductUnitStatus.AVAILABLE },
          });
        } else if (typeof (tx.stockLot as { aggregate?: unknown }).aggregate === 'function') {
          const agg = await tx.stockLot.aggregate({
            where: { productModelId },
            _sum: { quantityRemaining: true, quantityReserved: true },
          });
          availableCount = (agg._sum?.quantityRemaining ?? 0) - (agg._sum?.quantityReserved ?? 0);
        }

        if (availableCount <= model.minStockAlert) {
          await this.notificationsService.createLowStockNotification(productModelId, model.name, availableCount, model.minStockAlert);
        } else {
          await this.notificationsService.resolveLowStockNotification(productModelId);
        }
      }

      return {
        id: request.id,
        status: 'APPROVED',
        refundTotal,
        itemsReturned: plans.length,
      };
  }

  /**
   * Put a returned quantity of a NON-SERIALIZED line back into stock.
   *
   * Stock was consumed from lots at confirm time (StockConsumption), so the
   * matching quantity is re-added to those lots. Lines added after confirmation
   * have no consumption rows — those were only ever reserved, so we un-reserve.
   * Any leftover quantity (consumed before a lot merge, etc.) goes to the most
   * recent lots of the same model; if still unplaceable the approval fails.
   */
  private async restoreNonSerializedStock(
    tx: Prisma.TransactionClient,
    invoiceItemId: number,
    productModelId: number,
    quantity: number,
  ) {
    let remaining = quantity;

    const consumptions = await tx.stockConsumption.findMany({
      where: { invoiceItemId },
      orderBy: { createdAt: 'desc' },
    });

    for (const consumption of consumptions) {
      if (remaining <= 0) break;
      const credit = Math.min(Number(consumption.quantity), remaining);
      if (credit <= 0) continue;
      const lot = await tx.stockLot.findUnique({ where: { id: consumption.stockLotId } });
      if (!lot) continue;
      await tx.stockLot.update({
        where: { id: consumption.stockLotId },
        data: { quantityRemaining: { increment: credit } },
      });
      remaining -= credit;
    }

    // Line added after confirmation: it only ever reserved stock — release it.
    if (remaining > 0 && consumptions.length === 0) {
      const lots = await tx.stockLot.findMany({
        where: { productModelId },
        orderBy: { createdAt: 'desc' },
      });
      for (const lot of lots) {
        if (remaining <= 0) break;
        const release = Math.min(lot.quantityReserved, remaining);
        if (release <= 0) continue;
        await tx.stockLot.update({
          where: { id: lot.id },
          data: { quantityReserved: { decrement: release } },
        });
        remaining -= release;
      }
    }

    // Fallback: place any leftover quantity on recent lots of the same model.
    if (remaining > 0) {
      const lots = await tx.stockLot.findMany({
        where: { productModelId },
        orderBy: { createdAt: 'desc' },
      });
      for (const lot of lots) {
        if (remaining <= 0) break;
        await tx.stockLot.update({
          where: { id: lot.id },
          data: { quantityRemaining: { increment: 1 } },
        });
        remaining -= 1;
      }
    }

    if (remaining > 0) {
      throw new ConflictException({
        code: 'STOCK_CONFLICT',
        message: 'No stock lot available to restore the returned quantity',
      });
    }
  }

  /**
   * Price-change approval transaction (Section 10.5)
   */
  private async approvePriceChangeTransaction(staleRequest: any, adminId: number, adminNote?: string) {
    return this.prisma.$transaction(async (tx) => {
      const request = await this.claimAndReload(tx, staleRequest.id, adminId, adminNote);
      return this.applyPriceActions(tx, request, adminId, adminNote);
    });
  }

  /**
   * Price-change approval group — runs inside an already-claimed transaction.
   */
  private async applyPriceActions(
    tx: Prisma.TransactionClient,
    request: ChangeRequestWithItems,
    adminId: number,
    adminNote?: string,
  ) {
      const priceItems = request.items.filter((i) => i.action === ChangeRequestItemAction.CHANGE_PRICE);
      if (priceItems.length === 0) {
        return {};
      }
      let totalDelta = 0;
      const adjustments: { model: string; oldPrice: number; newPrice: number }[] = [];

      for (const priceItem of priceItems) {
        if (!priceItem.invoiceItemId) {
          throw new BadRequestException({ code: 'INVALID_INVOICE_ITEM', message: 'Price change must identify an invoice item' });
        }
        const invoiceItem = await tx.invoiceItem.findUnique({
          where: { id: priceItem.invoiceItemId },
          include: {
            productModel: { select: { name: true } },
            priceAdjustments: {
              orderBy: { createdAt: 'desc' },
              take: 1,
            },
          },
        });
        const typedInvoiceItem = invoiceItem as (Prisma.InvoiceItemGetPayload<{
          include: {
            productModel: { select: { name: true } };
            priceAdjustments: true;
          };
        }> | null);

        if (!typedInvoiceItem) {
          throw new BadRequestException({ code: 'INVALID_INVOICE_ITEM', message: `Invoice item ${priceItem.invoiceItemId} not found` });
        }

        // 4. Read current effective price
        const currentEffectivePrice = typedInvoiceItem.priceAdjustments.length > 0
          ? Number(typedInvoiceItem.priceAdjustments[0].newPrice)
          : Number(typedInvoiceItem.price);

        const newPrice = Number(priceItem.proposedPrice);
        const delta = newPrice - currentEffectivePrice;
        totalDelta += delta;
        adjustments.push({
          model: typedInvoiceItem.productModel.name,
          oldPrice: currentEffectivePrice,
          newPrice,
        });

        // 5. Create InvoicePriceAdjustment
        await tx.invoicePriceAdjustment.create({
          data: {
            invoiceId: request.invoiceId,
            invoiceItemId: priceItem.invoiceItemId,
            requestedById: request.requestedByEmployeeId,
            approvedById: adminId,
            oldPrice: currentEffectivePrice,
            newPrice,
            reason: request.reason,
            requestId: request.id,
          },
        });
      }

      // 6. Update Invoice.currentTotal by the delta
      await tx.invoice.update({
        where: { id: request.invoiceId },
        data: {
          currentTotal: {
            increment: totalDelta,
          },
        },
      });

      // 7. Write InvoiceAuditLog(PRICE_ADJUSTED)
      await tx.invoiceAuditLog.create({
        data: {
          invoiceId: request.invoiceId,
          action: InvoiceAuditAction.PRICE_ADJUSTED,
          employeeId: adminId,
          details: {
            requestId: request.id,
            delta: totalDelta,
            itemsAdjusted: priceItems.length,
            invoiceNumber: request.invoice.invoiceNumber,
            adminNote: adminNote ?? null,
            adjustments,
          },
        },
      });

      // 9. Create approval notification
      await tx.notification.create({
        data: {
          employeeId: request.requestedByEmployeeId,
          type: 'PRICE_CHANGE_APPROVED',
          title: `Price Change Approved`,
          message: `Your price change request on invoice ${request.invoice.invoiceNumber} has been approved. Adjustment: ${totalDelta >= 0 ? '+' : ''}${totalDelta}. Details: ${adjustments.map((a) => `${a.model}: ${a.oldPrice} → ${a.newPrice}`).join(', ')}`,
          payload: {
            invoice: request.invoice.invoiceNumber,
            delta: totalDelta,
            count: priceItems.length,
            itemsSummary: adjustments.map((a) => `${a.model}: ${a.oldPrice} → ${a.newPrice}`).join(', '),
          },
          entityType: 'InvoiceChangeRequest',
          entityId: String(request.id),
        },
      });

      return {
        id: request.id,
        status: 'APPROVED',
        totalDelta,
        itemsAdjusted: priceItems.length,
      };
  }

  private async approveAddItemTransaction(staleRequest: any, adminId: number, adminNote?: string) {
    return this.prisma.$transaction(async (tx) => {
      const request = await this.claimAndReload(tx, staleRequest.id, adminId, adminNote);
      return this.applyAddActions(tx, request, adminId, adminNote, { allowAutoReject: true });
    });
  }

  /**
   * Add-item approval group — runs inside an already-claimed transaction.
   *
   * Phase 1 validates every add-item (model, price, stock) before any mutation,
   * so an insufficient-stock failure never leaves partial reservations.
   * Phase 2 reserves stock, creates InvoiceItem rows, and increments currentTotal.
   *
   * With `allowAutoReject` (add-only requests) an insufficient stock level
   * auto-rejects the request; in a mixed request it fails the whole approval.
   */
  private async applyAddActions(
    tx: Prisma.TransactionClient,
    request: ChangeRequestWithItems,
    adminId: number,
    adminNote?: string,
    opts: { allowAutoReject: boolean } = { allowAutoReject: true },
  ) {
      const addItems = request.items.filter((i) => i.action === ChangeRequestItemAction.ADD_ITEM);
      if (addItems.length === 0) {
        return {};
      }

      type PlannedAdd = {
        addItem: any;
        model: { id: number; name: string; isSerialized: boolean; minStockAlert: number };
        quantity: number;
        price: number;
      };
      const plannedAdds: PlannedAdd[] = [];

      // ── Phase 1: validate all items before mutating anything ──
      for (const addItem of addItems) {
        if (!addItem.productModelId) {
          throw new BadRequestException({ code: 'INVALID_PRODUCT_MODEL', message: 'Add-item request must identify a product model' });
        }
        const model = await tx.productModel.findFirst({
          where: { id: addItem.productModelId, isActive: true, deletedAt: null },
        });

        if (!model) {
          throw new NotFoundException({
            code: 'PRODUCT_MODEL_NOT_FOUND',
            message: `Product model ${addItem.productModelId} not found`,
          });
        }

        const quantity = addItem.quantity;
        if (!quantity || quantity <= 0) {
          throw new BadRequestException({
            code: 'INVALID_QUANTITY',
            message: 'Quantity must be a positive number',
          });
        }

        const price = Number(addItem.proposedPrice);
        if (!Number.isFinite(price) || price < 0) {
          throw new BadRequestException({
            code: 'INVALID_PRICE',
            message: 'Proposed price must be a non-negative number',
          });
        }

        let available: number;
        if (model.isSerialized) {
          const availableCount = await tx.productUnit.count({
            where: { productModelId: model.id, status: ProductUnitStatus.AVAILABLE },
          });
          available = availableCount - model.reservedQuantity;
        } else {
          const lotAgg = await tx.stockLot.aggregate({
            where: { productModelId: model.id, quantityRemaining: { gt: 0 } },
            _sum: { quantityRemaining: true, quantityReserved: true },
          });
          const totalRemaining = Number(lotAgg._sum?.quantityRemaining) || 0;
          const totalReserved = Number(lotAgg._sum?.quantityReserved) || 0;
          available = totalRemaining - totalReserved;
        }

        if (available < quantity) {
          if (opts.allowAutoReject) {
          // Auto-reject the entire request. No stock has been reserved yet,
          // so there is nothing to release.
          const rejectReason = `Auto-rejected: Insufficient stock for ${model.name}. Available: ${available}, requested: ${quantity}`;
          await tx.invoiceChangeRequest.update({
            where: { id: request.id },
            data: {
              status: ChangeRequestStatus.REJECTED,
              reviewedByAdminId: adminId,
              reviewDate: new Date(),
              adminNote: rejectReason,
            },
          });
          await tx.invoiceAuditLog.create({
            data: {
              invoiceId: request.invoiceId,
              action: InvoiceAuditAction.CHANGE_REQUEST_REJECTED,
              employeeId: adminId,
              details: {
                requestId: request.id,
                reason: rejectReason,
                invoiceNumber: request.invoice.invoiceNumber,
                type: request.type,
                model: model.name,
                available,
                requested: quantity,
              },
            },
          });
          await tx.notification.create({
            data: {
              employeeId: request.requestedByEmployeeId,
              type: 'ADD_ITEM_REJECTED',
              title: `Add Item Request Auto-Rejected`,
              message: `Your add-item request on invoice ${request.invoice.invoiceNumber} was auto-rejected due to insufficient stock. Details: ${model.name} — available: ${available}, requested: ${quantity}.`,
              payload: {
                invoice: request.invoice.invoiceNumber,
                model: model.name,
                available,
                requested: quantity,
                reason: rejectReason,
              },
              entityType: 'InvoiceChangeRequest',
              entityId: String(request.id),
            },
          });
          return { id: request.id, status: 'REJECTED', reason: 'Insufficient stock' };
          }
          // Mixed request: fail the whole approval so nothing is applied.
          throw new ConflictException({
            code: 'INSUFFICIENT_STOCK',
            message: `Insufficient stock for ${model.name}. Available: ${available}, requested: ${quantity}`,
          });
        }

        plannedAdds.push({ addItem, model, quantity, price });
      }

      // ── Phase 2: reserve stock, create InvoiceItems, update currentTotal ──
      let totalDelta = 0;

      for (const planned of plannedAdds) {
        const { model, quantity, price } = planned;

        if (model.isSerialized) {
          await tx.productModel.update({
            where: { id: model.id },
            data: { reservedQuantity: { increment: quantity } },
          });
        } else {
          const lots = await tx.stockLot.findMany({
            where: { productModelId: model.id, quantityRemaining: { gt: 0 } },
            orderBy: { receivedDate: 'asc' },
          });
          let remainingToReserve = quantity;
          for (const lot of lots) {
            if (remainingToReserve <= 0) break;
            const availableInLot = lot.quantityRemaining - lot.quantityReserved;
            const toReserve = Math.min(availableInLot, remainingToReserve);
            if (toReserve > 0) {
              await tx.stockLot.update({
                where: { id: lot.id },
                data: { quantityReserved: { increment: toReserve } },
              });
              remainingToReserve = roundQuantity(remainingToReserve - toReserve);
            }
          }
          if (remainingToReserve > 0) {
            // Should not happen after Phase 1, but guard against races.
            throw new ConflictException({
              code: 'INSUFFICIENT_STOCK',
              message: `Insufficient stock for ${model.name} during reservation`,
            });
          }
        }

        // Create the missing InvoiceItem row (ISS-001)
        await tx.invoiceItem.create({
          data: {
            invoiceId: request.invoiceId,
            productModelId: model.id,
            quantity,
            price,
          },
        });

        totalDelta += price * quantity;
      }

      // Increment currentTotal by Σ proposedPrice × quantity (ISS-001)
      if (totalDelta !== 0) {
        await tx.invoice.update({
          where: { id: request.invoiceId },
          data: { currentTotal: { increment: totalDelta } },
        });
      }

      // Write InvoiceAuditLog(ITEM_ADDED)
      const addedItems = plannedAdds.map((planned) => ({
        model: planned.model.name,
        quantity: planned.quantity,
        price: planned.price,
      }));
      await tx.invoiceAuditLog.create({
        data: {
          invoiceId: request.invoiceId,
          action: InvoiceAuditAction.ITEM_ADDED,
          employeeId: adminId,
          details: {
            requestId: request.id,
            itemsAdded: addItems.length,
            totalDelta,
            invoiceNumber: request.invoice.invoiceNumber,
            adminNote: adminNote ?? null,
            items: addedItems,
          },
        },
      });

      await tx.invoiceChangeRequest.update({
        where: { id: request.id },
        data: {
          status: ChangeRequestStatus.APPROVED,
          reviewedByAdminId: adminId,
          reviewDate: new Date(),
          adminNote,
        },
      });

      // Create approval notification
      await tx.notification.create({
        data: {
          employeeId: request.requestedByEmployeeId,
          type: 'ADD_ITEM_APPROVED',
          title: `Add Item Approved`,
          message: `Your add-item request on invoice ${request.invoice.invoiceNumber} has been approved. ${addItems.length} item(s) added. Details: ${addedItems.map((i) => `${i.model} × ${i.quantity} @ ${i.price}`).join(', ')}`,
          payload: {
            invoice: request.invoice.invoiceNumber,
            count: addItems.length,
            total: totalDelta,
            itemsSummary: addedItems.map((i) => `${i.model} × ${i.quantity} @ ${i.price}`).join(', '),
          },
          entityType: 'InvoiceChangeRequest',
          entityId: String(request.id),
        },
      });

      // Recalculate low-stock state using productModelId (ISS-002)
      for (const planned of plannedAdds) {
        const productModelId = planned.model.id;
        const { isSerialized, name, minStockAlert } = planned.model;

        let available: number;
        if (isSerialized) {
          available = await tx.productUnit.count({
            where: { productModelId, status: ProductUnitStatus.AVAILABLE },
          });
        } else {
          const lotAgg = await tx.stockLot.aggregate({
            where: { productModelId },
            _sum: { quantityRemaining: true, quantityReserved: true },
          });
          available =
            (Number(lotAgg._sum?.quantityRemaining) || 0) -
            (Number(lotAgg._sum?.quantityReserved) || 0);
        }

        if (available <= minStockAlert) {
          await this.notificationsService.createLowStockNotification(
            productModelId,
            name,
            available,
            minStockAlert,
          );
        } else {
          await this.notificationsService.resolveLowStockNotification(productModelId);
        }
      }

      return {
        id: request.id,
        status: 'APPROVED',
        itemsAdded: addItems.length,
        totalDelta,
      };
  }
}
