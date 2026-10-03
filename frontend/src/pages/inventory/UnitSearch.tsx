import React from "react";
import api from "../../lib/api";
import { notify } from "../../lib/notify";
import { getFriendlyErrorMessage } from "../../lib/messages";
import { Button } from "../../components/ui/Button";
import { Card } from "../../components/ui/Card";
import { PageHeader } from "../../components/ui/PageHeader";
import { ScannerInput } from "../../components/ui/ScannerInput";
import { StatusChip } from "../../components/ui/StatusChip";
import { Modal } from "../../components/ui/Modal";
import { LoadingSpinner } from "../../components/ui/LoadingSpinner";
import { EmptyState } from "../../components/ui/EmptyState";
import { useI18n } from "../../i18n/context";
import type { ProductUnit, ProductUnitAuditEntry, ProductUnitStatus } from "../../types";

const detailPanelStyle: React.CSSProperties = {
  backgroundColor: "var(--card)",
  border: "1px solid var(--border)",
  borderRadius: "var(--radius-md)",
  padding: "16px",
};

const timelineItemStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "flex-start",
  gap: "12px",
  padding: "12px 0",
  borderBottom: "1px solid var(--border)",
};

const actionColorMap: Record<string, string> = {
  RECEIVED: "var(--mint)",
  SOLD: "var(--brand)",
  RETURNED: "var(--peach)",
  DAMAGED: "var(--accent)",
  RESTORED: "var(--mint)",
  AVAILABLE: "var(--mint)",
};

