import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../../lib/auth";
import api from "../../lib/api";
import { isAbortError } from "../../hooks";
import { Button } from "../../components/ui/Button";
import { Card } from "../../components/ui/Card";
import { Table } from "../../components/ui/Table";
import { LoadingSpinner } from "../../components/ui/LoadingSpinner";
import { EmptyState } from "../../components/ui/EmptyState";
import { PageHeader } from "../../components/ui/PageHeader";
import { useI18n } from "../../i18n/context";
import type { Attendance, DashboardSummary, Invoice, PaginatedResponse } from "../../types";

export default function SalesHome() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { t } = useI18n();
  const [attendance, setAttendance] = useState<Attendance | null>(null);
  const [dashboard, setDashboard] = useState<DashboardSummary | null>(null);
  const [recentInvoices, setRecentInvoices] = useState<Invoice[]>([]);
  const [pendingCount, setPendingCount] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const controller = new AbortController();
    const { signal } = controller;

    async function load() {
      try {
        const [attRes, dashRes, invRes, pendingRes] = await Promise.all([
          api.get("/attendance/me/today", { signal }),
          api.get("/dashboard", { signal }),
          api.get<PaginatedResponse<Invoice>>("/invoices", { params: { page: 1, limit: 10, sort: "desc" }, signal }),
          api
            .get<PaginatedResponse<Invoice>>("/invoices", { params: { status: "PENDING_ACCOUNTANT", limit: 1 }, signal })
            .catch((err) => {
              if (isAbortError(err)) throw err;
              return { data: { meta: { total: 0 } } };
            }),
        ]);
        setAttendance(attRes.data);
        setDashboard(dashRes.data);
        setRecentInvoices(invRes.data.data);
        setPendingCount(pendingRes.data.meta?.total ?? 0);
      } catch {
        // aborted or failed silently
      } finally {
        if (!signal.aborted) setLoading(false);
      }
    }
    void load();
    return () => controller.abort();
  }, []);

  const isCheckedIn = !!attendance && !attendance.checkOut;

  if (loading) {
    return (
      <div className="state-block">
        <LoadingSpinner size={32} />
      </div>
    );
  }

  const invoiceColumns = [
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
      key: "date",
      label: t.date,
      render: (row: Invoice) => new Date(row.date).toLocaleDateString(),
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

  return (
    <div>
      <PageHeader
        title={`${getGreeting(t)}, ${user?.firstName}`}
        subtitle={isCheckedIn ? t.salesHome.youAreCheckedIn : t.salesHome.notCheckedInYet}
      />

      {/* Attendance Card */}
      <div className="form-grid-wide page-section">
        <Card>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "12px", flexWrap: "wrap" }}>
            <div style={{ minWidth: 0 }}>
              <p style={{ fontFamily: "'Manrope', sans-serif", fontSize: "12px", color: "var(--soft)", margin: 0, textTransform: "uppercase", letterSpacing: "0.03em" }}>{t.salesHome.attendance}</p>
              <p style={{ fontFamily: "'Sora', sans-serif", fontSize: "18px", fontWeight: 600, color: isCheckedIn ? "var(--mint)" : "var(--peach)", margin: "4px 0 0" }}>
                {isCheckedIn ? t.salesAttendance.checkedIn : t.salesAttendance.notCheckedIn}
              </p>
              {attendance?.checkIn && (
                <p style={{ fontFamily: "'Manrope', sans-serif", fontSize: "12px", color: "var(--soft)", margin: "2px 0 0", fontVariantNumeric: "tabular-nums" }}>
                  {t.salesAttendance.checkInTime} {new Date(attendance.checkIn).toLocaleTimeString()}
                  {attendance.checkOut && ` · ${t.salesAttendance.checkOutTime} ${new Date(attendance.checkOut).toLocaleTimeString()}`}
                </p>
              )}
            </div>
            <Button
              variant="primary"
              size="md"
              onClick={() => navigate("/sales/attendance")}
              style={{ minWidth: 0, flex: "1 1 auto", maxWidth: "220px" }}
            >
              {t.attendanceScanner.recordAttendance}
            </Button>
          </div>
        </Card>

        {/* Today's Summary */}
      {/*   <Card title={t.salesHome.today}>
          <div style={{ display: "flex", gap: "32px" }}>
            <div>
              <p style={{ fontFamily: "'Manrope', sans-serif", fontSize: "12px", color: "var(--soft)", margin: 0 }}>{t.salesHome.invoices}</p>
              <p style={{ fontFamily: "'Sora', sans-serif", fontSize: "24px", fontWeight: 600, color: "var(--ink)", margin: "2px 0 0", fontVariantNumeric: "tabular-nums" }}>
                {dashboard?.today?.invoices ?? 0}
              </p>
            </div>
            <div>
              <p style={{ fontFamily: "'Manrope', sans-serif", fontSize: "12px", color: "var(--soft)", margin: 0 }}>{t.salesHome.revenue}</p>
              <p style={{ fontFamily: "'Sora', sans-serif", fontSize: "24px", fontWeight: 600, color: "var(--mint)", margin: "2px 0 0", fontVariantNumeric: "tabular-nums" }}>
              {t.currency} {Number(dashboard?.today?.revenue ?? 0).toFixed(2)}
              </p>
            </div>
          </div>
        </Card> */}
      </div>

      {/* Primary Action */}
      <div className="page-section">
        <Button
          size="lg"
          onClick={() => navigate("/sales/new-invoice")}
          style={{ width: "100%", maxWidth: "400px" }}
          icon={
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 5v14m-7-7h14" />
            </svg>
          }
        >
          {t.nav.newInvoice}
        </Button>
      </div>

      {/* Secondary Actions */}
      <div className="form-grid" style={{ gap: "12px", marginBottom: "var(--section-gap)" }}>
        {[
          { label: t.salesHome.searchInvoice, path: "/sales/invoice-search", icon: "M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" },
          { label: t.salesHome.scanUnit, path: "/unit-search", icon: "M10 18l4-4m0 0l-4-4m4 4H3" },
          { label: t.nav.customers, path: "/sales/customers", icon: "M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" },
          { label: t.nav.myRequests, path: "/sales/my-requests", icon: "M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" },
        ].map((action) => (
          <button
            key={action.label}
            onClick={() => navigate(action.path)}
            style={{
              display: "flex",
              alignItems: "center",
              gap: "10px",
              padding: "14px 16px",
              backgroundColor: "var(--card)",
              border: "1px solid var(--border)",
              borderRadius: "var(--radius-md)",
              cursor: "pointer",
              fontFamily: "'Manrope', sans-serif",
              fontSize: "14px",
              fontWeight: 600,
              color: "var(--ink)",
              transition: "border-color 0.15s ease, box-shadow 0.15s ease",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.borderColor = "var(--brand)";
              e.currentTarget.style.boxShadow = "0 0 0 1px var(--brand)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.borderColor = "var(--border)";
              e.currentTarget.style.boxShadow = "none";
            }}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--soft)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <path d={action.icon} />
            </svg>
            {action.label}
          </button>
        ))}
      </div>

      {/* Recent Invoices */}
      <Card title={t.salesHome.recentInvoices}>
        {recentInvoices.length === 0 ? (
          <EmptyState
            title={t.salesHome.noInvoicesYet}
            description={t.salesHome.recentInvoicesHint}
            icon={
              <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
            }
          />
        ) : (
          <Table
            columns={invoiceColumns}
            data={recentInvoices}
            onRowClick={(row) => navigate(`/sales/invoice/${(row as unknown as Invoice).id}`)}
            keyExtractor={(row) => String((row as unknown as Invoice).id)}
          />
        )}
      </Card>
    </div>
  );
}

function getGreeting(t: any): string {
  const hour = new Date().getHours();
  if (hour < 12) return t.salesHome.goodMorning;
  if (hour < 17) return t.salesHome.goodAfternoon;
  return t.salesHome.goodEvening;
}
