
import { useState, useEffect, useCallback, useRef } from "react";
import { useNavigate } from "react-router-dom";
import type { ReactNode } from "react";
import api from "../../../lib/api";
import { useAuth } from "../../../lib/auth";
import { Card } from "../../../components/ui/Card";
import { Table } from "../../../components/ui/Table";
import { Input } from "../../../components/ui/Input";
import { Select } from "../../../components/ui/Select";
import { Pagination } from "../../../components/ui/Pagination";
import { StatusChip } from "../../../components/ui/StatusChip";
import { LoadingSpinner } from "../../../components/ui/LoadingSpinner";
import { EmptyState } from "../../../components/ui/EmptyState";
import { useI18n } from "../../../i18n/context";
import { useReportPrint } from "../hooks/useReportPrint";
import PrintButton from "../components/PrintButton";
import ExcelExportButton from "../components/ExcelExportButton";
import PrintHeader from "../components/PrintHeader";
import ReportKpiCard from "../components/ReportKpiCard";
import DateRangePicker from "../../../components/ui/DateRangePicker";
import type { RevenueReportResponse } from "../types";
import type { Invoice } from "../../../types";

// ---------------------------------------------------------------------------
// Formatting helpers
// ---------------------------------------------------------------------------

function toNumber(value: number | string | null | undefined): number {
  if (value === null || value === undefined) return 0;

  const n = typeof value === "number" ? value : parseFloat(value);

  return Number.isFinite(n) ? n : 0;
}

const fmt = (n: number | string) =>
  toNumber(n).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

const fmtEGP = (n: number | string, currency?: string) =>
  `${currency ?? "EGP"} ${fmt(n)}`;

// Keep the date in the user's local timezone instead of converting it to UTC.
// Using toISOString() here can shift the date backward in Africa/Cairo.
function formatLocalDate(date: Date = new Date()): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface InvoicesMeta {
  page: number;
  totalPages: number;
  total: number;
  limit: number;
}

type InvoiceStatusFilter =
  | ""
  | "PENDING_ACCOUNTANT"
  | "CONFIRMED"
  | "DELIVERED"
  | "CANCELLED";

function getStatusOptions(
  t: ReturnType<typeof useI18n>["t"],
): { label: string; value: InvoiceStatusFilter }[] {
  return [
    { label: t.all, value: "" },
    {
      label: t.statusLabels.pendingReview,
      value: "PENDING_ACCOUNTANT",
    },
    {
      label: t.statusLabels.confirmed,
      value: "CONFIRMED",
    },
    {
      label: t.statusLabels.delivered,
      value: "DELIVERED",
    },
    {
      label: t.statusLabels.cancelled,
      value: "CANCELLED",
    },
  ];
}

const DEFAULT_INVOICES_META: InvoicesMeta = {
  page: 1,
  totalPages: 1,
  total: 0,
  limit: 10,
};

// ---------------------------------------------------------------------------
// Data hooks
// ---------------------------------------------------------------------------

function useRevenueSummary(
  dateFrom: string,
  dateTo: string,
  printLimit?: number,
) {
  const [data, setData] = useState<RevenueReportResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const fetch = useCallback(
    async (signal: AbortSignal) => {
      setLoading(true);
      setError(false);

      try {
        const params: Record<string, string | number> = {
          from: dateFrom,
          to: dateTo,
        };

        if (printLimit) {
          params.limit = printLimit;
        }

        const res = await api.get("/reports/revenue", {
          params,
          signal,
        });

        if (signal.aborted) return;

        setData(res.data);
      } catch {
        if (!signal.aborted) {
          setError(true);
        }
      } finally {
        if (!signal.aborted) {
          setLoading(false);
        }
      }
    },
    [dateFrom, dateTo, printLimit],
  );

  useEffect(() => {
    const controller = new AbortController();

    void fetch(controller.signal);

    return () => controller.abort();
  }, [fetch]);

  return {
    data,
    loading,
    error,
    refetch: fetch,
  };
}

