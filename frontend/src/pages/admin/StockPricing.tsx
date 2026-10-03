import { useState, useEffect, useCallback } from "react";
import api from "../../lib/api";
import { isAbortError } from "../../hooks";
import { notify } from "../../lib/notify";
import { getFriendlyErrorMessage } from "../../lib/messages";
import { getSuccessMessages } from "../../lib/success-messages";
import { Button } from "../../components/ui/Button";
import { Input } from "../../components/ui/Input";
import { Card } from "../../components/ui/Card";
import { Table } from "../../components/ui/Table";
import { StatusChip } from "../../components/ui/StatusChip";
import { LoadingSpinner } from "../../components/ui/LoadingSpinner";
import { EmptyState } from "../../components/ui/EmptyState";
import { PageHeader } from "../../components/ui/PageHeader";
import { useI18n } from "../../i18n/context";
import { useRealtimeRefresh } from "../../hooks/useRealtimeEvents";
import type { StockReceipt, PaginatedResponse } from "../../types";

export default function PendingPricingQueue() {
  const { t } = useI18n();
  const SUCCESS_MESSAGES = getSuccessMessages(t);
  const [receipts, setReceipts] = useState<StockReceipt[]>([]);
  const [loading, setLoading] = useState(true);
  const [pricingId, setPricingId] = useState<number | null>(null);
  const [purchasePrice, setPurchasePrice] = useState("");
  const [priceError, setPriceError] = useState("");
  const [saving, setSaving] = useState(false);

  const fetchReceipts = useCallback(async (signal?: AbortSignal) => {
    setLoading(true);
    try {
      const { data } = await api.get<PaginatedResponse<StockReceipt>>("/stock-receipts/pending-pricing", {
        params: { limit: 50 },
        signal,
      });
      setReceipts(data.data || []);
    } catch (err) {
      if (isAbortError(err)) return;
      setReceipts([]);
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    void fetchReceipts(controller.signal);
    return () => controller.abort();
  }, [fetchReceipts]);

  useRealtimeRefresh(() => {
    void fetchReceipts();
  }, ["stock.receipt.created", "stock.receipt.priced"]);

  const handlePrice = async (receiptId: number) => {
    const parsedPrice = parseFloat(purchasePrice);
    if (!purchasePrice || Number.isNaN(parsedPrice)) {
      setPriceError(t.errors.common.invalidNumber);
      return;
    }
    if (parsedPrice <= 0) {
      setPriceError(t.errors.common.greaterThanZero);
      return;
    }
    setPriceError("");
    setSaving(true);
    try {
      const receipt = receipts.find((item) => item.id === receiptId);
      if (!receipt) return;

      const prices = receipt.items.map((item) => ({
        productUnitId: item.productUnitId,
        purchasePrice: parsedPrice,
      }));
      const lotPrices = (receipt.stockLots || []).map((lot) => ({
        stockLotId: lot.id,
        purchasePrice: parsedPrice,
      }));
      await api.patch(`/stock-receipts/${receiptId}/price`, {
        prices: [...prices, ...lotPrices],
      });
      notify.success(SUCCESS_MESSAGES.pricing.saved);
      setPricingId(null);
      setPurchasePrice("");
      setPriceError("");
      fetchReceipts();
    } catch (err) {
      notify.error(getFriendlyErrorMessage(err, t));
    } finally {
      setSaving(false);
    }
  };

  const columns = [
    {
      key: "id",
      label: t.stockPricing.receiptNumber,
      render: (row: StockReceipt) => (
        <span style={{ fontWeight: 600, fontVariantNumeric: "tabular-nums" }}>#{row.id}</span>
      ),
    },
    {
      key: "model",
      label: t.stockPricing.productModel,
      render: (row: StockReceipt) => (
        <div>
          <div style={{ fontWeight: 600 }}>{row.items[0]?.productUnit.productModel?.name || row.stockLots?.[0]?.productModel?.name || "—"}</div>
          <div style={{ color: "var(--soft)", fontSize: "12px", marginTop: "3px" }}>
            {row.items[0]?.productUnit.productModel?.category?.name || row.stockLots?.[0]?.productModel?.category?.name || "—"}
          </div>
        </div>
      ),
    },
    {
      key: "supplier",
      label: t.stockPricing.supplier,
      render: (row: StockReceipt) => (
        <div>
          <div>{row.supplier?.name || "—"}</div>
          <div style={{ color: "var(--soft)", fontSize: "12px", marginTop: "3px" }}>
            {row.employee?.name || "—"}
          </div>
        </div>
      ),
    },
    {
      key: "quantity",
      label: t.stockPricing.quantity,
      align: "right" as const,
      render: (row: StockReceipt) => {
        const unit = row.stockLots?.[0]?.productModel?.unit ?? row.items?.[0]?.productUnit.productModel?.unit ?? "PIECE";
        const quantity = row.stockLots?.reduce((sum, lot) => sum + lot.quantityReceived, 0) || row.items?.length || 0;
        return (
          <span style={{ fontVariantNumeric: "tabular-nums", fontWeight: 600 }}>
            {quantity}
            {unit === "METER" ? ` ${t.uom.METER}` : ""}
          </span>
        );
      },
    },
    {
      key: "status",
      label: t.status,
      render: (row: StockReceipt) => <StatusChip status={row.status as any || "PENDING_PRICING"} />,
    },
    {
      key: "date",
      label: t.date,
      render: (row: StockReceipt) => new Date(row.date || row.createdAt).toLocaleDateString(),
    },
    {
      key: "actions",
      label: "",
      align: "right" as const,
      render: (row: StockReceipt) => (
        pricingId === row.id ? (
          <div style={{ display: "flex", gap: "8px", justifyContent: "flex-end", alignItems: "center" }}>
            <Input
              type="number"
              step="0.01"
              min="0"
              value={purchasePrice}
              error={priceError}
              onChange={(e) => { setPriceError(""); setPurchasePrice(e.target.value); }}
              placeholder={
                (row.stockLots?.[0]?.productModel?.unit ?? row.items?.[0]?.productUnit.productModel?.unit) === "METER"
                  ? t.stockPricing.pricePerMeter
                  : t.stockPricing.pricePerUnit
              }
              style={{ width: "120px", padding: "4px 8px", fontSize: "13px" }}
            />
            <Button variant="primary" size="sm" loading={saving} onClick={() => handlePrice(row.id)}>
              {t.stockPricing.submit}
            </Button>
            <Button variant="quiet" size="sm" onClick={() => { setPricingId(null); setPurchasePrice(""); setPriceError(""); }}>
              {t.stockPricing.cancel}
            </Button>
          </div>
        ) : (
          <Button variant="primary" size="sm" onClick={(e) => { e.stopPropagation(); setPricingId(row.id); setPurchasePrice(""); setPriceError(""); }}>
            {t.stockPricing.setPrice}
          </Button>
        )
      ),
    },
  ];

  return (
    <div>
      <PageHeader
        title={t.pages.stockPricing}
        subtitle={t.pages.stockPricingSubtitle}
      />

      {loading ? (
        <div className="state-block">
          <LoadingSpinner size={32} />
        </div>
      ) : receipts.length === 0 ? (
        <EmptyState
          title={t.stockPricing.noPendingPricing}
          description={t.stockPricing.allReceiptsPriced}
          icon={
            <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="12" y1="1" x2="12" y2="23" />
              <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
            </svg>
          }
        />
      ) : (
        <Table
          columns={columns}
          data={receipts}
          keyExtractor={(r) => String((r as unknown as StockReceipt).id)}
        />
      )}
    </div>
  );
}
