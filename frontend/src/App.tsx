import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider, useAuth } from "./lib/auth";
import Layout from "./components/Layout";
import Login from "./pages/Login";
import AdminDashboard from "./pages/admin/Dashboard";
import AdminEmployees from "./pages/admin/Employees";
import AdminChangeRequests from "./pages/admin/ChangeRequests";
import AdminInvoices from "./pages/admin/Invoices";
import AdminExpenses from "./pages/admin/Expenses";
import AdminSuppliers from "./pages/admin/Suppliers";
import AdminCustomers from "./pages/admin/Customers";
import AdminInvoiceDetail from "./pages/admin/InvoiceDetail";
import PendingPricingQueue from "./pages/admin/StockPricing";
import {
  ReportsLayout,
  ReportsIndexPage,
  RevenueReportPage,
  NetProfitReportPage,
  ExpensesReportPage,
  EmployeeSalesReportPage,
  ProductSalesReportPage,
  ReturnsReportPage,
  CustomerReportPage,
  SupplierReportPage,
  InventoryReportPage,
} from "./features/reports";
import AdminAttendance from "./pages/admin/Attendance";
import AdminSettings from "./pages/admin/Settings";
import AdminAuditHistory from "./pages/admin/AuditHistory";
import AdminNotifications from "./pages/admin/Notifications";
import SalesHome from "./pages/sales/Home";
import NewInvoice from "./pages/sales/NewInvoice";
import InvoiceSearch from "./pages/sales/InvoiceSearch";
import InvoiceDetail from "./pages/sales/InvoiceDetail";
import Customers from "./pages/sales/Customers";
import MyRequests from "./pages/sales/MyRequests";
import NewChangeRequest from "./pages/sales/NewChangeRequest";
import SalesAttendance from "./pages/sales/Attendance";
import InventoryHome from "./pages/inventory/Home";
import ReceiveShipment from "./pages/inventory/ReceiveShipment";
import Stock from "./pages/inventory/Stock";
import CategoriesModels from "./pages/inventory/CategoriesModels";
import UnitSearch from "./pages/inventory/UnitSearch";
import InvoiceDelivery from "./pages/inventory/InvoiceDelivery";
import StockAdjustments from "./pages/inventory/StockAdjustments";
import AccountantPendingInvoices from "./pages/accountant/PendingInvoices";
import AccountantExpenses from "./pages/accountant/Expenses";
import KioskLogin from "./pages/kiosk/KioskLogin";
import KioskPage from "./pages/kiosk/KioskPage";
import type { ReactNode } from "react";

function RoleRoute({
  allowedRoles,
  children,
}: {
  allowedRoles: string[];
  children: ReactNode;
}) {
  const { user } = useAuth();
  if (!user || !allowedRoles.includes(user.role)) {
    return <Navigate to="/" replace />;
  }
  return <>{children}</>;
}

function HomeRedirect() {
  const { user } = useAuth();
  if (user?.role === "ATTENDANCE_KIOSK") return <Navigate to="/kiosk" replace />;
  if (user?.role === "ADMIN") return <AdminDashboard />;
  if (user?.role === "INVENTORY") return <InventoryHome />;
  if (user?.role === "ACCOUNTANT") return <AccountantPendingInvoices />;
  return <SalesHome />;
}

function PublicRoute({ children }: { children: ReactNode }) {
  const { isAuthenticated } = useAuth();
  if (isAuthenticated) {
    return <Navigate to="/" replace />;
  }
  return <>{children}</>;
}

function KioskRoute({ children }: { children: ReactNode }) {
  const { isAuthenticated, user } = useAuth();
  if (!isAuthenticated) {
    return <Navigate to="/kiosk/login" replace />;
  }
  if (user?.role !== "ATTENDANCE_KIOSK") {
    return <Navigate to="/" replace />;
  }
  return <>{children}</>;
}

