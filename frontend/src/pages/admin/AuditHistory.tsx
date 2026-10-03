import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import api from "../../lib/api";
import { useDebouncedValue, isAbortError, useEmployeesOptions } from "../../hooks";
import { PageHeader } from "../../components/ui/PageHeader";
import { Select } from "../../components/ui/Select";
import { Table } from "../../components/ui/Table";
import { Pagination } from "../../components/ui/Pagination";
import { LoadingSpinner } from "../../components/ui/LoadingSpinner";
import { EmptyState } from "../../components/ui/EmptyState";
import DateRangePicker from "../../components/ui/DateRangePicker";
import { useI18n } from "../../i18n/context";

interface AuditEntry {
  id: number;
  source: "invoice" | "product_unit" | "stock_receipt";
  timestamp: string;
  employee?: { id: number; name: string; role: string };
  action: string;
  invoiceId: number | null;
  invoice?: { id: number; invoiceNumber: string };
  details: Record<string, unknown> | null;
  productUnit?: { id: number; barcode: string; productModel?: { id: number; name: string } };
  stockReceipt?: { id: number; status: string };
}

// Single source of truth for all audit actions. Add a new action here once —
// both the filter dropdown and the label lookup pick it up automatically.
const AUDIT_ACTIONS = [
  "CREATED",
  "SENT_FOR_ACCOUNTANT_REVIEW",
  "CONFIRMED",
  "REJECTED",
  "DELIVERED",
  "PRINTED",
  "STOCK_RESERVED",
  "STOCK_RESERVATION_RELEASED",
  "UNIT_SCANNED",
  "UNIT_SCAN_REVERSED",
  "CHANGE_REQUEST_CREATED",
  "CHANGE_REQUEST_APPROVED",
  "CHANGE_REQUEST_REJECTED",
  "PRICE_ADJUSTED",
  "ITEM_ADDED",
  "ITEM_RETURNED",
  "FULL_RETURNED",
  "PARTIAL_RETURNED",
  "RECEIVED",
  "ALLOCATED_TO_INVOICE",
  "ALLOCATION_RELEASED",
  "SOLD",
  "RETURNED",
  "MARKED_DAMAGED",
  "RESTORED_AVAILABLE",
  "PRICED",
] as const;

const ROLE_BADGE_COLORS: Record<string, { bg: string; fg: string }> = {
  ADMIN: { bg: "var(--brand-bg)", fg: "var(--brand)" },
  SALES: { bg: "var(--accent-bg)", fg: "var(--accent)" },
  ACCOUNTANT: { bg: "var(--mint-bg)", fg: "var(--mint)" },
  INVENTORY: { bg: "var(--peach-bg)", fg: "var(--peach)" },
};
const DEFAULT_ROLE_BADGE = { bg: "var(--bg-active)", fg: "var(--soft)" };

// Technical detail keys that either duplicate info already shown on the card
// (e.g. supplierName is shown, supplierId is redundant) or aren't useful to
// a non-technical reader, so they're hidden from the expanded details panel.
const HIDDEN_DETAIL_KEYS = new Set(["supplierId", "receiptId", "productUnitId", "invoiceItemId"]);

// Human-readable labels for detail keys, per language. Falls back to the
// raw key when a translation isn't listed here, so new/unknown keys from
// the backend still render instead of silently disappearing.
const DETAIL_LABELS: Record<string, { ar: string; en: string }> = {
  supplierName: { ar: "المورد", en: "Supplier" },
  status: { ar: "الحالة", en: "Status" },
  total: { ar: "الإجمالي", en: "Total" },
  subtotal: { ar: "الإجمالي الفرعي", en: "Subtotal" },
  itemCount: { ar: "عدد الأصناف", en: "Item count" },
  fixedDiscount: { ar: "خصم ثابت", en: "Fixed discount" },
  percentageDiscount: { ar: "خصم نسبة", en: "Percentage discount" },
  assignedUnitIds: { ar: "الوحدات المخصصة", en: "Assigned units" },
  invoiceNumber: { ar: "رقم الفاتورة", en: "Invoice" },
  customerName: { ar: "العميل", en: "Customer" },
  reason: { ar: "السبب", en: "Reason" },
  adminNote: { ar: "ملاحظة المراجع", en: "Reviewer note" },
  items: { ar: "الأصناف", en: "Items" },
  models: { ar: "المنتجات", en: "Products" },
  adjustments: { ar: "تعديلات الأسعار", en: "Price adjustments" },
  quantity: { ar: "الكمية", en: "Quantity" },
  unitCount: { ar: "عدد الوحدات", en: "Unit count" },
  modelName: { ar: "المنتج", en: "Product" },
  model: { ar: "المنتج", en: "Product" },
  barcode: { ar: "الباركود", en: "Barcode" },
  from: { ar: "من حالة", en: "From" },
  to: { ar: "إلى حالة", en: "To" },
  notes: { ar: "ملاحظات", en: "Notes" },
  refund: { ar: "المبلغ المسترد", en: "Refund" },
  refundTotal: { ar: "إجمالي الاسترداد", en: "Total refund" },
  newTotal: { ar: "الإجمالي الجديد", en: "New total" },
  delta: { ar: "فرق السعر", en: "Price delta" },
  totalDelta: { ar: "إجمالي الفرق", en: "Total delta" },
  oldPrice: { ar: "السعر القديم", en: "Old price" },
  newPrice: { ar: "السعر الجديد", en: "New price" },
  price: { ar: "السعر", en: "Price" },
  itemsAdjusted: { ar: "عدد التعديلات", en: "Items adjusted" },
  itemsAdded: { ar: "أصناف مُضافة", en: "Items added" },
  itemsReturned: { ar: "أصناف مُرجعة", en: "Items returned" },
  requestId: { ar: "رقم الطلب", en: "Request" },
  type: { ar: "نوع الطلب", en: "Request type" },
  available: { ar: "المتاح", en: "Available" },
  requested: { ar: "المطلوب", en: "Requested" },
  lineScanned: { ar: "تم مسحه", en: "Scanned" },
  lineRequired: { ar: "المطلوب مسحه", en: "Required" },
};

