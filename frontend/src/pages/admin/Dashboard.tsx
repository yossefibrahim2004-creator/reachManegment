import { useState, useEffect } from "react";
import api from "../../lib/api";
import { isAbortError } from "../../hooks";
import { PageHeader } from "../../components/ui/PageHeader";
import { Card } from "../../components/ui/Card";
import { Table } from "../../components/ui/Table";
import { LoadingSpinner } from "../../components/ui/LoadingSpinner";
import { EmptyState } from "../../components/ui/EmptyState";
import { StatusChip } from "../../components/ui/StatusChip";
import { useI18n } from "../../i18n/context";
import type { Invoice, InvoiceReturn } from "../../types";
import type { DashboardSummaryResponse } from "../../types/reports";

const fmt = (n: number | undefined | null) =>
  (n ?? 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const kpiStyle = (): React.CSSProperties => ({
  backgroundColor: "var(--card)",
  border: "1px solid var(--border)",
  borderRadius: "var(--radius-md)",
  padding: "16px",
  position: "relative",
  overflow: "hidden",
  minWidth: 0,
});

const kpiAccent = (color: string): React.CSSProperties => ({
  position: "absolute",
  bottom: 0,
  insetInlineStart: 0,
  width: "100%",
  height: "4px",
  backgroundColor: color,
});

interface ActivityData {
  recentInvoices: Invoice[];
  recentApprovals: InvoiceReturn[];
}

export default function AdminDashboard() {
  const { t } = useI18n();
  const [data, setData] = useState<DashboardSummaryResponse | null>(null);
  const [activity, setActivity] = useState<ActivityData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    const { signal } = controller;
    setLoading(true);
    Promise.all([
      api.get("/dashboard", { signal }),
      api.get("/dashboard/activity", { signal }),
    ])
      .then(([summaryRes, activityRes]) => {
        setData(summaryRes.data);
        setActivity(activityRes.data);
      })
      .catch((err) => {
        if (isAbortError(err)) return;
        setError(t.dashboard.failedToLoad);
      })
      .finally(() => {
        if (!signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, []);

  if (loading) {
    return (
      <div className="state-block">
        <LoadingSpinner size={28} />
      </div>
    );
  }

  if (error) {
    return (
      <div className="state-block">
        <EmptyState title={t.error} description={error} />
      </div>
    );
  }

  if (!data) return null;

  const kpis = [
    { label: t.dashboard.monthlyNetSales, value: fmt(data.netSales), color: "var(--brand)" },
    { label: t.dashboard.monthlyExpenses, value: fmt(data.expenses), color: "var(--peach)" },
      { label: t.dashboard.cogs, value: fmt(data.cogs || 0), color: "var(--accent)" },

    { label: t.dashboard.monthlyNetProfit, value: fmt(data.netProfit), color: "var(--mint)" },
    { label: t.dashboard.pendingCogsInvoices, value: String(data.pendingCogsInvoicesCount ?? 0), color: "var(--warning)" },
    { label: t.dashboard.pendingReviews, value: String(data.pendingInvoiceReviewsCount ?? 0), color: "var(--peach)" },
    { label: t.dashboard.pendingDeliveries, value: String(data.pendingDeliveriesCount ?? 0), color: "var(--brand)" },
    { label: t.dashboard.pendingChangeRequests, value: String(data.pendingChangeRequestsCount), color: "var(--accent)" },
    { label: t.dashboard.unreadNotifications, value: String(data.unreadNotificationsCount), color: "var(--soft)" },
  ];

  const invoiceColumns = [
    { key: "invoiceNumber", label: t.invoices.invoiceNumber },
    { key: "customerName", label: t.invoices.customer, render: (r: Invoice) => r.customer?.name ?? "—" },
    { key: "status", label: t.status, render: (r: Invoice) => <StatusChip status={r.status} /> },
    { key: "date", label: t.date, render: (r: Invoice) => new Date(r.date).toLocaleDateString() },
    { key: "currentTotal", label: t.total, align: "right" as const, render: (r: Invoice) => `${t.currency} ${fmt(r.currentTotal)}` },
  ];

  const returnColumns = [
    { key: "invoiceId", label: t.invoices.invoiceNumber, render: (r: InvoiceReturn) => r.invoice?.invoiceNumber ?? `#${r.invoiceId}` },
    { key: "reason", label: t.dashboard.reason },
    { key: "refundTotal", label: t.dashboard.refund, align: "right" as const, render: (r: InvoiceReturn) => `${t.currency} ${fmt(r.refundTotal)}` },
    { key: "createdAt", label: t.date, render: (r: InvoiceReturn) => new Date(r.createdAt).toLocaleDateString() },
  ];

  return (
    <div>
      <PageHeader title={t.pages.dashboard} subtitle={t.pages.dashboardSubtitle} />

      <div className="form-grid" style={{ marginBottom: "var(--section-gap)" }}>
        {kpis.map((kpi) => (
          <div key={kpi.label} style={kpiStyle()}>
            <p style={{ fontFamily: "'Manrope', sans-serif", fontSize: "12px", fontWeight: 600, color: "var(--soft)", margin: 0, textTransform: "uppercase", letterSpacing: "0.03em", lineHeight: 1.3 }}>
              {kpi.label}
            </p>
            <p style={{ fontFamily: "'Sora', sans-serif", fontSize: "clamp(22px, 3vw, 28px)", fontWeight: 700, color: "var(--ink)", margin: "6px 0 0", fontVariantNumeric: "tabular-nums", lineHeight: 1.15 }}>
              {kpi.value}
            </p>
            <div style={kpiAccent(kpi.color)} />
          </div>
        ))}
      </div>

      <p className="page-section" style={{ fontFamily: "'Manrope', sans-serif", fontSize: "12px", color: "var(--soft)", margin: 0 }}>
        {t.dashboard.netProfitFormula}
      </p>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 320px), 1fr))", gap: "var(--space-4)", marginBottom: "var(--space-4)" }}>
        <Card title={t.dashboard.recentInvoices}>
          <Table columns={invoiceColumns} data={activity?.recentInvoices ?? []} emptyMessage={t.dashboard.noRecentInvoices} />
        </Card>
        <Card title={t.dashboard.recentReturns}>
          <Table columns={returnColumns} data={activity?.recentApprovals ?? []} emptyMessage={t.dashboard.noRecentReturns} />
        </Card>
      </div>
    </div>
  );
}
