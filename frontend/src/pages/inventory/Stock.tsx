import React from "react";
import api from "../../lib/api";
import { isAbortError, useCategories, useDebouncedValue } from "../../hooks";
import { Button } from "../../components/ui/Button";
import { Input } from "../../components/ui/Input";
import { Select } from "../../components/ui/Select";
import { Card } from "../../components/ui/Card";
import { Table } from "../../components/ui/Table";
import { Pagination } from "../../components/ui/Pagination";
import { PageHeader } from "../../components/ui/PageHeader";
import { Modal } from "../../components/ui/Modal";
import { StatusChip } from "../../components/ui/StatusChip";
import { LoadingSpinner } from "../../components/ui/LoadingSpinner";
import { EmptyState } from "../../components/ui/EmptyState";
import { useI18n } from "../../i18n/context";
import type { ProductUnit, UnitOfMeasure } from "../../types";

interface StockRow {
  categoryName: string;
  modelName: string;
  modelId: number;
  unit?: UnitOfMeasure;
  available: number;
  sold: number;
  damaged: number;
  total: number;
  units: ProductUnit[];
}

interface InventoryCountItem {
  id: number;
  name: string;
  category: { id: number; name: string } | null;
  isSerialized: boolean;
  unit?: UnitOfMeasure;
  // serialized-only
  available?: number;
  sold?: number;
  totalUnits?: number;
  units?: ProductUnit[];
  // non-serialized-only
  quantityAvailable?: number;
  quantityReceived?: number;
  lots?: unknown[];
  // shared — backend now returns this as a flat field for BOTH
  // serialized and non-serialized rows, so it's read the same way
  // regardless of isSerialized. Do not gate this behind isSerialized
  // in mapItem below, or non-serialized rows will always show 0.
  damaged?: number;
  // non-serialized-only: same total as `damaged`, broken down by
  // adjustment type (e.g. { DAMAGE: 5, LOSS: 2 }) if a more detailed
  // breakdown is ever needed in the UI.
  reductionsByType?: Record<string, number>;
}

interface InventoryCountResponse {
  data: InventoryCountItem[];
  meta: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

const mapItem = (item: InventoryCountItem): StockRow => ({
  categoryName: item.category?.name || "Unknown",
  modelName: item.name,
  modelId: item.id,
  unit: item.unit,
  available: item.isSerialized ? item.available || 0 : item.quantityAvailable || 0,
  sold: item.isSerialized ? item.sold || 0 : 0,
  // `damaged` is a flat field on the response for both serialized and
  // non-serialized items now — read it the same way for both instead of
  // hardcoding 0 for non-serialized rows.
  damaged: item.damaged || 0,
  total: item.isSerialized ? item.totalUnits || 0 : item.quantityReceived || 0,
  units: item.units || [],
});

export default function Stock() {
  const { t } = useI18n();
  const [rows, setRows] = React.useState<StockRow[]>([]);
  const [total, setTotal] = React.useState(0);
  const [loading, setLoading] = React.useState(true);
  const [loadError, setLoadError] = React.useState<string | null>(null);
  const [page, setPage] = React.useState(1);
  const { data: categories = [] } = useCategories();
  const [filterCategoryId, setFilterCategoryId] = React.useState("");
  const [filterModel, setFilterModel] = React.useState("");
  const [filterStatus, setFilterStatus] = React.useState("");
  const [detailRow, setDetailRow] = React.useState<StockRow | null>(null);
  const debouncedModel = useDebouncedValue(filterModel, 300);
  const limit = 15;

  React.useEffect(() => {
    setPage(1);
  }, [debouncedModel, filterCategoryId, filterStatus]);

  const loadStock = React.useCallback(
    async (signal?: AbortSignal) => {
      setLoading(true);
      setLoadError(null);
      try {
        const params: Record<string, string | number> = { page: 1, limit };
        if (debouncedModel.trim()) params.search = debouncedModel.trim();
        if (filterCategoryId) params.categoryId = Number(filterCategoryId);

        // Status filter is not supported server-side; fetch a large window for the
        // active search/category and paginate client-side for that view only.
        if (filterStatus) {
          params.limit = 1000;
        } else {
          params.page = page;
        }

        const response = await api.get<InventoryCountResponse>("/stock-items/inventory-count", {
          params,
          signal,
        });
        if (signal?.aborted) return;
        const mapped = response.data.data.map(mapItem);
        setRows(mapped);
        setTotal(response.data.meta?.total ?? mapped.length);
      } catch (err) {
        if (isAbortError(err)) return;
        setRows([]);
        setTotal(0);
        setLoadError(t.stock.noProductsMatch);
      } finally {
        if (!signal?.aborted) setLoading(false);
      }
    },
    [page, debouncedModel, filterCategoryId, filterStatus, limit, t.stock.noProductsMatch]
  );

  React.useEffect(() => {
    const controller = new AbortController();
    void loadStock(controller.signal);
    return () => controller.abort();
  }, [loadStock]);

  const filtered = React.useMemo(() => {
    if (!filterStatus) return rows;
    return rows.filter((r) => {
      if (filterStatus === "available") return r.available > 0;
      if (filterStatus === "sold") return r.sold > 0;
      if (filterStatus === "damaged") return r.damaged > 0;
      return true;
    });
  }, [rows, filterStatus]);

  const totalPages = React.useMemo(() => {
    if (filterStatus) return Math.max(1, Math.ceil(filtered.length / limit));
    return Math.max(1, Math.ceil(total / limit));
  }, [filterStatus, filtered.length, total, limit]);

  React.useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [page, totalPages]);

