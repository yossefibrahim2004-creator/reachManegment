import { useState, useEffect, useCallback } from "react";
import api from "../../../lib/api";
import { isAbortError } from "../../../hooks";
import { LoadingSpinner } from "../../../components/ui/LoadingSpinner";
import { EmptyState } from "../../../components/ui/EmptyState";
import { useI18n } from "../../../i18n/context";
import { useReportPrint } from "../hooks/useReportPrint";
import PrintButton from "../components/PrintButton";
import ExcelExportButton from "../components/ExcelExportButton";
import PrintHeader from "../components/PrintHeader";
import ReportKpiCard from "../components/ReportKpiCard";
import DateRangePicker from "../../../components/ui/DateRangePicker";
import type { NetProfitReportResponse } from "../types";

const fmt = (n: number) =>
  n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export default function NetProfitReportPage() {
  const { t } = useI18n();
  const { printLimit, requestPrint, notifyReady } = useReportPrint();
  const [dateFrom, setDateFrom] = useState(() => {
    const d = new Date();
    d.setDate(1);
    return d.toISOString().slice(0, 10);
  });
  const [dateTo, setDateTo] = useState(() => new Date().toISOString().slice(0, 10));
  const [data, setData] = useState<NetProfitReportResponse | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async (signal?: AbortSignal) => {
    setLoading(true);
    try {
      const params: Record<string, string> = { from: dateFrom, to: dateTo };
      if (printLimit) params.limit = String(printLimit);
      const res = await api.get("/reports/net-profit", { params, signal });
      setData(res.data);
      if (printLimit) notifyReady();
    } catch (err) {
      if (isAbortError(err)) return;
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }, [dateFrom, dateTo, printLimit, notifyReady]);

  useEffect(() => {
    const controller = new AbortController();
    void fetchData(controller.signal);
    return () => controller.abort();
  }, [fetchData]);

  return (
    <div>
      <div className="no-print toolbar" style={{ marginBottom: "var(--section-gap)" }}>
        <DateRangePicker from={dateFrom} to={dateTo} onChange={(f, t) => { setDateFrom(f); setDateTo(t); }} />
        <PrintButton onClick={requestPrint} />
        <ExcelExportButton filename="net-profit-report" rows={data ? [data] : []} />
      </div>

      <div className="print-area">
        <PrintHeader titleEn={t.reports.netProfit} titleAr={t.reports.netProfit} range={{ from: dateFrom, to: dateTo }} />

        {loading ? (
          <div className="state-block">
            <LoadingSpinner size={32} />
          </div>
        ) : !data ? (
          <EmptyState title={t.noData} />
        ) : (
          <div className="form-grid" style={{ gap: "12px" }}>
            <ReportKpiCard label={t.reports.netSales} value={fmt(data.netSales)} color="var(--brand)" />
            <ReportKpiCard label={t.reports.expenses} value={fmt(data.totalExpenses)} color="var(--peach)" />
             <ReportKpiCard
              label={t.reports.cogs}
              value={fmt(data.cogs)}
              color="var(--peach)"
            />
            <ReportKpiCard label={t.reports.netSold} value={fmt(data.netProfit)} color="var(--mint)" />
          </div>
        )}
      </div>
    </div>
  );
}