export default function UnitSearch() {
  const { t } = useI18n();
  const [unit, setUnit] = React.useState<ProductUnit | null>(null);
  const [auditLog, setAuditLog] = React.useState<ProductUnitAuditEntry[]>([]);
  const [searching, setSearching] = React.useState(false);
  const [error, setError] = React.useState("");
  const [found, setFound] = React.useState(false);
  const [actionLoading, setActionLoading] = React.useState(false);
  const [confirmAction, setConfirmAction] = React.useState<"damaged" | "restore" | null>(null);

  const handleScan = async (barcode: string) => {
    setSearching(true);
    setError("");
    setFound(false);
    setUnit(null);
    setAuditLog([]);

    try {
      const res = await api.get<ProductUnit>(`/product-units/barcode/${barcode}`);
      setUnit(res.data);
      setFound(true);

      try {
        const auditRes = await api.get<ProductUnitAuditEntry[]>(`/product-units/${res.data.id}/audit`);
        setAuditLog(auditRes.data);
      } catch {
        setAuditLog([]);
      }
    } catch {
      setError(`${t.unitSearch.noUnitFound} "${barcode}"`);
    } finally {
      setSearching(false);
    }
  };

  const executeAction = async () => {
    if (!unit || !confirmAction) return;
    setActionLoading(true);
    try {
      if (confirmAction === "damaged") {
        await api.patch(`/product-units/${unit.id}/mark-damaged`);
      } else {
        await api.patch(`/product-units/${unit.id}/restore-available`);
      }
      // Refresh unit data
      const res = await api.get<ProductUnit>(`/product-units/barcode/${unit.barcode}`);
      setUnit(res.data);
      const auditRes = await api.get<ProductUnitAuditEntry[]>(`/product-units/${res.data.id}/audit`);
      setAuditLog(auditRes.data);
    } catch (err) {
      notify.error(getFriendlyErrorMessage(err, t));
    } finally {
      setActionLoading(false);
      setConfirmAction(null);
    }
  };

  const canMarkDamaged = unit?.status === "AVAILABLE";
  const canRestore = unit?.status === "DAMAGED";

  const soldInvoice = unit?.unitAssignments?.[0]?.invoiceItem?.invoice;
  const customerName = soldInvoice?.customer?.name;

  return (
    <div>
      <PageHeader
        title={t.pages.unitSearch}
        subtitle={t.pages.unitSearchSubtitle}
      />

      <div style={{ display: "flex", flexDirection: "column", gap: "16px", maxWidth: "640px" }}>
        <ScannerInput
          onScan={handleScan}
          placeholder={t.unitSearch.scanOrType}
        />

        {searching && (
          <div className="state-block">
            <LoadingSpinner size={24} />
          </div>
        )}

        {error && !searching && (
          <Card>
            <div style={{ display: "flex", alignItems: "center", gap: "12px", color: "var(--accent)" }}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10" />
                <line x1="15" y1="9" x2="9" y2="15" />
                <line x1="9" y1="9" x2="15" y2="15" />
              </svg>
              <span style={{ fontFamily: "'Manrope', sans-serif", fontSize: "14px", fontWeight: 500 }}>{error}</span>
            </div>
          </Card>
        )}

        {!searching && !found && !error && (
          <EmptyState
            icon={
              <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="11" cy="11" r="8" />
                <line x1="21" y1="21" x2="16.65" y2="16.65" />
              </svg>
            }
            title={t.unitSearch.scanBarcode}
            description={t.unitSearch.scanBarcodeHint}
          />
        )}

        {found && unit && (
          <>
            <div style={detailPanelStyle}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "8px", marginBottom: "16px", flexWrap: "wrap" }}>
                <div>
                  <div style={{ fontFamily: "'Manrope', sans-serif", fontSize: "12px", color: "var(--soft)", marginBottom: "4px" }}>{t.invoices.barcode}</div>
                  <div style={{ fontFamily: "'Sora', sans-serif", fontSize: "20px", fontWeight: 700, fontVariantNumeric: "tabular-nums", color: "var(--ink)" }}>
                    {unit.barcode}
                  </div>
                </div>
                <StatusChip status={unit.status as ProductUnitStatus} />
              </div>

              <div style={{ display: "flex", gap: "16px", marginBottom: "16px", flexWrap: "wrap" }}>
                <div>
                  <div style={{ fontFamily: "'Manrope', sans-serif", fontSize: "12px", color: "var(--soft)", marginBottom: "2px" }}>{t.unitSearch.productModel}</div>
                  <div style={{ fontFamily: "'Manrope', sans-serif", fontSize: "14px", fontWeight: 600, color: "var(--ink)" }}>
                    {unit.productModel?.name ?? "—"}
                  </div>
                </div>
                <div>
                  <div style={{ fontFamily: "'Manrope', sans-serif", fontSize: "12px", color: "var(--soft)", marginBottom: "2px" }}>{t.unitSearch.version}</div>
                  <div style={{ fontFamily: "'Manrope', sans-serif", fontSize: "14px", fontWeight: 600, fontVariantNumeric: "tabular-nums", color: "var(--ink)" }}>
                    v{unit.version}
                  </div>
                </div>
              </div>

              {unit.status === "SOLD" && (
                <div
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    gap: "2px",
                    padding: "12px",
                    marginBottom: "16px",
                    borderRadius: "var(--radius-md)",
                    border: "1px solid var(--brand)",
                    fontFamily: "'Manrope', sans-serif",
                  }}
                >
                  <span style={{ fontSize: "14px", fontWeight: 600, color: "var(--ink)" }}>
                    {t.unitSearch.soldTo(customerName ?? "—")}
                  </span>
                  {soldInvoice?.invoiceNumber && (
                    <span style={{ fontSize: "12px", color: "var(--soft)" }}>
                      {t.unitSearch.soldInInvoice(soldInvoice.invoiceNumber)}
                    </span>
                  )}
                </div>
              )}

              {(canMarkDamaged || canRestore) && (
                <div style={{ display: "flex", gap: "12px", paddingTop: "16px", borderTop: "1px solid var(--border)" }}>
                  {canMarkDamaged && (
                    <Button
                      variant="danger"
                      size="sm"
                      onClick={() => setConfirmAction("damaged")}
                    >
                      {t.unitSearch.markDamaged}
                    </Button>
                  )}
                  {canRestore && (
                    <Button
                      variant="primary"
                      size="sm"
                      onClick={() => setConfirmAction("restore")}
                    >
                      {t.unitSearch.restoreAvailable}
                    </Button>
                  )}
                </div>
              )}
            </div>

            <Card title={t.unitSearch.lifecycleTimeline}>
              {auditLog.length === 0 ? (
                <div style={{ fontFamily: "'Manrope', sans-serif", fontSize: "14px", color: "var(--soft)", textAlign: "center" as const, padding: "24px 0" }}>
                  {t.unitSearch.noLifecycleEvents}
                </div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column" }}>
                  {auditLog.map((entry) => (
                    <div key={entry.id} style={timelineItemStyle}>
                      <div
                        style={{
                          width: "8px",
                          height: "8px",
                          borderRadius: "50%",
                          backgroundColor: actionColorMap[entry.action] ?? "var(--soft)",
                          marginTop: "6px",
                          flexShrink: 0,
                        }}
                      />
                      <div style={{ flex: 1 }}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                          <span style={{ fontFamily: "'Manrope', sans-serif", fontSize: "14px", fontWeight: 600, color: "var(--ink)" }}>
                            {t.auditHistory.actions?.[entry.action as keyof typeof t.auditHistory.actions] ?? entry.action}
                          </span>
                          <span style={{ fontFamily: "'Manrope', sans-serif", fontSize: "12px", color: "var(--soft)" }}>
                            {new Date(entry.timestamp).toLocaleString()}
                          </span>
                        </div>
                        {entry.notes && (
                          <div style={{ fontFamily: "'Manrope', sans-serif", fontSize: "13px", color: "var(--soft)", marginTop: "2px" }}>
                            {entry.notes}
                          </div>
                        )}
                        {entry.employee && (
                          <div style={{ fontFamily: "'Manrope', sans-serif", fontSize: "12px", color: "var(--soft)", marginTop: "2px" }}>
                            {t.byName(entry.employee.name)}
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </Card>
          </>
        )}
      </div>

      <Modal
        isOpen={!!confirmAction}
        onClose={() => setConfirmAction(null)}
        title={confirmAction === "damaged" ? t.unitSearch.markAsDamaged : t.unitSearch.restoreToAvailable}
        footer={
          <>
            <Button variant="secondary" onClick={() => setConfirmAction(null)}>{t.cancel}</Button>
            <Button
              variant={confirmAction === "damaged" ? "danger" : "primary"}
              onClick={executeAction}
              loading={actionLoading}
            >
              {confirmAction === "damaged" ? t.unitSearch.markDamaged : t.unitSearch.restoreAvailable}
            </Button>
          </>
        }
      >
        <p style={{ margin: 0, fontFamily: "'Manrope', sans-serif", fontSize: "14px", color: "var(--ink)" }}>
          {confirmAction === "damaged"
            ? t.unitSearch.markDamagedConfirm
            : t.unitSearch.restoreConfirm
          }
        </p>
      </Modal>
    </div>
  );
}