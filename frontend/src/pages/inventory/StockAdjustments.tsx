import { useState, useEffect, useCallback } from "react";
import api from "../../lib/api";
import { ALL_OPTIONS_LIMIT, isAbortError } from "../../hooks";
import { notify } from "../../lib/notify";
import { getFriendlyErrorMessage } from "../../lib/messages";
import { getSuccessMessages } from "../../lib/success-messages";
import { useAuth } from "../../lib/auth";
import { Button } from "../../components/ui/Button";
import { Input } from "../../components/ui/Input";
import { Select } from "../../components/ui/Select";
import { Card } from "../../components/ui/Card";
import { Table } from "../../components/ui/Table";
import { Pagination } from "../../components/ui/Pagination";
import { Modal } from "../../components/ui/Modal";
import { StatusChip } from "../../components/ui/StatusChip";
import { LoadingSpinner } from "../../components/ui/LoadingSpinner";
import { EmptyState } from "../../components/ui/EmptyState";
import { PageHeader } from "../../components/ui/PageHeader";
import { useI18n } from "../../i18n/context";
import type { StockAdjustment, ProductModel, PaginatedResponse } from "../../types";

// Types where the direction can't be inferred from the type alone, so the
// user must choose INCREASE / DECREASE. Must match the backend service
// (StockItemsService.resolveSignedQuantity).
const AMBIGUOUS_TYPES = ["COUNT_CORRECTION", "RECEIVING_CORRECTION", "OTHER"];

