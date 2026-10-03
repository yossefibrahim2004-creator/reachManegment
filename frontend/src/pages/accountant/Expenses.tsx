import { useState, useEffect, useCallback } from "react";
import api from "../../lib/api";
import { isAbortError } from "../../hooks";
import { notify } from "../../lib/notify";
import { getFriendlyErrorMessage } from "../../lib/messages";
import { getSuccessMessages } from "../../lib/success-messages";
import { PageHeader } from "../../components/ui/PageHeader";
import { Button } from "../../components/ui/Button";
import { Input } from "../../components/ui/Input";
import { Select } from "../../components/ui/Select";
import { Table } from "../../components/ui/Table";
import { Pagination } from "../../components/ui/Pagination";
import { Modal } from "../../components/ui/Modal";
import { LoadingSpinner } from "../../components/ui/LoadingSpinner";
import { EmptyState } from "../../components/ui/EmptyState";
import { useI18n } from "../../i18n/context";
import type { Expense, ExpenseCategory } from "../../types";

interface ExpenseForm {
  categoryId: number | "";
  amount: string;
  date: string;
  description: string;
}

const emptyForm: ExpenseForm = { categoryId: "", amount: "", date: new Date().toISOString().slice(0, 10), description: "" };

export default function AccountantExpenses() {
  const { t } = useI18n();
  const SUCCESS_MESSAGES = getSuccessMessages(t);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [categories, setCategories] = useState<ExpenseCategory[]>([]);
  const [meta, setMeta] = useState({ page: 1, totalPages: 1, total: 0, limit: 20 });
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState<ExpenseForm>(emptyForm);
  const [categoryError, setCategoryError] = useState("");
  const [amountError, setAmountError] = useState("");
  const [descriptionError, setDescriptionError] = useState("");
  const [saving, setSaving] = useState(false);

  const fetchExpenses = useCallback(async (signal?: AbortSignal) => {
    setLoading(true);
    try {
      const res = await api.get("/expenses", { params: { page, limit: 20 }, signal });
      setExpenses(res.data.data ?? res.data);
      setMeta(res.data.meta ?? { page: 1, totalPages: 1, total: 0, limit: 20 });
    } catch (err) {
      if (isAbortError(err)) return;
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }, [page]);

  const fetchCategories = useCallback(async (signal?: AbortSignal) => {
    try {
      const res = await api.get("/expense-categories", { signal });
      setCategories(res.data.data ?? res.data);
    } catch (err) {
      if (isAbortError(err)) return;
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    void fetchExpenses(controller.signal);
    return () => controller.abort();
  }, [fetchExpenses]);
  useEffect(() => {
    const controller = new AbortController();
    void fetchCategories(controller.signal);
    return () => controller.abort();
  }, [fetchCategories]);

  const openCreate = () => {
    setForm(emptyForm);
    setCategoryError("");
    setAmountError("");
    setDescriptionError("");
    setModalOpen(true);
  };

  const handleSave = async () => {
    let valid = true;
    if (!form.categoryId) {
      setCategoryError(t.errors.common.required);
      valid = false;
    } else {
      setCategoryError("");
    }
    const amount = Number(form.amount);
    if (!form.amount.trim() || !Number.isFinite(amount)) {
      setAmountError(t.errors.common.invalidNumber);
      valid = false;
    } else if (amount <= 0) {
      setAmountError(t.errors.common.greaterThanZero);
      valid = false;
    } else {
      setAmountError("");
    }
    if (!form.description.trim()) {
      setDescriptionError(t.errors.common.required);
      valid = false;
    } else {
      setDescriptionError("");
    }
    if (!valid) return;
    setSaving(true);
    try {
      await api.post("/expenses", {
        categoryId: Number(form.categoryId),
        amount: parseFloat(form.amount),
        date: form.date,
        description: form.description,
      });
      setModalOpen(false);
      fetchExpenses();
      notify.success(SUCCESS_MESSAGES.expense.added);
    } catch (err) {
      notify.error(getFriendlyErrorMessage(err, t));
    } finally {
      setSaving(false);
    }
  };

  const fmt = (n: number) => n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  const columns = [
    { key: "categoryName", label: t.expenses.category, render: (r: Expense) => r.category?.name ?? "—" },
    { key: "amount", label: t.expenses.amount, align: "right" as const, render: (r: Expense) => <span style={{ fontVariantNumeric: "tabular-nums" }}>{t.currency} {fmt(r.amount)}</span> },
    { key: "date", label: t.date, render: (r: Expense) => new Date(r.date).toLocaleDateString() },
    { key: "description", label: t.description },
    { key: "employeeName", label: t.invoices.employee, render: (r: Expense) => r.employee?.name ?? "—" },
  ];

  return (
    <div>
      <PageHeader
        title={t.pages.expenses}
        subtitle={t.pages.expensesSubtitle}
        actions={<Button onClick={openCreate}>{t.expenses.addExpense}</Button>}
      />

      {loading ? (
        <div className="state-block">
          <LoadingSpinner size={32} />
        </div>
      ) : expenses.length === 0 ? (
        <EmptyState title={t.expenses.noExpenses} description={t.expenses.addFirst} action={<Button onClick={openCreate}>{t.expenses.addExpense}</Button>} />
      ) : (
        <>
          <Table columns={columns} data={expenses} keyExtractor={(r) => String(r.id)} />
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
        onClose={() => setModalOpen(false)}
        title={t.expenses.addExpense}
        footer={
          <>
            <Button variant="secondary" onClick={() => setModalOpen(false)}>{t.cancel}</Button>
            <Button onClick={handleSave} loading={saving}>{t.create}</Button>
          </>
        }
      >
        <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
          <Select
            label={t.expenses.category}
            options={[{ label: t.expenses.selectCategory, value: "" }, ...categories.map((c) => ({ label: c.name, value: String(c.id) }))]}
            value={String(form.categoryId)}
            onChange={(e) => {
              setForm({ ...form, categoryId: e.target.value ? Number(e.target.value) : "" });
              setCategoryError("");
            }}
            error={categoryError}
          />
          <Input
            label={t.expenses.amount}
            type="number"
            step="0.01"
            min="0"
            value={form.amount}
            onChange={(e) => {
              setForm({ ...form, amount: e.target.value });
              setAmountError("");
            }}
            error={amountError}
          />
          <Input label={t.date} type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} />
          <Input
            label={`${t.description} *`}
            value={form.description}
            onChange={(e) => {
              setForm({ ...form, description: e.target.value });
              setDescriptionError("");
            }}
            required
            error={descriptionError}
          />
        </div>
      </Modal>
    </div>
  );
}
