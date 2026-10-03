import React from "react";
import axios from "axios";
import api from "../../lib/api";
import { useCategories, useProductModelsByCategory, useSuppliersOptions } from "../../hooks";
import { notify } from "../../lib/notify";
import { getSuccessMessages } from "../../lib/success-messages";
import { Button } from "../../components/ui/Button";
import { Card } from "../../components/ui/Card";
import { Select } from "../../components/ui/Select";
import { PageHeader } from "../../components/ui/PageHeader";
import { ScannerInput } from "../../components/ui/ScannerInput";
import { Modal } from "../../components/ui/Modal";
import { useI18n } from "../../i18n/context";

interface ScannedItem {
  barcode: string;
  verified: boolean;
}

type ReceiveShipmentPayload = {
  categoryId: number;
  productModelId: number;
  supplierId?: number;
  barcodes?: string[];
  nonSerialized?: { quantity: number };
};

type ApiErrorResponse = {
  message?: string | string[];
  errors?: string[];
};

const tempBannerStyle: React.CSSProperties = {
  backgroundColor: "var(--peach-bg)",
  border: "1px solid color-mix(in srgb, var(--peach) 35%, transparent)",
  borderRadius: "8px",
  padding: "10px 16px",
  fontFamily: "'Manrope', sans-serif",
  fontSize: "13px",
  color: "var(--peach)",
  fontWeight: 500,
  display: "flex",
  alignItems: "center",
  gap: "8px",
};

const scannerContainerStyle: React.CSSProperties = {
  backgroundColor: "var(--card)",
  border: "1px solid var(--border)",
  borderRadius: "var(--radius-md)",
  padding: "16px",
};

const rowStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  padding: "10px 0",
  borderBottom: "1px solid var(--border)",
};

const countStyle: React.CSSProperties = {
  fontFamily: "'Sora', sans-serif",
  fontSize: "clamp(32px, 8vw, 48px)",
  fontWeight: 700,
  fontVariantNumeric: "tabular-nums",
  color: "var(--ink)",
  textAlign: "center" as const,
  lineHeight: 1,
};

