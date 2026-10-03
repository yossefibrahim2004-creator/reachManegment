import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import api from "../../lib/api";
import { useDebouncedValue, isAbortError } from "../../hooks";
import { PageHeader } from "../../components/ui/PageHeader";
import { Button } from "../../components/ui/Button";
import { Input } from "../../components/ui/Input";
import { Select } from "../../components/ui/Select";
import { Table } from "../../components/ui/Table";
import { Pagination } from "../../components/ui/Pagination";
import { StatusChip } from "../../components/ui/StatusChip";
import { LoadingSpinner } from "../../components/ui/LoadingSpinner";
import { EmptyState } from "../../components/ui/EmptyState";
import DateRangePicker from "../../components/ui/DateRangePicker";
import { useI18n } from "../../i18n/context";
import { useRealtimeRefresh } from "../../hooks/useRealtimeEvents";
import type { Invoice } from "../../types";

export default function Invoices() {
  const { t } = useI18n();
  const navigate = useNavigate();
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [meta, setMeta] = useState<{
    page: number;
    totalPages: number;
    total: number;
    limit: number;
    hint?: "UNIT_NOT_FOUND" | "UNIT_NOT_IN_ANY_INVOICE";
  }>({ page: 1, totalPages: 1, total: 0, limit: 20 });
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebouncedValue(search, 300);
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [page, setPage] = useState(1);

  const fetchInvoices = useCallback(async (signal?: AbortSignal) => {
    setLoading(true);
    try {
      const params: Record<string, string | number> = { page, limit: 20 };
      if (debouncedSearch) params.search = debouncedSearch;
      if (dateFrom) params.dateFrom = dateFrom;
      if (dateTo) params.dateTo = dateTo;
      if (statusFilter) params.status = statusFilter;
      const res = await api.get("/invoices", { params, signal });
      setInvoices(res.data.data ?? res.data);
      setMeta(res.data.meta ?? { page: 1, totalPages: 1, total: 0, limit: 20 });
    } catch (err) {
      if (isAbortError(err)) return;
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }, [page, debouncedSearch, dateFrom, dateTo, statusFilter]);

  useEffect(() => {
    const controller = new AbortController();
    void fetchInvoices(controller.signal);
    return () => controller.abort();
  }, [fetchInvoices]);

  useRealtimeRefresh(() => {
    void fetchInvoices();
  }, ["invoice.created", "invoice.confirmed", "invoice.rejected", "invoice.delivery.scan", "invoice.delivered"]);

  const fmt = (n: number) =>
    n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  const columns = [
    { key: "invoiceNumber", label: t.invoices.invoiceNumber, render: (r: Invoice) => <span style={{ fontFamily: "'Manrope', sans-serif", fontWeight: 600, fontVariantNumeric: "tabular-nums" }}>{r.invoiceNumber}</span> },
    { key: "customerName", label: t.invoices.customer, render: (r: Invoice) => r.customer?.name ?? "—" },
    { key: "employeeName", label: t.invoices.employee, render: (r: Invoice) => r.employee?.name ?? "—" },
    { key: "date", label: t.date, render: (r: Invoice) => new Date(r.date).toLocaleDateString() },
    { key: "status", label: t.status, render: (r: Invoice) => <StatusChip status={r.status} /> },
    { key: "currentTotal", label: t.total, align: "right" as const, render: (r: Invoice) => <span style={{ fontVariantNumeric: "tabular-nums" }}>{t.currency} {fmt(r.currentTotal)}</span> },
  ];

  return (
    <div>
      <PageHeader
        title={t.pages.invoices}
        subtitle={t.pages.invoicesSubtitle}
        actions={<Button onClick={() => navigate("/admin/new-invoice")}>{t.nav.newInvoice}</Button>}
      />

      <div className="toolbar">
        <div className="toolbar-grow">
          <Input placeholder={t.invoices.searchPlaceholder} value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} />
        </div>
        <DateRangePicker from={dateFrom} to={dateTo} onChange={(f, t) => { setDateFrom(f); setDateTo(t); setPage(1); }} />
        <div className="toolbar-fixed">
          <Select
            options={[
              { label: t.all, value: "" },
              { label: t.statusLabels.pendingReview, value: "PENDING_ACCOUNTANT" },
              { label: t.statusLabels.confirmed, value: "CONFIRMED" },
              { label: t.statusLabels.delivered, value: "DELIVERED" },
              { label: t.statusLabels.cancelled, value: "CANCELLED" },
            ]}
            value={statusFilter}
            onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}
          />
        </div>
      </div>

      {loading ? (
        <div className="state-block">
          <LoadingSpinner size={28} />
        </div>
      ) : invoices.length === 0 ? (
        <EmptyState
          title={t.invoices.noInvoices}
          description={
            meta.hint === "UNIT_NOT_FOUND"
              ? t.invoices.unitNotFound
              : meta.hint === "UNIT_NOT_IN_ANY_INVOICE"
                ? t.invoices.unitNotInInvoice
                : t.invoices.tryDifferent
          }
        />
      ) : (
        <>
          <Table
            columns={columns}
            data={invoices}
            onRowClick={(r) => navigate(`/admin/invoices/${(r as unknown as Invoice).id}`)}
            keyExtractor={(r) => String((r as unknown as Invoice).id)}
          />
          <Pagination
            currentStart={(meta.page - 1) * meta.limit + 1}
            currentEnd={Math.min(meta.page * meta.limit, meta.total)}
            total={meta.total}
            currentPage={meta.page}
            totalPages={meta.totalPages}
            onPrev={() => setPage((p) => Math.max(1, p - 1))}
            onNext={() => setPage((p) => Math.min(meta.totalPages, p + 1))}
          />
        </>
      )}
    </div>
  );
}
