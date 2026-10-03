import { useState, useEffect, useCallback, useMemo } from "react";
import api from "../../../lib/api";
import { useCustomerOptions } from "../../../hooks";
import { Card } from "../../../components/ui/Card";
import { Table } from "../../../components/ui/Table";
import { Pagination } from "../../../components/ui/Pagination";
import { LoadingSpinner } from "../../../components/ui/LoadingSpinner";
import { EmptyState } from "../../../components/ui/EmptyState";
import { Select } from "../../../components/ui/Select";
import { Button } from "../../../components/ui/Button";
import { useI18n } from "../../../i18n/context";
import { useReportPrint } from "../hooks/useReportPrint";
import PrintButton from "../components/PrintButton";
import ExcelExportButton from "../components/ExcelExportButton";
import PrintHeader from "../components/PrintHeader";
import DateRangePicker from "../../../components/ui/DateRangePicker";
import { ReportDetailPanel } from "../components/ReportDetailTable";
import type {
  CustomerReportResponse,
  CustomerReportRow,
} from "../types";

const formatLocalDate = (date: Date): string => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
};

const getMonthStart = (): string => {
  const date = new Date();
  date.setDate(1);
  return formatLocalDate(date);
};

const getToday = (): string => {
  return formatLocalDate(new Date());
};

const formatAmount = (value: number | string): string => {
  const amount = Number(value);

  if (!Number.isFinite(amount)) {
    return "0.00";
  }

  return amount.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
};

const formatDate = (value: string | null | undefined): string => {
  if (!value) {
    return "—";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "—";
  }

  return date.toLocaleDateString();
};