export default function ReceiveShipment() {
  const { t } = useI18n();
  const SUCCESS_MESSAGES = getSuccessMessages(t);
  const [categoryId, setCategoryId] = React.useState("");
  const { data: categories = [] } = useCategories();
  const {
    data: suppliers = [],
    isLoading: suppliersLoading,
    isError: suppliersError,
  } = useSuppliersOptions();
  const { data: models = [] } = useProductModelsByCategory(categoryId);
  const [modelId, setModelId] = React.useState("");
  const [supplierId, setSupplierId] = React.useState("");
  const [scannedList, setScannedList] = React.useState<ScannedItem[]>([]);
  const [scanError, setScanError] = React.useState("");
  const [scanSuccess, setScanSuccess] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  const [confirmOpen, setConfirmOpen] = React.useState(false);
  const [confirmData, setConfirmData] = React.useState<{ name: string; count: number } | null>(null);
  const [errorModal, setErrorModal] = React.useState<string[]>([]);
  const scannerRef = React.useRef<HTMLInputElement>(null);
  const [nonSerializedQty, setNonSerializedQty] = React.useState("");

  React.useEffect(() => {
    setModelId("");
  }, [categoryId]);

  const refocusScanner = () => {
    setTimeout(() => {
      const input = document.querySelector<HTMLInputElement>("[data-scanner-input]");
      input?.focus();
    }, 50);
  };

  const handleScan = async (barcode: string) => {
    setScanError("");
    setScanSuccess(false);

    if (scannedList.some((i) => i.barcode === barcode)) {
      setScanError(t.receiveShipment.barcodeAlreadyInList);
      refocusScanner();
      return;
    }

    try {
      const res = await api.get(`/product-units/barcode/${barcode}`);
      if (res.data) {
        setScanError(t.receiveShipment.barcodeAlreadyExists);
        refocusScanner();
        return;
      }
    } catch {
      // 404 means not found = new barcode, proceed
    }

    setScannedList((prev) => [...prev, { barcode, verified: true }]);
    setScanSuccess(true);
    setTimeout(() => setScanSuccess(false), 1200);
    refocusScanner();
  };

  const removeItem = (barcode: string) => {
    setScannedList((prev) => prev.filter((i) => i.barcode !== barcode));
  };

  const clearList = () => setScannedList([]);

  const handleSave = async () => {
    if (!categoryId || !modelId || !supplierId) return;
    const selectedModel = models.find((m) => String(m.id) === modelId);
    const isSerialized = selectedModel?.isSerialized !== false;
    const unit = selectedModel?.unit ?? "PIECE";
    const parsedCategoryId = Number(categoryId);
    const parsedModelId = Number(modelId);

    if (!Number.isInteger(parsedCategoryId) || !Number.isInteger(parsedModelId)) return;
    const parsedQuantity = Number(nonSerializedQty);
    if (isSerialized && scannedList.length === 0) return;
    if (!isSerialized || nonSerializedQty) {
      if (!Number.isFinite(parsedQuantity) || parsedQuantity <= 0) return;
      if (unit !== "METER" && !Number.isInteger(parsedQuantity)) return;
    }
    const quantity = unit === "METER" ? Math.round(parsedQuantity * 100) / 100 : parsedQuantity;

    setSaving(true);
    try {
      const modelName = models.find((m) => String(m.id) === modelId)?.name ?? "Model";
      const payload: ReceiveShipmentPayload = {
        categoryId: parsedCategoryId,
        productModelId: parsedModelId,
      };
      if (supplierId) payload.supplierId = Number(supplierId);
      if (isSerialized) {
        payload.barcodes = scannedList.map((i) => i.barcode);
      } else {
        payload.nonSerialized = { quantity };
      }
      await api.post("/stock-receipts", payload);
      notify.success(SUCCESS_MESSAGES.shipment.received);
      setConfirmData({ name: modelName, count: isSerialized ? scannedList.length : quantity });
      setConfirmOpen(true);
      setScannedList([]);
      setNonSerializedQty("");
      setCategoryId("");
      setModelId("");
      setSupplierId("");
    } catch (error: unknown) {
      const responseData: ApiErrorResponse | undefined = axios.isAxiosError(error)
        && typeof error.response?.data === "object"
        && error.response.data !== null
        ? error.response.data as ApiErrorResponse
        : undefined;
      const messages = responseData?.errors?.length
        ? responseData.errors
        : responseData?.message
          ? Array.isArray(responseData.message) ? responseData.message : [responseData.message]
          : [t.receiveShipment.failedToSave];
      setErrorModal(messages);
    } finally {
      setSaving(false);
    }
  };

  const categoryOptions = categories.map((c) => ({ label: c.name, value: String(c.id) }));
  const modelOptions = models.map((m) => ({ label: m.name, value: String(m.id) }));

  return (
    <div>
      <PageHeader
        title={t.pages.receiveShipment}
        subtitle={t.pages.receiveShipmentSubtitle}
        actions={
          <Button variant="secondary" onClick={() => window.history.back()}>
            {t.back}
          </Button>
        }
      />

      <div className="stack">
        <div style={tempBannerStyle}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="8" x2="12" y2="12" />
            <line x1="12" y1="16" x2="12.01" y2="16" />
          </svg>
          {t.receiveShipment.notSaved}
        </div>

        <div className="form-grid-wide" style={{ gap: "12px" }}>
          <div>
            <Select
              label={t.receiveShipment.category}
              options={categoryOptions}
              placeholder={t.receiveShipment.selectCategory}
              value={categoryId}
              onChange={(e) => setCategoryId(e.target.value)}
            />
          </div>
          <div>
            <Select
              label={t.receiveShipment.productModel}
              options={modelOptions}
              placeholder={categoryId ? t.receiveShipment.selectModel : t.receiveShipment.selectCategoryFirst}
              value={modelId}
              onChange={(e) => setModelId(e.target.value)}
              disabled={!categoryId}
            />
          </div>
          <div>
            <Select
              label={t.receiveShipment.supplier}
              options={suppliers.map((s) => ({ label: s.name, value: String(s.id) }))}
              placeholder={t.receiveShipment.selectSupplier}
              value={supplierId}
              onChange={(e) => setSupplierId(e.target.value)}
              disabled={suppliersLoading || suppliersError}
            />
            {suppliersLoading && <div style={{ marginTop: "4px", color: "var(--soft)", fontSize: "12px" }}>{t.receiveShipment.loadingSuppliers}</div>}
            {suppliersError && <div style={{ marginTop: "4px", color: "var(--accent)", fontSize: "12px" }}>{t.receiveShipment.unableToLoadSuppliers}</div>}
          </div>
        </div>

        <div style={scannerContainerStyle}>
          {(() => {
            const selectedModel = models.find((m) => String(m.id) === modelId);
            const isSerialized = selectedModel?.isSerialized !== false;
            const unit = selectedModel?.unit ?? "PIECE";
            if (!isSerialized) {
              return (
                <div style={{ textAlign: "center" as const, padding: "20px 0" }}>
                  <div style={{ fontFamily: "'Manrope', sans-serif", fontSize: "13px", color: "var(--soft)", marginBottom: "12px" }}>
                    {t.receiveShipment.nonSerializedProductEnterQuantity}
                  </div>
                  <input
                    type="number"
                    min={unit === "METER" ? "0.01" : "1"}
                    step={unit === "METER" ? "0.01" : "1"}
                    value={nonSerializedQty}
                    onChange={(e) => setNonSerializedQty(e.target.value)}
                    placeholder={t.receiveShipment.enterQuantity}
                    style={{
                      width: "100%",
                      maxWidth: "200px",
                      minWidth: 0,
                      padding: "12px 16px",
                      borderRadius: "8px",
                      border: "2px solid var(--border)",
                      fontFamily: "'Sora', sans-serif",
                      fontSize: "24px",
                      fontWeight: 700,
                      textAlign: "center",
                      color: "var(--ink)",
                      backgroundColor: "var(--card)",
                      outline: "none",
                      boxSizing: "border-box",
                    }}
                  />
                  <div style={{ fontFamily: "'Manrope', sans-serif", fontSize: "13px", color: "var(--soft)", marginTop: "8px" }}>
                    {t.uom[unit]}
                  </div>
                </div>
              );
            }
            return (
              <>
                <div style={{ marginBottom: "16px", textAlign: "center" as const }}>
                  <div style={countStyle} className="tabular-nums">{scannedList.length}</div>
                  <div style={{ fontFamily: "'Manrope', sans-serif", fontSize: "13px", color: "var(--soft)", marginTop: "4px" }}>
                    {t.receiveShipment.unitsScanned}
                  </div>
                </div>
                <ScannerInput
                  onScan={handleScan}
                  success={scanSuccess}
                  error={!!scanError}
                  data-scanner-input=""
                  ref={scannerRef as React.Ref<HTMLInputElement>}
                />
                {scanError && (
                  <div style={{ marginTop: "8px", fontFamily: "'Manrope', sans-serif", fontSize: "13px", color: "var(--accent)" }}>
                    {scanError}
                  </div>
                )}
              </>
            );
          })()}
        </div>

        {scannedList.length > 0 && (
          <Card
            title={`${t.receiveShipment.scannedBarcodes} (${scannedList.length})`}
            actions={
              <Button variant="quiet" size="sm" onClick={clearList}>
                {t.receiveShipment.clearList}
              </Button>
            }
          >
            <div style={{ maxHeight: "320px", overflowY: "auto" }}>
              {scannedList.map((item) => (
                <div key={item.barcode} style={rowStyle}>
                  <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--mint)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                    <span style={{ fontFamily: "'Manrope', sans-serif", fontSize: "14px", fontWeight: 600, fontVariantNumeric: "tabular-nums", color: "var(--ink)" }}>
                      {item.barcode}
                    </span>
                  </div>
                  <button
                    onClick={() => removeItem(item.barcode)}
                    style={{ background: "none", border: "none", cursor: "pointer", padding: "4px", color: "var(--soft)" }}
                    aria-label={`Remove ${item.barcode}`}
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <line x1="18" y1="6" x2="6" y2="18" />
                      <line x1="6" y1="6" x2="18" y2="18" />
                    </svg>
                  </button>
                </div>
              ))}
            </div>
          </Card>
        )}

        <div className="toolbar" style={{ justifyContent: "flex-end", paddingTop: "8px", marginBottom: 0 }}>
          <Button variant="secondary" onClick={clearList} disabled={scannedList.length === 0 || saving}>
            {t.receiveShipment.clearList}
          </Button>
          <Button
            onClick={handleSave}
            disabled={!categoryId || !modelId || !supplierId || (() => {
              const selectedModel = models.find((m) => String(m.id) === modelId);
              if (selectedModel?.isSerialized !== false) return scannedList.length === 0;
              const parsed = Number(nonSerializedQty);
              if (!nonSerializedQty || !Number.isFinite(parsed) || parsed <= 0) return true;
              return (selectedModel?.unit ?? "PIECE") !== "METER" && !Number.isInteger(parsed);
            })()}
            loading={saving}
          >
            {t.receiveShipment.saveReceiveShipment}
          </Button>
        </div>
      </div>

      <Modal
        isOpen={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        title={t.receiveShipment.shipmentReceived}
      >
        <div style={{ textAlign: "center" as const, padding: "16px 0" }}>
          <div style={{ color: "var(--mint)", marginBottom: "16px" }}>
            <svg width="56" height="56" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
              <polyline points="22 4 12 14.01 9 11.01" />
            </svg>
          </div>
          <p style={{ fontFamily: "'Manrope', sans-serif", fontSize: "15px", color: "var(--ink)", margin: 0 }}>
            <strong>{confirmData?.count}</strong> {t.receiveShipment.unitsOf} <strong>{confirmData?.name}</strong> {t.receiveShipment.addedToInventory}
          </p>
        </div>
      </Modal>

      <Modal
        isOpen={errorModal.length > 0}
        onClose={() => setErrorModal([])}
        title={t.receiveShipment.shipmentErrors}
      >
        <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
          {errorModal.map((msg, i) => (
            <div
              key={i}
              style={{
                padding: "10px 14px",
                backgroundColor: "var(--accent-bg)",
                borderRadius: "8px",
                fontFamily: "'Manrope', sans-serif",
                fontSize: "14px",
                color: "var(--accent)",
              }}
            >
              {msg}
            </div>
          ))}
        </div>
      </Modal>
    </div>
  );
}
