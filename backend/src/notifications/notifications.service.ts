import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationType, Prisma } from '@prisma/client';

export type NotificationDetails = Record<string, string | number | null | undefined>;

@Injectable()
export class NotificationsService {
  constructor(private prisma: PrismaService) {}

  private buildPayload(details?: NotificationDetails): Prisma.InputJsonValue | undefined {
    if (!details) return undefined;
    const payload: Record<string, string | number> = {};
    for (const [key, value] of Object.entries(details)) {
      if (value !== undefined && value !== null && value !== '') {
        payload[key] = value;
      }
    }
    return Object.keys(payload).length > 0 ? payload : undefined;
  }

  private detailsSentence(details?: NotificationDetails): string {
    if (!details) return '';
    const parts: string[] = [];
    if (details.model) parts.push(String(details.model));
    if (details.quantity !== undefined && details.quantity !== null) parts.push(`${details.quantity} units`);
    if (details.supplier) parts.push(`supplier: ${details.supplier}`);
    if (details.customer) parts.push(`customer: ${details.customer}`);
    if (details.itemCount !== undefined && details.itemCount !== null) parts.push(`${details.itemCount} item(s)`);
    if (details.total !== undefined && details.total !== null) parts.push(`total: ${details.total}`);
    if (details.refund !== undefined && details.refund !== null) parts.push(`refund: ${details.refund}`);
    if (details.delta !== undefined && details.delta !== null) {
      parts.push(`adjustment: ${Number(details.delta) >= 0 ? '+' : ''}${details.delta}`);
    }
    if (details.itemsSummary) parts.push(String(details.itemsSummary));
    if (details.reason) parts.push(`reason: ${details.reason}`);
    return parts.length > 0 ? ` Details: ${parts.join(', ')}.` : '';
  }

  async createLowStockNotification(
    productModelId: number,
    modelName: string,
    availableCount: number,
    minStockAlert: number,
  ) {
    const dedupeKey = `LOW_STOCK:PRODUCT_MODEL:${productModelId}`;
    const details = { model: modelName, available: availableCount, threshold: minStockAlert };

    const admins = await this.prisma.employee.findMany({
      where: { role: 'ADMIN', isActive: true, deletedAt: null },
      select: { id: true },
    });

    for (const admin of admins) {
      await this.prisma.notification.upsert({
        where: {
          employeeId_dedupeKey: {
            employeeId: admin.id,
            dedupeKey,
          },
        },
        update: {
          resolvedAt: null,
          isRead: false,
          message: `Low stock: ${modelName} has ${availableCount} units available (threshold: ${minStockAlert})`,
          payload: this.buildPayload(details),
        },
        create: {
          employeeId: admin.id,
          type: NotificationType.LOW_STOCK,
          title: `Low Stock Alert: ${modelName}`,
          message: `Low stock: ${modelName} has ${availableCount} units available (threshold: ${minStockAlert})`,
          payload: this.buildPayload(details),
          entityType: 'ProductModel',
          entityId: String(productModelId),
          dedupeKey,
          isRead: false,
        },
      });
    }
  }

  async resolveLowStockNotification(productModelId: number) {
    const dedupeKey = `LOW_STOCK:PRODUCT_MODEL:${productModelId}`;

    await this.prisma.notification.updateMany({
      where: {
        dedupeKey,
        resolvedAt: null,
      },
      data: {
        resolvedAt: new Date(),
      },
    });
  }

  async notifyInvoicePendingReview(
    invoiceId: number,
    invoiceNumber: string,
    details?: { customer?: string; total?: number; itemCount?: number },
  ) {
    const payloadDetails = { invoice: invoiceNumber, ...details };
    const employees = await this.prisma.employee.findMany({
      where: { role: { in: ['ADMIN', 'ACCOUNTANT'] }, isActive: true, deletedAt: null },
      select: { id: true },
    });

    for (const emp of employees) {
      await this.prisma.notification.upsert({
        where: {
          employeeId_dedupeKey: {
            employeeId: emp.id,
            dedupeKey: `INVOICE_PENDING_REVIEW:${invoiceId}`,
          },
        },
        update: { resolvedAt: null, isRead: false, payload: this.buildPayload(payloadDetails) },
        create: {
          employeeId: emp.id,
          type: NotificationType.INVOICE_PENDING_REVIEW,
          title: `Invoice Pending Review`,
          message: `Invoice ${invoiceNumber} is waiting for your review.${this.detailsSentence(details)}`,
          payload: this.buildPayload(payloadDetails),
          entityType: 'Invoice',
          entityId: String(invoiceId),
          dedupeKey: `INVOICE_PENDING_REVIEW:${invoiceId}`,
          isRead: false,
        },
      });
    }
  }