function EmployeeRoute({ children }: { children: ReactNode }) {
  const { isAuthenticated, user } = useAuth();
  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }
  if (user?.role === "ATTENDANCE_KIOSK") {
    return <Navigate to="/kiosk" replace />;
  }
  return <>{children}</>;
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route
            path="/kiosk/login"
            element={
              <PublicRoute>
                <KioskLogin />
              </PublicRoute>
            }
          />
          <Route
            path="/kiosk"
            element={
              <KioskRoute>
                <KioskPage />
              </KioskRoute>
            }
          />
          <Route
            path="/login"
            element={
              <PublicRoute>
                <Login />
              </PublicRoute>
            }
          />
          <Route
            element={
              <EmployeeRoute>
                <Layout />
              </EmployeeRoute>
            }
          >
            <Route path="/" element={<HomeRedirect />} />
            <Route
              path="/unit-search"
              element={
                <RoleRoute allowedRoles={["SALES", "INVENTORY"]}>
                  <UnitSearch />
                </RoleRoute>
              }
            />
            <Route path="/notifications" element={<AdminNotifications />} />
            <Route
              path="/sales/*"
              element={
                <RoleRoute allowedRoles={["SALES"]}>
                  <Routes>
                    <Route path="new-invoice" element={<NewInvoice />} />
                    <Route path="invoice-search" element={<InvoiceSearch />} />
                    <Route path="invoice/:id" element={<InvoiceDetail />} />
                    <Route path="customers" element={<Customers />} />
                    <Route path="my-requests" element={<MyRequests />} />
                    <Route path="change-request" element={<NewChangeRequest />} />
                    <Route path="change-request/:invoiceId" element={<NewChangeRequest />} />
                    <Route path="attendance" element={<SalesAttendance />} />
                  </Routes>
                </RoleRoute>
              }
            />
            <Route
              path="/inventory/*"
              element={
                <RoleRoute allowedRoles={["INVENTORY"]}>
                  <Routes>
                    <Route path="receive-shipment" element={<ReceiveShipment />} />
                    <Route path="stock" element={<Stock />} />
                    <Route path="categories-models" element={<CategoriesModels />} />
                    <Route path="unit-search" element={<UnitSearch />} />
                    <Route path="delivery" element={<InvoiceDelivery />} />
                    <Route path="stock-adjustments" element={<StockAdjustments />} />
                  </Routes>
                </RoleRoute>
              }
            />
            <Route
              path="/accountant/*"
              element={
                <RoleRoute allowedRoles={["ACCOUNTANT"]}>
                  <Routes>
                    <Route path="pending-invoices" element={<AccountantPendingInvoices />} />
                    <Route path="expenses" element={<AccountantExpenses />} />
                    <Route path="attendance" element={<SalesAttendance />} />
                  </Routes>
                </RoleRoute>
              }
            />
            <Route
              path="/inventory/attendance"
              element={
                <RoleRoute allowedRoles={["INVENTORY"]}>
                  <SalesAttendance />
                </RoleRoute>
              }
            />
            <Route
              path="/admin/*"
              element={
                <RoleRoute allowedRoles={["ADMIN"]}>
                  <Routes>
                    <Route path="notifications" element={<AdminNotifications />} />
                    <Route path="change-requests" element={<AdminChangeRequests />} />
                    <Route path="invoices" element={<AdminInvoices />} />
                    <Route path="new-invoice" element={<NewInvoice />} />
                    <Route path="invoices/:id" element={<AdminInvoiceDetail />} />
                    <Route path="employees" element={<AdminEmployees />} />
                    <Route path="attendance" element={<AdminAttendance />} />
                    <Route path="expenses" element={<AdminExpenses />} />
                    <Route path="suppliers" element={<AdminSuppliers />} />
                    <Route path="customers" element={<AdminCustomers />} />
                 <Route path="unit-search" element={<UnitSearch />} />
                    <Route path="stock-pricing" element={<PendingPricingQueue />} />
                    <Route path="stock-adjustments" element={<StockAdjustments />} />
                    <Route path="reports" element={<ReportsLayout />}>
                      <Route index element={<ReportsIndexPage />} />
                      <Route path="revenue" element={<RevenueReportPage />} />
                      <Route path="net-profit" element={<NetProfitReportPage />} />
                      <Route path="expenses" element={<ExpensesReportPage />} />
                      <Route path="employees-sales" element={<EmployeeSalesReportPage />} />
                      <Route path="products-sales" element={<ProductSalesReportPage />} />
                      <Route path="returns" element={<ReturnsReportPage />} />
                      <Route path="customers" element={<CustomerReportPage />} />
                      <Route path="suppliers" element={<SupplierReportPage />} />
                      <Route path="inventory" element={<InventoryReportPage />} />
                    </Route>
                    <Route path="audit" element={<AdminAuditHistory />} />
                    <Route path="settings" element={<AdminSettings />} />
                  </Routes>
                </RoleRoute>
              }
            />
            <Route
              path="/reports/*"
              element={
                <RoleRoute allowedRoles={["ADMIN", "ACCOUNTANT"]}>
                  <Routes>
                    <Route path="" element={<ReportsLayout />}>
                      <Route index element={<ReportsIndexPage />} />
                      <Route path="expenses" element={<ExpensesReportPage />} />
                    </Route>
                  </Routes>
                </RoleRoute>
              }
            />
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}
