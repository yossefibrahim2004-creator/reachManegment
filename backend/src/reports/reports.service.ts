import { Injectable, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Prisma } from '@prisma/client';
import {
  ReportRange,
  ExpensesReportResponse,
  RevenueReportResponse,
  NetProfitReportResponse,
  EmployeeSalesReportResponse,
  ProductSalesReportResponse,
  ReturnsReportResponse,
  CustomerReportResponse,
  SupplierReportResponse,
  ExpenseDetailResponse,
  EmployeeSalesDetailResponse,
  ProductSalesDetailResponse,
  ReturnsDetailResponse,
  CustomerReportDetailResponse,
  SupplierReportDetailResponse,
  InventoryReportResponse,
  InventoryReportRow,
} from './reports.types';

@Injectable()
export class ReportsService {
  constructor(private prisma: PrismaService) {}

  private parseAndValidateDateRange(from: string, to: string): { start: Date; end: Date } {
    if (!from || !to) {
      throw new BadRequestException('from and to date parameters are required');
    }
    const start = new Date(from);
    const end = new Date(to);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
      throw new BadRequestException('Invalid date format. Use YYYY-MM-DD');
    }
    if (start > end) {
      throw new BadRequestException('from date must not be after to date');
    }
    const inclusiveEnd = new Date(end);
    inclusiveEnd.setUTCDate(inclusiveEnd.getUTCDate() + 1);
    return { start, end: inclusiveEnd };
  }

  private buildRange(from: string, to: string): ReportRange {
    return { from, to };
  }

  // ─── Shared revenue aggregation (used by computeRevenue AND computeNetProfit) ───

  async privateComputeRevenueData(start: Date, end: Date) {
    const completedSalesInvoice = { status: 'DELIVERED' as any };

    const [grossItems, adjustmentsResult, returnsResult, invoiceCount] = await Promise.all([
      this.prisma.invoiceItem.findMany({
        where: { invoice: { date: { gte: start, lt: end }, ...completedSalesInvoice } },
        select: { price: true, quantity: true },
      }),
      this.prisma.invoicePriceAdjustment.aggregate({
        where: {
          createdAt: { gte: start, lt: end },
          invoice: completedSalesInvoice,
        },
        _sum: { newPrice: true, oldPrice: true },
      }),
      this.prisma.invoiceReturnItem.aggregate({
        where: {
          invoiceReturn: {
            createdAt: { gte: start, lt: end },
            invoice: completedSalesInvoice,
          },
        },
        _sum: { refundAmount: true },
      }),
      this.prisma.invoice.count({
        where: { date: { gte: start, lt: end }, ...completedSalesInvoice },
      }),
    ]);

    const originalSales = grossItems.reduce(
      (total, item) => total + Number(item.price) * item.quantity,
      0,
    );
    const adjNew = Number(adjustmentsResult._sum?.newPrice) || 0;
    const adjOld = Number(adjustmentsResult._sum?.oldPrice) || 0;
    const approvedAdjustments = adjNew - adjOld;
    const approvedReturns = Number(returnsResult._sum?.refundAmount) || 0;
    const netSales = originalSales + approvedAdjustments - approvedReturns;

    return { originalSales, approvedAdjustments, approvedReturns, netSales, invoiceCount };
  }

  // ─── Shared expenses aggregation (used by computeExpenses AND computeNetProfit) ───

  async privateComputeExpensesData(start: Date, end: Date, categoryId?: number) {
    const where: any = { date: { gte: start, lt: end }, deletedAt: null };
    if (categoryId) {
      where.categoryId = categoryId;
    }

    const result = await this.prisma.expense.aggregate({
      where,
      _sum: { amount: true },
      _count: true,
    });

    return {
      totalExpenses: Number(result._sum?.amount) || 0,
      totalCount: result._count,
    };
  }

  // ─── 2.2 Revenue Report ───

  async computeRevenue(from: string, to: string): Promise<RevenueReportResponse> {
    const { start, end } = this.parseAndValidateDateRange(from, to);

    const { originalSales, approvedAdjustments, approvedReturns, netSales, invoiceCount } =
      await this.privateComputeRevenueData(start, end);

    // Group by day
    const [grossByDay, adjByDay, retByDay] = await Promise.all([
      this.prisma.$queryRaw`
        SELECT DATE_TRUNC('day', i."date") AS "day",
               COALESCE(SUM(ii."price" * ii."quantity")::numeric, 0)::float AS "total"
        FROM "InvoiceItem" ii
        JOIN "Invoice" i ON i."id" = ii."invoiceId"
        WHERE i."date" >= ${start} AND i."date" < ${end}
          AND i."status" = 'DELIVERED'
        GROUP BY DATE_TRUNC('day', i."date")
        ORDER BY "day" ASC
      `,
      this.prisma.$queryRaw`
        SELECT DATE_TRUNC('day', ipa."createdAt") AS "day",
               COALESCE(SUM(ipa."newPrice" - ipa."oldPrice")::numeric, 0)::float AS "total"
        FROM "InvoicePriceAdjustment" ipa
        JOIN "Invoice" i ON i."id" = ipa."invoiceId"
        WHERE ipa."createdAt" >= ${start} AND ipa."createdAt" < ${end}
          AND i."status" = 'DELIVERED'
        GROUP BY DATE_TRUNC('day', ipa."createdAt")
        ORDER BY "day" ASC
      `,
      this.prisma.$queryRaw`
        SELECT DATE_TRUNC('day', ir."createdAt") AS "day",
               COALESCE(SUM(iri."refundAmount")::numeric, 0)::float AS "total"
        FROM "InvoiceReturnItem" iri
        JOIN "InvoiceReturn" ir ON ir."id" = iri."invoiceReturnId"
        JOIN "Invoice" i ON i."id" = ir."invoiceId"
        WHERE ir."createdAt" >= ${start} AND ir."createdAt" < ${end}
          AND i."status" = 'DELIVERED'
        GROUP BY DATE_TRUNC('day', ir."createdAt")
        ORDER BY "day" ASC
      `,
    ]);

    const dayMap = new Map<string, number>();
    for (const row of grossByDay as any[]) {
      const key = this.formatDay(row.day);
      dayMap.set(key, (dayMap.get(key) || 0) + row.total);
    }
    for (const row of adjByDay as any[]) {
      const key = this.formatDay(row.day);
      dayMap.set(key, (dayMap.get(key) || 0) + row.total);
    }
    for (const row of retByDay as any[]) {
      const key = this.formatDay(row.day);
      dayMap.set(key, (dayMap.get(key) || 0) - row.total);
    }

    const byDay = Array.from(dayMap.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, total]) => ({ date, total }));

    return {
      originalSales,
      approvedAdjustments,
      approvedReturns,
      netSales,
      invoiceCount,
      byDay,
      range: this.buildRange(from, to),
    };
  }

  private formatDay(date: Date): string {
    const d = new Date(date);
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
  }

  // ─── 2.1 Expenses Report ───

  async computeExpenses(
    from: string,
    to: string,
    categoryId?: number,
    page = 1,
    limit = 25,
  ): Promise<ExpensesReportResponse> {
    const { start, end } = this.parseAndValidateDateRange(from, to);

    const where: any = { date: { gte: start, lt: end }, deletedAt: null };
    if (categoryId) {
      where.categoryId = categoryId;
    }

    const [grouped, grandTotalResult] = await Promise.all([
      this.prisma.expense.groupBy({
        by: ['categoryId'],
        where,
        _sum: { amount: true },
        _count: true,
        orderBy: { _sum: { amount: 'desc' } },
      }),
      this.prisma.expense.aggregate({
        where,
        _sum: { amount: true },
      }),
    ]);

    const totalExpenses = Number(grandTotalResult._sum?.amount) || 0;

    const categoryIds = grouped.map((g) => g.categoryId);
    const categories = await this.prisma.expenseCategory.findMany({
      where: { id: { in: categoryIds } },
      select: { id: true, name: true },
    });
    const categoryMap = new Map(categories.map((c) => [c.id, c.name]));

    const allRows = grouped.map((g) => ({
      categoryId: g.categoryId,
      categoryName: categoryMap.get(g.categoryId) || 'Unknown',
      total: Number(g._sum?.amount) || 0,
      count: g._count,
      sharePercent: totalExpenses > 0
        ? Math.round(((Number(g._sum?.amount) || 0) / totalExpenses) * 10000) / 100
        : 0,
    }));

    const totalCount = allRows.length;
    const totalPages = Math.ceil(totalCount / limit) || 1;
    const safePage = Math.max(1, Math.min(page, totalPages));
    const offset = (safePage - 1) * limit;
    const items = allRows.slice(offset, offset + limit);

    return {
      items,
      totalExpenses,
      totalCount,
      range: this.buildRange(from, to),
      meta: { page: safePage, limit, total: totalCount, totalPages },
    };
  }

  // ─── 2.3 Net Profit Report ───

  async computeNetProfit(from: string, to: string): Promise<NetProfitReportResponse> {
    const { start, end } = this.parseAndValidateDateRange(from, to);

    const completedSalesInvoice = { status: 'DELIVERED' as any };

    const [revenueData, expensesData, cogsResult, serializedCogsResult, pendingCogsInvoices, returnedCogsResult] = await Promise.all([
      this.privateComputeRevenueData(start, end),
      this.privateComputeExpensesData(start, end),
      this.prisma.stockConsumption.aggregate({
        where: {
          invoiceItem: { invoice: { date: { gte: start, lt: end }, ...completedSalesInvoice } },
        },
        _sum: { totalCost: true },
      }),
      this.prisma.invoiceItem.aggregate({
        where: {
          invoice: { date: { gte: start, lt: end }, ...completedSalesInvoice },
          productModel: { isSerialized: true },
          cogsStatus: 'FINAL',
          costAtSale: { not: null },
        },
        _sum: { costAtSale: true },
      }),
      this.prisma.invoiceItem.groupBy({
        by: ['invoiceId'],
        where: {
          invoice: { date: { gte: start, lt: end }, ...completedSalesInvoice },
          cogsStatus: 'PENDING',
        },
      }),
      this.prisma.$queryRaw<{ total: number | null }[]>`
        SELECT COALESCE(SUM(ii."costAtSale"), 0)::float AS "total"
        FROM "InvoiceReturnItem" iri
        JOIN "InvoiceReturn" ir ON ir."id" = iri."invoiceReturnId"
        JOIN "InvoiceItem" ii ON ii."id" = iri."invoiceItemId"
        JOIN "Invoice" i ON i."id" = ii."invoiceId"
        WHERE ir."createdAt" >= ${start} AND ir."createdAt" < ${end}
          AND i."status" = 'DELIVERED'
      `,
    ]);

    const nonSerializedCogs = Number(cogsResult._sum?.totalCost) || 0;
    const serializedCogs = Number(serializedCogsResult._sum?.costAtSale) || 0;
    const returnedCogs = Number(returnedCogsResult[0]?.total) || 0;
    const cogs = nonSerializedCogs + serializedCogs - returnedCogs;

    return {
      netSales: revenueData.netSales,
      totalExpenses: expensesData.totalExpenses,
      cogs,
      netProfit: revenueData.netSales - expensesData.totalExpenses - cogs,
      pendingCogsInvoicesCount: pendingCogsInvoices.length,
      range: this.buildRange(from, to),
    };
  }

  // ─── 2.4 Employee Sales Report ───

  async computeEmployeesSales(
    from: string,
    to: string,
    employeeId?: number,
    page = 1,
    limit = 25,
  ): Promise<EmployeeSalesReportResponse> {
    const { start, end } = this.parseAndValidateDateRange(from, to);

    const invoiceFilter: any = { date: { gte: start, lt: end }, status: 'DELIVERED' };
    if (employeeId) {
      invoiceFilter.employeeId = employeeId;
    }

    const returnFilter: any = { createdAt: { gte: start, lt: end } };
    if (employeeId) {
      returnFilter.invoice = { employeeId };
    }

    const [invoiceItems, returnItems, invoiceCounts] = await Promise.all([
      this.prisma.invoiceItem.findMany({
        where: { invoice: invoiceFilter },
        select: {
          price: true,
          quantity: true,
          invoice: { select: { employeeId: true } },
        },
      }),
      this.prisma.invoiceReturnItem.findMany({
        where: { invoiceReturn: returnFilter },
        select: {
          refundAmount: true,
          invoiceReturn: {
            select: { invoice: { select: { employeeId: true } } },
          },
        },
      }),
      this.prisma.invoice.groupBy({
        by: ['employeeId'],
        where: invoiceFilter,
        _count: true,
      }),
    ]);

    const employeeMap = new Map<number, { grossSales: number; returns: number }>();

    for (const item of invoiceItems) {
      const empId = item.invoice.employeeId;
      const existing = employeeMap.get(empId) || { grossSales: 0, returns: 0 };
      const quantity = item.quantity || 1;
      existing.grossSales += Number(item.price) * quantity;
      employeeMap.set(empId, existing);
    }

    for (const item of returnItems) {
      const empId = item.invoiceReturn.invoice.employeeId;
      const existing = employeeMap.get(empId) || { grossSales: 0, returns: 0 };
      existing.returns += Number(item.refundAmount);
      employeeMap.set(empId, existing);
    }

    const countMap = new Map(invoiceCounts.map((c) => [c.employeeId, c._count]));

    const employeeIds = Array.from(employeeMap.keys());
    const employees = await this.prisma.employee.findMany({
      where: { id: { in: employeeIds } },
      select: { id: true, name: true },
    });
    const nameMap = new Map(employees.map((e) => [e.id, e.name]));

    const allRows = Array.from(employeeMap.entries()).map(([empId, data]) => ({
      employeeId: empId,
      employeeName: nameMap.get(empId) || 'Unknown',
      invoiceCount: countMap.get(empId) || 0,
      grossSales: data.grossSales,
      returns: data.returns,
      netSales: data.grossSales - data.returns,
    }));

    allRows.sort((a, b) => b.netSales - a.netSales);

    const total = allRows.length;
    const totalPages = Math.ceil(total / limit) || 1;
    const safePage = Math.max(1, Math.min(page, totalPages));
    const offset = (safePage - 1) * limit;
    const items = allRows.slice(offset, offset + limit);

    return {
      items,
      range: this.buildRange(from, to),
      meta: { page: safePage, limit, total, totalPages },
    };
  }

  // ─── 2.5 Product Sales Report ───

  async computeProductsSales(
    from: string,
    to: string,
    categoryId?: number,
    productModelId?: number,
    page = 1,
    limit = 25,
  ): Promise<ProductSalesReportResponse> {
    const { start, end } = this.parseAndValidateDateRange(from, to);

    const soldWhere: any = { invoice: { date: { gte: start, lt: end }, status: 'DELIVERED' } };
    const returnedWhere: any = { invoiceReturn: { createdAt: { gte: start, lt: end }, invoice: { status: 'DELIVERED' } } };

    if (productModelId) {
      soldWhere.productModelId = productModelId;
      returnedWhere.invoiceItem = { productModelId };
    } else if (categoryId) {
      const modelIds = (
        await this.prisma.productModel.findMany({
          where: { categoryId, deletedAt: null },
          select: { id: true },
        })
      ).map((m) => m.id);
      soldWhere.productModelId = { in: modelIds };
      returnedWhere.invoiceItem = { productModelId: { in: modelIds } };
    }

    const [soldItems, returnedItems, productModels] = await Promise.all([
      this.prisma.invoiceItem.findMany({
        where: soldWhere,
        select: {
          price: true,
          quantity: true,
          productModelId: true,
        },
      }),
      this.prisma.invoiceReturnItem.findMany({
        where: returnedWhere,
        select: {
          refundAmount: true,
          invoiceItem: { select: { productModelId: true } },
        },
      }),
      this.prisma.productModel.findMany({
        where: { deletedAt: null },
        select: { id: true, name: true, categoryId: true, isSerialized: true },
      }),
    ]);

    const categories = await this.prisma.category.findMany({
      select: { id: true, name: true },
    });
    const categoryNameMap = new Map(categories.map((c) => [c.id, c.name]));
    const modelNameMap = new Map(productModels.map((pm) => [pm.id, { name: pm.name, categoryId: pm.categoryId }]));

    const modelMap = new Map<number, { soldEvents: number; returnedEvents: number; revenue: number }>();

    for (const item of soldItems) {
      const modelId = item.productModelId;
      const existing = modelMap.get(modelId) || { soldEvents: 0, returnedEvents: 0, revenue: 0 };
      const quantity = item.quantity || 1;
      existing.soldEvents += quantity;
      existing.revenue += Number(item.price) * quantity;
      modelMap.set(modelId, existing);
    }

    for (const item of returnedItems) {
      const modelId = item.invoiceItem.productModelId;
      const existing = modelMap.get(modelId) || { soldEvents: 0, returnedEvents: 0, revenue: 0 };
      existing.returnedEvents += 1;
      modelMap.set(modelId, existing);
    }

    const allRows = Array.from(modelMap.entries()).map(([modelId, data]) => {
      const modelInfo = modelNameMap.get(modelId);
      return {
        productModelId: modelId,
        productModelName: modelInfo?.name || 'Unknown',
        categoryName: categoryNameMap.get(modelInfo?.categoryId || 0) || 'Unknown',
        soldEvents: data.soldEvents,
        returnedEvents: data.returnedEvents,
        netUnitsSold: data.soldEvents - data.returnedEvents,
        revenue: data.revenue,
      };
    });

    allRows.sort((a, b) => b.revenue - a.revenue);

    const total = allRows.length;
    const totalPages = Math.ceil(total / limit) || 1;
    const safePage = Math.max(1, Math.min(page, totalPages));
    const offset = (safePage - 1) * limit;
    const items = allRows.slice(offset, offset + limit);

    return {
      items,
      range: this.buildRange(from, to),
      meta: { page: safePage, limit, total, totalPages },
    };
  }

  // ─── 2.6 Returns Report ───

  async computeReturns(
    from: string,
    to: string,
    employeeId?: number,
    status?: string,
    page = 1,
    limit = 25,
  ): Promise<ReturnsReportResponse> {
    const { start, end } = this.parseAndValidateDateRange(from, to);

    const where: any = { createdAt: { gte: start, lt: end } };

    if (employeeId) {
      where.requestedById = employeeId;
    }

    if (status) {
      where.request = { status: status as any };
    }

    const [returns, totalResult] = await Promise.all([
      this.prisma.invoiceReturn.findMany({
        where,
        include: {
          invoice: { select: { invoiceNumber: true } },
          items: true,
        },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.invoiceReturn.aggregate({
        where,
        _sum: { refundTotal: true },
        _count: true,
      }),
    ]);

    const totalRefunds = Number(totalResult._sum?.refundTotal) || 0;
    const totalCount = totalResult._count;
    const totalPages = Math.ceil(totalCount / limit) || 1;
    const safePage = Math.max(1, Math.min(page, totalPages));
    const offset = (safePage - 1) * limit;
    const paged = returns.slice(offset, offset + limit);

    // Fetch employee names for requestedBy and approvedBy
    const empIds = new Set<number>();
    for (const r of paged) {
      empIds.add(r.requestedById);
      empIds.add(r.approvedById);
    }
    const employees = await this.prisma.employee.findMany({
      where: { id: { in: Array.from(empIds) } },
      select: { id: true, name: true },
    });
    const empNameMap = new Map(employees.map((e) => [e.id, e.name]));

    const items = paged.map((r) => ({
      returnId: r.id,
      invoiceNumber: r.invoice.invoiceNumber,
      requestedByName: empNameMap.get(r.requestedById) || 'Unknown',
      approvedByName: empNameMap.get(r.approvedById) || 'Unknown',
      itemCount: r.items.length,
      refundTotal: Number(r.refundTotal),
      reason: r.reason,
      createdAt: r.createdAt.toISOString(),
    }));

    return {
      items,
      totalRefunds,
      range: this.buildRange(from, to),
      meta: { page: safePage, limit, total: totalCount, totalPages },
    };
  }

  async getExpenseReportDetails(
    from: string,
    to: string,
    categoryId?: number,
  ): Promise<ExpenseDetailResponse> {
    const { start, end } = this.parseAndValidateDateRange(from, to);

    const where: any = { date: { gte: start, lt: end }, deletedAt: null };
    if (categoryId) {
      where.categoryId = categoryId;
    }

    const expenses = await this.prisma.expense.findMany({
      where,
      include: { category: true, employee: true },
      orderBy: { date: 'desc' },
    });

    return {
      items: expenses.map((expense) => ({
        id: expense.id,
        date: expense.date.toISOString(),
        categoryName: expense.category.name,
        employeeName: expense.employee.name,
        description: expense.description,
        amount: Number(expense.amount),
      })),
      range: this.buildRange(from, to),
      meta: { page: 1, limit: expenses.length || 1, total: expenses.length, totalPages: 1 },
    };
  }

  async getEmployeeSalesReportDetails(
    from: string,
    to: string,
    employeeId?: number,
  ): Promise<EmployeeSalesDetailResponse> {
    const { start, end } = this.parseAndValidateDateRange(from, to);

    const invoiceFilter: any = { date: { gte: start, lt: end }, status: 'DELIVERED' };
    if (employeeId) {
      invoiceFilter.employeeId = employeeId;
    }

    const invoices = await this.prisma.invoice.findMany({
      where: invoiceFilter,
      include: {
        customer: true,
        employee: true,
        items: { include: { productModel: true } },
        returns: { include: { items: true } },
      },
      orderBy: { date: 'desc' },
    });

    const items = invoices.map((invoice) => {
      const lineItems = invoice.items.map((lineItem) => ({
        productName: lineItem.productModel.name,
        quantity: lineItem.quantity,
        unitPrice: Number(lineItem.price),
        lineTotal: Number(lineItem.price) * lineItem.quantity,
      }));
      const returnsTotal = invoice.returns.reduce((sum, returnEntry) => sum + Number(returnEntry.refundTotal), 0);
      const grossSales = Number(invoice.currentTotal) + returnsTotal;
      return {
        invoiceId: invoice.id,
        invoiceNumber: invoice.invoiceNumber,
        invoiceDate: invoice.date.toISOString(),
        customerName: invoice.customer?.name || 'Unknown customer',
        employeeName: invoice.employee?.name || 'Unknown employee',
        grossSales,
        returns: returnsTotal,
        netSales: Number(invoice.currentTotal),
        items: lineItems,
      };
    });

    return {
      items,
      range: this.buildRange(from, to),
      meta: { page: 1, limit: items.length || 1, total: items.length, totalPages: 1 },
    };
  }

  async getProductSalesReportDetails(
    from: string,
    to: string,
    productModelId?: number,
    categoryId?: number,
  ): Promise<ProductSalesDetailResponse> {
    const { start, end } = this.parseAndValidateDateRange(from, to);

    const where: any = {
      invoice: { date: { gte: start, lt: end }, status: 'DELIVERED' },
    };

    if (productModelId) {
      where.productModelId = productModelId;
    } else if (categoryId) {
      const modelIds = (await this.prisma.productModel.findMany({
        where: { categoryId, deletedAt: null },
        select: { id: true },
      })).map((model) => model.id);
      where.productModelId = { in: modelIds };
    }

    const invoiceItems = await this.prisma.invoiceItem.findMany({
      where,
      include: {
        productModel: true,
        invoice: { include: { customer: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    const items = invoiceItems.map((item) => ({
      invoiceId: item.invoiceId,
      invoiceNumber: item.invoice.invoiceNumber,
      invoiceDate: item.invoice.date.toISOString(),
      customerName: item.invoice.customer.name,
      productName: item.productModel.name,
      quantity: item.quantity,
      unitPrice: Number(item.price),
      lineTotal: Number(item.price) * item.quantity,
    }));

    return {
      items,
      range: this.buildRange(from, to),
      meta: { page: 1, limit: items.length || 1, total: items.length, totalPages: 1 },
    };
  }

  async getReturnsReportDetails(
    from: string,
    to: string,
    employeeId?: number,
    status?: string,
    returnId?: number,
  ): Promise<ReturnsDetailResponse> {
    const { start, end } = this.parseAndValidateDateRange(from, to);

    const where: any = { createdAt: { gte: start, lt: end } };
    if (employeeId) {
      where.requestedById = employeeId;
    }
    if (status) {
      where.request = { status: status as any };
    }
    if (returnId) {
      where.id = returnId;
    }

    const returns = await this.prisma.invoiceReturn.findMany({
      where,
      include: {
        invoice: true,
        items: { include: { invoiceItem: { include: { productModel: true } } } },
      },
      orderBy: { createdAt: 'desc' },
    });

    const employeeIds = Array.from(new Set(returns.flatMap((item) => [item.requestedById, item.approvedById])));
    const employees = employeeIds.length
      ? await this.prisma.employee.findMany({
          where: { id: { in: employeeIds } },
          select: { id: true, name: true },
        })
      : [];
    const employeeNameMap = new Map(employees.map((employee) => [employee.id, employee.name]));

    const items = returns.map((item) => ({
      returnId: item.id,
      invoiceNumber: item.invoice.invoiceNumber,
      createdAt: item.createdAt.toISOString(),
      requestedByName: employeeNameMap.get(item.requestedById) || 'Unknown',
      approvedByName: employeeNameMap.get(item.approvedById) || 'Unknown',
      refundTotal: Number(item.refundTotal),
      reason: item.reason,
      items: item.items.map((lineItem) => ({
        productName: lineItem.invoiceItem.productModel.name,
        quantity: lineItem.invoiceItem.quantity,
        refundAmount: Number(lineItem.refundAmount),
      })),
    }));

    return {
      items,
      range: this.buildRange(from, to),
      meta: { page: 1, limit: items.length || 1, total: items.length, totalPages: 1 },
    };
  }

  async getCustomerReportDetails(
    from: string,
    to: string,
    customerId?: number,
  ): Promise<CustomerReportDetailResponse> {
    const { start, end } = this.parseAndValidateDateRange(from, to);

    const where: any = { date: { gte: start, lt: end }, status: 'DELIVERED' };
    if (customerId) {
      where.customerId = customerId;
    }

    const invoices = await this.prisma.invoice.findMany({
      where,
      include: {
        customer: true,
        employee: true,
        items: { include: { productModel: true } },
        returns: true,
      },
      orderBy: { date: 'desc' },
    });

    const items = invoices.map((invoice) => {
      const lineItems = invoice.items.map((lineItem) => ({
        productName: lineItem.productModel.name,
        quantity: lineItem.quantity,
        unitPrice: Number(lineItem.price),
        lineTotal: Number(lineItem.price) * lineItem.quantity,
      }));
      const returnsTotal = (invoice.returns ?? []).reduce(
        (sum, returnEntry) => sum + Number(returnEntry.refundTotal),
        0,
      );
      return {
        invoiceId: invoice.id,
        invoiceNumber: invoice.invoiceNumber,
        invoiceDate: invoice.date.toISOString(),
        customerName: invoice.customer?.name || 'Unknown customer',
        employeeName: invoice.employee?.name || 'Unknown employee',
        grossSales: Number(invoice.currentTotal) + returnsTotal,
        returns: returnsTotal,
        netSales: Number(invoice.currentTotal),
        items: lineItems,
      };
    });

    return {
      items,
      range: this.buildRange(from, to),
      meta: { page: 1, limit: items.length || 1, total: items.length, totalPages: 1 },
    };
  }

  async getSupplierReportDetails(
    from: string,
    to: string,
    supplierId?: number,
  ): Promise<SupplierReportDetailResponse> {
    const { start, end } = this.parseAndValidateDateRange(from, to);

    const where: any = { date: { gte: start, lt: end } };
    if (supplierId) {
      where.supplierId = supplierId;
    }

    const receipts = await this.prisma.stockReceipt.findMany({
      where,
      include: {
        supplier: true,
        stockLots: { include: { productModel: true } },
      },
      orderBy: { date: 'desc' },
    });

    const items = receipts.map((receipt) => ({
      receiptId: receipt.id,
      receiptNumber: `RCPT-${String(receipt.id).padStart(6, '0')}`,
      receiptDate: receipt.date.toISOString(),
      supplierName: receipt.supplier?.name || 'Unknown supplier',
      totalValue: receipt.stockLots.reduce((sum, lot) => sum + (Number(lot.purchasePrice || 0) * lot.quantityReceived), 0),
      items: receipt.stockLots.map((lot) => ({
        productName: lot.productModel.name,
        quantityReceived: lot.quantityReceived,
        unitPrice: Number(lot.purchasePrice || 0),
        lineTotal: Number(lot.purchasePrice || 0) * lot.quantityReceived,
      })),
    }));

    return {
      items,
      range: this.buildRange(from, to),
      meta: { page: 1, limit: items.length || 1, total: items.length, totalPages: 1 },
    };
  }

  // ─── Dashboard (kept for backward compat) ───

  async computeDashboardSummary(from: string, to: string, employeeId?: number) {
    const { start, end } = this.parseAndValidateDateRange(from, to);

    const completedSalesInvoice = { status: 'DELIVERED' as any };

    const [revenueData, expensesData, cogsResult, serializedCogsResult, pendingCogsInvoices, returnedCogsResult] = await Promise.all([
      this.privateComputeRevenueData(start, end),
      this.privateComputeExpensesData(start, end),
      this.prisma.stockConsumption.aggregate({
        where: {
          invoiceItem: { invoice: { date: { gte: start, lt: end }, ...completedSalesInvoice } },
        },
        _sum: { totalCost: true },
      }),
      this.prisma.invoiceItem.aggregate({
        where: {
          invoice: { date: { gte: start, lt: end }, ...completedSalesInvoice },
          productModel: { isSerialized: true },
          cogsStatus: 'FINAL',
          costAtSale: { not: null },
        },
        _sum: { costAtSale: true },
      }),
      this.prisma.invoiceItem.groupBy({
        by: ['invoiceId'],
        where: {
          invoice: { date: { gte: start, lt: end }, ...completedSalesInvoice },
          cogsStatus: 'PENDING',
        },
      }),
      this.prisma.$queryRaw<{ total: number | null }[]>`
        SELECT COALESCE(SUM(ii."costAtSale"), 0)::float AS "total"
        FROM "InvoiceReturnItem" iri
        JOIN "InvoiceReturn" ir ON ir."id" = iri."invoiceReturnId"
        JOIN "InvoiceItem" ii ON ii."id" = iri."invoiceItemId"
        JOIN "Invoice" i ON i."id" = ii."invoiceId"
        WHERE ir."createdAt" >= ${start} AND ir."createdAt" < ${end}
          AND i."status" = 'DELIVERED'
      `,
    ]);

    const nonSerializedCogs = Number(cogsResult._sum?.totalCost) || 0;
    const serializedCogs = Number(serializedCogsResult._sum?.costAtSale) || 0;
    const returnedCogs = Number(returnedCogsResult[0]?.total) || 0;
    const cogs = nonSerializedCogs + serializedCogs - returnedCogs;

    const lowStockModels = await this.prisma.$queryRaw`
      SELECT COUNT(*)::int as "count"
      FROM (
        -- Serialized models
        SELECT pm."id" as "modelId", pm."minStockAlert",
               COALESCE(pu."availableCount", 0) as "available"
        FROM "ProductModel" pm
        LEFT JOIN (
          SELECT "productModelId", COUNT(*)::int as "availableCount"
          FROM "ProductUnit"
          WHERE "status" = 'AVAILABLE'
          GROUP BY "productModelId"
        ) pu ON pu."productModelId" = pm."id"
        WHERE pm."deletedAt" IS NULL
          AND pm."isActive" = true
          AND pm."isSerialized" = true
          AND pm."minStockAlert" > 0

        UNION ALL

        -- Non-serialized models
        SELECT pm."id" as "modelId", pm."minStockAlert",
               COALESCE(sl."available", 0) as "available"
        FROM "ProductModel" pm
        LEFT JOIN (
          SELECT "productModelId",
                 SUM("quantityRemaining" - "quantityReserved")::int as "available"
          FROM "StockLot"
          GROUP BY "productModelId"
        ) sl ON sl."productModelId" = pm."id"
        WHERE pm."deletedAt" IS NULL
          AND pm."isActive" = true
          AND pm."isSerialized" = false
          AND pm."minStockAlert" > 0
      ) combined
      WHERE combined."available" <= combined."minStockAlert"
    `;

    const lowStock = (lowStockModels as any[])[0]?.count || 0;

    const [pendingChangeRequests, unreadNotifications] = await Promise.all([
      this.prisma.invoiceChangeRequest.count({ where: { status: 'PENDING' } }),
      // Same semantics as GET /notifications/unread-count: only the current
      // employee's unread, unresolved notifications — must match the bell.
      this.prisma.notification.count({
        where: {
          isRead: false,
          resolvedAt: null,
          ...(employeeId ? { employeeId } : {}),
        },
      }),
    ]);

    return {
      netSales: revenueData.netSales,
      expenses: expensesData.totalExpenses,
      cogs,
      netProfit: revenueData.netSales - expensesData.totalExpenses - cogs,
      pendingCogsInvoicesCount: pendingCogsInvoices.length,
      lowStockModelsCount: lowStock,
      pendingChangeRequestsCount: pendingChangeRequests,
      unreadNotificationsCount: unreadNotifications,
      range: { from, to },
    };
  }

  // ─── 2.7 Customer Report ───

  async computeCustomers(
    from: string,
    to: string,
    customerId?: number,
    page = 1,
    limit = 25,
  ): Promise<CustomerReportResponse> {
    const { start, end } = this.parseAndValidateDateRange(from, to);

    const completedSalesInvoice = { status: 'DELIVERED' as any };

    const invoiceFilter: Prisma.InvoiceWhereInput = { date: { gte: start, lt: end }, ...completedSalesInvoice };
    if (customerId) {
      invoiceFilter.customerId = customerId;
    }

    const invoiceData = await this.prisma.invoice.groupBy({
      by: ['customerId'],
      where: invoiceFilter,
      _count: true,
      _sum: { currentTotal: true },
    });

    const customerIds = invoiceData.map((d) => d.customerId);

    const returnData = await this.prisma.invoiceReturn.groupBy({
      by: ['invoiceId'],
      where: {
        invoice: { customerId: { in: customerIds } },
        createdAt: { gte: start, lt: end },
      },
      _sum: { refundTotal: true },
    });

    const returnInvoiceIds = returnData.map((r) => r.invoiceId);
    const returnInvoices = await this.prisma.invoice.findMany({
      where: { id: { in: returnInvoiceIds } },
      select: { id: true, customerId: true },
    });
    const invoiceToCustomerMap = new Map(returnInvoices.map((i) => [i.id, i.customerId]));

    const returnsByCustomer = new Map<number, number>();
    for (const rd of returnData) {
      const custId = invoiceToCustomerMap.get(rd.invoiceId);
      if (custId) {
        returnsByCustomer.set(custId, (returnsByCustomer.get(custId) || 0) + Number(rd._sum?.refundTotal || 0));
      }
    }

    const customers = await this.prisma.customer.findMany({
      where: { id: { in: customerIds } },
      select: { id: true, name: true, type: true },
    });
    const customerMap = new Map(customers.map((c) => [c.id, c]));

    const lastInvoices = await this.prisma.invoice.findMany({
      where: invoiceFilter,
      select: { customerId: true, date: true, invoiceNumber: true },
      orderBy: { date: 'desc' },
    });

    const lastInvoiceMap = new Map<number, { date: Date; invoiceNumber: string }>();
    for (const inv of lastInvoices) {
      if (!lastInvoiceMap.has(inv.customerId)) {
        lastInvoiceMap.set(inv.customerId, { date: inv.date, invoiceNumber: inv.invoiceNumber });
      }
    }

    const customerInvoiceNumbers = new Map<number, string[]>();
    for (const inv of lastInvoices) {
      const existing = customerInvoiceNumbers.get(inv.customerId) || [];
      existing.push(inv.invoiceNumber);
      customerInvoiceNumbers.set(inv.customerId, existing);
    }

    const allRows = invoiceData.map((d) => {
      const customer = customerMap.get(d.customerId);
      const netSales = Number(d._sum?.currentTotal) || 0;
      const returns = returnsByCustomer.get(d.customerId) || 0;
      const grossSales = netSales + returns;
      const last = lastInvoiceMap.get(d.customerId);
      return {
        customerId: d.customerId,
        customerName: customer?.name || 'Unknown',
        customerType: customer?.type || 'Unknown',
        invoiceCount: d._count,
        invoiceNumbers: customerInvoiceNumbers.get(d.customerId) || [],
        grossSales,
        returns,
        netSales,
        lastInvoiceDate: last?.date.toISOString() || '',
      };
    });

    allRows.sort((a, b) => b.netSales - a.netSales);

    const total = allRows.length;
    const totalPages = Math.ceil(total / limit) || 1;
    const safePage = Math.max(1, Math.min(page, totalPages));
    const offset = (safePage - 1) * limit;
    const items = allRows.slice(offset, offset + limit);

    return {
      items,
      range: this.buildRange(from, to),
      meta: { page: safePage, limit, total, totalPages },
    };
  }

  // ─── 2.8 Supplier Report ───

  async computeSuppliers(
    from: string,
    to: string,
    supplierId?: number,
    page = 1,
    limit = 25,
  ): Promise<SupplierReportResponse> {
    const { start, end } = this.parseAndValidateDateRange(from, to);

    const receiptFilter: Prisma.StockReceiptWhereInput = { date: { gte: start, lt: end } };
    if (supplierId) {
      receiptFilter.supplierId = supplierId;
    }

    const receiptData = await this.prisma.stockReceipt.groupBy({
      by: ['supplierId'],
      where: receiptFilter,
      _count: true,
    });

    const supplierIds = receiptData.map((d) => d.supplierId);
    const suppliers = await this.prisma.supplier.findMany({
      where: { id: { in: supplierIds } },
      select: { id: true, name: true },
    });
    const supplierMap = new Map(suppliers.map((s) => [s.id, s.name]));

    const lotData = await this.prisma.stockLot.groupBy({
      by: ['supplierId'],
      where: { receivedDate: { gte: start, lt: end } },
      _count: true,
      _sum: { quantityReceived: true },
    });
    const lotMap = new Map(lotData.map((l) => [l.supplierId, { count: l._count, totalQty: Number(l._sum?.quantityReceived) || 0 }]));

    const purchaseValueBySupplier = new Map<number, number>();
    const supplierReceiptDates = new Map<number, string[]>();
    const supplierReceiptNumbers = new Map<number, string[]>();

    const lotRows = await this.prisma.stockLot.findMany({
      where: { receivedDate: { gte: start, lt: end }, ...(supplierId ? { supplierId } : {}) },
      select: { supplierId: true, quantityReceived: true, purchasePrice: true, receivedDate: true, stockReceiptId: true },
    });

    for (const lot of lotRows) {
      const current = purchaseValueBySupplier.get(lot.supplierId) || 0;
      purchaseValueBySupplier.set(lot.supplierId, current + ((Number(lot.purchasePrice) || 0) * lot.quantityReceived));

      if (lot.receivedDate) {
        const dates = supplierReceiptDates.get(lot.supplierId) || [];
        dates.push(new Date(lot.receivedDate).toISOString());
        supplierReceiptDates.set(lot.supplierId, dates);
      }

      if (this.prisma.stockReceipt?.findUnique) {
        const receipt = await this.prisma.stockReceipt.findUnique({
          where: { id: lot.stockReceiptId },
          select: { id: true, date: true },
        });
        if (receipt) {
          const numbers = supplierReceiptNumbers.get(lot.supplierId) || [];
          numbers.push(`RCPT-${String(receipt.id).padStart(5, '0')}`);
          supplierReceiptNumbers.set(lot.supplierId, numbers);
        }
      }
    }

    const allRows = receiptData.map((d) => {
      const lotInfo = lotMap.get(d.supplierId) || { count: 0, totalQty: 0 };
      return {
        supplierId: d.supplierId,
        supplierName: supplierMap.get(d.supplierId) || 'Unknown',
        receiptCount: d._count,
        totalLots: lotInfo.count,
        totalQuantityReceived: lotInfo.totalQty,
        totalPurchaseValue: purchaseValueBySupplier.get(d.supplierId) || 0,
        receiptDates: supplierReceiptDates.get(d.supplierId) || [],
        receiptNumbers: supplierReceiptNumbers.get(d.supplierId) || [],
      };
    });

    allRows.sort((a, b) => b.receiptCount - a.receiptCount);

    const total = allRows.length;
    const totalPages = Math.ceil(total / limit) || 1;
    const safePage = Math.max(1, Math.min(page, totalPages));
    const offset = (safePage - 1) * limit;
    const items = allRows.slice(offset, offset + limit);

    return {
      items,
      range: this.buildRange(from, to),
      meta: { page: safePage, limit, total, totalPages },
    };
  }

  // ─── 2.9 Warehouse Inventory Report (point-in-time snapshot) ───

    // ─── 2.9 Warehouse Inventory Report (point-in-time snapshot) ───

  async computeInventory(
    page = 1,
    limit = 25,
    categoryId?: number,
    productModelId?: number,
    search?: string,
  ): Promise<InventoryReportResponse> {
    const safeLimit = Math.min(Math.max(1, limit), 100);
    const where: Prisma.ProductModelWhereInput = {
      isActive: true,
      deletedAt: null,
      ...(categoryId && { categoryId }),
      ...(productModelId && { id: productModelId }),
      ...(search && { name: { contains: search, mode: 'insensitive' } }),
    };

    const allModels = await this.prisma.productModel.findMany({
      where,
      select: {
        id: true,
        name: true,
        isSerialized: true,
        minStockAlert: true,
        category: { select: { name: true } },
      },
      orderBy: { name: 'asc' },
    });

    const serializedIds = allModels.filter((m) => m.isSerialized).map((m) => m.id);
    const nonSerializedIds = allModels.filter((m) => !m.isSerialized).map((m) => m.id);

    const [unitGroups, availableValueGroups, lots, damageLossGroups] = await Promise.all([
      serializedIds.length
        ? this.prisma.productUnit.groupBy({
            by: ['productModelId', 'status'],
            where: { productModelId: { in: serializedIds } },
            _count: true,
          })
        : Promise.resolve([]),
      serializedIds.length
        ? this.prisma.productUnit.groupBy({
            by: ['productModelId'],
            where: {
              productModelId: { in: serializedIds },
              status: 'AVAILABLE',
              purchasePrice: { not: null },
            },
            _sum: { purchasePrice: true },
          })
        : Promise.resolve([]),
      nonSerializedIds.length
        ? this.prisma.stockLot.findMany({
            where: { productModelId: { in: nonSerializedIds } },
            select: {
              productModelId: true,
              quantityReceived: true,
              quantityRemaining: true,
              quantityReserved: true,
              purchasePrice: true,
            },
          })
        : Promise.resolve([]),
      // Approved DAMAGE / LOSS adjustments for non-serialized models.
      // Quantities are stored negative, so we take the absolute value below.
      nonSerializedIds.length
        ? this.prisma.stockAdjustment.groupBy({
            by: ['productModelId'],
            where: {
              productModelId: { in: nonSerializedIds },
              status: 'APPROVED',
              type: { in: ['DAMAGE', 'LOSS'] },
              quantity: { lt: 0 },
            },
            _sum: { quantity: true },
          })
        : Promise.resolve([]),
    ]);

    type UnitCountMap = Map<number, { available: number; reserved: number; sold: number; damaged: number; total: number }>;
    const unitCounts: UnitCountMap = new Map();
    for (const row of unitGroups as Array<{ productModelId: number; status: string; _count: number }>) {
      const entry = unitCounts.get(row.productModelId) || { available: 0, reserved: 0, sold: 0, damaged: 0, total: 0 };
      if (row.status === 'AVAILABLE') entry.available = row._count;
      else if (row.status === 'RESERVED') entry.reserved = row._count;
      else if (row.status === 'SOLD') entry.sold = row._count;
      else if (row.status === 'DAMAGED') entry.damaged = row._count;
      entry.total += row._count;
      unitCounts.set(row.productModelId, entry);
    }

    const availableValueByModel = new Map<number, number>();
    for (const row of availableValueGroups as Array<{ productModelId: number; _sum: { purchasePrice: unknown } }>) {
      availableValueByModel.set(row.productModelId, Number(row._sum?.purchasePrice) || 0);
    }

    const damagedByModel = new Map<number, number>();
    for (const row of damageLossGroups as Array<{ productModelId: number; _sum: { quantity: number | null } }>) {
      damagedByModel.set(row.productModelId, Math.abs(row._sum?.quantity ?? 0));
    }

    const lotStats = new Map<number, { received: number; remaining: number; reserved: number; value: number }>();
    for (const lot of lots as Array<{
      productModelId: number;
      quantityReceived: number;
      quantityRemaining: number;
      quantityReserved: number;
      purchasePrice: unknown;
    }>) {
      const entry = lotStats.get(lot.productModelId) || { received: 0, remaining: 0, reserved: 0, value: 0 };
      entry.received += lot.quantityReceived;
      entry.remaining += lot.quantityRemaining;
      entry.reserved += lot.quantityReserved;
      entry.value += lot.quantityRemaining * (Number(lot.purchasePrice) || 0);
      lotStats.set(lot.productModelId, entry);
    }

    const allRows: InventoryReportRow[] = allModels.map((model) => {
      if (model.isSerialized) {
        const counts = unitCounts.get(model.id) || { available: 0, reserved: 0, sold: 0, damaged: 0, total: 0 };
        const stockValue = availableValueByModel.get(model.id) || 0;
        return {
          productModelId: model.id,
          productModelName: model.name,
          categoryName: model.category?.name || 'Unknown',
          isSerialized: true,
          available: counts.available,
          reserved: counts.reserved,
          sold: counts.sold,
          damaged: counts.damaged,
          totalReceived: counts.total,
          minStockAlert: model.minStockAlert,
          lowStock: counts.available < model.minStockAlert,
          stockValue,
        };
      }

      const stats = lotStats.get(model.id) || { received: 0, remaining: 0, reserved: 0, value: 0 };
      const available = Math.max(0, stats.remaining - stats.reserved);
      return {
        productModelId: model.id,
        productModelName: model.name,
        categoryName: model.category?.name || 'Unknown',
        isSerialized: false,
        available,
        reserved: stats.reserved,
        sold: 0,
        damaged: damagedByModel.get(model.id) || 0,
        totalReceived: stats.received,
        minStockAlert: model.minStockAlert,
        lowStock: available < model.minStockAlert,
        stockValue: stats.value,
      };
    });

    const totals = {
      productModels: allRows.length,
      availableUnits: allRows.reduce((sum, row) => sum + row.available, 0),
      reservedUnits: allRows.reduce((sum, row) => sum + row.reserved, 0),
      lowStockCount: allRows.filter((row) => row.lowStock).length,
      stockValue: allRows.reduce((sum, row) => sum + row.stockValue, 0),
    };

    const total = allRows.length;
    const totalPages = Math.ceil(total / safeLimit) || 1;
    const safePage = Math.max(1, Math.min(page, totalPages));
    const offset = (safePage - 1) * safeLimit;
    const items = allRows.slice(offset, offset + safeLimit);

    return {
      items,
      totals,
      meta: { page: safePage, limit: safeLimit, total, totalPages },
    };
  }
}
