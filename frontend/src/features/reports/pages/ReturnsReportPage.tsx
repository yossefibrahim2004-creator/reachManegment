import { useState, useEffect, useCallback } from "react";
import api from "../../../lib/api";
import { isAbortError } from "../../../hooks";
import { Card } from "../../../components/ui/Card";
import { Table } from "../../../components/ui/Table";
import { Pagination } from "../../../components/ui/Pagination";
import { LoadingSpinner } from "../../../components/ui/LoadingSpinner";
import { EmptyState } from "../../../components/ui/EmptyState";
import { Button } from "../../../components/ui/Button";
import { useI18n } from "../../../i18n/context";
import { useReportPrint } from "../hooks/useReportPrint";
import PrintButton from "../components/PrintButton";
import ExcelExportButton from "../components/ExcelExportButton";
import PrintHeader from "../components/PrintHeader";
import DateRangePicker from "../../../components/ui/DateRangePicker";
import { ReportDetailPanel } from "../components/ReportDetailTable";
import type { ReturnsReportResponse } from "../types";

const fmt = (n: number) =>
  n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export default function ReturnsReportPage() {
  const { t } = useI18n();
  const { printLimit, requestPrint, notifyReady } = useReportPrint();
  const [dateFrom, setDateFrom] = useState(() => {
    const d = new Date();
    d.setDate(1);
    return d.toISOString().slice(0, 10);
  });
  const [dateTo, setDateTo] = useState(() => new Date().toISOString().slice(0, 10));
  const [data, setData] = useState<ReturnsReportResponse | null>(null);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [selectedReturn, setSelectedReturn] = useState<any | null>(null);
  const [detailMode, setDetailMode] = useState<"all" | "selected" | null>(null);
  const showAllDetails = detailMode === "all";
  const showSelectedDetails = detailMode === "selected" && !!selectedReturn;

  const fetchData = useCallback(async (signal?: AbortSignal) => {
    setLoading(true);
    try {
      const params: Record<string, string | number> = { from: dateFrom, to: dateTo, page: printLimit ? 1 : page, limit: printLimit || 10 };
      const res = await api.get("/reports/returns", { params, signal });
      setData(res.data);
      if (printLimit) notifyReady();
    } catch (err) {
      if (isAbortError(err)) return;
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }, [dateFrom, dateTo, page, printLimit, notifyReady]);

  useEffect(() => {
    const controller = new AbortController();
    void fetchData(controller.signal);
    return () => controller.abort();
  }, [fetchData]);

  return (
    <div>
      <div className="no-print toolbar" style={{ marginBottom: "var(--section-gap)" }}>
        <DateRangePicker from={dateFrom} to={dateTo} onChange={(f, t) => { setDateFrom(f); setDateTo(t); setPage(1); }} />
        <PrintButton onClick={requestPrint} />
        <ExcelExportButton filename="returns-report" rows={data?.items ?? []} />
      </div>

      <div className="print-area">
        <PrintHeader titleEn={t.reports.returns} titleAr={t.reports.returns} range={{ from: dateFrom, to: dateTo }} />

        {loading ? (
          <div className="state-block">
            <LoadingSpinner size={32} />
          </div>
        ) : !data || data.items.length === 0 ? (
          <EmptyState title={t.reports.noReturns} description={t.reports.noReturnsRecorded} />
        ) : (
          <Card
            title={t.reports.returns}
            actions={
              <span style={{ fontFamily: "'Manrope', sans-serif", fontSize: "14px", color: "var(--soft)" }}>
                {t.reports.totalRefunded}: <strong style={{ color: "var(--peach)" }}>{fmt(data.totalRefunds)}</strong>
              </span>
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
                    setSelectedReturn(null);
                    setDetailMode("all");
                  }}
                >
                  {showAllDetails ? t.reports.hideDetails : t.reports.showAllDetails}
                </Button>
                <Button
                  type="button"
                  variant={showSelectedDetails ? "primary" : "secondary"}
                  size="sm"
                  disabled={!selectedReturn}
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
              {selectedReturn && (
                <span style={{ color: "var(--soft)", fontSize: "12px", display: "inline-flex", alignItems: "center", gap: "6px" }}>
                  <span style={{ width: "8px", height: "8px", borderRadius: "50%", background: "var(--brand)", display: "inline-block" }} />
                  {t.reports.selected}: {selectedReturn.invoiceNumber}
                </span>
              )}
            </div>
            <Table
              columns={[
                { key: "invoiceNumber", label: t.reports.invoiceNumber },
                { key: "requestedByName", label: t.reports.employee },
                { key: "approvedByName", label: t.changeRequests.approve },
                { key: "itemCount", label: t.items, align: "right" },
                { key: "refundTotal", label: t.reports.refundTotal, align: "right", render: (r: any) => <span style={{ fontVariantNumeric: "tabular-nums" }}>{fmt(r.refundTotal)}</span> },
                { key: "reason", label: t.reports.reason },
                { key: "createdAt", label: t.date, render: (r: any) => new Date(r.createdAt).toLocaleDateString() },
              ]}
              data={data.items}
              emptyMessage={t.reports.noReturns}
              selectedRowKey={showSelectedDetails && selectedReturn ? String(selectedReturn.returnId) : null}
              onRowClick={(row: any) => {
                setSelectedReturn(row);
                setDetailMode("selected");
              }}
            />
            {(showAllDetails || showSelectedDetails) && (
              <ReportDetailPanel
                rowId={selectedReturn?.returnId ?? null}
                from={dateFrom}
                to={dateTo}
                endpoint="/reports/returns"
                detailTitle={selectedReturn ? t.reports.returnLines : t.reports.allReturnLines}
                groupBy={(item: any) => item.invoiceNumber || selectedReturn?.invoiceNumber || t.reports.unknown}
                groupLabel={(groupKey) => `${t.invoices.invoiceNumber}: ${groupKey}`}
                detailColumns={[
                  { key: "invoiceNumber", label: t.invoices.invoiceNumber, render: (item: any) => item.invoiceNumber ?? selectedReturn?.invoiceNumber ?? "—" },
                  { key: "productName", label: t.reports.product },
                  { key: "quantity", label: t.reports.qtySold, align: "right" },
                  { key: "refundAmount", label: t.reports.refundTotal, align: "right", render: (item: any) => fmt(item.refundAmount) },
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
