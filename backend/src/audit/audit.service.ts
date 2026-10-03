import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { InvoiceAuditAction, ProductUnitAuditAction, StockReceiptStatus, Role } from '@prisma/client';

const INVOICE_ACTIONS = new Set<string>(Object.values(InvoiceAuditAction));
const PU_ACTIONS = new Set<string>(Object.values(ProductUnitAuditAction));

function partitionAction(action?: string) {
  if (!action) return { wantInvoice: true, wantPu: true, wantStock: true };
  return {
    wantInvoice: INVOICE_ACTIONS.has(action),
    wantPu: PU_ACTIONS.has(action),
    wantStock: action === 'RECEIVED' || action === 'PRICED',
  };
}

@Injectable()
export class AuditService {
  constructor(private prisma: PrismaService) {}

  async getInvoiceAuditLog(invoiceId: number, user?: { sub: number; role: string }) {
    const invoice = await this.prisma.invoice.findUnique({
        where: { id: invoiceId },
        select: { employeeId: true, status: true },
      });
    if (!invoice) {
      throw new NotFoundException({ code: 'INVOICE_NOT_FOUND', message: 'Invoice not found' });
    }
    if (user?.role === Role.SALES && invoice.employeeId !== user.sub) {
      throw new ForbiddenException({ code: 'FORBIDDEN_RESOURCE', message: 'You cannot access this invoice audit' });
    }
    if (
      user?.role === Role.INVENTORY &&
      invoice.status !== 'CONFIRMED' &&
      invoice.status !== 'DELIVERED'
    ) {
      throw new ForbiddenException({ code: 'FORBIDDEN_RESOURCE', message: 'You cannot access this invoice audit' });
    }
    return this.prisma.invoiceAuditLog.findMany({
      where: { invoiceId },
      include: { employee: { select: { id: true, name: true, role: true } } },
      orderBy: { timestamp: 'desc' },
    });
  }