function useInvoicesList(params: {
  dateFrom: string;
  dateTo: string;
  page: number;
  search: string;
  status: InvoiceStatusFilter;
  printLimit?: number;
}) {
  const { dateFrom, dateTo, page, search, status, printLimit } = params;

  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [meta, setMeta] = useState<InvoicesMeta>(DEFAULT_INVOICES_META);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const fetch = useCallback(
    async (signal: AbortSignal) => {
      setLoading(true);
      setError(false);

      try {
        const query: Record<string, string | number> = {
          from: dateFrom,
          to: dateTo,
          page: printLimit ? 1 : page,
          limit: printLimit ?? 10,
        };

        if (search) {
          query.number = search;
        }

        if (status) {
          query.status = status;
        }

        const res = await api.get("/invoices", {
          params: query,
          signal,
        });

        if (signal.aborted) return;

        setInvoices(res.data?.data ?? []);
        setMeta(res.data?.meta ?? DEFAULT_INVOICES_META);
      } catch {
        if (!signal.aborted) {
          setError(true);
        }
      } finally {
        if (!signal.aborted) {
          setLoading(false);
        }
      }
    },
    [dateFrom, dateTo, page, search, status, printLimit],
  );

  useEffect(() => {
    const controller = new AbortController();

    void fetch(controller.signal);

    return () => controller.abort();
  }, [fetch]);

  return {
    invoices,
    meta,
    loading,
    error,
    refetch: fetch,
  };
}

// ---------------------------------------------------------------------------
// Small presentational helpers
// ---------------------------------------------------------------------------

function SectionTitle({
  title,
  subtitle,
  right,
}: {
  title: string;
  subtitle?: string;
  right?: ReactNode;
}) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "flex-end",
        justifyContent: "space-between",
        marginBottom: "12px",
        gap: "12px",
        flexWrap: "wrap",
      }}
    >
      <div>
        <h3
          style={{
            fontFamily: "'Sora', sans-serif",
            fontSize: "16px",
            fontWeight: 700,
            color: "var(--ink)",
            margin: 0,
          }}
        >
          {title}
        </h3>

        {subtitle && (
          <p
            style={{
              fontFamily: "'Manrope', sans-serif",
              fontSize: "13px",
              color: "var(--soft)",
              margin: "2px 0 0",
            }}
          >
            {subtitle}
          </p>
        )}
      </div>

      {right}
    </div>
  );
}

