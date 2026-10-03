import { useState, useEffect, useCallback } from "react";
import api from "../../lib/api";
import { useDebouncedValue, isAbortError } from "../../hooks";
import { notify } from "../../lib/notify";
import { getFriendlyErrorMessage } from "../../lib/messages";
import { getSuccessMessages } from "../../lib/success-messages";
import { Button } from "../../components/ui/Button";
import { Input } from "../../components/ui/Input";
import { Select } from "../../components/ui/Select";
import { Table } from "../../components/ui/Table";
import { Pagination } from "../../components/ui/Pagination";
import { StatusChip } from "../../components/ui/StatusChip";
import { LoadingSpinner } from "../../components/ui/LoadingSpinner";
import { EmptyState } from "../../components/ui/EmptyState";
import { PageHeader } from "../../components/ui/PageHeader";
import { Modal } from "../../components/ui/Modal";
import { useI18n } from "../../i18n/context";
import type { Customer, PaginatedResponse } from "../../types";

export default function AdminCustomers() {
  const { t } = useI18n();
  const SUCCESS_MESSAGES = getSuccessMessages(t);
  const [customers, setCustomers] = useState<PaginatedResponse<Customer> | null>(null);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebouncedValue(search, 300);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [showDetails, setShowDetails] = useState(false);
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [editingCustomer, setEditingCustomer] = useState<Customer | null>(null);
  const [formName, setFormName] = useState("");
  const [formPhone, setFormPhone] = useState("");
  const [formType, setFormType] = useState<"INDIVIDUAL" | "COMPANY">("INDIVIDUAL");
  const [saving, setSaving] = useState(false);
  const [nameError, setNameError] = useState("");

  const fetchCustomers = useCallback(async (signal?: AbortSignal) => {
    setLoading(true);
    try {
      const params: Record<string, string | number> = { page, limit: 20 };
      if (debouncedSearch.trim()) params.search = debouncedSearch.trim();
      const response = await api.get<PaginatedResponse<Customer> | Customer[]>("/customers", { params, signal });
      const payload = Array.isArray(response.data)
        ? {
            data: response.data,
            meta: { page: 1, limit: response.data.length, total: response.data.length, totalPages: 1 },
          }
        : response.data;
      setCustomers(payload);
    } catch (err) {
      if (isAbortError(err)) return;
      // handle silently
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }, [page, debouncedSearch]);

  useEffect(() => {
    const controller = new AbortController();
    void fetchCustomers(controller.signal);
    return () => controller.abort();
  }, [fetchCustomers]);

  const openCreate = () => {
    setEditingCustomer(null);
    setSelectedCustomer(null);
    setFormName("");
    setFormPhone("");
    setFormType("INDIVIDUAL");
    setNameError("");
    setShowModal(true);
  };

  const openEdit = (customer: Customer) => {
    setEditingCustomer(customer);
    setSelectedCustomer(customer);
    setFormName(customer.name);
    setFormPhone(customer.phone || "");
    setFormType(customer.type);
    setNameError("");
    setShowModal(true);
  };

  const openDetails = (customer: Customer) => {
    setSelectedCustomer(customer);
    setShowDetails(true);
  };

  const handleSave = async () => {
    if (!formName.trim()) {
      setNameError(t.errors.common.required);
      return;
    }
    setNameError("");
    setSaving(true);
    try {
      const payload = {
        name: formName.trim(),
        phone: formPhone.trim() || undefined,
        type: formType,
      };

      if (editingCustomer) {
        await api.patch(`/customers/${editingCustomer.id}`, payload);
        notify.success(SUCCESS_MESSAGES.customer.updated);
      } else {
        await api.post("/customers", payload);
        notify.success(SUCCESS_MESSAGES.customer.added);
      }

      setShowModal(false);
      setEditingCustomer(null);
      fetchCustomers();
    } catch (err) {
      notify.error(getFriendlyErrorMessage(err, t));
    } finally {
      setSaving(false);
    }
  };

  const handleDeactivate = async (id: number) => {
    if (!confirm(t.customers.deactivateConfirm)) return;
    try {
      await api.delete(`/customers/${id}`);
      fetchCustomers();
      notify.warning(SUCCESS_MESSAGES.customer.deactivated);
    } catch (err) {
      notify.error(getFriendlyErrorMessage(err, t));
    }
  };

  const columns = [
    {
      key: "name",
      label: t.name,
      render: (row: Customer) => <span style={{ fontWeight: 600 }}>{row.name}</span>,
    },
    {
      key: "type",
      label: t.customers.type,
      render: (row: Customer) => <span style={{ textTransform: "capitalize" }}>{row.type.toLowerCase()}</span>,
    },
    {
      key: "phone",
      label: t.customers.phone,
      render: (row: Customer) => row.phone || "—",
    },
    {
      key: "status",
      label: t.status,
      render: (row: Customer) => <StatusChip status={row.isActive ? "ACTIVE" : "INACTIVE"} />,
    },
    {
      key: "createdAt",
      label: t.date,
      render: (row: Customer) => new Date(row.createdAt).toLocaleDateString(),
    },
    {
      key: "actions",
      label: "",
      align: "right" as const,
      render: (row: Customer) => (
        <div style={{ display: "flex", gap: "4px", justifyContent: "flex-end" }}>
          <Button variant="quiet" size="sm" onClick={() => openDetails(row)}>
            {t.customers.details}
          </Button>
          <Button variant="quiet" size="sm" onClick={() => openEdit(row)}>
            {t.edit}
          </Button>
          {row.isActive && (
            <Button variant="quiet" size="sm" onClick={() => handleDeactivate(row.id)} style={{ color: "var(--accent)" }}>
              {t.deactivate}
            </Button>
          )}
        </div>
      ),
    },
  ];

  const data = customers?.data || [];
  const meta = customers?.meta;

  return (
    <div>
      <PageHeader
        title={t.pages.adminCustomers}
        subtitle={t.pages.adminCustomersSubtitle}
        actions={
          <Button variant="primary" onClick={openCreate}>
            {t.customers.newCustomer}
          </Button>
        }
      />

      <div style={{ marginBottom: "16px", maxWidth: "400px" }}>
        <Input
          placeholder={t.customers.searchPlaceholder}
          value={search}
          onChange={(e) => { setSearch(e.target.value); setPage(1); }}
        />
      </div>

      {loading ? (
        <div className="state-block">
          <LoadingSpinner size={28} />
        </div>
      ) : data.length === 0 ? (
        <EmptyState
          title={t.customers.noCustomers}
          description={search ? t.customers.tryDifferent : t.customers.noCustomersInSystem}
          action={!search ? <Button variant="primary" onClick={openCreate}>{t.customers.newCustomer}</Button> : undefined}
        />
      ) : (
        <>
          <Table
            columns={columns}
            data={data}
            keyExtractor={(row) => String(row.id)}
          />
          {meta && meta.totalPages > 1 && (
            <Pagination
              currentStart={(meta.page - 1) * meta.limit + 1}
              currentEnd={Math.min(meta.page * meta.limit, meta.total)}
              total={meta.total}
              currentPage={meta.page}
              totalPages={meta.totalPages}
              onPrev={() => setPage((p) => Math.max(1, p - 1))}
              onNext={() => setPage((p) => Math.min(meta.totalPages, p + 1))}
              loading={loading}
            />
          )}
        </>
      )}

      <Modal
        isOpen={showModal}
        onClose={() => { setShowModal(false); setNameError(""); }}
        title={editingCustomer ? t.customers.editCustomer : t.customers.newCustomer}
        footer={
          <>
            <Button variant="secondary" onClick={() => { setShowModal(false); setNameError(""); }}>{t.cancel}</Button>
            <Button variant="primary" loading={saving} onClick={handleSave}>
              {editingCustomer ? t.saveChanges : t.create}
            </Button>
          </>
        }
      >
        <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
          <Input
            label={t.name}
            value={formName}
            error={nameError}
            onChange={(e) => { setNameError(""); setFormName(e.target.value); }}
            placeholder={t.customers.customerNamePlaceholder}
          />
          <Input
            label={t.newInvoice.phoneOptional}
            value={formPhone}
            onChange={(e) => setFormPhone(e.target.value)}
            placeholder={t.customers.phoneNumberPlaceholder}
          />
          <Select
            label={t.customers.type}
            value={formType}
            onChange={(e) => setFormType(e.target.value as "INDIVIDUAL" | "COMPANY")}
            options={[
              { label: t.newInvoice.retail, value: "INDIVIDUAL" },
              { label: t.newInvoice.wholesale, value: "COMPANY" },
            ]}
          />
        </div>
      </Modal>

      <Modal
        isOpen={showDetails}
        onClose={() => setShowDetails(false)}
        title={selectedCustomer ? selectedCustomer.name : t.customers.customerDetails}
      >
        {selectedCustomer && (
          <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
            <div>
              <strong>{t.customers.nameLabel}</strong> {selectedCustomer.name}
            </div>
            <div>
              <strong>{t.customers.phoneLabel}</strong> {selectedCustomer.phone || "—"}
            </div>
            <div>
              <strong>{t.customers.typeLabel}</strong> {selectedCustomer.type}
            </div>
            <div>
              <strong>{t.customers.statusLabel}</strong> <StatusChip status={selectedCustomer.isActive ? "ACTIVE" : "INACTIVE"} />
            </div>
            <div>
              <strong>{t.customers.createdLabel}</strong> {new Date(selectedCustomer.createdAt).toLocaleString()}
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
