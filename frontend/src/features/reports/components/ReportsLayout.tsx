import { NavLink, Outlet } from "react-router-dom";
import { useI18n } from "../../../i18n/context";
import { useAuth } from "../../../lib/auth";
import { PageHeader } from "../../../components/ui/PageHeader";

export default function ReportsLayout() {
  const { t } = useI18n();
  const { user } = useAuth();
  const basePath = user?.role === "ACCOUNTANT" ? "/reports" : "/admin/reports";

  const isAccountant = user?.role === "ACCOUNTANT";

  const allNavItems = [
    { to: `${basePath}/revenue`, label: t.reports.revenue || "Revenue", end: true },
    { to: `${basePath}/net-profit`, label: t.reports.netSold || "Net Profit" },
    { to: `${basePath}/expenses`, label: t.reports.expenses },
    { to: `${basePath}/employees-sales`, label: t.reports.employeeSales },
    { to: `${basePath}/products-sales`, label: t.reports.productSales },
    { to: `${basePath}/returns`, label: t.reports.returns },
    { to: `${basePath}/customers`, label: t.reports.customerReport || "Customer Report" },
    { to: `${basePath}/suppliers`, label: t.reports.supplierReport || "Supplier Report" },
    { to: `${basePath}/inventory`, label: t.reports.inventoryReport || "Inventory" },
  ];

  const navItems = isAccountant
    ? allNavItems.filter((item) => item.to.endsWith("/expenses"))
    : allNavItems;

  return (
    <div className="reports-layout">
      <div className="no-print">
        <PageHeader
          title={isAccountant ? (t.reports.expenses || "Expenses") : t.pages.reports}
          subtitle={isAccountant ? undefined : t.pages.reportsSubtitle}
        />

        {/* Report nav tabs */}
        <div
          className="page-section"
          style={{
            display: "flex",
            gap: "4px",
            padding: "4px",
            backgroundColor: "var(--card)",
            border: "1px solid var(--border)",
            borderRadius: "10px",
            overflowX: "auto",
            WebkitOverflowScrolling: "touch",
            scrollbarWidth: "none",
          }}
        >
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              style={({ isActive }) => ({
                padding: "8px 14px",
                borderRadius: "8px",
                border: "none",
                backgroundColor: isActive ? "var(--brand-fill)" : "transparent",
                color: isActive ? "var(--on-brand)" : "var(--soft)",
                fontFamily: "'Manrope', sans-serif",
                fontSize: "13px",
                fontWeight: 600,
                cursor: "pointer",
                whiteSpace: "nowrap",
                transition: "background-color 0.15s ease, color 0.15s ease",
                textDecoration: "none",
                minHeight: "36px",
                display: "inline-flex",
                alignItems: "center",
              })}
            >
              {item.label}
            </NavLink>
          ))}
        </div>
      </div>

      <Outlet />
    </div>
  );
}