import { useState, useEffect, useCallback, useRef } from "react";
import api from "../../lib/api";
import { isAbortError } from "../../hooks";
import { notify } from "../../lib/notify";
import { getFriendlyErrorMessage } from "../../lib/messages";
import { getSuccessMessages } from "../../lib/success-messages";
import { Button } from "../../components/ui/Button";
import { Card } from "../../components/ui/Card";
import { Table } from "../../components/ui/Table";
import { LoadingSpinner } from "../../components/ui/LoadingSpinner";
import { EmptyState } from "../../components/ui/EmptyState";
import { PageHeader } from "../../components/ui/PageHeader";
import { Modal } from "../../components/ui/Modal";
import { useI18n } from "../../i18n/context";
import { useRealtimeRefresh } from "../../hooks/useRealtimeEvents";
import type { Invoice, PaginatedResponse } from "../../types";

interface DeliverySummary {
  invoiceId: number;
  invoiceNumber: string;
  status: string;
  serializedLines: Array<{
    invoiceItemId: number;
    productModelId: number;
    productModelName: string;
    requiredQuantity: number;
    scannedQuantity: number;
    scannedUnits: Array<{ barcode: string; scannedAt: string; scannedBy?: string }>; 
  }>;
}

export default function InvoiceDelivery() {
  const { t } = useI18n();
  const SUCCESS_MESSAGES = getSuccessMessages(t);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [delivering, setDelivering] = useState<number | null>(null);
  const [selectedInvoice, setSelectedInvoice] = useState<Invoice | null>(null);
  const [deliverySummary, setDeliverySummary] = useState<DeliverySummary | null>(null);
  const [barcodeInput, setBarcodeInput] = useState("");
  const [barcodeError, setBarcodeError] = useState("");
  const [scanLoading, setScanLoading] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);

  const detailAbortRef = useRef<AbortController | null>(null);
  const barcodeInputRef = useRef<HTMLInputElement | null>(null);

  const serializedLines = deliverySummary?.serializedLines ?? [];
  const remainingScans = serializedLines.reduce(
    (sum, line) => sum + Math.max(0, line.requiredQuantity - line.scannedQuantity),
    0,
  );
  const firstUnscannedItemId = serializedLines.find(
    (line) => line.scannedQuantity < line.requiredQuantity,
  )?.invoiceItemId;

  const fetchInvoices = useCallback(async (signal?: AbortSignal) => {
    setLoading(true);
    try {
      const { data } = await api.get<PaginatedResponse<Invoice>>("/invoices/delivery-queue", { signal });
      setInvoices(data.data || []);
    } catch (err) {
      if (isAbortError(err)) return;
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }, []);

  const fetchInvoiceDelivery = useCallback(async (invoiceId: number) => {
    detailAbortRef.current?.abort();
    const controller = new AbortController();
    detailAbortRef.current = controller;
    const { signal } = controller;

    setDetailLoading(true);
    try {
      const [invoiceRes, deliveryRes] = await Promise.all([
        api.get<Invoice>(`/invoices/${invoiceId}`, { signal }),
        api.get<DeliverySummary>(`/invoices/${invoiceId}/delivery`, { signal }),
      ]);
      setSelectedInvoice(invoiceRes.data);
      setDeliverySummary(deliveryRes.data);
      setBarcodeInput("");
    } catch (err) {
      if (isAbortError(err)) return;
      setSelectedInvoice(null);
      setDeliverySummary(null);
    } finally {
      if (!signal.aborted) setDetailLoading(false);
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    void fetchInvoices(controller.signal);
    return () => {
      controller.abort();
      detailAbortRef.current?.abort();
    };
  }, [fetchInvoices]);

  useRealtimeRefresh(() => {
    void fetchInvoices();
    if (selectedInvoice) void fetchInvoiceDelivery(selectedInvoice.id);
  }, ["invoice.confirmed", "invoice.delivery.scan", "invoice.delivered"]);

  // Keep the barcode field focused so a hardware scanner always has a target.
  useEffect(() => {
    if (!detailLoading && selectedInvoice && deliverySummary) {
      barcodeInputRef.current?.focus();
    }
  }, [detailLoading, selectedInvoice, deliverySummary]);

  const openDelivery = useCallback((invoiceId: number) => {
    void fetchInvoiceDelivery(invoiceId);
  }, [fetchInvoiceDelivery]);

  const handleDeliver = async (invoiceId: number) => {
    setDelivering(invoiceId);
    try {
      await api.patch(`/invoices/${invoiceId}/deliver`);
      setSelectedInvoice(null);
      setDeliverySummary(null);
      fetchInvoices();
      notify.success(SUCCESS_MESSAGES.invoice.delivered);
    } catch (err) {
      const code = (err as { response?: { data?: { code?: string } } })?.response?.data?.code;
      notify.error(getFriendlyErrorMessage(err, t));
      // Guide the employee to the scan screen instead of leaving them with a dead end.
      if (code === "DELIVERY_INCOMPLETE") {
        openDelivery(invoiceId);
      }
    } finally {
      setDelivering(null);
    }
  };

  const handleBarcodeScan = async () => {
    if (!selectedInvoice || scanLoading) return;
    if (!barcodeInput.trim()) {
      setBarcodeError(t.errors.common.required);
      return;
    }
    setBarcodeError("");
    setScanLoading(true);
    try {
      await api.post(`/invoices/${selectedInvoice.id}/delivery/scan`, { barcode: barcodeInput.trim() });
      setBarcodeInput("");
      notify.success(t.invoices.barcodeScannedSuccessfully);
      await fetchInvoiceDelivery(selectedInvoice.id);
    } catch (err) {
      notify.error(getFriendlyErrorMessage(err, t));
    } finally {
      setScanLoading(false);
    }
  };

  const columns = [
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
      key: "employee",
      label: t.invoices.employee,
      render: (row: Invoice) => row.employee?.name || "—",
    },
    {
      key: "date",
      label: t.date,
      render: (row: Invoice) => new Date(row.date).toLocaleDateString(),
    },
    {
      key: "itemsSummary",
      label: t.products,
      render: (row: Invoice) => {
        const items = row.items ?? [];

        if (items.length === 0) {
          return "—";
        }

        return (
          <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
            {items.map((item) => {
              const productName = item.productModel?.name || "Product";
              const quantity = item.quantity ?? 1;
              const isSerialized = item.productModel?.isSerialized ?? false;

              return (
                <div key={item.id} style={{ display: "flex", justifyContent: "space-between", gap: "12px", fontSize: "12px" }}>
                  <span style={{ color: "var(--ink)", fontWeight: 600 }}>{productName}</span>
                  <span style={{ color: "var(--soft)", fontVariantNumeric: "tabular-nums" }}>
                    {isSerialized
                      ? `barcode x${quantity}`
                      : `x${quantity}${item.productModel?.unit === "METER" ? ` ${t.uom.METER}` : ""}`}
                  </span>
                </div>
              );
            })}
          </div>
        );
      },
    },
    {
      key: "itemCount",
      label: t.items,
      align: "center" as const,
      render: (row: Invoice) => (
        <span style={{ fontVariantNumeric: "tabular-nums" }}>{row.items?.length ?? 0}</span>
      ),
    },
    {
      key: "actions",
      label: "",
      align: "right" as const,
      render: (row: Invoice) => (
        <div className="toolbar" style={{ justifyContent: "flex-end", marginBottom: 0 }}>
          <Button variant="secondary" size="sm" onClick={(e) => { e.stopPropagation(); openDelivery(row.id); }}>
            {t.view}
          </Button>
          <Button
            variant="primary"
            size="sm"
            loading={delivering === row.id}
            onClick={(e) => { e.stopPropagation(); void handleDeliver(row.id); }}
          >
            {t.markDelivered}
          </Button>
        </div>
      ),
    },
  ];

  return (
    <div>
      <PageHeader
        title={t.pages.invoiceDelivery}
        subtitle={t.pages.invoiceDeliverySubtitle}
      />

      {loading ? (
        <div className="state-block">
          <LoadingSpinner size={28} />
        </div>
      ) : invoices.length === 0 ? (
        <EmptyState
          title={t.invoices.noInvoices}
          description={t.noInvoicesPendingDelivery}
          icon={
            <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
            </svg>
          }
        />
      ) : (
        <Table
          columns={columns}
          data={invoices}
          keyExtractor={(row) => String((row as unknown as Invoice).id)}
        />
      )}

      <Modal
        isOpen={!!selectedInvoice}
        onClose={() => {
          setSelectedInvoice(null);
          setDeliverySummary(null);
          setBarcodeInput("");
        }}
        title={selectedInvoice ? `${t.invoices.invoiceNumber} ${selectedInvoice.invoiceNumber}` : t.invoiceDetails}
        footer={
          selectedInvoice ? (
            <>
              <Button variant="secondary" onClick={() => {
                setSelectedInvoice(null);
                setDeliverySummary(null);
                setBarcodeInput("");
              }}>
                {t.close}
              </Button>
              <Button
                variant="primary"
                loading={delivering === selectedInvoice.id}
                disabled={remainingScans > 0}
                onClick={() => { void handleDeliver(selectedInvoice.id); }}
              >
                {t.markDelivered}
              </Button>
            </>
          ) : null
        }
      >
        {detailLoading || !selectedInvoice ? (
          <div className="state-block">
            <LoadingSpinner size={24} />
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
            <div className="form-grid-wide" style={{ gap: "12px" }}>
              <div style={{ background: "var(--surface)", padding: "12px", borderRadius: "8px" }}>
                <div style={{ fontSize: "11px", color: "var(--soft)", textTransform: "uppercase" }}>{t.customerName}</div>
                <div style={{ fontWeight: 600 }}>{selectedInvoice.customer?.name || "—"}</div>
              </div>
              <div style={{ background: "var(--surface)", padding: "12px", borderRadius: "8px" }}>
                <div style={{ fontSize: "11px", color: "var(--soft)", textTransform: "uppercase" }}>{t.employeeName}</div>
                <div style={{ fontWeight: 600 }}>{selectedInvoice.employee?.name || "—"}</div>
              </div>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
              <div style={{ fontWeight: 700, fontSize: "13px", color: "var(--ink)" }}>{t.products}</div>
              {(selectedInvoice.items ?? []).map((item) => {
                const productName = item.productModel?.name || "Product";
                const quantity = item.quantity ?? 1;
                const isSerialized = item.productModel?.isSerialized ?? false;
                const serializedLine =
                  deliverySummary?.serializedLines.find((line) => line.invoiceItemId === item.id) ??
                  deliverySummary?.serializedLines.find((line) => line.productModelId === item.productModelId);
                const needsScan =
                  isSerialized &&
                  !!serializedLine &&
                  serializedLine.scannedQuantity < serializedLine.requiredQuantity;
                const attachRef = needsScan && serializedLine?.invoiceItemId === firstUnscannedItemId;

                return (
                  <div key={item.id} style={{ border: "1px solid var(--border)", borderRadius: "8px", padding: "12px" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", gap: "12px", alignItems: "center" }}>
                      <div>
                        <div style={{ fontWeight: 600 }}>{productName}</div>
                        <div style={{ fontSize: "12px", color: "var(--soft)" }}>
                          {isSerialized ? t.invoices.serialized : t.invoices.nonSerialized}
                        </div>
                      </div>
                      <div style={{ fontWeight: 700, color: "var(--ink)", fontVariantNumeric: "tabular-nums" }}>
                        {t.invoices.qty} {quantity}
                      </div>
                    </div>

                    {isSerialized && serializedLine && (
                      <div style={{ marginTop: "10px", display: "flex", flexDirection: "column", gap: "8px" }}>
                        <div style={{ fontSize: "12px", color: "var(--soft)" }}>
                          {t.invoices.scanned} {serializedLine.scannedQuantity} / {serializedLine.requiredQuantity}
                        </div>
                        {serializedLine.scannedUnits.length > 0 && (
                          <div style={{ display: "flex", flexWrap: "wrap", gap: "6px" }}>
                            {serializedLine.scannedUnits.map((unit) => (
                              <span key={unit.barcode} style={{ background: "var(--mint-bg)", color: "var(--mint)", padding: "4px 8px", borderRadius: "999px", fontSize: "11px" }}>
                                {unit.barcode}
                              </span>
                            ))}
                          </div>
                        )}
                        {needsScan && (
                          <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                            <div style={{ display: "flex", gap: "8px" }}>
                              <input
                                ref={attachRef ? barcodeInputRef : undefined}
                                value={barcodeInput}
                                onChange={(e) => {
                                  setBarcodeInput(e.target.value);
                                  setBarcodeError("");
                                }}
                                onKeyDown={(e) => {
                                  if (e.key === "Enter") {
                                    e.preventDefault();
                                    void handleBarcodeScan();
                                  }
                                }}
                                placeholder={t.invoices.barcode}
                                aria-label={t.invoices.barcode}
                                style={{
                                  flex: 1,
                                  padding: "8px 10px",
                                  borderRadius: "8px",
                                  border: barcodeError ? "1px solid var(--accent)" : "1px solid var(--border)",
                                  background: "var(--card)",
                                  fontSize: "13px",
                                  color: "var(--ink)",
                                }}
                              />
                              <Button size="sm" loading={scanLoading} disabled={scanLoading} onClick={() => { void handleBarcodeScan(); }}>
                                {t.invoices.scan}
                              </Button>
                            </div>
                            {barcodeError && (
                              <span style={{ fontFamily: "'Manrope', sans-serif", fontSize: "12px", color: "var(--accent)" }}>
                                {barcodeError}
                              </span>
                            )}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}

              {remainingScans > 0 && (
                <div
                  style={{
                    background: "var(--accent-bg)",
                    border: "1px solid color-mix(in srgb, var(--accent) 30%, transparent)",
                    color: "var(--accent)",
                    borderRadius: "8px",
                    padding: "10px 12px",
                    fontSize: "13px",
                    fontWeight: 600,
                  }}
                >
                  {t.invoices.remainingToScan.replace("{n}", String(remainingScans))}
                </div>
              )}
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
