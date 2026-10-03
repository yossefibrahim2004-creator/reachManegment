import React from "react";
import api from "../../lib/api";
import { ALL_OPTIONS_LIMIT, isAbortError, useCategories, useInvalidateOptions } from "../../hooks";
import { notify } from "../../lib/notify";
import { getFriendlyErrorMessage } from "../../lib/messages";
import { getSuccessMessages } from "../../lib/success-messages";
import { Button } from "../../components/ui/Button";
import { Input } from "../../components/ui/Input";
import { Select } from "../../components/ui/Select";
import { Card } from "../../components/ui/Card";
import { Table } from "../../components/ui/Table";
import { PageHeader } from "../../components/ui/PageHeader";
import { Modal } from "../../components/ui/Modal";
import { StatusChip } from "../../components/ui/StatusChip";
import { LoadingSpinner } from "../../components/ui/LoadingSpinner";
import { EmptyState } from "../../components/ui/EmptyState";
import { useI18n } from "../../i18n/context";
import type { Category, PaginatedResponse, ProductModel, UnitOfMeasure } from "../../types";

const tabBtnStyle = (active: boolean): React.CSSProperties => ({
  padding: "8px 20px",
  borderRadius: "8px",
  border: "none",
  cursor: "pointer",
  fontFamily: "'Manrope', sans-serif",
  fontSize: "14px",
  fontWeight: 600,
  backgroundColor: active ? "var(--brand-fill)" : "transparent",
  color: active ? "var(--on-brand)" : "var(--ink)",
  transition: "background-color 0.15s, color 0.15s",
});