export default function CustomerReportPage() {
  const { t } = useI18n();
  const { printLimit, requestPrint, notifyReady } = useReportPrint();

  const [dateFrom, setDateFrom] = useState<string>(getMonthStart);
  const [dateTo, setDateTo] = useState<string>(getToday);
  const [customerFilter, setCustomerFilter] = useState<string>("");
  const { data: customerRows = [] } = useCustomerOptions("");
  const customerOptions = useMemo(
    () => customerRows.map((customer) => ({ label: customer.name, value: String(customer.id) })),
    [customerRows]
  );

  const [data, setData] = useState<CustomerReportResponse | null>(null);

  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const [page, setPage] = useState<number>(1);
  const [selectedCustomer, setSelectedCustomer] = useState<CustomerReportRow | null>(null);
  const [detailMode, setDetailMode] = useState<"all" | "selected" | null>(null);
  const showAllDetails = detailMode === "all";
  const showSelectedDetails = detailMode === "selected" && !!selectedCustomer;

  /*
   * Fetch report data.
   *
   * AbortController prevents an older request from overwriting
   * newer data when the user changes the filters quickly.
   */
  const fetchData = useCallback(
    async (signal: AbortSignal) => {
      setLoading(true);
      setError(null);

      try {
        const params: Record<string, string | number> = {
          page,
          limit: printLimit || 20,
        };

        if (dateFrom) {
          params.from = dateFrom;
        }

        if (dateTo) {
          params.to = dateTo;
        }

        if (customerFilter) {
          params.customerId = Number(customerFilter);
        }

        const response = await api.get<CustomerReportResponse>(
          "/reports/customers",
          {
            params,
            signal,
          },
        );

        if (signal.aborted) {
          return;
        }

        setData(response.data);
      } catch (err: unknown) {
        if (signal.aborted) {
          return;
        }

        setData(null);

        if (err instanceof Error) {
          setError(err.message);
        } else {
          setError(t.reports.failedToLoadReport);
        }
      } finally {
        if (!signal.aborted) {
          setLoading(false);
        }
      }
    },
    [page, dateFrom, dateTo, customerFilter, printLimit],
  );

  /*
   * Fetch whenever pagination, filters, or print mode changes.
   */
  useEffect(() => {
    const controller = new AbortController();

    void fetchData(controller.signal);

    return () => {
      controller.abort();
    };
  }, [fetchData]);

  /*
   * Notify the print system only after the report data has actually
   * been rendered into state.
   */
  useEffect(() => {
    if (!printLimit || loading || error || !data) {
      return;
    }

    const frame = window.requestAnimationFrame(() => {
      notifyReady();
    });

    return () => {
      window.cancelAnimationFrame(frame);
    };
  }, [printLimit, loading, error, data, notifyReady]);

  /*
   * Reset pagination when the date range changes.
   *
   * We intentionally don't fetch here. The page state change causes
   * the main fetch effect to run once with page = 1.
   */
  const handleDateChange = useCallback(
    (from: string, to: string) => {
      setDateFrom(from);
      setDateTo(to);

      if (page !== 1) {
        setPage(1);
      }
    },
    [page],
  );

  const handleCustomerFilterChange = useCallback((value: string) => {
    setCustomerFilter(value);
    setPage(1);
  }, []);

  const handlePreviousPage = useCallback(() => {
    setPage((currentPage) => Math.max(1, currentPage - 1));
  }, []);

  const handleNextPage = useCallback(() => {
    setPage((currentPage) => {
      if (!data) {
        return currentPage;
      }

      return Math.min(data.meta.totalPages, currentPage + 1);
    });
  }, [data]);

  const columns = useMemo(
    () => [
      {
        key: "customerName",
        label: t.nav.customerName || "Customer",
        render: (row: CustomerReportRow) => (
          <span style={{ fontWeight: 600 }}>
            {row.customerName}
          </span>
        ),
      },
      {
        key: "invoiceNumbers",
        label: t.reports.invoicesCount || t.nav.invoices || "Invoices",
        render: (row: CustomerReportRow) => {
          const values = row.invoiceNumbers ?? [];
          return values.length > 0 ? values.slice(0, 5).join(", ") + (values.length > 5 ? " +" : "") : "—";
        },
      },
      {
        key: "invoiceCount",
        label: t.reports.invoicesCount,
        align: "right" as const,
        render: (row: CustomerReportRow) => (
          <span
            style={{
              fontVariantNumeric: "tabular-nums",
            }}
          >
            {row.invoiceCount}
          </span>
        ),
      },
      {
        key: "netSales",
        label: t.total,
        align: "right" as const,
        render: (row: CustomerReportRow) => (
          <span
            style={{
              fontVariantNumeric: "tabular-nums",
              fontWeight: 600,
            }}
          >
            {t.currency} {formatAmount(row.netSales)}
          </span>
        ),
      },
      {
        key: "lastInvoiceDate",
        label: t.nav.lastInvoice || "Last Invoice",
        render: (row: CustomerReportRow) =>
          formatDate(row.lastInvoiceDate),
      },
    ],
    [t],
  );

  const hasData = Boolean(data && data.items.length > 0);

  const showPagination =
    Boolean(
      data &&
        !printLimit &&
        data.meta.totalPages > 1,
    );

  return (
    <div>
      {/* Report Controls */}
      <div
        className="no-print toolbar"
        style={{
          marginBottom: "var(--section-gap)",
        }}
      >
        <DateRangePicker
          from={dateFrom}
          to={dateTo}
          onChange={handleDateChange}
        />

        <Select
          label={t.nav.customer || t.invoices.customer || "Customer"}
          value={customerFilter}
          onChange={(event) => handleCustomerFilterChange(event.target.value)}
          options={[
            { label: t.nav.allCustomers || "All customers", value: "" },
            ...customerOptions,
          ]}
          style={{ minWidth: 190 }}
        />

        <PrintButton onClick={requestPrint} />
        <ExcelExportButton filename="customer-report" rows={data?.items ?? []} />
      </div>

      {/* Printable Report */}
      <div className="print-area">
        <PrintHeader
          titleEn={t.reports.customerReport || "Customer Report"}
          titleAr={t.reports.customerReport || "تقرير العملاء"}
          range={{
            from: dateFrom,
            to: dateTo,
          }}
          filters={customerFilter ? [{ label: t.nav.customer || "Customer", value: customerOptions.find((option) => option.value === customerFilter)?.label || (t.nav.customerName || "Selected customer") }] : []}
        />

        {/* Loading */}
        {loading && (
          <div
            style={{
              display: "flex",
              justifyContent: "center",
              alignItems: "center",
              minHeight: "240px",
              padding: "40px 0",
            }}
          >
            <LoadingSpinner size={32} />
          </div>
        )}

        {/* API Error */}
        {!loading && error && (
          <EmptyState
            title={t.reports.failedToLoadReport}
            description={error}
          />
        )}

        {/* Empty Result */}
        {!loading && !error && !hasData && (
          <EmptyState
            title={t.noData}
            description={
              t.nav.noCustomerData ||
              "No customer data for this period"
            }
          />
        )}

        {/* Report */}
        {!loading && !error && hasData && data && (
          <Card
            title={
              t.reports.customerReport ||
              "Customer Report"
            }
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "12px", marginBottom: "12px", flexWrap: "wrap" }}>
              <div style={{ display: "flex", gap: "8px", alignItems: "center", flexWrap: "wrap" }}>
                <Button
                  type="button"
                  variant={showAllDetails ? "primary" : "secondary"}
                  size="sm"
                  onClick={() => {
                    if (showAllDetails) {
                      setDetailMode(null);
                      return;
                    }
                    setSelectedCustomer(null);
                    setDetailMode("all");
                  }}
                >
                  {showAllDetails ? t.reports.hideDetails : t.reports.showAllDetails}
                </Button>
                <Button
                  type="button"
                  variant={showSelectedDetails ? "primary" : "secondary"}
                  size="sm"
                  disabled={!selectedCustomer}
                  onClick={() => {
                    if (showSelectedDetails) {
                      setDetailMode(null);
                      return;
                    }
                    setDetailMode("selected");
                  }}
                >
                  {showSelectedDetails ? t.reports.hideDetails : t.reports.showSelected}
                </Button>
              </div>
              {selectedCustomer && (
                <span style={{ color: "var(--soft)", fontSize: "12px", display: "inline-flex", alignItems: "center", gap: "6px" }}>
                  <span style={{ width: "8px", height: "8px", borderRadius: "50%", background: "var(--brand)", display: "inline-block" }} />
                  {t.reports.selected}: {selectedCustomer.customerName}
                </span>
              )}
            </div>
            <Table
              columns={columns}
              data={data.items}
              emptyMessage={t.noData}
              selectedRowKey={showSelectedDetails && selectedCustomer ? String(selectedCustomer.customerId) : null}
              onRowClick={(row: CustomerReportRow) => {
                setSelectedCustomer(row);
                setDetailMode("selected");
              }}
            />

            {(showAllDetails || showSelectedDetails) && (
              <ReportDetailPanel
                rowId={selectedCustomer?.customerId ?? null}
                from={dateFrom}
                to={dateTo}
                endpoint="/reports/customers"
                detailTitle={selectedCustomer ? t.reports.customerInvoices : t.reports.allCustomerInvoices}
                groupBy={(item: any) => item.customerName || selectedCustomer?.customerName || t.reports.unknown}
                groupLabel={(groupKey) => `${t.invoices.customer}: ${groupKey}`}
                transform={(payload: any) =>
                  (payload?.items ?? []).flatMap((invoice: any) =>
                    (invoice.items ?? []).map((item: any) => ({
                      invoiceNumber: invoice.invoiceNumber,
                      invoiceDate: invoice.invoiceDate,
                      employeeName: invoice.employeeName,
                      customerName: invoice.customerName || selectedCustomer?.customerName || t.reports.unknown,
                      productName: item.productName,
                      quantity: item.quantity,
                      unitPrice: item.unitPrice,
                      lineTotal: item.lineTotal,
                      netSales: invoice.netSales,
                    })),
                  )
                }
                detailColumns={[
                  { key: "invoiceNumber", label: t.invoices.invoiceNumber },
                  { key: "invoiceDate", label: t.date, render: (item: any) => formatDate(item.invoiceDate) },
                  { key: "employeeName", label: t.reports.employee },
                  { key: "customerName", label: t.invoices.customer, render: (item: any) => item.customerName ?? selectedCustomer?.customerName ?? "—" },
                  { key: "productName", label: t.reports.product },
                  { key: "quantity", label: t.reports.qtySold, align: "right" },
                  { key: "unitPrice", label: t.reports.unitPrice, align: "right", render: (item: any) => `EGP ${formatAmount(item.unitPrice)}` },
                  { key: "lineTotal", label: t.reports.lineTotal, align: "right", render: (item: any) => `EGP ${formatAmount(item.lineTotal)}` },
                  { key: "netSales", label: t.reports.netSales, align: "right", render: (item: any) => `EGP ${formatAmount(item.netSales)}` },
                ]}
              />
            )}

            {showPagination && (
              <Pagination
                currentStart={
                  data.meta.total === 0
                    ? 0
                    : (data.meta.page - 1) *
                        data.meta.limit +
                      1
                }
                currentEnd={
                  Math.min(
                    data.meta.page * data.meta.limit,
                    data.meta.total,
                  )
                }
                total={data.meta.total}
                currentPage={data.meta.page}
                totalPages={data.meta.totalPages}
                onPrev={handlePreviousPage}
                onNext={handleNextPage}
              />
            )}
          </Card>
        )}
      </div>
    </div>
  );
}