  const paged = React.useMemo(() => {
    if (filterStatus) return filtered.slice((page - 1) * limit, page * limit);
    return rows;
  }, [filterStatus, filtered, page, limit, rows]);

  const displayTotal = filterStatus ? filtered.length : total;

  const openDetail = (row: StockRow) => {
    if (row.units && row.units.length > 0) {
      setDetailRow(row);
    }
  };

  const columns = [
    {
      key: "categoryName",
      label: t.stock.category,
      render: (row: StockRow) => (
        <span style={{ fontWeight: 600, color: "var(--ink)" }}>{row.categoryName}</span>
      ),
    },
    {
      key: "modelName",
      label: t.stock.productModel,
      render: (row: StockRow) => (
        <span style={{ color: "var(--ink)" }}>
          {row.modelName}
          {row.unit === "METER" && (
            <small style={{ marginInlineStart: "6px", color: "var(--soft)", fontWeight: 500 }}>
              · {t.uom.METER}
            </small>
          )}
        </span>
      ),
    },
    {
      key: "available",
      label: t.stock.available,
      align: "right" as const,
      render: (row: StockRow) => (
        <span style={{ fontVariantNumeric: "tabular-nums", color: "var(--mint)", fontWeight: 600 }}>
          {row.available}
        </span>
      ),
    },
    {
      key: "sold",
      label: t.stock.sold,
      align: "right" as const,
      render: (row: StockRow) => (
        <span style={{ fontVariantNumeric: "tabular-nums", color: "var(--brand)", fontWeight: 600 }}>
          {row.sold}
        </span>
      ),
    },
    {
      key: "damaged",
      label: t.stock.damaged,
      align: "right" as const,
      render: (row: StockRow) => (
        <span style={{ fontVariantNumeric: "tabular-nums", color: "var(--accent)", fontWeight: 600 }}>
          {row.damaged}
        </span>
      ),
    },
    {
      key: "total",
      label: t.stock.total,
      align: "right" as const,
      render: (row: StockRow) => (
        <span style={{ fontVariantNumeric: "tabular-nums", fontWeight: 700, color: "var(--ink)" }}>
          {row.total}
        </span>
      ),
    },
    {
      key: "_hint",
      label: "",
      align: "right" as const,
      render: (row: StockRow) => {
        const hasUnits = row.units.length > 0;
        return hasUnits ? (
          <span style={{ fontSize: "12px", color: "var(--soft)" }}>{t.inventory.viewUnits}</span>
        ) : null;
      },
    },
  ];

