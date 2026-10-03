// Re-export canonical report types from the single source of truth.
// Keep in sync with backend src/reports/reports.types.ts
export type {
  ReportRange,
  PaginationMeta,
  ExpenseReportRow,
  ExpensesReportResponse,
  RevenueByDay,
  RevenueReportResponse,
  NetProfitReportResponse,
  EmployeeSalesRow,
  EmployeeSalesReportResponse,
  ProductSalesRow,
  ProductSalesReportResponse,
  ReturnItem,
  ReturnsReportResponse,
} from "../features/reports/types";

// DashboardSummaryResponse is a dashboard concern, not a report type.
export interface DashboardSummaryResponse {
  netSales: number;
  expenses: number;
  netProfit: number;
  cogs?: number;
  lowStockModelsCount: number;
  pendingChangeRequestsCount: number;
  pendingInvoiceReviewsCount?: number;
  pendingDeliveriesCount?: number;
  pendingCogsInvoicesCount?: number;
  unreadNotificationsCount: number;
  range: { from: string; to: string };
}
