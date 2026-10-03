import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ReportsService } from '../reports/reports.service';

@Injectable()
export class DashboardService {
  constructor(
    private prisma: PrismaService,
    private reportsService: ReportsService,
  ) {}

  async getSummary(from?: string, to?: string, employeeId?: number) {
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const resolvedFrom = from || startOfMonth.toISOString().slice(0, 10);
    const resolvedTo = to || now.toISOString().slice(0, 10);

    const baseSummary = await this.reportsService.computeDashboardSummary(resolvedFrom, resolvedTo, employeeId);

    const pendingInvoiceReviewsCount = await this.prisma.invoice.count({
      where: { status: 'PENDING_ACCOUNTANT' },
    });

    const pendingDeliveriesCount = await this.prisma.invoice.count({
      where: { status: 'CONFIRMED' },
    });

    const pendingCogsInvoicesCount = await this.prisma.invoiceItem.groupBy({
      by: ['invoiceId'],
      where: {
        invoice: { status: { in: ['CONFIRMED', 'DELIVERED'] } },
        cogsStatus: 'PENDING',
      },
    });

    return {
      ...baseSummary,
      pendingInvoiceReviewsCount,
      pendingDeliveriesCount,
      pendingCogsInvoicesCount: pendingCogsInvoicesCount.length,
    };
  }

  async getRecentActivity(limit = 20) {
    const recentInvoices = await this.prisma.invoice.findMany({
      take: limit,
      orderBy: { date: 'desc' },
      select: {
        id: true,
        invoiceNumber: true,
        currentTotal: true,
        status: true,
        date: true,
        employee: { select: { name: true } },
      },
    });

    const recentApprovals = await this.prisma.invoiceChangeRequest.findMany({
      take: limit,
      where: { status: 'PENDING' },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        type: true,
        reason: true,
        createdAt: true,
        requestedBy: { select: { name: true } },
        invoice: { select: { invoiceNumber: true } },
      },
    });

    return { recentInvoices, recentApprovals };
  }
}