  if (loading) {
    return (
      <div className="state-block">
        <LoadingSpinner size={28} />
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title={t.pages.inventoryStock}
        subtitle={`${displayTotal} ${t.stock.productModelsInInventory}`}
      />

      {loadError && (
        <Card
          style={{
            marginBottom: "16px",
            padding: "12px 16px",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: "12px",
            background: "var(--danger-bg)",
            border: "1px solid var(--danger)",
          }}
        >
          <span style={{ color: "var(--danger)", fontWeight: 600, fontSize: "13px" }}>
            {loadError}
          </span>
          <Button onClick={() => void loadStock()}>{t.back}</Button>
        </Card>
      )}

      <div className="stack">
        <div className="toolbar" style={{ marginBottom: 0 }}>
          <div className="toolbar-grow" style={{ maxWidth: 280 }}>
            <Input
              label={t.stock.searchByModel}
              placeholder={t.stock.searchByModel}
              value={filterModel}
              onChange={(e) => {
                setFilterModel(e.target.value);
                setPage(1);
              }}
            />
          </div>
          <div className="toolbar-fixed-wide">
            <Select
              label={t.stock.searchByCategory}
              options={[
                { label: t.all, value: "" },
                ...categories.map((c) => ({ label: c.name, value: String(c.id) })),
              ]}
              value={filterCategoryId}
              onChange={(e) => {
                setFilterCategoryId(e.target.value);
                setPage(1);
              }}
            />
          </div>
          <div className="toolbar-fixed-wide">
            <Select
              label={t.stock.filterStatus}
              options={[
                { label: t.all, value: "" },
                { label: t.stock.hasAvailable, value: "available" },
                { label: t.stock.hasSold, value: "sold" },
                { label: t.stock.hasDamaged, value: "damaged" },
              ]}
              value={filterStatus}
              onChange={(e) => {
                setFilterStatus(e.target.value);
                setPage(1);
              }}
            />
          </div>
        </div>

        {filtered.length === 0 ? (
          <EmptyState
            icon={
              <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <rect x="2" y="3" width="20" height="14" rx="2" ry="2" />
                <line x1="8" y1="21" x2="16" y2="21" />
                <line x1="12" y1="17" x2="12" y2="21" />
              </svg>
            }
            title={t.stock.noInventory}
            description={
              total === 0 && !debouncedModel && !filterCategoryId
                ? t.stock.noInventory
                : t.stock.noProductsMatch
            }
          />
        ) : (
          <>
            <Table
              columns={columns}
              data={paged}
              onRowClick={openDetail}
              keyExtractor={(row) => String(row.modelId)}
              emptyMessage={t.noResults}
            />
            <Pagination
              currentStart={(page - 1) * limit + 1}
              currentEnd={Math.min(page * limit, displayTotal)}
              total={displayTotal}
              currentPage={page}
              totalPages={totalPages}
              onPrev={() => setPage((p) => Math.max(1, p - 1))}
              onNext={() => setPage((p) => Math.min(totalPages, p + 1))}
            />
          </>
        )}
      </div>

      <Modal
        isOpen={!!detailRow}
        onClose={() => setDetailRow(null)}
        title={t.stock.stockDetail}
      >
        {detailRow && (
          <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <div>
                <div style={{ fontFamily: "'Manrope', sans-serif", fontSize: "12px", color: "var(--soft)" }}>
                  {t.reports.category}
                </div>
                <div style={{ fontFamily: "'Manrope', sans-serif", fontSize: "14px", fontWeight: 600, color: "var(--ink)" }}>
                  {detailRow.categoryName}
                </div>
              </div>
              <div>
                <div style={{ fontFamily: "'Manrope', sans-serif", fontSize: "12px", color: "var(--soft)" }}>
                  {t.inventory.model}
                </div>
                <div style={{ fontFamily: "'Manrope', sans-serif", fontSize: "14px", fontWeight: 600, color: "var(--ink)" }}>
                  {detailRow.modelName}
                </div>
              </div>
            </div>

            <div style={{ display: "flex", gap: "12px", flexWrap: "wrap", alignItems: "center" }}>
              <div>
                <div style={{ fontSize: "12px", color: "var(--soft)" }}>{t.inventory.available}</div>
                <div style={{ fontSize: "16px", fontWeight: 700, color: "var(--mint)" }}>{detailRow.available}</div>
              </div>
              <div>
                <div style={{ fontSize: "12px", color: "var(--soft)" }}>{t.inventory.sold}</div>
                <div style={{ fontSize: "16px", fontWeight: 700, color: "var(--brand)" }}>{detailRow.sold}</div>
              </div>
              <div>
                <div style={{ fontSize: "12px", color: "var(--soft)" }}>{t.inventory.damaged}</div>
                <div style={{ fontSize: "16px", fontWeight: 700, color: "var(--accent)" }}>{detailRow.damaged}</div>
              </div>
            </div>

            <div>
              <div style={{ fontSize: "12px", color: "var(--soft)", marginBottom: "8px" }}>
                {t.inventory.units} ({detailRow.units.length})
              </div>
              <div style={{ maxHeight: "260px", overflowY: "auto", display: "flex", flexDirection: "column", gap: "8px" }}>
                {detailRow.units.map((u) => (
                  <div
                    key={u.id}
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      padding: "8px 10px",
                      borderRadius: "8px",
                      background: "var(--surface-2)",
                    }}
                  >
                    <span
                      style={{
                        fontFamily: "'Manrope', sans-serif",
                        fontSize: "13px",
                        fontVariantNumeric: "tabular-nums",
                        color: "var(--ink)",
                      }}
                    >
                      {u.barcode}
                    </span>
                    <StatusChip status={u.status} />
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}