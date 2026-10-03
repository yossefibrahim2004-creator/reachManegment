// Canonical report response types — single source of truth.
// Frontend MUST mirror these exactly (see frontend src/features/reports/types.ts).

export interface ReportRange {
  from: string;
  to: string;
}

export interface PaginationMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

// 2.1 Expenses Report
export interface ExpenseReportRow {
  categoryId: number;
  categoryName: string;
  total: number;
  count: number;
  sharePercent: number;
}

export interface ExpensesReportResponse {
  items: ExpenseReportRow[];
  totalExpenses: number;
  totalCount: number;
  range: ReportRange;
  meta: PaginationMeta;
}

// 2.2 Revenue Report
export interface RevenueByDay {
  date: string;
  total: number;
}

export interface RevenueReportResponse {
  originalSales: number;
  approvedAdjustments: number;
  approvedReturns: number;
  netSales: number;
  invoiceCount: number;
  byDay: RevenueByDay[];
  range: ReportRange;
}

// 2.3 Net Profit Report
export interface NetProfitReportResponse {
  netSales: number;
  totalExpenses: number;
  cogs: number;
  netProfit: number;
  pendingCogsInvoicesCount: number;
  range: ReportRange;
}

// 2.4 Employee Sales Report
export interface EmployeeSalesRow {
  employeeId: number;
  employeeName: string;
  invoiceCount: number;
  grossSales: number;
  returns: number;
  netSales: number;
}

export interface EmployeeSalesReportResponse {
  items: EmployeeSalesRow[];
  range: ReportRange;
  meta: PaginationMeta;
}

// 2.5 Product Sales Report
export interface ProductSalesRow {
  productModelId: number;
  productModelName: string;
  categoryName: string;
  soldEvents: number;
  returnedEvents: number;
  netUnitsSold: number;
  revenue: number;
}

export interface ProductSalesReportResponse {
  items: ProductSalesRow[];
  range: ReportRange;
  meta: PaginationMeta;
}

// 2.6 Returns Report
export interface ReturnItem {
  returnId: number;
  invoiceNumber: string;
  requestedByName: string;
  approvedByName: string;
  itemCount: number;
  refundTotal: number;
  reason: string;
  createdAt: string;
}

export interface ReturnsReportResponse {
  items: ReturnItem[];
  totalRefunds: number;
  range: ReportRange;
  meta: PaginationMeta;
}

// 2.7 Customer Report
export interface CustomerReportRow {
  customerId: number;
  customerName: string;
  customerType: string;
  invoiceCount: number;
  invoiceNumbers: string[];
  grossSales: number;
  returns: number;
  netSales: number;
  lastInvoiceDate: string;
}

export interface CustomerReportResponse {
  items: CustomerReportRow[];
  range: ReportRange;
  meta: PaginationMeta;
}

// 2.8 Supplier Report
export interface SupplierReportRow {
  supplierId: number;
  supplierName: string;
  receiptCount: number;
  totalLots: number;
  totalQuantityReceived: number;
  totalPurchaseValue: number;
  receiptDates: string[];
  receiptNumbers?: string[];
}

export interface SupplierReportResponse {
  items: SupplierReportRow[];
  range: ReportRange;
  meta: PaginationMeta;
}

export interface ReportDetailListResponse<T> {
  items: T[];
  range: ReportRange;
  meta: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
}

export interface ExpenseDetailItem {
  id: number;
  date: string;
  categoryName: string;
  employeeName: string;
  description: string | null;
  amount: number;
}

export interface ExpenseDetailResponse extends ReportDetailListResponse<ExpenseDetailItem> {}

export interface EmployeeSalesDetailItem {
  invoiceId: number;
  invoiceNumber: string;
  invoiceDate: string;
  customerName: string;
  grossSales: number;
  returns: number;
  netSales: number;
  items: Array<{
    productName: string;
    quantity: number;
    unitPrice: number;
    lineTotal: number;
  }>;
}

export interface EmployeeSalesDetailResponse extends ReportDetailListResponse<EmployeeSalesDetailItem> {}

export interface ProductSalesDetailItem {
  invoiceId: number;
  invoiceNumber: string;
  invoiceDate: string;
  customerName: string;
  productName: string;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
}

export interface ProductSalesDetailResponse extends ReportDetailListResponse<ProductSalesDetailItem> {}

export interface ReturnDetailItem {
  returnId: number;
  invoiceNumber: string;
  createdAt: string;
  requestedByName: string;
  approvedByName: string;
  refundTotal: number;
  reason: string;
  items: Array<{
    productName: string;
    quantity: number;
    refundAmount: number;
  }>;
}

export interface ReturnsDetailResponse extends ReportDetailListResponse<ReturnDetailItem> {}

export interface CustomerInvoiceLineItem {
  productName: string;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
}

export interface CustomerReportDetailItem {
  invoiceId: number;
  invoiceNumber: string;
  invoiceDate: string;
  customerName: string;
  employeeName: string;
  grossSales: number;
  returns: number;
  netSales: number;
  items: CustomerInvoiceLineItem[];
}

export interface CustomerReportDetailResponse extends ReportDetailListResponse<CustomerReportDetailItem> {}

export interface SupplierReceiptLineItem {
  productName: string;
  quantityReceived: number;
  unitPrice: number;
  lineTotal: number;
}

export interface SupplierReportDetailItem {
  receiptId: number;
  receiptNumber: string;
  receiptDate: string;
  supplierName: string;
  totalValue: number;
  items: SupplierReceiptLineItem[];
}

export interface SupplierReportDetailResponse extends ReportDetailListResponse<SupplierReportDetailItem> {}

// 2.9 Warehouse Inventory Report (point-in-time stock snapshot)
export interface InventoryReportRow {
  productModelId: number;
  productModelName: string;
  categoryName: string;
  isSerialized: boolean;
  available: number;
  reserved: number;
  sold: number;
  damaged: number;
  totalReceived: number;
  minStockAlert: number;
  lowStock: boolean;
  stockValue: number;
}

export interface InventoryReportTotals {
  productModels: number;
  availableUnits: number;
  reservedUnits: number;
  lowStockCount: number;
  stockValue: number;
}

export interface InventoryReportResponse {
  items: InventoryReportRow[];
  totals: InventoryReportTotals;
  meta: PaginationMeta;
}