  async findAll(params: {
    employeeId?: number;
    action?: string;
    startDate?: string;
    endDate?: string;
    page?: number;
    limit?: number;
  }) {
    const { employeeId, action, startDate, endDate, page = 1, limit: rawLimit = 50 } = params;
    const limit = Math.max(1, rawLimit);
    const skip = (page - 1) * limit;

    const dateFilter: any = {};
    if (startDate) dateFilter.gte = new Date(startDate);
    if (endDate) {
      const end = new Date(endDate);
      end.setUTCHours(23, 59, 59, 999);
      dateFilter.lte = end;
    }
    const hasDateFilter = !!startDate || !!endDate;
    const { wantInvoice, wantPu, wantStock } = partitionAction(action);

    const queries: Promise<any>[] = [];

    // --- InvoiceAuditLog ---
    if (wantInvoice) {
      const invoiceWhere: any = {};
      if (employeeId) invoiceWhere.employeeId = employeeId;
      if (hasDateFilter) invoiceWhere.timestamp = dateFilter;
      if (action) invoiceWhere.action = action;

      queries.push(
        this.prisma.invoiceAuditLog.findMany({
          where: invoiceWhere,
          include: {
            employee: { select: { id: true, name: true, role: true } },
            invoice: { select: { id: true, invoiceNumber: true } },
          },
          orderBy: { timestamp: 'desc' },
        })
      );
    } else {
      queries.push(Promise.resolve([]));
    }

    // --- ProductUnitAuditLog ---
    if (wantPu) {
      const puWhere: any = {};
      if (employeeId) puWhere.employeeId = employeeId;
      if (hasDateFilter) puWhere.timestamp = dateFilter;
      if (action) puWhere.action = action;

      queries.push(
        this.prisma.productUnitAuditLog.findMany({
          where: puWhere,
          include: {
            employee: { select: { id: true, name: true, role: true } },
            productUnit: { select: { id: true, barcode: true, productModel: { select: { id: true, name: true } } } },
            invoice: { select: { id: true, invoiceNumber: true } },
          },
          orderBy: { timestamp: 'desc' },
        })
      );
    } else {
      queries.push(Promise.resolve([]));
    }

    // --- StockReceipt ---
    if (wantStock) {
      const stockWhere: any = {};
      if (employeeId) {
        stockWhere.OR = [{ employeeId }, { pricedByEmployeeId: employeeId }];
      }
      if (hasDateFilter) stockWhere.date = dateFilter;

      queries.push(
        this.prisma.stockReceipt.findMany({
          where: stockWhere,
          include: {
            employee: { select: { id: true, name: true } },
            pricedBy: { select: { id: true, name: true, role: true } },
            supplier: { select: { id: true, name: true } },
            items: {
              select: {
                productUnit: {
                  select: {
                    barcode: true,
                    productModel: { select: { name: true } },
                  },
                },
              },
            },
            stockLots: {
              select: {
                quantityReceived: true,
                productModel: { select: { name: true } },
              },
            },
          },
          orderBy: { date: 'desc' },
        })
      );
    } else {
      queries.push(Promise.resolve([]));
    }

    const [invoiceLogs, puLogs, stockReceipts] = await Promise.all(queries);

    const wantReceived = !action || action === 'RECEIVED';
    const wantPriced = !action || action === 'PRICED';

    const receiptModels = (r: any): { models: string[]; quantity: number } => {
      const counts = new Map<string, number>();
      for (const item of r.items ?? []) {
        const name = item.productUnit?.productModel?.name ?? 'Unknown';
        counts.set(name, (counts.get(name) ?? 0) + 1);
      }
      let quantity = 0;
      for (const lot of r.stockLots ?? []) {
        const name = lot.productModel?.name ?? 'Unknown';
        const qty = Number(lot.quantityReceived ?? 0);
        counts.set(name, (counts.get(name) ?? 0) + qty);
        quantity += qty;
      }
      if (quantity === 0) quantity = r.items?.length ?? 0;
      const models = [...counts.entries()].map(([name, count]) => `${name} × ${count}`);
      return { models, quantity };
    };

    const normalized: any[] = [
      ...invoiceLogs.map((l: any) => ({
        id: l.id,
        source: 'invoice' as const,
        timestamp: l.timestamp,
        employee: l.employee,
        action: l.action,
        invoiceId: l.invoiceId,
        invoice: l.invoice,
        details: l.details,
      })),
      ...puLogs.map((l: any) => ({
        id: l.id + 1_000_000_000,
        source: 'product_unit' as const,
        timestamp: l.timestamp,
        employee: l.employee,
        action: l.action,
        invoiceId: l.invoiceId,
        invoice: l.invoice,
        details: {
          ...(l.notes ? { notes: l.notes } : {}),
          ...(l.metadata && typeof l.metadata === 'object' ? l.metadata : {}),
        },
        productUnit: l.productUnit,
      })),
    ];

    for (const r of stockReceipts) {
      const { models, quantity } = receiptModels(r);
      if (wantReceived) {
        normalized.push({
          id: 2_000_000_000 + r.id * 2,
          source: 'stock_receipt' as const,
          timestamp: r.date,
          employee: r.employee,
          action: 'RECEIVED',
          invoiceId: null,
          invoice: null,
          details: {
            supplierId: r.supplierId,
            supplierName: r.supplier?.name,
            status: r.status,
            receiptId: r.id,
            quantity,
            models,
          },
          stockReceipt: { id: r.id, status: r.status },
        });
      }
      if (wantPriced && r.status === StockReceiptStatus.PRICED && r.pricedAt && r.pricedBy) {
        normalized.push({
          id: 2_000_000_000 + r.id * 2 + 1,
          source: 'stock_receipt' as const,
          timestamp: r.pricedAt,
          employee: r.pricedBy,
          action: 'PRICED',
          invoiceId: null,
          invoice: null,
          details: {
            supplierId: r.supplierId,
            supplierName: r.supplier?.name,
            receiptId: r.id,
            quantity,
            models,
          },
          stockReceipt: { id: r.id, status: r.status },
        });
      }
    }

    normalized.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

    const total = normalized.length;
    const paginated = normalized.slice(skip, skip + limit);

    return {
      data: paginated,
      meta: { page, limit, total, totalPages: Math.ceil(total / limit) },
    };
  }
}