function RetryPanel({
  message,
  onRetry,
  retryLabel,
}: {
  message: string;
  onRetry: () => void;
  retryLabel: string;
}) {
  return (
    <div role="alert" className="state-block">
      <p
        style={{
          fontFamily: "'Manrope', sans-serif",
          fontSize: "14px",
          color: "var(--soft)",
          margin: "0 0 12px",
        }}
      >
        {message}
      </p>

      <button
        type="button"
        onClick={onRetry}
        style={{
          padding: "8px 18px",
          borderRadius: "10px",
          border: "1px solid var(--border)",
          backgroundColor: "var(--card)",
          color: "var(--ink)",
          fontFamily: "'Manrope', sans-serif",
          fontSize: "13px",
          fontWeight: 600,
          cursor: "pointer",
        }}
      >
        {retryLabel}
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function RevenueReportPage() {
  const { t } = useI18n();
  const { user } = useAuth();
  const navigate = useNavigate();
  const { printLimit, requestPrint, notifyReady } = useReportPrint();

  // Page-level filter: date range
  const [dateFrom, setDateFrom] = useState(() => {
    const d = new Date();
    d.setDate(1);

    return formatLocalDate(d);
  });

  const [dateTo, setDateTo] = useState(() => formatLocalDate());

  // Invoice-list-only filters
  const [invoicesPage, setInvoicesPage] = useState(1);
  const [searchInput, setSearchInput] = useState("");
  const [invoicesSearch, setInvoicesSearch] = useState("");
  const [statusFilter, setStatusFilter] =
    useState<InvoiceStatusFilter>("");

  // Debounce the search box
  useEffect(() => {
    const handle = setTimeout(() => {
      setInvoicesSearch(searchInput.trim());
      setInvoicesPage(1);
    }, 400);

    return () => clearTimeout(handle);
  }, [searchInput]);

  // Changing the date range resets invoice pagination
  useEffect(() => {
    setInvoicesPage(1);
  }, [dateFrom, dateTo]);

  const summary = useRevenueSummary(
    dateFrom,
    dateTo,
    printLimit,
  );

  const invoicesList = useInvoicesList({
    dateFrom,
    dateTo,
    page: invoicesPage,
    search: invoicesSearch,
    status: statusFilter,
    printLimit,
  });

  // Fire the print-ready signal once, only after BOTH datasets have settled
  const printNotifiedRef = useRef(false);

  useEffect(() => {
    if (!printLimit) {
      printNotifiedRef.current = false;
      return;
    }

    if (
      !summary.loading &&
      !invoicesList.loading &&
      !printNotifiedRef.current
    ) {
      printNotifiedRef.current = true;
      notifyReady();
    }
  }, [
    printLimit,
    summary.loading,
    invoicesList.loading,
    notifyReady,
  ]);

  const statusOptions = getStatusOptions(t);

  const hasInvoiceFilters =
    invoicesSearch !== "" || statusFilter !== "";

  const clearInvoiceFilters = () => {
    setSearchInput("");
    setInvoicesSearch("");
    setStatusFilter("");
    setInvoicesPage(1);
  };

  const goToInvoice = (id: string | number) => {
    if (user?.role !== "ADMIN") return;

    navigate(`/admin/invoices/${id}`);
  };

  const invoiceColumns = [
    {
      key: "invoiceNumber",
      label: t.invoices.invoiceNumber,
      render: (r: Invoice) => (
        <span
          style={{
            fontFamily: "'Manrope', sans-serif",
            fontWeight: 600,
            fontVariantNumeric: "tabular-nums",
          }}
        >
          {r.invoiceNumber}
        </span>
      ),
    },
    {
      key: "customerName",
      label: t.invoices.customer,
      render: (r: Invoice) => r.customer?.name ?? "—",
    },
    {
      key: "employeeName",
      label: t.invoices.employee,
      render: (r: Invoice) => r.employee?.name ?? "—",
    },
    {
      key: "date",
      label: t.date,
      render: (r: Invoice) =>
        new Date(r.date).toLocaleDateString(),
    },
    {
      key: "status",
      label: t.status,
      render: (r: Invoice) => (
        <StatusChip status={r.status} />
      ),
    },
    {
      key: "currentTotal",
      label: t.total,
      align: "right" as const,
      render: (r: Invoice) => (
        <strong
          style={{
            fontVariantNumeric: "tabular-nums",
          }}
        >
          {fmtEGP(r.currentTotal, t.currency)}
        </strong>
      ),
    },
  ];

  const data = summary.data;

  return (
    <div>
      <style>{`
        @media print {
          .print-break {
            page-break-before: always;
          }

          .report-card {
            break-inside: avoid;
          }
        }
      `}</style>

      {/* Page-level filters */}
      <div
        className="no-print toolbar"
        style={{
          marginBottom: "var(--section-gap)",
        }}
      >
        <DateRangePicker
          from={dateFrom}
          to={dateTo}
          onChange={(from, to) => {
            setDateFrom(from);
            setDateTo(to);
          }}
        />

        <PrintButton onClick={requestPrint} />

        <ExcelExportButton
          filename="revenue-report"
          rows={data?.byDay ?? []}
        />
      </div>

      <div className="print-area">
        <PrintHeader
          titleEn={t.reports.revenue}
          titleAr={t.reports.revenue}
          range={{
            from: dateFrom,
            to: dateTo,
          }}
        />

        {/* ================================================================
            Revenue Summary / KPIs
            ================================================================ */}
        {summary.loading ? (
          <div className="state-block">
            <LoadingSpinner size={32} />
          </div>
        ) : summary.error ? (
          <RetryPanel
            message={t.reports.failedToLoadData}
            onRetry={() =>
              summary.refetch(
                new AbortController().signal,
              )
            }
            retryLabel={t.reports.retry}
          />
        ) : !data ? (
          <EmptyState title={t.noData} />
        ) : (
          <>
            {/* KPIs */}
            <div
              className="report-card form-grid"
              style={{
                gap: "12px",
                marginBottom: "var(--section-gap)",
              }}
            >
              <ReportKpiCard
                label={t.reports.grossSales}
                value={fmtEGP(
                  data.originalSales,
                  t.currency,
                )}
                color="var(--brand)"
              />

              <ReportKpiCard
                label={t.reports.adjustments}
                value={fmtEGP(
                  data.approvedAdjustments,
                  t.currency,
                )}
                color="var(--accent)"
              />

              <ReportKpiCard
                label={t.reports.returns}
                value={fmtEGP(
                  data.approvedReturns,
                  t.currency,
                )}
                color="var(--peach)"
              />

              <ReportKpiCard
                label={t.reports.netSales}
                value={fmtEGP(
                  data.netSales,
                  t.currency,
                )}
                color="var(--mint)"
              />
            </div>

            <div
              style={{
                marginBottom: "var(--section-gap)",
                fontFamily: "'Manrope', sans-serif",
                fontSize: "13px",
                color: "var(--soft)",
              }}
            >
              {t.reports.invoicesCount}:{" "}
              <strong style={{ color: "var(--ink)" }}>
                {data.invoiceCount}
              </strong>
            </div>
          </>
        )}

        {/* ================================================================
            Detailed Invoices Table

            This section is intentionally independent from the revenue
            summary request. Invoice data comes from /invoices directly.
            ================================================================ */}
        <div
          style={{
            marginBottom: "var(--section-gap)",
          }}
        >
          <SectionTitle
            title={
              t.reports.invoicesDetails ??
              t.invoices.invoiceNumber
            }
            subtitle={`${invoicesList.meta.total} ${t.invoices.invoiceNumber}`}
            right={
              <div
                className="no-print"
                style={{
                  display: "flex",
                  gap: "8px",
                  alignItems: "flex-end",
                  flexWrap: "wrap",
                }}
              >
                <div style={{ width: 200 }}>
                  <Input
                    placeholder={
                      t.invoices.searchPlaceholder
                    }
                    value={searchInput}
                    onChange={(e) =>
                      setSearchInput(e.target.value)
                    }
                  />
                </div>

                <div style={{ width: 160 }}>
                  <Select
                    options={statusOptions}
                    value={statusFilter}
                    onChange={(e) => {
                      setStatusFilter(
                        e.target
                          .value as InvoiceStatusFilter,
                      );
                      setInvoicesPage(1);
                    }}
                  />
                </div>

                {hasInvoiceFilters && (
                  <button
                    type="button"
                    onClick={clearInvoiceFilters}
                    style={{
                      padding: "10px 14px",
                      borderRadius: "10px",
                      border:
                        "1px solid var(--border)",
                      backgroundColor: "var(--card)",
                      color: "var(--soft)",
                      fontFamily:
                        "'Manrope', sans-serif",
                      fontSize: "13px",
                      fontWeight: 600,
                      cursor: "pointer",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {t.reports.clearFilters ??
                      "مسح الفلاتر"}
                  </button>
                )}
              </div>
            }
          />

          <Card className="report-card">
            {invoicesList.loading ? (
              <div
                style={{
                  display: "flex",
                  justifyContent: "center",
                  padding: "40px 0",
                }}
              >
                <LoadingSpinner size={24} />
              </div>
            ) : invoicesList.error ? (
              <RetryPanel
                message={t.reports.failedToLoadInvoices}
                onRetry={() =>
                  invoicesList.refetch(
                    new AbortController().signal,
                  )
                }
                retryLabel={t.reports.retry}
              />
            ) : invoicesList.invoices.length === 0 ? (
              <EmptyState
                title={t.invoices.noInvoices}
                description={t.invoices.tryDifferent}
              />
            ) : (
              <>
                <Table
                  columns={invoiceColumns}
                  data={invoicesList.invoices}
                  onRowClick={(r) =>
                    goToInvoice(
                      (r as unknown as Invoice).id,
                    )
                  }
                  keyExtractor={(r) =>
                    String(
                      (r as unknown as Invoice).id,
                    )
                  }
                />

                <div className="no-print">
                  <Pagination
                    currentStart={
                      (invoicesList.meta.page - 1) *
                        invoicesList.meta.limit +
                      1
                    }
                    currentEnd={Math.min(
                      invoicesList.meta.page *
                        invoicesList.meta.limit,
                      invoicesList.meta.total,
                    )}
                    total={invoicesList.meta.total}
                    currentPage={invoicesList.meta.page}
                    totalPages={
                      invoicesList.meta.totalPages
                    }
                    onPrev={() =>
                      setInvoicesPage((p) =>
                        Math.max(1, p - 1),
                      )
                    }
                    onNext={() =>
                      setInvoicesPage((p) =>
                        Math.min(
                          invoicesList.meta.totalPages,
                          p + 1,
                        ),
                      )
                    }
                  />
                </div>
              </>
            )}
          </Card>
        </div>

        {/* ================================================================
            Summary table
            ================================================================ */}
        {data?.byDay && data.byDay.length > 0 && (
          <div className="print-break">
            <SectionTitle
              title={t.reports.daily}
              subtitle={t.reports.netSales}
            />

            <Card className="report-card">
              <Table
                columns={[
                  {
                    key: "date",
                    label: t.date,
                  },
                  {
                    key: "total",
                    label: t.total,
                    align: "right",
                    render: (
                      r: { total: number | string },
                    ) => (
                      <strong
                        style={{
                          fontVariantNumeric:
                            "tabular-nums",
                        }}
                      >
                        {fmtEGP(
                          r.total,
                          t.currency,
                        )}
                      </strong>
                    ),
                  },
                ]}
                data={data.byDay}
                emptyMessage={t.noData}
              />
            </Card>
          </div>
        )}
      </div>
    </div>
  );
}