  async notifyInvoiceRejected(
    invoiceId: number,
    invoiceNumber: string,
    salesEmployeeId: number,
    reason: string,
    details?: { customer?: string; total?: number; itemCount?: number },
  ) {
    const dedupeKey = `INVOICE_REJECTED:${invoiceId}`;
    const payloadDetails = { invoice: invoiceNumber, reason, ...details };

    await this.prisma.notification.upsert({
      where: {
        employeeId_dedupeKey: {
          employeeId: salesEmployeeId,
          dedupeKey,
        },
      },
      update: { resolvedAt: null, isRead: false, payload: this.buildPayload(payloadDetails) },
      create: {
        employeeId: salesEmployeeId,
        type: NotificationType.INVOICE_REJECTED,
        title: `Invoice Rejected`,
        message: `Invoice ${invoiceNumber} has been rejected. Reason: ${reason}.${this.detailsSentence(details)}`,
        payload: this.buildPayload(payloadDetails),
        entityType: 'Invoice',
        entityId: String(invoiceId),
        dedupeKey,
        isRead: false,
      },
    });
  }

  async notifyInvoiceConfirmed(
    invoiceId: number,
    invoiceNumber: string,
    salesEmployeeId: number,
    details?: { customer?: string; total?: number; itemCount?: number },
  ) {
    const payloadDetails = { invoice: invoiceNumber, ...details };
    const employees = await this.prisma.employee.findMany({
      where: { OR: [{ id: salesEmployeeId }, { role: { in: ['ADMIN', 'INVENTORY'] } }], isActive: true, deletedAt: null },
      select: { id: true },
    });

    const uniqueEmployees = Array.from(new Map(employees.map((e) => [e.id, e])).values());

    for (const emp of uniqueEmployees) {
      await this.prisma.notification.upsert({
        where: {
          employeeId_dedupeKey: {
            employeeId: emp.id,
            dedupeKey: `INVOICE_CONFIRMED:${invoiceId}`,
          },
        },
        update: { resolvedAt: null, isRead: false, payload: this.buildPayload(payloadDetails) },
        create: {
          employeeId: emp.id,
          type: NotificationType.INVOICE_CONFIRMED,
          title: `Invoice Confirmed`,
          message: `Invoice ${invoiceNumber} has been confirmed and is ready for delivery.${this.detailsSentence(details)}`,
          payload: this.buildPayload(payloadDetails),
          entityType: 'Invoice',
          entityId: String(invoiceId),
          dedupeKey: `INVOICE_CONFIRMED:${invoiceId}`,
          isRead: false,
        },
      });
    }
  }

  async resolveDeliveryNotification(invoiceId: number) {
    const dedupeKey = `DELIVERY_PENDING:${invoiceId}`;
    await this.prisma.notification.updateMany({
      where: { dedupeKey, resolvedAt: null },
      data: { resolvedAt: new Date() },
    });
  }

  async notifyStockPendingPricing(
    receiptId: number,
    details?: { model?: string; quantity?: number; supplier?: string; receivingType?: string },
  ) {
    const payloadDetails = { receipt: String(receiptId), ...details };
    const admins = await this.prisma.employee.findMany({
      where: { role: 'ADMIN', isActive: true, deletedAt: null },
      select: { id: true },
    });

    for (const admin of admins) {
      await this.prisma.notification.upsert({
        where: {
          employeeId_dedupeKey: {
            employeeId: admin.id,
            dedupeKey: `STOCK_PENDING_PRICING:${receiptId}`,
          },
        },
        update: { resolvedAt: null, isRead: false, payload: this.buildPayload(payloadDetails) },
        create: {
          employeeId: admin.id,
          type: NotificationType.STOCK_PENDING_PRICING,
          title: `Stock Receipt Pending Pricing`,
          message: `Stock receipt #${receiptId} is waiting for pricing.${this.detailsSentence(details)}`,
          payload: this.buildPayload(payloadDetails),
          entityType: 'StockReceipt',
          entityId: String(receiptId),
          dedupeKey: `STOCK_PENDING_PRICING:${receiptId}`,
          isRead: false,
        },
      });
    }
  }

  async resolveStockPricingNotification(receiptId: number) {
    const dedupeKey = `STOCK_PENDING_PRICING:${receiptId}`;
    await this.prisma.notification.updateMany({
      where: { dedupeKey, resolvedAt: null },
      data: { resolvedAt: new Date() },
    });
  }

  async findAll(employeeId: number, params: {
    unreadOnly?: boolean;
    page?: number;
    limit?: number;
  }) {
    const { unreadOnly, page = 1, limit = 25 } = params;
    const skip = (page - 1) * limit;

    const where: Prisma.NotificationWhereInput = {
      employeeId,
      type: { not: NotificationType.DELIVERY_PENDING },
      ...(unreadOnly && { isRead: false, resolvedAt: null }),
    };

    const [data, total] = await Promise.all([
      this.prisma.notification.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.notification.count({ where }),
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

  async getUnreadCount(employeeId: number) {
    const count = await this.prisma.notification.count({
      where: {
        employeeId,
        isRead: false,
        resolvedAt: null,
        type: { not: NotificationType.DELIVERY_PENDING },
      },
    });

    return { count };
  }

  async markAsRead(notificationId: number, employeeId: number) {
    return this.prisma.notification.updateMany({
      where: {
        id: notificationId,
        employeeId,
      },
      data: {
        isRead: true,
      },
    });
  }

  async markAllAsRead(employeeId: number) {
    return this.prisma.notification.updateMany({
      where: {
        employeeId,
        isRead: false,
      },
      data: {
        isRead: true,
      },
    });
  }
}
