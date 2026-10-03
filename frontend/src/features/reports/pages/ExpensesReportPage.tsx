import { useState, useEffect, useCallback } from "react";
import api from "../../../lib/api";
import { isAbortError } from "../../../hooks";
import { Card } from "../../../components/ui/Card";
import { Table } from "../../../components/ui/Table";
import { Pagination } from "../../../components/ui/Pagination";
import { LoadingSpinner } from "../../../components/ui/LoadingSpinner";
import { EmptyState } from "../../../components/ui/EmptyState";
import { useI18n } from "../../../i18n/context";
import { useReportPrint } from "../hooks/useReportPrint";
import PrintButton from "../components/PrintButton";
import ExcelExportButton from "../components/ExcelExportButton";
import PrintHeader from "../components/PrintHeader";
import DateRangePicker from "../../../components/ui/DateRangePicker";
import type { ExpensesReportResponse } from "../types";

const fmt = (n: number) =>
  n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export default function ExpensesReportPage() {
  const { t } = useI18n();
  const { printLimit, requestPrint, notifyReady } = useReportPrint();
  const [dateFrom, setDateFrom] = useState(() => {
    const d = new Date();
    d.setDate(1);
    return d.toISOString().slice(0, 10);
  });
  const [dateTo, setDateTo] = useState(() => new Date().toISOString().slice(0, 10));
  const [summary, setSummary] = useState<ExpensesReportResponse | null>(null);
  const [rows, setRows] = useState<any[]>([]);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async (signal?: AbortSignal) => {
    setLoading(true);
    try {
      const params: Record<string, string | number> = { from: dateFrom, to: dateTo, page: printLimit ? 1 : page, limit: printLimit || 10 };
      const [summaryRes, detailsRes] = await Promise.all([
        api.get("/reports/expenses", { params, signal }),
        api.get("/reports/expenses/details", { params, signal }),
      ]);
      setSummary(summaryRes.data);
      setRows(detailsRes.data?.items ?? []);
      if (printLimit) notifyReady();
    } catch (err) {
      if (isAbortError(err)) return;
      setSummary(null);
      setRows([]);
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
        <ExcelExportButton filename="expenses-report" rows={rows} />
      </div>

      <div className="print-area">
        <PrintHeader titleEn={t.reports.expenses} titleAr={t.reports.expenses} range={{ from: dateFrom, to: dateTo }} />

        {loading ? (
          <div className="state-block">
            <LoadingSpinner size={32} />
          </div>
        ) : rows.length === 0 ? (
          <EmptyState title={t.noData} description={t.reports.noExpenses} />
        ) : (
          <Card
            title={t.reports.expenses}
            actions={
              <span style={{ fontFamily: "'Manrope', sans-serif", fontSize: "14px", color: "var(--soft)" }}>
                {t.total}: <strong style={{ color: "var(--ink)" }}>{fmt(summary?.totalExpenses ?? 0)}</strong>
              </span>
            }
          >
            <Table
              columns={[
                { key: "date", label: t.date, render: (item: any) => new Date(item.date).toLocaleDateString() },
                { key: "categoryName", label: t.reports.category },
                { key: "description", label: t.description },
                { key: "employeeName", label: t.reports.employee },
                { key: "amount", label: t.total, align: "right", render: (item: any) => fmt(item.amount) },
              ]}
              data={rows}
              emptyMessage={t.reports.noExpenses}
            />
            {!printLimit && summary && (
              <Pagination
                currentStart={(summary.meta.page - 1) * summary.meta.limit + 1}
                currentEnd={Math.min(summary.meta.page * summary.meta.limit, summary.meta.total)}
                total={summary.meta.total}
                currentPage={summary.meta.page}
                totalPages={summary.meta.totalPages}
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