export default function StockAdjustments() {
  const { t } = useI18n();
  const { user } = useAuth();
  const isAdmin = user?.role === "ADMIN";
  const SUCCESS_MESSAGES = getSuccessMessages(t);
  const ADJUSTMENT_TYPES = [
    { label: t.stockAdjustments.typeDamage, value: "DAMAGE" },
    { label: t.stockAdjustments.typeLoss, value: "LOSS" },
    { label: t.stockAdjustments.typeFound, value: "FOUND" },
    { label: t.stockAdjustments.typeCountCorrection, value: "COUNT_CORRECTION" },
    { label: t.stockAdjustments.typeReceivingCorrection, value: "RECEIVING_CORRECTION" },
    { label: t.stockAdjustments.typeOther, value: "OTHER" },
  ];
  const DIRECTION_OPTIONS = [
    { label: t.stockAdjustments.selectDirection, value: "" },
    { label: t.stockAdjustments.directionIncrease, value: "INCREASE" },
    { label: t.stockAdjustments.directionDecrease, value: "DECREASE" },
  ];

  const [adjustments, setAdjustments] = useState<StockAdjustment[]>([]);
  const [models, setModels] = useState<ProductModel[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [formModelId, setFormModelId] = useState("");
  const [formType, setFormType] = useState("");
  const [formDirection, setFormDirection] = useState("");
  const [formQuantity, setFormQuantity] = useState("");
  const [formReason, setFormReason] = useState("");
  const [modelError, setModelError] = useState("");
  const [typeError, setTypeError] = useState("");
  const [directionError, setDirectionError] = useState("");
  const [quantityError, setQuantityError] = useState("");
  const [reasonError, setReasonError] = useState("");
  const [saving, setSaving] = useState(false);
  const [meta, setMeta] = useState({ page: 1, totalPages: 1, total: 0, limit: 20 });
  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState("PENDING");
  const [rejectModalId, setRejectModalId] = useState<number | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  const [rejectError, setRejectError] = useState("");
  const [processingId, setProcessingId] = useState<number | null>(null);

  const needsDirection = AMBIGUOUS_TYPES.includes(formType);
  const formUnit = models.find((m) => String(m.id) === formModelId)?.unit ?? "PIECE";

  const fetchAdjustments = useCallback(async (signal?: AbortSignal) => {
    setLoading(true);
    try {
      const { data } = await api.get<PaginatedResponse<StockAdjustment>>("/stock-adjustments", {
        params: { page, limit: 20, ...(statusFilter ? { status: statusFilter } : {}) },
        signal,
      });
      setAdjustments(data.data || []);
      setMeta(data.meta || { page: 1, totalPages: 1, total: 0, limit: 20 });
    } catch (err) {
      if (isAbortError(err)) return;
      setAdjustments([]);
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }, [page, statusFilter]);

  const fetchModels = useCallback(async (signal?: AbortSignal) => {
    try {
      const { data } = await api.get<PaginatedResponse<ProductModel>>("/product-models", {
        params: { page: 1, limit: ALL_OPTIONS_LIMIT },
        signal,
      });
      setModels(data.data);
    } catch (err) {
      if (isAbortError(err)) return;
      setModels([]);
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    void fetchAdjustments(controller.signal);
    return () => controller.abort();
  }, [fetchAdjustments]);
  useEffect(() => {
    const controller = new AbortController();
    void fetchModels(controller.signal);
    return () => controller.abort();
  }, [fetchModels]);

  const resetFormErrors = () => {
    setModelError("");
    setTypeError("");
    setDirectionError("");
    setQuantityError("");
    setReasonError("");
  };

  const openModal = () => {
    resetFormErrors();
    setModalOpen(true);
  };

  const closeModal = () => {
    if (saving) return;
    resetFormErrors();
    setModalOpen(false);
  };

  const handleSave = async () => {
    const parsedQuantity = Number(formQuantity);

    if (!formModelId) {
      setModelError(t.errors.common.required);
    } else {
      setModelError("");
    }

    if (!formType) {
      setTypeError(t.errors.common.required);
    } else {
      setTypeError("");
    }

    if (needsDirection && !formDirection) {
      setDirectionError(t.errors.common.required);
    } else {
      setDirectionError("");
    }

    if (!formQuantity || !Number.isFinite(parsedQuantity)) {
      setQuantityError(t.errors.common.invalidNumber);
    } else if (parsedQuantity <= 0) {
      setQuantityError(t.errors.common.greaterThanZero);
    } else if (formUnit !== "METER" && !Number.isInteger(parsedQuantity)) {
      setQuantityError(t.errors.delivery.FRACTIONAL_QUANTITY_NOT_ALLOWED);
    } else {
      setQuantityError("");
    }

    if (!formReason.trim()) {
      setReasonError(t.errors.common.reasonRequired);
    } else {
      setReasonError("");
    }

    const quantity = formUnit === "METER" ? Math.round(parsedQuantity * 100) / 100 : parsedQuantity;

    if (
      !formModelId ||
      !formType ||
      (needsDirection && !formDirection) ||
      !formQuantity ||
      !Number.isFinite(parsedQuantity) ||
      quantity <= 0 ||
      (formUnit !== "METER" && !Number.isInteger(quantity)) ||
      !formReason.trim()
    ) {
      return;
    }

    setSaving(true);
    try {
      await api.post("/stock-adjustments", {
        productModelId: Number(formModelId),
        type: formType,
        quantity,
        // Only sent for ambiguous types; the backend ignores it otherwise.
        ...(needsDirection ? { direction: formDirection } : {}),
        reason: formReason.trim(),
      });
      notify.success(t.stockAdjustments.submitted);
      setModalOpen(false);
      setFormModelId("");
      setFormType("");
      setFormDirection("");
      setFormQuantity("");
      setFormReason("");
      resetFormErrors();
      setStatusFilter("PENDING");
      setPage(1);
      fetchAdjustments();
    } catch (err) {
      notify.error(getFriendlyErrorMessage(err, t));
    } finally {
      setSaving(false);
    }
  };

  const handleApprove = async (id: number) => {
    setProcessingId(id);
    try {
      await api.post(`/stock-adjustments/${id}/approve`);
      notify.success(SUCCESS_MESSAGES.changeRequest.approved);
      fetchAdjustments();
    } catch (err) {
      notify.error(getFriendlyErrorMessage(err, t));
    } finally {
      setProcessingId(null);
    }
  };

  const openRejectModal = (id: number) => {
    setRejectModalId(id);
    setRejectReason("");
    setRejectError("");
  };

  const closeRejectModal = () => {
    if (processingId !== null) return;
    setRejectModalId(null);
    setRejectReason("");
    setRejectError("");
  };

  const handleReject = async () => {
    if (rejectModalId === null) return;

    if (!rejectReason.trim()) {
      setRejectError(t.errors.common.reasonRequired);
      return;
    }
    setRejectError("");

    setProcessingId(rejectModalId);
    try {
      await api.post(`/stock-adjustments/${rejectModalId}/reject`, { reason: rejectReason.trim() });
      notify.warning(SUCCESS_MESSAGES.changeRequest.rejected);
      setRejectModalId(null);
      setRejectReason("");
      fetchAdjustments();
    } catch (err) {
      notify.error(getFriendlyErrorMessage(err, t));
    } finally {
      setProcessingId(null);
    }
  };

  const columns = [
    {
      key: "model",
      label: t.stockAdjustments.model,
      render: (row: StockAdjustment) => (
        <span style={{ fontWeight: 600 }}>{row.productModel?.name || "—"}</span>
      ),
    },
    {
      key: "type",
      label: t.stockAdjustments.type,
      render: (row: StockAdjustment) => (
        <span style={{ textTransform: "capitalize" }}>{row.type.replace(/_/g, " ").toLowerCase()}</span>
      ),
    },
    {
      key: "quantity",
      label: t.stockAdjustments.quantity,
      align: "right" as const,
      // The backend stores a signed quantity (negative = reduces stock),
      // so show the sign explicitly to make the direction obvious.
      render: (row: StockAdjustment) => (
        <span
          dir="ltr"
          style={{
            fontVariantNumeric: "tabular-nums",
            fontWeight: 600,
            color: row.quantity < 0 ? "var(--danger)" : "var(--success)",
          }}
        >
          {row.quantity > 0 ? `+${row.quantity}` : row.quantity}
        </span>
      ),
    },
    {
      key: "reason",
      label: t.stockAdjustments.reason,
      render: (row: StockAdjustment) => (
        <span style={{ color: "var(--soft)", maxWidth: "200px", display: "inline-block", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {row.reason}
        </span>
      ),
    },
    {
      key: "status",
      label: t.status,
      render: (row: StockAdjustment) => <StatusChip status={row.status} />,
    },
    {
      key: "employee",
      label: t.invoices.employee,
      render: (row: StockAdjustment) => row.employee?.name || "—",
    },
    {
      key: "createdAt",
      label: t.date,
      render: (row: StockAdjustment) => new Date(row.createdAt).toLocaleDateString(),
    },
    ...(isAdmin
      ? [
          {
            key: "actions",
            label: "",
            render: (row: StockAdjustment) =>
              row.status === "PENDING" ? (
                <div style={{ display: "flex", gap: "8px" }}>
                  <Button
                    size="sm"
                    onClick={() => handleApprove(row.id)}
                    loading={processingId === row.id}
                  >
                    {t.changeRequests.approve}
                  </Button>
                  <Button
                    size="sm"
                    variant="danger"
                    onClick={() => openRejectModal(row.id)}
                    disabled={processingId === row.id}
                  >
                    {t.changeRequests.reject}
                  </Button>
                </div>
              ) : (
                <span style={{ color: "var(--soft)", fontSize: "12px" }}>
                  {row.status === "REJECTED" && row.reviewNote ? row.reviewNote : "—"}
                </span>
              ),
          },
        ]
      : []),
  ];

  return (
    <div>
      <PageHeader
        title={t.pages.stockAdjustments}
        subtitle={t.pages.stockAdjustmentsSubtitle}
        actions={<Button onClick={openModal}>{t.stockAdjustments.newAdjustment}</Button>}
      />

      <div className="toolbar" style={{ marginBottom: "var(--section-gap)" }}>
        <div className="toolbar-fixed">
          <Select
            options={[
              { label: t.all, value: "" },
              { label: t.changeRequests.pending, value: "PENDING" },
              { label: t.changeRequests.approved, value: "APPROVED" },
              { label: t.changeRequests.rejected, value: "REJECTED" },
            ]}
            value={statusFilter}
            onChange={(e) => {
              setStatusFilter(e.target.value);
              setPage(1);
            }}
          />
        </div>
        <span style={{ color: "var(--soft)", fontSize: "13px" }}>{t.stockAdjustments.pendingHint}</span>
      </div>

      {loading ? (
        <div className="state-block">
          <LoadingSpinner size={32} />
        </div>
      ) : adjustments.length === 0 ? (
        <EmptyState
          title={t.stockAdjustments.noAdjustments}
          description={t.stockAdjustments.noAdjustmentsDescription}
        />
      ) : (
        <>
          <Table
            columns={columns}
            data={adjustments}
            keyExtractor={(r) => String((r as unknown as StockAdjustment).id)}
          />
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

      <Modal
        isOpen={modalOpen}
        onClose={closeModal}
        title={t.stockAdjustments.newStockAdjustment}
        footer={
          <>
            <Button variant="secondary" onClick={closeModal}>{t.cancel}</Button>
            <Button onClick={handleSave} loading={saving}>{t.create}</Button>
          </>
        }
      >
        <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
          <Select
            label={t.stockPricing.productModel}
            options={[{ label: t.stockAdjustments.selectModel, value: "" }, ...models.map((m) => ({ label: m.name, value: String(m.id) }))]}
            value={formModelId}
            error={modelError}
            onChange={(e) => { setModelError(""); setFormModelId(e.target.value); }}
          />
          <Select
            label={t.stockAdjustments.adjustmentType}
            options={[{ label: t.stockAdjustments.selectType, value: "" }, ...ADJUSTMENT_TYPES]}
            value={formType}
            error={typeError}
            onChange={(e) => {
              setTypeError("");
              setDirectionError("");
              setFormType(e.target.value);
              // Direction only applies to ambiguous types; clear it otherwise.
              if (!AMBIGUOUS_TYPES.includes(e.target.value)) setFormDirection("");
            }}
          />
          {needsDirection && (
            <Select
              label={t.stockAdjustments.direction}
              options={DIRECTION_OPTIONS}
              value={formDirection}
              error={directionError}
              onChange={(e) => { setDirectionError(""); setFormDirection(e.target.value); }}
            />
          )}
          <Input
            label={`${t.stockAdjustments.quantity} (${t.uom[formUnit]})`}
            type="number"
            min={formUnit === "METER" ? "0.01" : "1"}
            step={formUnit === "METER" ? "0.01" : "1"}
            value={formQuantity}
            error={quantityError}
            onChange={(e) => { setQuantityError(""); setFormQuantity(e.target.value); }}
            placeholder={t.stockAdjustments.enterQuantity}
          />
          <Input
            label={t.changeRequests.reason}
            value={formReason}
            error={reasonError}
            onChange={(e) => { setReasonError(""); setFormReason(e.target.value); }}
            placeholder={t.stockAdjustments.enterReason}
          />
        </div>
      </Modal>

      <Modal
        isOpen={rejectModalId !== null}
        onClose={closeRejectModal}
        title={t.changeRequests.rejectTitle}
        footer={
          <>
            <Button variant="secondary" onClick={closeRejectModal} disabled={processingId !== null}>
              {t.cancel}
            </Button>
            <Button
              variant="danger"
              onClick={handleReject}
              loading={processingId !== null}
              disabled={!rejectReason.trim()}
            >
              {t.changeRequests.reject}
            </Button>
          </>
        }
      >
        <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
          <p style={{ color: "var(--soft)", fontSize: "13px" }}>{t.changeRequests.rejectReasonPrompt}</p>
          <Input
            label={t.changeRequests.rejectReason}
            value={rejectReason}
            error={rejectError}
            onChange={(e) => { setRejectError(""); setRejectReason(e.target.value); }}
            placeholder={t.changeRequests.rejectReasonPlaceholder}
          />
        </div>
      </Modal>
    </div>
  );
}