// Detail values that represent money, so they get thousands-separator
// formatting instead of raw digits.
const CURRENCY_DETAIL_KEYS = new Set([
  "total",
  "subtotal",
  "fixedDiscount",
  "refund",
  "refundTotal",
  "newTotal",
  "delta",
  "totalDelta",
  "oldPrice",
  "newPrice",
  "price",
]);

export default function AuditHistory() {
  const { t, language } = useI18n();
  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const { data: employees = [] } = useEmployeesOptions();
  const [meta, setMeta] = useState({ page: 1, totalPages: 1, total: 0, limit: 30 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [page, setPage] = useState(1);
  const [employeeFilter, setEmployeeFilter] = useState("");
  const debouncedEmployeeFilter = useDebouncedValue(employeeFilter, 300);
  const [actionFilter, setActionFilter] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [expandedId, setExpandedId] = useState<number | null>(null);

  // Guards against out-of-order responses: if the user changes filters
  // quickly, an older request could resolve after a newer one and overwrite
  // fresher data. Each fetch stamps its own id; only the latest is applied.
  const requestIdRef = useRef(0);

  const hasActiveFilters = Boolean(debouncedEmployeeFilter || actionFilter || dateFrom || dateTo);

  const resetFilters = () => {
    setEmployeeFilter("");
    setActionFilter("");
    setDateFrom("");
    setDateTo("");
    setPage(1);
  };

  const fetchEntries = useCallback(async (signal?: AbortSignal) => {
    const currentRequestId = ++requestIdRef.current;
    setLoading(true);
    setError(false);
    try {
      const params: Record<string, string | number> = { page, limit: 30 };
      if (debouncedEmployeeFilter) params.employeeId = debouncedEmployeeFilter;
      if (actionFilter) params.action = actionFilter;
      if (dateFrom) params.startDate = dateFrom;
      if (dateTo) params.endDate = dateTo;
      const res = await api.get("/audit/system", { params, signal });

      if (currentRequestId !== requestIdRef.current) return; // a newer request already landed

      setEntries(res.data.data ?? res.data);
      setMeta(res.data.meta ?? { page: 1, totalPages: 1, total: 0, limit: 30 });
    } catch (err) {
      if (isAbortError(err)) return;
      if (currentRequestId !== requestIdRef.current) return;
      setError(true);
      setEntries([]);
    } finally {
      if (currentRequestId === requestIdRef.current && !signal?.aborted) setLoading(false);
    }
  }, [page, debouncedEmployeeFilter, actionFilter, dateFrom, dateTo]);

  useEffect(() => {
    const controller = new AbortController();
    void fetchEntries(controller.signal);
    return () => controller.abort();
  }, [fetchEntries]);

  const formatAction = (action: string) => {
    const label = t.auditHistory.actions?.[action as keyof typeof t.auditHistory.actions];
    return label ?? action;
  };

  const actionOptions = useMemo(
    () => [
      { label: t.auditHistory.allActions, value: "" },
      ...AUDIT_ACTIONS.map((action) => ({
        label: t.auditHistory.actions?.[action as keyof typeof t.auditHistory.actions] ?? action,
        value: action,
      })),
    ],
    [t]
  );

  const detailLabel = (key: string) => DETAIL_LABELS[key]?.[language === "ar" ? "ar" : "en"] ?? key;

  const formatNumber = (value: number) =>
    value.toLocaleString(language === "ar" ? "ar-EG" : "en-US");

  const formatDetailItem = (value: unknown): string => {
    if (value === null || value === undefined) return "—";
    if (typeof value === "number") return formatNumber(value);
    if (typeof value === "string") return value;
    if (typeof value !== "object") return String(value);

    const obj = value as Record<string, unknown>;
    const model = typeof obj.model === "string" ? obj.model : undefined;
    const barcode = typeof obj.barcode === "string" ? obj.barcode : undefined;
    const quantity = typeof obj.quantity === "number" ? obj.quantity : undefined;
    const price = typeof obj.price === "number" ? obj.price : undefined;
    const refund = typeof obj.refund === "number" ? obj.refund : undefined;
    const oldPrice = typeof obj.oldPrice === "number" ? obj.oldPrice : undefined;
    const newPrice = typeof obj.newPrice === "number" ? obj.newPrice : undefined;

    if (model && oldPrice !== undefined && newPrice !== undefined) {
      return `${model}: ${formatNumber(oldPrice)} → ${formatNumber(newPrice)}`;
    }
    if (model && quantity !== undefined && price !== undefined) {
      return `${model} × ${quantity} @ ${formatNumber(price)}`;
    }
    if (model && quantity !== undefined) return `${model} × ${quantity}`;
    if (model && refund !== undefined) {
      return `${model}${barcode ? ` (${barcode})` : ""} — ${formatNumber(refund)}`;
    }
    if (model && barcode) return `${model} (${barcode})`;
    if (model) return model;
    if (barcode) return barcode;
    return JSON.stringify(value);
  };

  const formatDetailValue = (key: string, value: unknown): string => {
    if (value === null || value === undefined) return "—";
    if (Array.isArray(value)) {
      if (value.length === 0) return "—";
      return value.map((v) => formatDetailItem(v)).join(language === "ar" ? "، " : ", ");
    }
    if (typeof value === "number" && CURRENCY_DETAIL_KEYS.has(key)) {
      return formatNumber(value);
    }
    if (typeof value === "object") return formatDetailItem(value);
    return String(value);
  };

  const renderDetails = (entry: AuditEntry) => {
    if (!entry.details) return <span style={{ color: "var(--soft)" }}>—</span>;

    const detailEntries = Object.entries(entry.details).filter(([key]) => !HIDDEN_DETAIL_KEYS.has(key));
    if (detailEntries.length === 0) return <span style={{ color: "var(--soft)" }}>—</span>;

    return (
      <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
        {detailEntries.map(([key, value]) => (
          <div key={key} style={{ display: "flex", gap: "8px", fontSize: "12px" }}>
            <span style={{ color: "var(--soft)", minWidth: 80, fontWeight: 600 }}>{detailLabel(key)}:</span>
            <span style={{ color: "var(--ink)" }}>{formatDetailValue(key, value)}</span>
          </div>
        ))}
      </div>
    );
  };

  return (
    <div>
      <PageHeader title={t.pages.auditHistory} subtitle={t.pages.auditHistorySubtitle} />

      <div className="toolbar">
        <div style={{ width: 180 }}>
          <Select
            label={t.auditHistory.employee}
            options={[
              { label: t.auditHistory.allActions, value: "" },
              ...employees.map((e) => ({ label: e.name, value: String(e.id) })),
            ]}
            value={employeeFilter}
            onChange={(e) => { setEmployeeFilter(e.target.value); setPage(1); }}
          />
        </div>
        <div style={{ width: 180 }}>
          <Select
            label={t.auditHistory.action}
            options={actionOptions}
            value={actionFilter}
            onChange={(e) => { setActionFilter(e.target.value); setPage(1); }}
          />
        </div>
        <DateRangePicker from={dateFrom} to={dateTo} onChange={(f, t) => { setDateFrom(f); setDateTo(t); setPage(1); }} />
        {hasActiveFilters && (
          <button
            type="button"
            onClick={resetFilters}
            style={{
              fontFamily: "'Manrope', sans-serif",
              fontSize: "13px",
              fontWeight: 600,
              color: "var(--brand)",
              background: "none",
              border: "none",
              cursor: "pointer",
              padding: "8px 4px",
            }}
          >
            {t.auditHistory.clearFilters ?? "Clear filters"}
          </button>
        )}
      </div>

      {loading ? (
        <div className="state-block">
          <LoadingSpinner size={32} />
        </div>
      ) : error ? (
        <EmptyState
          title={t.auditHistory.errorTitle ?? "Something went wrong"}
          description={t.auditHistory.errorHint ?? "Couldn't load the audit history. Please try again."}
        />
      ) : entries.length === 0 ? (
        <EmptyState
          title={t.auditHistory.noEntries}
          description={hasActiveFilters ? t.auditHistory.noEntriesFilteredHint ?? t.auditHistory.noEntriesHint : t.auditHistory.noEntriesHint}
        />
      ) : (
        <>
          <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
            {entries.map((entry) => {
              const isExpanded = expandedId === entry.id;
              const roleColors = entry.employee?.role
                ? ROLE_BADGE_COLORS[entry.employee.role] ?? DEFAULT_ROLE_BADGE
                : DEFAULT_ROLE_BADGE;

              return (
                <div
                  key={entry.id}
                  className="audit-detail-card"
                  role="button"
                  tabIndex={0}
                  aria-expanded={isExpanded}
                  style={{
                    backgroundColor: "var(--card)",
                    border: "1px solid var(--border)",
                    borderRadius: "var(--radius-md)",
                    padding: "14px 16px",
                    cursor: "pointer",
                    transition: "border-color 0.15s ease",
                  }}
                  onClick={() => setExpandedId(isExpanded ? null : entry.id)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      setExpandedId(isExpanded ? null : entry.id);
                    }
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.borderColor = "var(--brand)"; }}
                  onMouseLeave={(e) => { e.currentTarget.style.borderColor = "var(--border)"; }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "12px" }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "4px" }}>
                        <span style={{ fontFamily: "'Sora', sans-serif", fontSize: "14px", fontWeight: 600, color: "var(--ink)" }}>
                          {entry.employee?.name || "—"}
                        </span>
                        {entry.employee?.role && (
                          <span style={{
                            fontFamily: "'Manrope', sans-serif",
                            fontSize: "11px",
                            fontWeight: 600,
                            padding: "2px 8px",
                            borderRadius: "999px",
                            backgroundColor: roleColors.bg,
                            color: roleColors.fg,
                          }}>
                            {entry.employee.role}
                          </span>
                        )}
                      </div>
                      <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
                        <span style={{
                          fontFamily: "'Manrope', sans-serif",
                          fontSize: "12px",
                          fontWeight: 600,
                          padding: "2px 8px",
                          borderRadius: "999px",
                          backgroundColor: "var(--brand-bg)",
                          color: "var(--brand)",
                        }}>
                          {formatAction(entry.action)}
                        </span>
                        {entry.invoice && (
                          <span style={{ fontFamily: "'Manrope', sans-serif", fontSize: "12px", color: "var(--soft)" }}>
                            {t.invoices.invoiceNumber} {entry.invoice.invoiceNumber}
                          </span>
                        )}
                        {entry.productUnit && (
                          <span style={{ fontFamily: "'Manrope', sans-serif", fontSize: "12px", color: "var(--soft)" }}>
                            {entry.productUnit.productModel?.name} — {entry.productUnit.barcode}
                          </span>
                        )}
                        {entry.stockReceipt && (
                          <span style={{ fontFamily: "'Manrope', sans-serif", fontSize: "12px", color: "var(--soft)" }}>
                            #{entry.stockReceipt.id}
                            {typeof entry.details?.supplierName === "string" && ` — ${entry.details.supplierName}`}
                          </span>
                        )}
                      </div>
                    </div>
                    <div style={{ textAlign: "end", flexShrink: 0 }}>
                      <div style={{ fontFamily: "'Manrope', sans-serif", fontSize: "13px", color: "var(--ink)", whiteSpace: "nowrap" }}>
                        {new Date(entry.timestamp).toLocaleDateString(language === "ar" ? "ar-EG" : "en-US", { day: "numeric", month: "short", year: "numeric" })}
                      </div>
                      <div style={{ fontFamily: "'Manrope', sans-serif", fontSize: "12px", color: "var(--soft)", fontVariantNumeric: "tabular-nums" }}>
                        {new Date(entry.timestamp).toLocaleTimeString(language === "ar" ? "ar-EG" : "en-US", { hour: "2-digit", minute: "2-digit" })}
                      </div>
                    </div>
                  </div>

                  {isExpanded && entry.details && (
                    <div style={{ marginTop: "12px", paddingTop: "12px", borderTop: "1px solid var(--border)" }}>
                      <div style={{ fontFamily: "'Manrope', sans-serif", fontSize: "11px", fontWeight: 600, color: "var(--soft)", textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: "8px" }}>
                        {t.auditHistory.details}
                      </div>
                      {renderDetails(entry)}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
          <Pagination
            currentStart={(meta.page - 1) * meta.limit + 1}
            currentEnd={Math.min(meta.page * meta.limit, meta.total)}
            total={meta.total}
            currentPage={meta.page}
            totalPages={meta.totalPages}
            onPrev={() => setPage((p) => Math.max(1, p - 1))}
            onNext={() => setPage((p) => Math.min(meta.totalPages, p + 1))}
          />
        </>
      )}
    </div>
  );
}