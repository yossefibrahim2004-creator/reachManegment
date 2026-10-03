import { useState, useEffect, useCallback, useMemo } from "react";
import api from "../../../lib/api";
import { useDebouncedValue, isAbortError, useCategories } from "../../../hooks";
import { Card } from "../../../components/ui/Card";
import { Table } from "../../../components/ui/Table";
import { Pagination } from "../../../components/ui/Pagination";
import { LoadingSpinner } from "../../../components/ui/LoadingSpinner";
import { EmptyState } from "../../../components/ui/EmptyState";
import { Select } from "../../../components/ui/Select";
import { Input } from "../../../components/ui/Input";
import { useI18n } from "../../../i18n/context";
import { useReportPrint } from "../hooks/useReportPrint";
import PrintButton from "../components/PrintButton";
import ExcelExportButton from "../components/ExcelExportButton";
import PrintHeader from "../components/PrintHeader";
import ReportKpiCard from "../components/ReportKpiCard";
import type { InventoryReportResponse, InventoryReportRow } from "../types";

const fmt = (n: number) =>
  n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export default function InventoryReportPage() {
  const { t } = useI18n();
  const { printLimit, requestPrint, notifyReady } = useReportPrint();
  const today = new Date().toISOString().slice(0, 10);
  const [categoryFilter, setCategoryFilter] = useState("");
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebouncedValue(search, 300);
  const { data: categoryRows = [] } = useCategories();
  const categories = useMemo(
    () => categoryRows.map((category) => ({ label: category.name, value: String(category.id) })),
    [categoryRows]
  );
  const [data, setData] = useState<InventoryReportResponse | null>(null);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async (signal?: AbortSignal) => {
    setLoading(true);
    try {
      const params: Record<string, string | number> = { page: printLimit ? 1 : page, limit: printLimit || 25 };
      if (categoryFilter) params.categoryId = Number(categoryFilter);
      if (debouncedSearch.trim()) params.search = debouncedSearch.trim();
      const { data: res } = await api.get<InventoryReportResponse>("/reports/inventory", { params, signal });
      setData(res);
      if (printLimit) notifyReady();
    } catch (err) {
      if (isAbortError(err)) return;
      setData(null);
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }, [page, categoryFilter, debouncedSearch, printLimit, notifyReady]);

  useEffect(() => {
    const controller = new AbortController();
    void fetchData(controller.signal);
    return () => controller.abort();
  }, [fetchData]);

  const filters = useMemo(() => {
    const result: Array<{ label: string; value: string }> = [];
    if (categoryFilter) {
      result.push({
        label: t.reports.category,
        value: categories.find((option) => option.value === categoryFilter)?.label || t.reports.selectedCategory,
      });
    }
    if (debouncedSearch.trim()) {
      result.push({ label: t.reports.product, value: debouncedSearch.trim() });
    }
    return result;
  }, [categoryFilter, debouncedSearch, categories, t]);

  const columns = [
    {
      key: "categoryName",
      label: t.reports.category,
      render: (row: InventoryReportRow) => <span style={{ fontWeight: 600 }}>{row.categoryName}</span>,
    },
    {
      key: "productModelName",
      label: t.reports.product,
      render: (row: InventoryReportRow) => <span>{row.productModelName}</span>,
    },
    {
      key: "serialStatus",
      label: t.reports.stockType || "serialStatus",
      render: (row: InventoryReportRow) => (
        <span style={{ color: "var(--soft)", fontSize: "12px" }}>
          {row.isSerialized ? (t.reports.serialized || "Serialized") : (t.reports.bulk || "Bulk")}
        </span>
      ),
    },
    {
  key: "type",
  label: "Serial",
  render: (row: InventoryReportRow) => (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: "6px",
        padding: "4px 10px",
        borderRadius: "6px",
        backgroundColor: row.isSerialized
          ? "var(--mint-bg)"
          : "var(--bg-active)",
        color: row.isSerialized ? "var(--mint)" : "var(--soft)",
        fontSize: "12px",
        fontWeight: 600,
        whiteSpace: "nowrap",
      }}
    >
      <span
        style={{
          width: "6px",
          height: "6px",
          borderRadius: "50%",
          background: row.isSerialized ? "var(--mint)" : "var(--soft)",
        }}
      />

      {row.isSerialized ? "بسيريال" : "بدون سيريال"}
    </span>
  ),
},
    {
      key: "available",
      label: t.stock.available,
      align: "right" as const,
      render: (row: InventoryReportRow) => (
        <span
          style={{
            fontVariantNumeric: "tabular-nums",
            fontWeight: 600,
            color: row.lowStock ? "var(--accent)" : "var(--mint)",
          }}
        >
          {row.available}
        </span>
      ),
    },
    {
      key: "reserved",
      label: t.statusLabels.reserved,
      align: "right" as const,
      render: (row: InventoryReportRow) => (
        <span style={{ fontVariantNumeric: "tabular-nums", color: "var(--peach)" }}>{row.reserved}</span>
      ),
    },
    {
      key: "sold",
      label: t.stock.sold,
      align: "right" as const,
      render: (row: InventoryReportRow) => <span style={{ fontVariantNumeric: "tabular-nums" }}>{row.sold}</span>,
    },
    {
      key: "damaged",
      label: t.stock.damaged,
      align: "right" as const,
      render: (row: InventoryReportRow) => (
        <span style={{ fontVariantNumeric: "tabular-nums", color: row.damaged > 0 ? "var(--accent)" : undefined }}>
          {row.damaged}
        </span>
      ),
    },
    {
      key: "totalReceived",
      label: t.reports.totalReceived || "Total Received",
      align: "right" as const,
      render: (row: InventoryReportRow) => (
        <span style={{ fontVariantNumeric: "tabular-nums" }}>{row.totalReceived}</span>
      ),
    },
    {
      key: "minStockAlert",
      label: t.inventory.minStock || "Min Stock",
      align: "right" as const,
      render: (row: InventoryReportRow) => (
        <span style={{ fontVariantNumeric: "tabular-nums", color: "var(--soft)" }}>{row.minStockAlert}</span>
      ),
    },
    {
      key: "stockValue",
      label: t.reports.stockValue || "Stock Value",
      align: "right" as const,
      render: (row: InventoryReportRow) => (
        <span style={{ fontVariantNumeric: "tabular-nums", fontWeight: 600 }}>
          {t.currency} {fmt(row.stockValue)}
        </span>
      ),
    },
    {
      key: "lowStock",
      label: t.reports.status || "Status",
      render: (row: InventoryReportRow) =>
        row.lowStock ? (
          <span
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "6px",
              padding: "2px 10px",
              borderRadius: "999px",
              backgroundColor: "var(--accent-bg)",
              color: "var(--accent)",
              fontSize: "12px",
              fontWeight: 600,
            }}
          >
            <span style={{ width: "6px", height: "6px", borderRadius: "50%", background: "var(--accent)" }} />
            {t.reports.lowStock || "Low Stock"}
          </span>
        ) : (
          <span
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "6px",
              padding: "2px 10px",
              borderRadius: "999px",
              backgroundColor: "var(--mint-bg)",
              color: "var(--mint)",
              fontSize: "12px",
              fontWeight: 600,
            }}
          >
            <span style={{ width: "6px", height: "6px", borderRadius: "50%", background: "var(--mint)" }} />
            {t.reports.ok || "OK"}
          </span>
        ),
    },
  ];

  return (
    <div>
      <div className="no-print toolbar" style={{ marginBottom: "var(--section-gap)" }}>
        <Select
          label={t.reports.category}
          value={categoryFilter}
          onChange={(event) => { setCategoryFilter(event.target.value); setPage(1); }}
          options={[{ label: t.reports.allCategories, value: "" }, ...categories]}
          style={{ minWidth: 180 }}
        />
        <div style={{ minWidth: 220 }}>
          <Input
            label={t.reports.product}
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder={t.reports.searchProducts || "Search products..."}
          />
        </div>
        <PrintButton onClick={requestPrint} />
        <ExcelExportButton filename="inventory-report" rows={data?.items ?? []} sheetName="Inventory" />
      </div>

      <div className="print-area">
        <PrintHeader
          titleEn={t.reports.inventoryReport || "Warehouse Inventory Report"}
          titleAr={t.reports.inventoryReportAr || "تقرير مخزون المخزن"}
          range={{ from: today, to: today }}
          filters={filters}
        />

        {loading ? (
          <div className="state-block">
            <LoadingSpinner size={32} />
          </div>
        ) : !data ? (
          <EmptyState title={t.reports.failedToLoadReport} description={t.reports.failedToLoadData} />
        ) : (
          <>
            <div
              className="form-grid"
              style={{
                gap: "12px",
                marginBottom: "var(--section-gap)",
              }}
            >
              <ReportKpiCard label={t.reports.productModels || "Products"} value={String(data.totals.productModels)} color="var(--brand)" />
              <ReportKpiCard label={t.stock.available} value={String(data.totals.availableUnits)} color="var(--mint)" />
              <ReportKpiCard label={t.statusLabels.reserved} value={String(data.totals.reservedUnits)} color="var(--peach)" />
              <ReportKpiCard label={t.reports.lowStock || "Low Stock"} value={String(data.totals.lowStockCount)} color="var(--accent)" />
              <ReportKpiCard label={t.reports.stockValue || "Stock Value"} value={fmt(data.totals.stockValue)} color="var(--mint)" />
            </div>

            <Card title={t.reports.inventoryReport || "Warehouse Inventory Report"}>
              <Table columns={columns} data={data.items as any[]} emptyMessage={t.noData} />
              {!printLimit && data.meta.totalPages > 1 && (
                <Pagination
                  currentStart={(data.meta.page - 1) * data.meta.limit + 1}
                  currentEnd={Math.min(data.meta.page * data.meta.limit, data.meta.total)}
                  total={data.meta.total}
                  currentPage={data.meta.page}
                  totalPages={data.meta.totalPages}
                  onPrev={() => setPage((p) => Math.max(1, p - 1))}
                  onNext={() => setPage((p) => Math.min(data.meta.totalPages, p + 1))}
                />
              )}
            </Card>
          </>
        )}
      </div>
    </div>
  );
}