export default function CategoriesModels() {
  const { t } = useI18n();
  const SUCCESS_MESSAGES = getSuccessMessages(t);
  const [tab, setTab] = React.useState<"categories" | "models">("categories");

  // Categories state
  const { data: categories = [], isLoading: catLoading } = useCategories();
  const invalidateOptions = useInvalidateOptions();
  const [catModalOpen, setCatModalOpen] = React.useState(false);
  const [catForm, setCatForm] = React.useState({ name: "", id: 0 });
  const [catSaving, setCatSaving] = React.useState(false);
  const [catNameError, setCatNameError] = React.useState("");
  const [catDeleteConfirm, setCatDeleteConfirm] = React.useState<Category | null>(null);

  // Models state
  const [models, setModels] = React.useState<ProductModel[]>([]);
  const [modelLoading, setModelLoading] = React.useState(true);
  const [modelModalOpen, setModelModalOpen] = React.useState(false);
  const [modelForm, setModelForm] = React.useState({
    id: 0,
    name: "",
    categoryId: "",
    minStockAlert: "",
    isSerialized: true,
    unit: "PIECE" as UnitOfMeasure,
  });
  const [modelSaving, setModelSaving] = React.useState(false);
  const [modelNameError, setModelNameError] = React.useState("");
  const [modelCategoryError, setModelCategoryError] = React.useState("");
  const [modelMinStockError, setModelMinStockError] = React.useState("");
  const [modelDeleteConfirm, setModelDeleteConfirm] = React.useState<ProductModel | null>(null);

  // Fetch models
  const fetchModels = React.useCallback(async (signal?: AbortSignal) => {
    setModelLoading(true);
    try {
      const res = await api.get<PaginatedResponse<ProductModel>>("/product-models", {
        params: { page: 1, limit: ALL_OPTIONS_LIMIT },
        signal,
      });
      setModels(res.data.data);
    } catch (err) {
      if (isAbortError(err)) return;
      setModels([]);
    } finally {
      if (!signal?.aborted) setModelLoading(false);
    }
  }, []);

  React.useEffect(() => {
    if (tab !== "models") return;
    const controller = new AbortController();
    void fetchModels(controller.signal);
    return () => controller.abort();
  }, [tab, fetchModels]);

  // Category CRUD
  const openCatCreate = () => { setCatForm({ name: "", id: 0 }); setCatNameError(""); setCatModalOpen(true); };
  const openCatEdit = (cat: Category) => { setCatForm({ name: cat.name, id: cat.id }); setCatNameError(""); setCatModalOpen(true); };

  const saveCategory = async () => {
    if (catForm.name.trim().length < 2) {
      setCatNameError(t.errors.common.minLength.replace("{n}", "2"));
      return;
    }
    setCatNameError("");
    setCatSaving(true);
    try {
      if (catForm.id) {
        await api.patch(`/categories/${catForm.id}`, { name: catForm.name.trim() });
        notify.success(SUCCESS_MESSAGES.category.updated);
      } else {
        await api.post("/categories", { name: catForm.name.trim() });
        notify.success(SUCCESS_MESSAGES.category.added);
      }
      setCatModalOpen(false);
      void invalidateOptions.categories();
    } catch (err) {
      notify.error(getFriendlyErrorMessage(err, t));
    } finally {
      setCatSaving(false);
    }
  };

  const deleteCategory = async () => {
    if (!catDeleteConfirm) return;
    try {
      await api.delete(`/categories/${catDeleteConfirm.id}`);
      setCatDeleteConfirm(null);
      void invalidateOptions.categories();
      notify.warning(SUCCESS_MESSAGES.category.deleted);
    } catch (err) {
      notify.error(getFriendlyErrorMessage(err, t));
    }
  };

  // Model CRUD
  const openModelCreate = () => {
    setModelForm({ id: 0, name: "", categoryId: "", minStockAlert: "", isSerialized: true, unit: "PIECE" });
    setModelNameError("");
    setModelCategoryError("");
    setModelMinStockError("");
    setModelModalOpen(true);
  };
  const openModelEdit = (m: ProductModel) => {
    const unit = m.unit ?? "PIECE";
    setModelForm({
      id: m.id,
      name: m.name,
      categoryId: String(m.categoryId),
      minStockAlert: String(m.minStockAlert),
      isSerialized: unit === "METER" ? false : m.isSerialized !== false,
      unit,
    });
    setModelNameError("");
    setModelCategoryError("");
    setModelMinStockError("");
    setModelModalOpen(true);
  };

  const saveModel = async () => {
    let valid = true;

    if (!modelForm.name.trim()) {
      setModelNameError(t.errors.common.required);
      valid = false;
    } else {
      setModelNameError("");
    }

    if (!modelForm.categoryId) {
      setModelCategoryError(t.errors.common.required);
      valid = false;
    } else {
      setModelCategoryError("");
    }

    if (modelForm.minStockAlert.trim()) {
      const parsedMinStock = Number(modelForm.minStockAlert);
      if (!Number.isFinite(parsedMinStock) || parsedMinStock < 0) {
        setModelMinStockError(t.errors.common.invalidNumber);
        valid = false;
      } else {
        setModelMinStockError("");
      }
    } else {
      setModelMinStockError("");
    }

    if (!valid) return;

    setModelSaving(true);
    const payload = {
      name: modelForm.name.trim(),
      categoryId: Number(modelForm.categoryId),
      minStockAlert: Number(modelForm.minStockAlert) || 0,
      isSerialized: modelForm.unit === "METER" ? false : modelForm.isSerialized,
      unit: modelForm.unit,
    };
    try {
      if (modelForm.id) {
        await api.patch(`/product-models/${modelForm.id}`, payload);
        notify.success(SUCCESS_MESSAGES.productModel.updated);
      } else {
        await api.post("/product-models", payload);
        notify.success(SUCCESS_MESSAGES.productModel.added);
      }
      setModelModalOpen(false);
      fetchModels();
    } catch (err) {
      notify.error(getFriendlyErrorMessage(err, t));
    } finally {
      setModelSaving(false);
    }
  };

  const deleteModel = async () => {
    if (!modelDeleteConfirm) return;
    try {
      await api.delete(`/product-models/${modelDeleteConfirm.id}`);
      setModelDeleteConfirm(null);
      fetchModels();
      notify.warning(SUCCESS_MESSAGES.productModel.deleted);
    } catch (err) {
      notify.error(getFriendlyErrorMessage(err, t));
    }
  };

  const catColumns = [
    { key: "name", label: t.name },
    {
      key: "status",
      label: t.status,
      render: (row: Record<string, unknown>) => (
        <StatusChip status={(row.isActive as boolean) ? "ACTIVE" : "INACTIVE"} />
      ),
    },
    {
      key: "actions",
      label: "",
      align: "right" as const,
      render: (row: Record<string, unknown>) => (
        <div style={{ display: "flex", gap: "8px", justifyContent: "flex-end" }}>
          <Button variant="quiet" size="sm" onClick={(e) => { e.stopPropagation(); openCatEdit(row as unknown as Category); }}>
            {t.edit}
          </Button>
          <Button variant="quiet" size="sm" onClick={(e) => { e.stopPropagation(); setCatDeleteConfirm(row as unknown as Category); }} style={{ color: "var(--accent)" }}>
            {t.delete}
          </Button>
        </div>
      ),
    },
  ];

  const modelColumns = [
    { key: "name", label: t.name },
    {
      key: "category",
      label: t.inventory.category,
      render: (row: Record<string, unknown>) => (row.category as Category | undefined)?.name ?? "—",
    },
    {
      key: "minStockAlert",
      label: t.inventory.minStock,
      align: "right" as const,
      render: (row: Record<string, unknown>) => (
        <span style={{ fontVariantNumeric: "tabular-nums" }}>{row.minStockAlert as number}</span>
      ),
    },
    {
      key: "serialType",
      label: t.inventory.serial,
      render: (row: Record<string, unknown>) => {
        const isSerialized = (row.isSerialized as boolean | undefined) !== false;
        return (
          <StatusChip
            status={isSerialized ? "APPROVED" : "INACTIVE"}
            label={isSerialized ? t.inventory.serialized : t.inventory.nonSerialized}
          />
        );
      },
    },
    {
      key: "status",
      label: t.status,
      render: (row: Record<string, unknown>) => (
        <StatusChip status={(row.isActive as boolean) ? "ACTIVE" : "INACTIVE"} />
      ),
    },
    {
      key: "actions",
      label: "",
      align: "right" as const,
      render: (row: Record<string, unknown>) => (
        <div style={{ display: "flex", gap: "8px", justifyContent: "flex-end" }}>
          <Button variant="quiet" size="sm" onClick={(e) => { e.stopPropagation(); openModelEdit(row as unknown as ProductModel); }}>
            {t.edit}
          </Button>
          <Button variant="quiet" size="sm" onClick={(e) => { e.stopPropagation(); setModelDeleteConfirm(row as unknown as ProductModel); }} style={{ color: "var(--accent)" }}>
            {t.delete}
          </Button>
        </div>
      ),
    },
  ];

  const isLoading = tab === "categories" ? catLoading : modelLoading;

  return (
    <div>
      <PageHeader
        title={t.pages.categoriesAndModels}
        subtitle={t.pages.categoriesAndModelsSubtitle}
        actions={
          <Button onClick={tab === "categories" ? openCatCreate : openModelCreate}>
            {tab === "categories" ? t.inventory.newCategory : t.inventory.newModel}
          </Button>
        }
      />

      <div className="toolbar">
        <button style={tabBtnStyle(tab === "categories")} onClick={() => setTab("categories")}>{t.inventory.categories}</button>
        <button style={tabBtnStyle(tab === "models")} onClick={() => setTab("models")}>{t.inventory.productModels}</button>
      </div>

      {isLoading ? (
        <div className="state-block">
          <LoadingSpinner size={28} />
        </div>
      ) : tab === "categories" ? (
        categories.length === 0 ? (
          <EmptyState
            icon={<svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" /></svg>}
            title={t.inventory.noCategories}
            description={t.inventory.noCategoriesHint}
            action={<Button onClick={openCatCreate}>{t.inventory.createCategory}</Button>}
          />
        ) : (
          <Table
            columns={catColumns}
            data={categories as unknown as Record<string, unknown>[]}
            keyExtractor={(row) => String((row as unknown as Category).id)}
          />
        )
      ) : (
        models.length === 0 ? (
          <EmptyState
            icon={<svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><rect x="2" y="7" width="20" height="14" rx="2" ry="2" /><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16" /></svg>}
            title={t.inventory.noProductModels}
            description={t.inventory.noProductModelsHint}
            action={<Button onClick={openModelCreate}>{t.inventory.createModel}</Button>}
          />
        ) : (
          <Table
            columns={modelColumns}
            data={models as unknown as Record<string, unknown>[]}
            keyExtractor={(row) => String((row as unknown as ProductModel).id)}
          />
        )
      )}

      {/* Category Modal */}
      <Modal
        isOpen={catModalOpen}
        onClose={() => { setCatModalOpen(false); setCatNameError(""); }}
        title={catForm.id ? t.inventory.editCategory : t.inventory.newCategoryTitle}
        footer={
          <>
            <Button variant="secondary" onClick={() => { setCatModalOpen(false); setCatNameError(""); }}>{t.cancel}</Button>
            <Button onClick={saveCategory} loading={catSaving}>
              {catForm.id ? t.saveChanges : t.inventory.createCategory}
            </Button>
          </>
        }
      >
        <Input
          label={t.inventory.categoryName}
          value={catForm.name}
          error={catNameError}
          onChange={(e) => { setCatNameError(""); setCatForm({ ...catForm, name: e.target.value }); }}
          placeholder={t.inventory.newCategory}
        />
      </Modal>

      {/* Category Delete Confirmation */}
      <Modal
        isOpen={!!catDeleteConfirm}
        onClose={() => setCatDeleteConfirm(null)}
        title={t.inventory.deleteCategory}
        footer={
          <>
            <Button variant="secondary" onClick={() => setCatDeleteConfirm(null)}>{t.cancel}</Button>
            <Button variant="danger" onClick={deleteCategory}>{t.delete}</Button>
          </>
        }
      >
        <p style={{ margin: 0, fontFamily: "'Manrope', sans-serif", fontSize: "14px", color: "var(--ink)" }}>
          {t.inventory.deleteCategoryConfirm} <strong>{catDeleteConfirm?.name}</strong>? {t.inventory.deleteCategoryWarning}
        </p>
      </Modal>

      {/* Model Modal */}
      <Modal
        isOpen={modelModalOpen}
        onClose={() => { setModelModalOpen(false); setModelNameError(""); setModelCategoryError(""); setModelMinStockError(""); }}
        title={modelForm.id ? t.inventory.editModel : t.inventory.newModelTitle}
        footer={
          <>
            <Button variant="secondary" onClick={() => { setModelModalOpen(false); setModelNameError(""); setModelCategoryError(""); setModelMinStockError(""); }}>{t.cancel}</Button>
            <Button onClick={saveModel} loading={modelSaving}>
              {modelForm.id ? t.saveChanges : t.inventory.createModel}
            </Button>
          </>
        }
      >
        <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
          <Input
            label={t.name}
            value={modelForm.name}
            error={modelNameError}
            onChange={(e) => { setModelNameError(""); setModelForm({ ...modelForm, name: e.target.value }); }}
            placeholder={t.inventory.newModelTitle}
          />
          <Select
            label={t.inventory.category}
            options={categories.map((c) => ({ label: c.name, value: String(c.id) }))}
            placeholder={t.inventory.selectCategory}
            value={modelForm.categoryId}
            error={modelCategoryError}
            onChange={(e) => { setModelCategoryError(""); setModelForm({ ...modelForm, categoryId: e.target.value }); }}
          />
          <Input
            label={t.inventory.minStock}
            type="number"
            step="0.01"
            value={modelForm.minStockAlert}
            error={modelMinStockError}
            onChange={(e) => { setModelMinStockError(""); setModelForm({ ...modelForm, minStockAlert: e.target.value }); }}
            placeholder="0"
          />
          <Select
            label={t.uom.label}
            options={[
              { label: t.uom.PIECE, value: "PIECE" },
              { label: t.uom.METER, value: "METER" },
            ]}
            value={modelForm.unit}
            onChange={(e) => {
              const unit = e.target.value as UnitOfMeasure;
              setModelForm({
                ...modelForm,
                unit,
                isSerialized: unit === "METER" ? false : modelForm.isSerialized,
              });
            }}
          />
          <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
            <label style={{ fontFamily: "'Manrope', sans-serif", fontSize: "13px", fontWeight: 600, color: "var(--ink)" }}>
              {t.inventory.serializedProduct}
            </label>
            <button
              type="button"
              disabled={modelForm.unit === "METER"}
              onClick={() => setModelForm({ ...modelForm, isSerialized: !modelForm.isSerialized })}
              style={{
                width: "44px",
                height: "24px",
                borderRadius: "var(--radius-md)",
                border: "none",
                backgroundColor: modelForm.isSerialized
                  ? "var(--brand-fill)"
                  : "var(--border)",
                position: "relative",
                cursor: modelForm.unit === "METER" ? "not-allowed" : "pointer",
                opacity: modelForm.unit === "METER" ? 0.6 : 1,
                transition: "background-color 0.2s",
              }}
            >
              <div
                style={{
                  width: "20px",
                  height: "20px",
                  borderRadius: "50%",
                  backgroundColor: "var(--card)",
                  position: "absolute",
                  top: "2px",
                  insetInlineStart: modelForm.isSerialized ? "22px" : "2px",
                  transition: "inset-inline-start 0.2s",
                  boxShadow: "var(--shadow-sm)",
                }}
              />
            </button>
            <span style={{ fontFamily: "'Manrope', sans-serif", fontSize: "12px", color: "var(--soft)" }}>
              {modelForm.unit === "METER"
                ? t.inventory.meterProductsNotSerialized
                : modelForm.isSerialized
                  ? t.inventory.eachUnitHasUniqueBarcode
                  : t.inventory.soldByQuantity}
            </span>
          </div>
        </div>
      </Modal>

      {/* Model Delete Confirmation */}
      <Modal
        isOpen={!!modelDeleteConfirm}
        onClose={() => setModelDeleteConfirm(null)}
        title={t.inventory.deleteModel}
        footer={
          <>
            <Button variant="secondary" onClick={() => setModelDeleteConfirm(null)}>{t.cancel}</Button>
            <Button variant="danger" onClick={deleteModel}>{t.delete}</Button>
          </>
        }
      >
        <p style={{ margin: 0, fontFamily: "'Manrope', sans-serif", fontSize: "14px", color: "var(--ink)" }}>
          {t.inventory.deleteModelConfirm} <strong>{modelDeleteConfirm?.name}</strong>? {t.inventory.deleteModelWarning}
        </p>
      </Modal>
    </div>
  );
}
