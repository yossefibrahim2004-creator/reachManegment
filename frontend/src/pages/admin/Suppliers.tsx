import { useState, useEffect, useCallback } from "react";
import api from "../../lib/api";
import { useDebouncedValue, isAbortError } from "../../hooks";
import { notify } from "../../lib/notify";
import { getFriendlyErrorMessage } from "../../lib/messages";
import { getSuccessMessages } from "../../lib/success-messages";
import { PageHeader } from "../../components/ui/PageHeader";
import { Button } from "../../components/ui/Button";
import { Input } from "../../components/ui/Input";
import { Card } from "../../components/ui/Card";
import { Table } from "../../components/ui/Table";
import { Pagination } from "../../components/ui/Pagination";
import { StatusChip } from "../../components/ui/StatusChip";
import { Modal } from "../../components/ui/Modal";
import { LoadingSpinner } from "../../components/ui/LoadingSpinner";
import { EmptyState } from "../../components/ui/EmptyState";
import { useI18n } from "../../i18n/context";
import type { Supplier, PaginatedResponse } from "../../types";

interface SupplierForm {
  name: string;
  phone: string;
  address: string;
}

const emptyForm: SupplierForm = { name: "", phone: "", address: "" };

export default function AdminSuppliers() {
  const { t } = useI18n();
  const SUCCESS_MESSAGES = getSuccessMessages(t);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [meta, setMeta] = useState({ page: 1, totalPages: 1, total: 0, limit: 20 });
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebouncedValue(search, 300);
  const [page, setPage] = useState(1);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Supplier | null>(null);
  const [form, setForm] = useState<SupplierForm>(emptyForm);
  const [saving, setSaving] = useState(false);
  const [nameError, setNameError] = useState("");

  const fetchSuppliers = useCallback(async (signal?: AbortSignal) => {
    setLoading(true);
    try {
      const params: Record<string, string | number> = { page, limit: 20 };
      if (debouncedSearch.trim()) params.search = debouncedSearch.trim();
      const { data } = await api.get<PaginatedResponse<Supplier>>("/suppliers", { params, signal });
      setSuppliers(data.data || []);
      setMeta(data.meta || { page: 1, totalPages: 1, total: 0, limit: 20 });
    } catch (err) {
      if (isAbortError(err)) return;
      setSuppliers([]);
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }, [page, debouncedSearch]);

  useEffect(() => {
    const controller = new AbortController();
    void fetchSuppliers(controller.signal);
    return () => controller.abort();
  }, [fetchSuppliers]);

  const openCreate = () => {
    setEditing(null);
    setForm(emptyForm);
    setNameError("");
    setModalOpen(true);
  };

  const openEdit = (s: Supplier) => {
    setEditing(s);
    setForm({ name: s.name, phone: s.phone || "", address: s.address || "" });
    setNameError("");
    setModalOpen(true);
  };

  const handleSave = async () => {
    if (form.name.trim().length < 2) {
      setNameError(t.errors.common.minLength.replace("{n}", "2"));
      return;
    }
    setNameError("");
    setSaving(true);
    try {
      const payload = { name: form.name.trim(), phone: form.phone.trim() || undefined, address: form.address.trim() || undefined };
      if (editing) {
        await api.patch(`/suppliers/${editing.id}`, payload);
        notify.success(SUCCESS_MESSAGES.supplier.updated);
      } else {
        await api.post("/suppliers", payload);
        notify.success(SUCCESS_MESSAGES.supplier.added);
      }
      setModalOpen(false);
      fetchSuppliers();
    } catch (err) {
      notify.error(getFriendlyErrorMessage(err, t));
    } finally {
      setSaving(false);
    }
  };

  const handleDeactivate = async (id: number) => {
    if (!window.confirm(t.suppliers.deactivateConfirm)) return;
    try {
      await api.delete(`/suppliers/${id}`);
      fetchSuppliers();
      notify.warning(SUCCESS_MESSAGES.supplier.deactivated);
    } catch (err) {
      notify.error(getFriendlyErrorMessage(err, t));
    }
  };

  const columns = [
    {
      key: "name",
      label: t.name,
      render: (row: Supplier) => <span style={{ fontWeight: 600 }}>{row.name}</span>,
    },
    {
      key: "phone",
      label: t.suppliers.phone,
      render: (row: Supplier) => row.phone || "—",
    },
    {
      key: "address",
      label: t.suppliers.address,
      render: (row: Supplier) => row.address || "—",
    },
    {
      key: "status",
      label: t.status,
      render: (row: Supplier) => <StatusChip status={row.isActive ? "ACTIVE" : "INACTIVE"} />,
    },
    {
      key: "actions",
      label: "",
      align: "right" as const,
      render: (row: Supplier) => (
        <div style={{ display: "flex", gap: "4px", justifyContent: "flex-end" }}>
          <Button variant="quiet" size="sm" onClick={() => openEdit(row)}>{t.edit}</Button>
          {row.isActive && (
            <Button variant="quiet" size="sm" onClick={() => handleDeactivate(row.id)} style={{ color: "var(--accent)" }}>
              {t.deactivate}
            </Button>
          )}
        </div>
      ),
    },
  ];

  return (
    <div>
      <PageHeader
        title={t.pages.suppliers}
        subtitle={t.pages.suppliersSubtitle}
        actions={<Button onClick={openCreate}>{t.suppliers.newSupplier}</Button>}
      />

      <div className="toolbar" style={{ maxWidth: 400 }}>
        <div className="toolbar-grow">
          <Input
            placeholder={t.suppliers.searchPlaceholder}
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
          />
        </div>
      </div>

      {loading ? (
        <div className="state-block">
          <LoadingSpinner size={28} />
        </div>
      ) : suppliers.length === 0 ? (
        <EmptyState
          title={t.suppliers.noSuppliers}
          description={search ? t.suppliers.noSuppliersMatch : t.suppliers.addFirstSupplier}
          action={!search ? <Button onClick={openCreate}>{t.suppliers.newSupplier}</Button> : undefined}
        />
      ) : (
        <>
          <Table
            columns={columns}
            data={suppliers}
            keyExtractor={(r) => String((r as unknown as Supplier).id)}
          />
          {meta.totalPages > 1 && (
            <Pagination
              currentStart={(meta.page - 1) * meta.limit + 1}
              currentEnd={Math.min(meta.page * meta.limit, meta.total)}
              total={meta.total}
              currentPage={meta.page}
              totalPages={meta.totalPages}
              onPrev={() => setPage((p) => Math.max(1, p - 1))}
              onNext={() => setPage((p) => Math.min(meta.totalPages, p + 1))}
            />
          )}
        </>
      )}

      <Modal
        isOpen={modalOpen}
        onClose={() => { setModalOpen(false); setNameError(""); }}
        title={editing ? t.suppliers.editSupplier : t.suppliers.newSupplier}
        footer={
          <>
            <Button variant="secondary" onClick={() => { setModalOpen(false); setNameError(""); }}>{t.cancel}</Button>
            <Button onClick={handleSave} loading={saving}>{editing ? t.saveChanges : t.create}</Button>
          </>
        }
      >
        <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
          <Input label={t.name} value={form.name} error={nameError} onChange={(e) => { setNameError(""); setForm({ ...form, name: e.target.value }); }} placeholder={t.suppliers.supplierNamePlaceholder} />
          <Input label={t.suppliers.phone} value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder={t.suppliers.phoneNumberPlaceholder} />
          <Input label={t.suppliers.address} value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} placeholder={t.suppliers.address} />
        </div>
      </Modal>
    </div>
  );
}
