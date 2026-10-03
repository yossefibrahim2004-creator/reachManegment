import { useState, useRef, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import api from "../../lib/api";
import { useAuth } from "../../lib/auth";
import { notify } from "../../lib/notify";
import { getFriendlyErrorMessage } from "../../lib/messages";
import { getSuccessMessages } from "../../lib/success-messages";
import { Button } from "../../components/ui/Button";
import { Card } from "../../components/ui/Card";
import { Modal } from "../../components/ui/Modal";
import { Input } from "../../components/ui/Input";
import { Select } from "../../components/ui/Select";
import { useI18n } from "../../i18n/context";
import { useSettings } from "../../lib/settings";
import { ALL_OPTIONS_LIMIT, useCustomerOptions, useInvalidateOptions } from "../../hooks";
import BrandLogo from "../../components/BrandLogo";
import type { Customer, ProductModel } from "../../types";

interface InvoiceLine {
  id: string;
  model: ProductModel;
  quantity: number;
  price: number;
}

// Normalize Arabic so "قاعدة" / "قاعده" / أ-إ-آ variants all match
const normalizeAr = (s: string) =>
  s.replace(/[أإآ]/g, "ا").replace(/[ةه]/g, "ه").trim();

// Models whose name contains "قاعدة" can be added without a price
const isPriceOptional = (m?: { name: string } | null) =>
  !!m && normalizeAr(m.name).includes("قاعده");

export default function NewInvoice() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { t } = useI18n();
  const { brand } = useSettings();
  const SUCCESS_MESSAGES = getSuccessMessages(t);

  const [selectedCustomerId, setSelectedCustomerId] = useState<number | null>(null);
  const [customerSearch, setCustomerSearch] = useState("");
  const [showCustomerDropdown, setShowCustomerDropdown] = useState(false);
  const [showCreateCustomer, setShowCreateCustomer] = useState(false);
  const [newCustomerName, setNewCustomerName] = useState("");
  const [newCustomerPhone, setNewCustomerPhone] = useState("");
  const [newCustomerType, setNewCustomerType] = useState<"INDIVIDUAL" | "COMPANY">("INDIVIDUAL");
  const [creatingCustomer, setCreatingCustomer] = useState(false);
  const [newCustomerNameError, setNewCustomerNameError] = useState("");

  const [lines, setLines] = useState<InvoiceLine[]>([]);
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [savedInvoiceNumber, setSavedInvoiceNumber] = useState<string | null>(null);
  const [savedInvoiceId, setSavedInvoiceId] = useState<number | null>(null);
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [paymentType, setPaymentType] = useState("CASH");
  const [discountPercentage, setDiscountPercentage] = useState("");
  const [discountAmount, setDiscountAmount] = useState("");
  const [discountPercentageError, setDiscountPercentageError] = useState("");
  const [discountAmountError, setDiscountAmountError] = useState("");
  const [selectedCategoryId, setSelectedCategoryId] = useState("");
  const [selectedModelId, setSelectedModelId] = useState("");
  const [itemQuantity, setItemQuantity] = useState("1");
  const [itemPrice, setItemPrice] = useState("");
  const [allModels, setAllModels] = useState<ProductModel[]>([]);
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const invalidateOptions = useInvalidateOptions();
  const { data: customerOptions = [] } = useCustomerOptions(customerSearch);

  useEffect(() => {
    const controller = new AbortController();
    const { signal } = controller;
    api.get("/product-models", { params: { page: 1, limit: ALL_OPTIONS_LIMIT }, signal }).then((res) => {
      if (signal.aborted) return;
      setAllModels(res.data.data ?? res.data ?? []);
    }).catch(() => {});
    return () => controller.abort();
  }, []);

  const filteredCustomers = customerOptions;

  // Unique list of categories derived from the loaded product models
  const categories = Array.from(
    new Map(
      (Array.isArray(allModels) ? allModels : [])
        .filter((m: any) => m.category)
        .map((m: any) => [m.category.id, m.category])
    ).values()
  ) as { id: number; name: string }[];

  // Models filtered by the selected category (all models if none selected)
  const filteredModels = (Array.isArray(allModels) ? allModels : []).filter(
    (m: any) => !selectedCategoryId || String(m.category?.id) === selectedCategoryId
  );

  useEffect(() => {
    if (selectedCustomerId === null) {
      setSelectedCustomer(null);
      return;
    }
    const fromOptions = customerOptions.find((c) => c.id === selectedCustomerId);
    if (fromOptions) setSelectedCustomer(fromOptions);
  }, [customerOptions, selectedCustomerId]);

  const subtotal = lines.reduce((sum, l) => sum + l.price * l.quantity, 0);
  const parsedPercentage = Number(discountPercentage) || 0;
  const parsedFixed = Number(discountAmount) || 0;
  const percentageDiscount = Math.max(0, Math.min(parsedPercentage, 100)) / 100 * subtotal;
  const finalDiscountAmount = Math.max(0, Math.min(parsedFixed, subtotal));
  const total = Math.max(0, subtotal - percentageDiscount - finalDiscountAmount);
  const discountPercentageValid =
    discountPercentage.trim() === "" ||
    (Number.isFinite(Number(discountPercentage)) && Number(discountPercentage) >= 0 && Number(discountPercentage) <= 100);
  const discountAmountValid =
    discountAmount.trim() === "" || (Number.isFinite(Number(discountAmount)) && Number(discountAmount) >= 0);
  const canSave =
    selectedCustomerId !== null &&
    lines.length > 0 &&
    lines.every((l) => l.quantity > 0 && (l.price > 0 || isPriceOptional(l.model))) &&
    discountPercentageValid &&
    discountAmountValid;

  // Currently selected model in the "Add item" row (drives whether price is required)
  const selectedModel = allModels.find((m) => String(m.id) === selectedModelId);
  const priceOptional = isPriceOptional(selectedModel);

  const handlePriceChange = (lineId: string, price: number) => {
    setLines((prev) => prev.map((l) => (l.id === lineId ? { ...l, price } : l)));
  };

  const handleQuantityChange = (lineId: string, quantity: number) => {
    setLines((prev) => prev.map((l) => (l.id === lineId ? { ...l, quantity } : l)));
  };

  const handleRemoveLine = (lineId: string) => {
    setLines((prev) => prev.filter((l) => l.id !== lineId));
  };

  const handleAddItem = () => {
    setFormError(null);
    if (!selectedModelId || !itemQuantity) return;
    const model = allModels.find((m) => String(m.id) === selectedModelId);
    if (!model) return;

    const optional = isPriceOptional(model);
    if (!optional && !itemPrice) return;

    const unit = model.unit ?? "PIECE";
    const rawQty = parseFloat(itemQuantity);
    if (!(rawQty > 0)) return;
    if (unit !== "METER" && !Number.isInteger(rawQty)) {
      setFormError(t.errors.delivery.FRACTIONAL_QUANTITY_NOT_ALLOWED);
      return;
    }
    const qty = unit === "METER" ? Math.round(rawQty * 100) / 100 : rawQty;
    const price = itemPrice ? parseFloat(itemPrice) : 0;
    if (!optional && !(price > 0)) return;

    setLines((prev) => {
      const existing = prev.find((l) => l.model.id === model.id);
      if (existing) {
        return prev.map((l) =>
          l.model.id === model.id
            ? {
                ...l,
                quantity: unit === "METER"
                  ? Math.round((l.quantity + qty) * 100) / 100
                  : l.quantity + qty,
                price,
              }
            : l,
        );
      }
      return [...prev, { id: `line-${Date.now()}`, model, quantity: qty, price }];
    });
    setSelectedModelId("");
    setItemQuantity("1");
    setItemPrice("");
  };

  const handleCreateCustomer = async () => {
    if (!newCustomerName.trim()) {
      setNewCustomerNameError(t.errors.common.required);
      return;
    }
    setNewCustomerNameError("");
    setCreatingCustomer(true);
    try {
      const { data } = await api.post("/customers", {
        name: newCustomerName.trim(),
        phone: newCustomerPhone.trim() || undefined,
        type: newCustomerType,
      });
      setSelectedCustomerId(data.id);
      setSelectedCustomer(data);
      setCustomerSearch(data.name);
      setShowCreateCustomer(false);
      setNewCustomerName("");
      setNewCustomerPhone("");
      setNewCustomerType("INDIVIDUAL");
      void invalidateOptions.customers();
      notify.success(SUCCESS_MESSAGES.customer.added);
    } catch (err) {
      notify.error(getFriendlyErrorMessage(err, t));
    } finally {
      setCreatingCustomer(false);
    }
  };

  const handleSave = async () => {
    if (!discountPercentageValid) {
      setDiscountPercentageError(t.errors.common.invalidNumber);
      return;
    }
    if (!discountAmountValid) {
      setDiscountAmountError(t.errors.common.invalidNumber);
      return;
    }
    if (!canSave) return;
    setSaving(true);
    try {
      const { data } = await api.post("/invoices", {
        customerId: selectedCustomerId,
        paymentType,
        discountPercentage: parsedPercentage || undefined,
        discountAmount: finalDiscountAmount || undefined,
        // Serialized-unit assignment happens later, at delivery/fulfillment by
        // Warehouse. Invoice creation only needs the model + quantity + price.
        items: lines.map((l) => ({
          productModelId: l.model.id,
          quantity: l.quantity,
          price: l.price,
        })),
      });
      setSavedInvoiceNumber(data.invoiceNumber);
      setSavedInvoiceId(data.id);
      notify.success(SUCCESS_MESSAGES.invoice.created);
      setShowConfirmModal(true);
    } catch (error: any) {
      const message = getFriendlyErrorMessage(error, t, t.newInvoice.unableToSave);
      setFormError(typeof message === "string" ? message : t.newInvoice.unableToSave);
      setTimeout(() => setFormError(null), 4000);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex flex-col lg:flex-row gap-4" style={{ alignItems: "stretch" }}>
      {/* LEFT PANEL */}
      <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: "16px" }}>
        {/* Customer Selector */}
        <Card style={{ overflow: "visible" }}>
          <label style={{ display: "block", fontFamily: "'Manrope', sans-serif", fontSize: "12px", fontWeight: 600, color: "var(--soft)", marginBottom: "6px" }}>
            {t.newInvoice.customer}
          </label>
          <div style={{ position: "relative", zIndex: 10 }}>
            <input
              type="text"
              placeholder={t.newInvoice.searchCustomer}
              value={customerSearch}
              onChange={(e) => {
                setCustomerSearch(e.target.value);
                setSelectedCustomerId(null);
                setSelectedCustomer(null);
                setShowCustomerDropdown(true);
              }}
              onFocus={() => setShowCustomerDropdown(true)}
              onBlur={() => setTimeout(() => setShowCustomerDropdown(false), 200)}
              style={{
                fontFamily: "'Manrope', sans-serif",
                fontSize: "14px",
                color: "var(--ink)",
                backgroundColor: "var(--card)",
                border: "1px solid var(--border)",
                borderRadius: "8px",
                padding: "8px 12px",
                width: "100%",
                outline: "none",
                boxSizing: "border-box",
              }}
            />
            {showCustomerDropdown && (
              <div
                style={{
                  position: "absolute",
                  top: "100%",
                  left: 0,
                  right: 0,
                  backgroundColor: "var(--card)",
                  border: "1px solid var(--border)",
                  borderRadius: "8px",
                  boxShadow: "var(--shadow-md)",
                  maxHeight: "260px",
                  overflowY: "auto",
                  zIndex: 20,
                }}
              >
                {filteredCustomers.map((c) => (
                  <button
                    key={c.id}
                    onMouseDown={() => {
                      setSelectedCustomerId(c.id);
                      setSelectedCustomer(c);
                      setCustomerSearch(c.name);
                      setShowCustomerDropdown(false);
                    }}
                    style={{
                      display: "block",
                      width: "100%",
                      textAlign: "start",
                      padding: "10px 12px",
                      fontFamily: "'Manrope', sans-serif",
                      fontSize: "14px",
                      color: c.id === selectedCustomerId ? "var(--brand)" : "var(--ink)",
                      backgroundColor: c.id === selectedCustomerId ? "var(--row-selected)" : "transparent",
                      border: "none",
                      cursor: "pointer",
                      borderRadius: "6px",
                      transition: "background-color 0.1s",
                    }}
                    onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = "var(--row-hover)")}
                    onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = c.id === selectedCustomerId ? "var(--row-selected)" : "transparent")}
                  >
                    <span style={{ fontWeight: 600 }}>{c.name}</span>
                    {c.phone && <span style={{ color: "var(--soft)", marginInlineStart: "8px", fontSize: "12px" }}>{c.phone}</span>}
                    <span style={{ float: "inline-end", fontSize: "11px", color: "var(--soft)" }}>{c.type}</span>
                  </button>
                ))}
                <button
                  onMouseDown={(e) => {
                    e.preventDefault();
                    setShowCustomerDropdown(false);
                    setNewCustomerNameError("");
                    setShowCreateCustomer(true);
                  }}
                  style={{
                    display: "block",
                    width: "100%",
                    textAlign: "start",
                    padding: "10px 12px",
                    fontFamily: "'Manrope', sans-serif",
                    fontSize: "13px",
                    fontWeight: 600,
                    color: "var(--brand)",
                    backgroundColor: "transparent",
                    border: "none",
                    borderTop: "1px solid var(--border)",
                    cursor: "pointer",
                  }}
                >
                  {t.newInvoice.createNewCustomer}
                </button>
              </div>
            )}
          </div>
          {selectedCustomer && (
            <p style={{ fontFamily: "'Manrope', sans-serif", fontSize: "12px", color: "var(--soft)", margin: "4px 0 0" }}>
              {selectedCustomer.type} · {selectedCustomer.phone || t.newInvoice.noPhone}
            </p>
          )}
        </Card>

        {/* Payment Type */}
        <Card>
          <label style={{ display: "block", fontFamily: "'Manrope', sans-serif", fontSize: "13px", fontWeight: 600, color: "var(--ink)", marginBottom: "6px" }}>
            {t.newInvoice.paymentType}
          </label>
          <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
            {["CASH", "CARD", "TRANSFER", "CREDIT"].map((pt) => (
              <button
                key={pt}
                onClick={() => setPaymentType(pt)}
                style={{
                  flex: "1 1 80px",
                  minHeight: "40px",
                  padding: "8px 12px",
                  borderRadius: "8px",
                  border: `1px solid ${paymentType === pt ? "var(--brand)" : "var(--border)"}`,
                  backgroundColor: paymentType === pt ? "var(--row-selected)" : "transparent",
                  color: paymentType === pt ? "var(--brand)" : "var(--ink)",
                  fontFamily: "'Manrope', sans-serif",
                  fontSize: "13px",
                  fontWeight: 600,
                  cursor: "pointer",
                  transition: "all 0.15s ease",
                }}
              >
                {pt}
              </button>
            ))}
          </div>
        </Card>

        <Card>
          <label style={{ display: "block", fontFamily: "'Manrope', sans-serif", fontSize: "12px", fontWeight: 600, color: "var(--soft)", marginBottom: "8px" }}>
            {t.newInvoice.discounts}
          </label>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: "10px" }}>
            <div>
              <label style={{ display: "block", fontSize: "12px", color: "var(--soft)", marginBottom: "4px" }}>{t.newInvoice.discountPercent}</label>
              <input
                type="number"
                min="0"
                max="100"
                step="0.01"
                value={discountPercentage}
                onChange={(e) => {
                  const v = e.target.value;
                  setDiscountPercentage(v);
                  setDiscountPercentageError(
                    v.trim() === "" || (Number.isFinite(Number(v)) && Number(v) >= 0 && Number(v) <= 100)
                      ? ""
                      : t.errors.common.invalidNumber,
                  );
                }}
                placeholder="0"
                style={{ width: "100%", padding: "8px 10px", borderRadius: "8px", border: discountPercentageError ? "1px solid var(--accent)" : "1px solid var(--border)", fontFamily: "'Manrope', sans-serif", fontSize: "13px", color: "var(--ink)", backgroundColor: "var(--card)", outline: "none", boxSizing: "border-box" }}
              />
              {discountPercentageError && (
                <span style={{ fontFamily: "'Manrope', sans-serif", fontSize: "12px", color: "var(--accent)", display: "block", marginTop: "4px" }}>
                  {discountPercentageError}
                </span>
              )}
            </div>
            <div>
              <label style={{ display: "block", fontSize: "12px", color: "var(--soft)", marginBottom: "4px" }}>{t.newInvoice.discountAmount}</label>
              <input
                type="number"
                min="0"
                step="0.01"
                value={discountAmount}
                onChange={(e) => {
                  const v = e.target.value;
                  setDiscountAmount(v);
                  setDiscountAmountError(
                    v.trim() === "" || (Number.isFinite(Number(v)) && Number(v) >= 0)
                      ? ""
                      : t.errors.common.invalidNumber,
                  );
                }}
                placeholder="0"
                style={{ width: "100%", padding: "8px 10px", borderRadius: "8px", border: discountAmountError ? "1px solid var(--accent)" : "1px solid var(--border)", fontFamily: "'Manrope', sans-serif", fontSize: "13px", color: "var(--ink)", backgroundColor: "var(--card)", outline: "none", boxSizing: "border-box" }}
              />
              {discountAmountError && (
                <span style={{ fontFamily: "'Manrope', sans-serif", fontSize: "12px", color: "var(--accent)", display: "block", marginTop: "4px" }}>
                  {discountAmountError}
                </span>
              )}
            </div>
          </div>
        </Card>

        {/* Add Item — every product model (serialized or not) is selectable here.
            No barcode scanning at invoice creation; specific serial units get
            assigned later at delivery/fulfillment by Warehouse.
            Models whose name contains "قاعدة" can be added without a price. */}
        <Card>
          <label style={{ display: "block", fontFamily: "'Manrope', sans-serif", fontSize: "13px", fontWeight: 600, color: "var(--ink)", marginBottom: "6px" }}>
            {t.newInvoice.addItem ?? t.newInvoice.addNonSerializedItem}
          </label>
          <div style={{ display: "flex", gap: "8px", alignItems: "flex-end", flexWrap: "wrap" }}>
            {/* Category filter */}
            <div style={{ flex: 1, minWidth: "130px" }}>
              <Select
                options={categories.map((c) => ({ label: c.name, value: String(c.id) }))}
                placeholder={t.newInvoice.allCategories ?? "كل الفئات"}
                value={selectedCategoryId}
                onChange={(e) => {
                  setSelectedCategoryId(e.target.value);
                  setSelectedModelId("");
                }}
              />
            </div>
            <div style={{ flex: 2, minWidth: "160px" }}>
              <Select
                options={filteredModels.map((m) => ({ label: m.name, value: String(m.id) }))}
                placeholder={t.newInvoice.selectModel}
                value={selectedModelId}
                onChange={(e) => setSelectedModelId(e.target.value)}
              />
            </div>
            <div style={{ flex: 1, minWidth: "90px" }}>
              <input
                type="number"
                min={selectedModel?.unit === "METER" ? "0.01" : "1"}
                step={selectedModel?.unit === "METER" ? "0.01" : "1"}
                placeholder={t.newInvoice.qty}
                value={itemQuantity}
                onChange={(e) => setItemQuantity(e.target.value)}
                style={{
                  width: "100%",
                  padding: "8px 12px",
                  borderRadius: "8px",
                  border: "1px solid var(--border)",
                  fontFamily: "'Manrope', sans-serif",
                  fontSize: "13px",
                  color: "var(--ink)",
                  backgroundColor: "var(--card)",
                  outline: "none",
                  boxSizing: "border-box",
                }}
              />
            </div>
            <div style={{ fontFamily: "'Manrope', sans-serif", fontSize: "12px", color: "var(--soft)", paddingBottom: "10px", whiteSpace: "nowrap" }}>
              {t.uom[selectedModel?.unit ?? "PIECE"]}
            </div>
            <div style={{ flex: 1, minWidth: "90px" }}>
              <input
                type="number"
                min="0"
                step="0.01"
                placeholder={t.newInvoice.price}
                value={itemPrice}
                onChange={(e) => setItemPrice(e.target.value)}
                style={{
                  width: "100%",
                  padding: "8px 12px",
                  borderRadius: "8px",
                  border: "1px solid var(--border)",
                  fontFamily: "'Manrope', sans-serif",
                  fontSize: "13px",
                  color: "var(--ink)",
                  backgroundColor: "var(--card)",
                  outline: "none",
                  boxSizing: "border-box",
                }}
              />
            </div>
            <button
              onClick={handleAddItem}
              disabled={!selectedModelId || !itemQuantity || (!priceOptional && !itemPrice)}
              style={{
                padding: "8px 16px",
                borderRadius: "8px",
                border: "none",
                backgroundColor: "var(--brand-fill)",
                color: "var(--on-brand)",
                fontFamily: "'Manrope', sans-serif",
                fontSize: "13px",
                fontWeight: 600,
                cursor: "pointer",
                whiteSpace: "nowrap",
              }}
            >
              {t.newInvoice.add}
            </button>
          </div>
          {formError && (
            <div
              style={{
                marginTop: "8px",
                padding: "8px 12px",
                borderRadius: "8px",
                backgroundColor: "var(--accent-bg)",
                color: "var(--accent)",
                fontFamily: "'Manrope', sans-serif",
                fontSize: "13px",
                fontWeight: 600,
              }}
            >
              {formError}
            </div>
          )}
        </Card>

        {/* Lines */}
        <Card style={{ flex: 1, overflow: "hidden", display: "flex", flexDirection: "column" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "12px" }}>
            <h3 style={{ fontFamily: "'Sora', sans-serif", fontSize: "14px", fontWeight: 600, color: "var(--ink)", margin: 0 }}>
              {t.items} ({lines.length})
            </h3>
            {lines.length > 0 && (
              <span style={{ fontFamily: "'Manrope', sans-serif", fontSize: "13px", color: "var(--soft)" }}>
                {t.total}: <span style={{ fontWeight: 700, color: "var(--ink)", fontVariantNumeric: "tabular-nums" }}>{t.currency} {Number(total).toFixed(2)}</span>
              </span>
            )}
          </div>

          {lines.length === 0 ? (
            <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "40px 16px", color: "var(--soft)" }}>
              <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ marginBottom: "12px", opacity: 0.5 }}>
                <path d="M3 7V5a2 2 0 012-2h2" />
                <path d="M17 3h2a2 2 0 012 2v2" />
                <path d="M21 17v2a2 2 0 01-2 2h-2" />
                <path d="M7 21H5a2 2 0 01-2-2v-2" />
                <line x1="7" y1="12" x2="17" y2="12" />
              </svg>
              <p style={{ fontFamily: "'Manrope', sans-serif", fontSize: "14px", margin: 0 }}>{t.newInvoice.noItemsScanned}</p>
            </div>
          ) : (
            <div style={{ flex: 1, overflowY: "auto", overflowX: "auto" }}>
              <table style={{ width: "100%", minWidth: 420, borderCollapse: "collapse", fontFamily: "'Manrope', sans-serif", fontSize: "13px" }}>
                <thead>
                  <tr>
                    <th style={{ textAlign: "start", padding: "6px 8px", fontSize: "11px", fontWeight: 600, color: "var(--soft)", textTransform: "uppercase", letterSpacing: "0.04em" }}>{t.newInvoice.model}</th>
                    <th style={{ textAlign: "center", padding: "6px 8px", fontSize: "11px", fontWeight: 600, color: "var(--soft)", textTransform: "uppercase", letterSpacing: "0.04em" }}>{t.newInvoice.qty}</th>
                    <th style={{ textAlign: "end", padding: "6px 8px", fontSize: "11px", fontWeight: 600, color: "var(--soft)", textTransform: "uppercase", letterSpacing: "0.04em" }}>{t.newInvoice.price}</th>
                    <th style={{ width: "40px" }} />
                  </tr>
                </thead>
                <tbody>
                  {lines.map((line) => (
                    <tr key={line.id}>
                      <td style={{ padding: "8px", fontWeight: 600 }}>{line.model.name}</td>
                      <td style={{ padding: "8px", textAlign: "center" }}>
                        <input
                          type="number"
                          min={line.model.unit === "METER" ? "0.01" : "1"}
                          step={line.model.unit === "METER" ? "0.01" : "1"}
                          value={line.quantity}
                          onChange={(e) => {
                            const unit = line.model.unit ?? "PIECE";
                            const parsed = parseFloat(e.target.value);
                            const next = Number.isFinite(parsed) && parsed > 0 ? parsed : 1;
                            handleQuantityChange(
                              line.id,
                              unit === "METER" ? Math.round(next * 100) / 100 : Math.max(1, Math.trunc(next)),
                            );
                          }}
                          style={{
                            width: "60px",
                            textAlign: "center",
                            fontFamily: "'Manrope', sans-serif",
                            fontSize: "13px",
                            fontVariantNumeric: "tabular-nums",
                            color: "var(--ink)",
                            border: "1px solid var(--border)",
                            borderRadius: "6px",
                            padding: "4px 6px",
                            backgroundColor: "var(--surface)",
                            outline: "none",
                            boxSizing: "border-box",
                          }}
                        />
                        <div style={{ fontSize: "11px", color: "var(--soft)", marginTop: "2px" }}>
                          {t.uom[line.model.unit ?? "PIECE"]}
                        </div>
                      </td>
                      <td style={{ padding: "8px", textAlign: "end" }}>
                        <input
                          type="number"
                          value={line.price}
                          onChange={(e) => handlePriceChange(line.id, parseFloat(e.target.value) || 0)}
                          style={{
                            width: "90px",
                            textAlign: "end",
                            fontFamily: "'Manrope', sans-serif",
                            fontSize: "14px",
                            fontWeight: 600,
                            fontVariantNumeric: "tabular-nums",
                            color: "var(--ink)",
                            border: "1px solid var(--border)",
                            borderRadius: "6px",
                            padding: "4px 8px",
                            backgroundColor: "var(--surface)",
                            outline: "none",
                            boxSizing: "border-box",
                          }}
                        />
                      </td>
                      <td style={{ padding: "8px", textAlign: "center" }}>
                        <button
                          onClick={() => handleRemoveLine(line.id)}
                          style={{
                            background: "none",
                            border: "none",
                            cursor: "pointer",
                            color: "var(--accent)",
                            padding: "4px",
                            lineHeight: 1,
                          }}
                          title={t.newInvoice.remove}
                        >
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <line x1="18" y1="6" x2="6" y2="18" />
                            <line x1="6" y1="6" x2="18" y2="18" />
                          </svg>
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>

        {/* Save Button */}
        <Button
          variant="primary"
          size="lg"
          loading={saving}
          disabled={!canSave}
          onClick={handleSave}
          style={{ width: "100%" }}
        >
          {t.newInvoice.saveInvoice} — {t.currency} {Number(total).toFixed(2)}
        </Button>
      </div>

      {/* RIGHT PANEL - Live Preview */}
      <div
        className="w-full lg:w-[400px]"
        style={{
          flexShrink: 0,
          display: "flex",
          flexDirection: "column",
          gap: "12px",
        }}
      >
        <p style={{
          fontFamily: "'Manrope', sans-serif",
          fontSize: "11px",
          fontWeight: 600,
          color: "var(--soft)",
          textTransform: "uppercase",
          letterSpacing: "0.06em",
          margin: 0,
          textAlign: "center",
        }}>
          {t.newInvoice.preview}
        </p>
        <div
          style={{
            backgroundColor: "var(--card)",
            border: "1px solid var(--border)",
            borderRadius: "var(--radius-md)",
            padding: "20px 16px",
            flex: 1,
            display: "flex",
            flexDirection: "column",
          }}
        >
          {/* Company Header */}
          <div style={{ textAlign: "center", marginBottom: "16px", paddingBottom: "16px", borderBottom: "2px solid var(--ink)" }}>
            <div style={{ display: "inline-flex", alignItems: "center", gap: "10px", marginBottom: "8px" }}>
              <BrandLogo size={32} />
              <span style={{ fontFamily: "'Sora', sans-serif", fontSize: "20px", fontWeight: 700, color: "var(--ink)" }}>{brand.businessName}</span>
            </div>
            <p style={{ fontFamily: "'Manrope', sans-serif", fontSize: "12px", color: "var(--soft)", margin: 0 }}>{t.appSubtitle}</p>
            {(brand.address || brand.phone) && (
              <p style={{ fontFamily: "'Manrope', sans-serif", fontSize: "11px", color: "var(--soft)", margin: "4px 0 0" }}>
                {[brand.address, brand.phone].filter(Boolean).join(" · ")}
              </p>
            )}
          </div>

          {/* Customer */}
          <div style={{ marginBottom: "18px", padding: "12px 14px", background: "var(--bg-inset)", borderRadius: "10px", border: "1px solid var(--border)" }}>
            <p style={{ fontFamily: "'Manrope', sans-serif", fontSize: "10px", fontWeight: 700, color: "var(--soft)", textTransform: "uppercase", letterSpacing: "0.08em", margin: "0 0 6px" }}>{t.newInvoice.billTo}</p>
            <p style={{ fontFamily: "'Manrope', sans-serif", fontSize: "14px", fontWeight: 700, color: "var(--ink)", margin: 0 }}>
              {selectedCustomer?.name || "—"}
            </p>
            {selectedCustomer?.phone && (
              <p style={{ fontFamily: "'Manrope', sans-serif", fontSize: "12px", color: "var(--soft)", margin: "4px 0 0" }}>{selectedCustomer.phone}</p>
            )}
          </div>

            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: "10px", marginBottom: "16px", fontSize: "11px" }}>
            <div style={{ padding: "10px 12px", borderRadius: "10px", background: "var(--bg-muted)", border: "1px solid var(--border)" }}>
              <div style={{ color: "var(--soft)", marginBottom: "4px" }}>{t.newInvoice.invoiceNumber}</div>
              <div style={{ fontWeight: 700, color: "var(--ink)", fontVariantNumeric: "tabular-nums" }}>{savedInvoiceNumber || t.newInvoice.draft}</div>
            </div>
            <div style={{ padding: "10px 12px", borderRadius: "10px", background: "var(--bg-muted)", border: "1px solid var(--border)" }}>
              <div style={{ color: "var(--soft)", marginBottom: "4px" }}>{t.newInvoice.payment}</div>
              <div style={{ fontWeight: 700, color: "var(--ink)" }}>{paymentType}</div>
            </div>
          </div>

          {/* Items */}
          <div style={{ flex: 1 }}>
            {lines.length === 0 ? (
              <p style={{ fontFamily: "'Manrope', sans-serif", fontSize: "13px", color: "var(--soft)", textAlign: "center", padding: "24px 16px" }}>
                {t.newInvoice.noItemsScanned}
              </p>
            ) : (
              <table style={{ width: "100%", borderCollapse: "collapse", fontFamily: "'Manrope', sans-serif", fontSize: "13px" }}>
                <thead>
                  <tr>
                    <th style={{ textAlign: "start", padding: "6px 0", fontSize: "11px", fontWeight: 600, color: "var(--soft)", textTransform: "uppercase", borderBottom: "1px solid var(--border)" }}>{t.items}</th>
                    <th style={{ textAlign: "center", padding: "6px 0", fontSize: "11px", fontWeight: 600, color: "var(--soft)", textTransform: "uppercase", borderBottom: "1px solid var(--border)" }}>{t.newInvoice.qty}</th>
                    <th style={{ textAlign: "end", padding: "6px 0", fontSize: "11px", fontWeight: 600, color: "var(--soft)", textTransform: "uppercase", borderBottom: "1px solid var(--border)" }}>{t.newInvoice.price}</th>
                  </tr>
                </thead>
                <tbody>
                  {lines.map((line) => (
                    <tr key={line.id}>
                      <td style={{ padding: "8px 0", borderBottom: "1px solid var(--border)", fontWeight: 600 }}>{line.model.name}</td>
                      <td style={{ padding: "8px 0", textAlign: "center", fontVariantNumeric: "tabular-nums", borderBottom: "1px solid var(--border)" }}>
                        {line.quantity}
                      </td>
                      <td style={{ padding: "8px 0", textAlign: "end", fontVariantNumeric: "tabular-nums", fontWeight: 600, borderBottom: "1px solid var(--border)" }}>
                        {line.price === 0 ? "—" : `${t.currency} ${Number(line.price * line.quantity).toFixed(2)}`}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          {/* Total */}
          {lines.length > 0 && (
            <div style={{ marginTop: "16px", paddingTop: "16px", borderTop: "2px solid var(--ink)" }}>
              <div style={{ display: "flex", justifyContent: "space-between", fontFamily: "'Manrope', sans-serif", marginBottom: "6px" }}>
                <span style={{ fontSize: "12px", color: "var(--soft)" }}>{t.newInvoice.subtotal}</span>
                <span style={{ fontSize: "13px", fontWeight: 600, color: "var(--ink)", fontVariantNumeric: "tabular-nums" }}>{t.currency} {Number(subtotal).toFixed(2)}</span>
              </div>
              {parsedPercentage > 0 && (
                <div style={{ display: "flex", justifyContent: "space-between", fontFamily: "'Manrope', sans-serif", marginBottom: "6px" }}>
                  <span style={{ fontSize: "12px", color: "var(--soft)" }}>{t.newInvoice.discountPercent}</span>
                  <span style={{ fontSize: "13px", fontWeight: 600, color: "var(--ink)", fontVariantNumeric: "tabular-nums" }}>- {t.currency} {Number(percentageDiscount).toFixed(2)}</span>
                </div>
              )}
              {parsedFixed > 0 && (
                <div style={{ display: "flex", justifyContent: "space-between", fontFamily: "'Manrope', sans-serif", marginBottom: "6px" }}>
                  <span style={{ fontSize: "12px", color: "var(--soft)" }}>{t.newInvoice.discount}</span>
                  <span style={{ fontSize: "13px", fontWeight: 600, color: "var(--ink)", fontVariantNumeric: "tabular-nums" }}>- {t.currency} {Number(finalDiscountAmount).toFixed(2)}</span>
                </div>
              )}
              <div style={{ display: "flex", justifyContent: "space-between", fontFamily: "'Manrope', sans-serif" }}>
                <span style={{ fontSize: "14px", fontWeight: 700, color: "var(--ink)" }}>{t.total}</span>
                <span style={{ fontSize: "20px", fontWeight: 700, color: "var(--ink)", fontVariantNumeric: "tabular-nums" }}>{t.currency} {Number(total).toFixed(2)}</span>
              </div>
              <p style={{ fontFamily: "'Manrope', sans-serif", fontSize: "11px", color: "var(--soft)", margin: "8px 0 0", textAlign: "end" }}>
                {lines.length} {lines.length === 1 ? t.newInvoice.item : t.newInvoice.items}
              </p>
            </div>
          )}

          {/* Footer */}
          <div style={{ marginTop: "24px", paddingTop: "16px", borderTop: "1px solid var(--border)", textAlign: "center" }}>
            <p style={{ fontFamily: "'Manrope', sans-serif", fontSize: "11px", color: "var(--soft)", margin: 0 }}>
              {new Date().toLocaleDateString()} · {user?.firstName} {user?.lastName}
            </p>
          </div>
        </div>
      </div>

      {/* Create Customer Modal */}
      <Modal
        isOpen={showCreateCustomer}
        onClose={() => setShowCreateCustomer(false)}
        title={t.newInvoice.newCustomer}
        footer={
          <>
            <Button variant="secondary" onClick={() => setShowCreateCustomer(false)}>{t.cancel}</Button>
            <Button variant="primary" loading={creatingCustomer} onClick={handleCreateCustomer}>{t.create}</Button>
          </>
        }
      >
        <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
          <Input
            label={t.name}
            value={newCustomerName}
            onChange={(e) => {
              setNewCustomerName(e.target.value);
              setNewCustomerNameError("");
            }}
            placeholder={t.newInvoice.customerNamePlaceholder}
            error={newCustomerNameError}
          />
          <Input
            label={t.newInvoice.phoneOptional}
            value={newCustomerPhone}
            onChange={(e) => setNewCustomerPhone(e.target.value)}
            placeholder={t.newInvoice.phoneNumberPlaceholder}
          />
          <Select
            label={t.customers.type}
            value={newCustomerType}
            onChange={(e) => setNewCustomerType(e.target.value as "INDIVIDUAL" | "COMPANY")}
            options={[
              { label: t.newInvoice.retail, value: "INDIVIDUAL" },
              { label: t.newInvoice.wholesale, value: "COMPANY" },
            ]}
          />
        </div>
      </Modal>

      {/* Save Confirmation Modal */}
      <Modal
        isOpen={showConfirmModal}
        onClose={() => setShowConfirmModal(false)}
        title={t.newInvoice.invoiceCreated}
        footer={
          <>
            <Button variant="secondary" onClick={() => { setShowConfirmModal(false); setLines([]); setSelectedCustomerId(null); setCustomerSearch(""); setSavedInvoiceNumber(null); setSavedInvoiceId(null); }}>
              {t.newInvoice.startNewInvoice}
            </Button>
            <Button variant="primary" onClick={() => navigate(user?.role === "ADMIN" ? `/admin/invoices/${savedInvoiceId}` : `/sales/invoice/${savedInvoiceId}`)}>
              {t.newInvoice.viewInvoice}
            </Button>
          </>
        }
      >
        <div style={{ textAlign: "center", padding: "16px 0" }}>
          <div style={{ width: "56px", height: "56px", borderRadius: "50%", backgroundColor: "var(--mint-bg)", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 16px" }}>
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="var(--mint)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="20 6 9 17 4 12" />
            </svg>
          </div>
          <p style={{ fontFamily: "'Sora', sans-serif", fontSize: "18px", fontWeight: 600, color: "var(--ink)", margin: "0 0 4px" }}>{t.newInvoice.savedAsPendingAccountant}</p>
          <p style={{ fontFamily: "'Manrope', sans-serif", fontSize: "14px", color: "var(--soft)", margin: "0 0 16px" }}>
            {t.newInvoice.invoiceNumberLabel} <strong style={{ color: "var(--ink)", fontVariantNumeric: "tabular-nums" }}>{savedInvoiceNumber}</strong>
          </p>
        </div>
      </Modal>
    </div>
  );
}