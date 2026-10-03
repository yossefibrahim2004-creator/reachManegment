import { useState, useEffect, useCallback, useMemo } from "react";
import api from "../../../lib/api";
import { ALL_OPTIONS_LIMIT, isAbortError, useCategories } from "../../../hooks";
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
import type { ProductSalesReportResponse } from "../types";

const fmt = (n: number) =>
  n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export default function ProductSalesReportPage() {
  const { t } = useI18n();
  const { printLimit, requestPrint, notifyReady } = useReportPrint();
  const [dateFrom, setDateFrom] = useState(() => {
    const d = new Date();
    d.setDate(1);
    return d.toISOString().slice(0, 10);
  });
  const [dateTo, setDateTo] = useState(() => new Date().toISOString().slice(0, 10));
  const [categoryFilter, setCategoryFilter] = useState("");
  const [productModelFilter, setProductModelFilter] = useState("");
  const { data: categoryRows = [] } = useCategories();
  const categories = useMemo(
    () => categoryRows.map((category) => ({ label: category.name, value: String(category.id) })),
    [categoryRows]
  );
  const [productModels, setProductModels] = useState<Array<{ label: string; value: string }>>([]);
  const [data, setData] = useState<ProductSalesReportResponse | null>(null);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [selectedProduct, setSelectedProduct] = useState<any | null>(null);
  const [detailMode, setDetailMode] = useState<"all" | "selected" | null>(null);
  const showAllDetails = detailMode === "all";
  const showSelectedDetails = detailMode === "selected" && !!selectedProduct;

  useEffect(() => {
    if (!categoryFilter) {
      setProductModels([]);
      setProductModelFilter("");
      return;
    }

    const controller = new AbortController();
    const { signal } = controller;

    const loadModels = async () => {
      try {
        const { data: res } = await api.get<{ data?: Array<{ id: number; name: string }> }>(`/product-models`, {
          params: { categoryId: categoryFilter, page: 1, limit: ALL_OPTIONS_LIMIT },
          signal,
        });
        if (signal.aborted) return;
        const options = (res?.data ?? []).map((model) => ({ label: model.name, value: String(model.id) }));
        setProductModels(options);
        setProductModelFilter("");
      } catch (err) {
        if (isAbortError(err)) return;
        setProductModels([]);
        setProductModelFilter("");
      }
    };

    void loadModels();
    return () => controller.abort();
  }, [categoryFilter]);

  const fetchData = useCallback(async (signal?: AbortSignal) => {
    setLoading(true);
    try {
      const params: Record<string, string | number> = { from: dateFrom, to: dateTo, page: printLimit ? 1 : page, limit: printLimit || 10 };
      if (categoryFilter) params.categoryId = Number(categoryFilter);
      if (productModelFilter) params.productModelId = Number(productModelFilter);
      const res = await api.get("/reports/products-sales", { params, signal });
      setData(res.data);
      if (printLimit) notifyReady();
    } catch (err) {
      if (isAbortError(err)) return;
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }, [dateFrom, dateTo, categoryFilter, productModelFilter, page, printLimit, notifyReady]);

  useEffect(() => {
    const controller = new AbortController();
    void fetchData(controller.signal);
    return () => controller.abort();
  }, [fetchData]);

  return (
    <div>
      <div className="no-print toolbar" style={{ marginBottom: "var(--section-gap)" }}>
        <DateRangePicker from={dateFrom} to={dateTo} onChange={(f, t) => { setDateFrom(f); setDateTo(t); setPage(1); }} />
        <Select
          label={t.reports.category}
          value={categoryFilter}
          onChange={(event) => { setCategoryFilter(event.target.value); setPage(1); }}
          options={[{ label: t.reports.allCategories, value: "" }, ...categories]}
          style={{ minWidth: 180 }}
        />
        <Select
          label={t.reports.product}
          value={productModelFilter}
          onChange={(event) => { setProductModelFilter(event.target.value); setPage(1); }}
          options={[{ label: t.reports.allProducts, value: "" }, ...productModels]}
          style={{ minWidth: 210 }}
          disabled={!categoryFilter}
        />
        <PrintButton onClick={requestPrint} />
        <ExcelExportButton filename="product-sales-report" rows={data?.items ?? []} />
      </div>

      <div className="print-area">
        <PrintHeader
          titleEn={t.reports.productSales}
          titleAr={t.reports.productSales}
          range={{ from: dateFrom, to: dateTo }}
          filters={[
            ...(categoryFilter ? [{ label: t.reports.category, value: categories.find((option) => option.value === categoryFilter)?.label || t.reports.selectedCategory }] : []),
            ...(productModelFilter ? [{ label: t.reports.product, value: productModels.find((option) => option.value === productModelFilter)?.label || t.reports.selectedProduct }] : []),
          ]}
        />

        {loading ? (
          <div className="state-block">
            <LoadingSpinner size={32} />
          </div>
        ) : !data || data.items.length === 0 ? (
          <EmptyState title={t.noData} description={t.reports.noProductSales} />
        ) : (
          <Card title={t.reports.productSales}>
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
                    setSelectedProduct(null);
                    setDetailMode("all");
                  }}
                >
                  {showAllDetails ? t.reports.hideDetails : t.reports.showAllDetails}
                </Button>
                <Button
                  type="button"
                  variant={showSelectedDetails ? "primary" : "secondary"}
                  size="sm"
                  disabled={!selectedProduct}
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
              {selectedProduct && (
                <span style={{ color: "var(--soft)", fontSize: "12px", display: "inline-flex", alignItems: "center", gap: "6px" }}>
                  <span style={{ width: "8px", height: "8px", borderRadius: "50%", background: "var(--brand)", display: "inline-block" }} />
                  {t.reports.selected}: {selectedProduct.productModelName}
                </span>
              )}
            </div>
            <Table
              columns={[
                { key: "productModelName", label: t.reports.product },
                { key: "categoryName", label: t.reports.category },
                { key: "soldEvents", label: t.reports.soldEvents, align: "right", render: (r: any) => <span style={{ fontVariantNumeric: "tabular-nums" }}>{r.soldEvents}</span> },
                { key: "returnedEvents", label: t.reports.returnedEvents, align: "right", render: (r: any) => <span style={{ fontVariantNumeric: "tabular-nums", color: "var(--peach)" }}>{r.returnedEvents}</span> },
                { key: "netUnitsSold", label: t.reports.netSold, align: "right", render: (r: any) => <strong style={{ fontVariantNumeric: "tabular-nums" }}>{r.netUnitsSold}</strong> },
                { key: "revenue", label: t.reports.revenue, align: "right", render: (r: any) => <span style={{ fontVariantNumeric: "tabular-nums" }}>{fmt(r.revenue)}</span> },
              ]}
              data={data.items}
              emptyMessage={t.reports.noProductSales}
              selectedRowKey={showSelectedDetails && selectedProduct ? String(selectedProduct.productModelId) : null}
              onRowClick={(row: any) => {
                setSelectedProduct(row);
                setDetailMode("selected");
              }}
            />
            {(showAllDetails || showSelectedDetails) && (
              <ReportDetailPanel
                rowId={selectedProduct?.productModelId ?? null}
                from={dateFrom}
                to={dateTo}
                endpoint="/reports/products-sales"
                detailTitle={selectedProduct ? t.reports.productDetailLines : t.reports.allProductDetailLines}
                groupBy={(item: any) => item.productName || selectedProduct?.productModelName || t.reports.unknown}
                groupLabel={(groupKey) => `${t.reports.product}: ${groupKey}`}
                detailColumns={[
                  { key: "invoiceNumber", label: t.invoices.invoiceNumber },
                  { key: "invoiceDate", label: t.date, render: (item: any) => new Date(item.invoiceDate).toLocaleDateString() },
                  { key: "customerName", label: t.invoices.customer },
                  { key: "productName", label: t.reports.product, render: (item: any) => item.productName ?? selectedProduct?.productModelName ?? "—" },
                  { key: "quantity", label: t.reports.qtySold, align: "right" },
                  { key: "lineTotal", label: t.reports.lineTotal, align: "right", render: (item: any) => fmt(item.lineTotal) },
                ]}
              />
            )}
            {!printLimit && (
              <Pagination
                currentStart={(data.meta.page - 1) * data.meta.limit + 1}
                currentEnd={Math.min(data.meta.page * data.meta.limit, data.meta.total)}
                total={data.meta.total}
                currentPage={data.meta.page}
                totalPages={data.meta.totalPages}
                onPrev={() => setPage(page - 1)}
                onNext={() => setPage(page + 1)}
              />
            )}
          </Card>
        )}
      </div>
    </div>
  );
}
