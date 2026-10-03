import { useState, useEffect, useCallback, useMemo } from "react";
import api from "../../../lib/api";
import { isAbortError, useEmployeesOptions } from "../../../hooks";
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
import type { EmployeeSalesReportResponse } from "../types";

const fmt = (n: number) =>
  n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export default function EmployeeSalesReportPage() {
  const { t } = useI18n();
  const { printLimit, requestPrint, notifyReady } = useReportPrint();
  const [dateFrom, setDateFrom] = useState(() => {
    const d = new Date();
    d.setDate(1);
    return d.toISOString().slice(0, 10);
  });
  const [dateTo, setDateTo] = useState(() => new Date().toISOString().slice(0, 10));
  const [employeeFilter, setEmployeeFilter] = useState("");
  const { data: employeeRows = [] } = useEmployeesOptions();
  const employeeOptions = useMemo(
    () => employeeRows.map((employee) => ({ label: employee.name, value: String(employee.id) })),
    [employeeRows]
  );
  const [data, setData] = useState<EmployeeSalesReportResponse | null>(null);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [selectedEmployee, setSelectedEmployee] = useState<any | null>(null);
  const [detailMode, setDetailMode] = useState<"all" | "selected" | null>(null);
  const showAllDetails = detailMode === "all";
  const showSelectedDetails = detailMode === "selected" && !!selectedEmployee;

  const fetchData = useCallback(async (signal?: AbortSignal) => {
    setLoading(true);
    try {
      const params: Record<string, string | number> = { from: dateFrom, to: dateTo, page: printLimit ? 1 : page, limit: printLimit || 10 };
      if (employeeFilter) params.employeeId = Number(employeeFilter);
      const res = await api.get("/reports/employees-sales", { params, signal });
      setData(res.data);
      if (printLimit) notifyReady();
    } catch (err) {
      if (isAbortError(err)) return;
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }, [dateFrom, dateTo, employeeFilter, page, printLimit, notifyReady]);

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
          label={t.reports.employee}
          value={employeeFilter}
          onChange={(event) => { setEmployeeFilter(event.target.value); setPage(1); }}
          options={[{ label: t.reports.allEmployees, value: "" }, ...employeeOptions]}
          style={{ minWidth: 190 }}
        />
        <PrintButton onClick={requestPrint} />
        <ExcelExportButton filename="employee-sales-report" rows={data?.items ?? []} />
      </div>

      <div className="print-area">
        <PrintHeader
          titleEn={t.reports.employeeSales}
          titleAr={t.reports.employeeSales}
          range={{ from: dateFrom, to: dateTo }}
          filters={employeeFilter ? [{ label: t.reports.employee, value: employeeOptions.find((option) => option.value === employeeFilter)?.label || t.reports.selectedEmployee }] : []}
        />

        {loading ? (
          <div className="state-block">
            <LoadingSpinner size={32} />
          </div>
        ) : !data || data.items.length === 0 ? (
          <EmptyState title={t.noData} description={t.reports.noEmployeeSales} />
        ) : (
          <Card title={t.reports.employeeSales}>
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
                    setSelectedEmployee(null);
                    setDetailMode("all");
                  }}
                >
                  {showAllDetails ? t.reports.hideDetails : t.reports.showAllDetails}
                </Button>
                <Button
                  type="button"
                  variant={showSelectedDetails ? "primary" : "secondary"}
                  size="sm"
                  disabled={!selectedEmployee}
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
              {selectedEmployee && (
                <span style={{ color: "var(--soft)", fontSize: "12px", display: "inline-flex", alignItems: "center", gap: "6px" }}>
                  <span style={{ width: "8px", height: "8px", borderRadius: "50%", background: "var(--brand)", display: "inline-block" }} />
                  {t.reports.selected}: {selectedEmployee.employeeName}
                </span>
              )}
            </div>
            <Table
              columns={[
                { key: "employeeName", label: t.reports.employee },
                { key: "invoiceCount", label: t.reports.invoicesCount, align: "right", render: (r: any) => <span style={{ fontVariantNumeric: "tabular-nums" }}>{r.invoiceCount}</span> },
                { key: "grossSales", label: t.reports.grossSales, align: "right", render: (r: any) => <span style={{ fontVariantNumeric: "tabular-nums" }}>{fmt(r.grossSales)}</span> },
                { key: "returns", label: t.reports.returns, align: "right", render: (r: any) => <span style={{ fontVariantNumeric: "tabular-nums", color: "var(--peach)" }}>{fmt(r.returns)}</span> },
                { key: "netSales", label: t.reports.netSales, align: "right", render: (r: any) => <strong style={{ fontVariantNumeric: "tabular-nums" }}>{fmt(r.netSales)}</strong> },
              ]}
              data={data.items}
              emptyMessage={t.reports.noEmployeeSales}
              selectedRowKey={showSelectedDetails && selectedEmployee ? String(selectedEmployee.employeeId) : null}
              onRowClick={(row: any) => {
                setSelectedEmployee(row);
                setDetailMode("selected");
              }}
            />
            {(showAllDetails || showSelectedDetails) && (
              <ReportDetailPanel
                rowId={selectedEmployee?.employeeId ?? null}
                from={dateFrom}
                to={dateTo}
                endpoint="/reports/employees-sales"
                detailTitle={selectedEmployee ? t.reports.employeeInvoices : t.reports.allEmployeeInvoices}
                groupBy={(item: any) => item.employeeName || selectedEmployee?.employeeName || t.reports.unknown}
                groupLabel={(groupKey) => `${t.reports.employee}: ${groupKey}`}
                transform={(payload: any) =>
                  (payload?.items ?? []).flatMap((invoice: any) =>
                    (invoice.items ?? []).map((item: any) => ({
                      invoiceNumber: invoice.invoiceNumber,
                      invoiceDate: invoice.invoiceDate,
                      employeeName: invoice.employeeName || selectedEmployee?.employeeName || t.reports.unknown,
                      customerName: invoice.customerName,
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
                  { key: "invoiceDate", label: t.date, render: (item: any) => new Date(item.invoiceDate).toLocaleDateString() },
                  { key: "employeeName", label: t.reports.employee, render: (item: any) => item.employeeName ?? selectedEmployee?.employeeName ?? "—" },
                  { key: "customerName", label: t.invoices.customer },
                  { key: "productName", label: t.reports.product },
                  { key: "quantity", label: t.reports.qtySold, align: "right" },
                  { key: "unitPrice", label: t.reports.unitPrice, align: "right", render: (item: any) => `${fmt(item.unitPrice)}` },
                  { key: "lineTotal", label: t.reports.lineTotal, align: "right", render: (item: any) => `${fmt(item.lineTotal)}` },
                  { key: "netSales", label: t.reports.netSales, align: "right", render: (item: any) => fmt(item.netSales) },
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
