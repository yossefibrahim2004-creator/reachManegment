import { useState, useEffect, useCallback, useRef } from "react";
import { useNavigate } from "react-router-dom";
import api from "../../lib/api";
import { useDebouncedValue, isAbortError } from "../../hooks";
import { Button } from "../../components/ui/Button";
import { Input } from "../../components/ui/Input";
import { Select } from "../../components/ui/Select";
import { Card } from "../../components/ui/Card";
import { Table } from "../../components/ui/Table";
import { Pagination } from "../../components/ui/Pagination";
import { StatusChip } from "../../components/ui/StatusChip";
import { LoadingSpinner } from "../../components/ui/LoadingSpinner";
import { EmptyState } from "../../components/ui/EmptyState";
import { PageHeader } from "../../components/ui/PageHeader";
import { useI18n } from "../../i18n/context";
import type { Invoice, PaginatedResponse } from "../../types";

export default function InvoiceSearch() {
  const navigate = useNavigate();
  const { t } = useI18n();
  const [query, setQuery] = useState("");
  const debouncedQuery = useDebouncedValue(query, 300);
  const [page, setPage] = useState(1);
  const [showFilters, setShowFilters] = useState(false);
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [results, setResults] = useState<PaginatedResponse<Invoice> | null>(null);
  const [loading, setLoading] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  const fetchInvoices = useCallback(async () => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setLoading(true);
    try {
      const params: Record<string, any> = { page, limit: 15 };
      if (debouncedQuery.trim()) {
        params.search = debouncedQuery.trim();
      }
      if (dateFrom) params.dateFrom = dateFrom;
      if (dateTo) params.dateTo = dateTo;
      if (statusFilter) params.status = statusFilter;
      const { data } = await api.get<PaginatedResponse<Invoice>>("/invoices", {
        params,
        signal: controller.signal,
      });
      if (controller.signal.aborted) return;
      setResults(data);
    } catch (error) {
      if (isAbortError(error)) return;
      // handle silently
    } finally {
      if (!controller.signal.aborted) setLoading(false);
    }
  }, [page, debouncedQuery, dateFrom, dateTo, statusFilter]);

  useEffect(() => {
    fetchInvoices();
    return () => abortRef.current?.abort();
  }, [fetchInvoices]);

  // Submit only resets page — a single effect (keyed on debounced filters) fetches.
  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (page !== 1) setPage(1);
  };

  const columns = [
    {
      key: "invoiceNumber",
      label: t.invoices.invoiceNumber,
      render: (row: Invoice) => (
        <span style={{ fontWeight: 600, fontVariantNumeric: "tabular-nums" }}>{row.invoiceNumber}</span>
      ),
    },
    {
      key: "customer",
      label: t.invoices.customer,
      render: (row: Invoice) => row.customer?.name || "—",
    },
    {
      key: "employee",
      label: t.invoices.employee,
      render: (row: Invoice) => row.employee?.name || "—",
    },
    {
      key: "status",
      label: t.status,
      render: (row: Invoice) => <StatusChip status={row.status} />,
    },
    {
      key: "date",
      label: t.date,
      render: (row: Invoice) => new Date(row.date).toLocaleDateString(),
    },
    {
      key: "itemCount",
      label: t.items,
      align: "center" as const,
      render: (row: Invoice) => (
        <span style={{ fontVariantNumeric: "tabular-nums" }}>{row.itemCount ?? row.items?.length ?? 0}</span>
      ),
    },
    {
      key: "currentTotal",
      label: t.total,
      align: "right" as const,
      render: (row: Invoice) => (
        <span style={{ fontWeight: 600, fontVariantNumeric: "tabular-nums" }}>
        {t.currency} {Number(row.currentTotal).toFixed(2)}
        </span>
      ),
    },
  ];

  const data = results?.data || [];
  const meta = results?.meta;

  return (
    <div>
      <PageHeader
        title={t.pages.invoiceSearch}
        subtitle={t.pages.invoiceSearchSubtitle}
      />

      {/* Search Bar */}
      <form onSubmit={handleSearch} style={{ marginBottom: "16px" }}>
        <div className="toolbar" style={{ marginBottom: 0 }}>
          <div className="toolbar-grow">
            <Input
              placeholder={t.invoices.searchPlaceholder}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>
          <Button type="submit" variant="primary">
            {t.search}
          </Button>
          <Button
            type="button"
            variant="secondary"
            onClick={() => setShowFilters(!showFilters)}
          >
            {t.filters} {showFilters ? "▲" : "▼"}
          </Button>
        </div>
      </form>

      {/* Expandable Filters */}
      {showFilters && (
        <Card style={{ marginBottom: "16px" }}>
          <div className="form-grid" style={{ gap: "12px" }}>
            <Input
              label={t.date}
              type="date"
              value={dateFrom}
              onChange={(e) => {
                setDateFrom(e.target.value);
                setPage(1);
              }}
            />
            <Input
              label={t.date}
              type="date"
              value={dateTo}
              onChange={(e) => {
                setDateTo(e.target.value);
                setPage(1);
              }}
            />
            <Select
              label={t.status}
              options={[
                { label: t.all, value: "" },
                { label: t.statusLabels.pendingReview, value: "PENDING_ACCOUNTANT" },
                { label: t.statusLabels.confirmed, value: "CONFIRMED" },
                { label: t.statusLabels.delivered, value: "DELIVERED" },
                { label: t.statusLabels.cancelled, value: "CANCELLED" },
              ]}
              value={statusFilter}
              onChange={(e) => {
                setStatusFilter(e.target.value);
                setPage(1);
              }}
            />
          </div>
        </Card>
      )}

      {/* Results */}
      {loading ? (
        <div className="state-block">
          <LoadingSpinner size={28} />
        </div>
      ) : data.length === 0 ? (
        <EmptyState
          title={t.invoices.noInvoices}
          description={
            meta?.hint === "UNIT_NOT_FOUND"
              ? t.invoices.unitNotFound
              : meta?.hint === "UNIT_NOT_IN_ANY_INVOICE"
                ? t.invoices.unitNotInInvoice
                : t.invoices.tryDifferent
          }
          icon={
            <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
          }
        />
      ) : (
        <>
          <Table
            columns={columns}
            data={data}
            onRowClick={(row) => navigate(`/sales/invoice/${(row as unknown as Invoice).id}`)}
            keyExtractor={(row) => String((row as unknown as Invoice).id)}
          />
          {meta && meta.totalPages > 1 && (
            <Pagination
              currentStart={(meta.page - 1) * meta.limit + 1}
              currentEnd={Math.min(meta.page * meta.limit, meta.total)}
              total={meta.total}
              currentPage={meta.page}
              totalPages={meta.totalPages}
              onPrev={() => setPage((p) => Math.max(1, p - 1))}
              onNext={() => setPage((p) => Math.min(meta.totalPages, p + 1))}
              loading={loading}
            />
          )}
        </>
      )}
    </div>
  );
}
