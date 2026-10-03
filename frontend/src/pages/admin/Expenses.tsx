import {
  useState,
  useEffect,
  useCallback,
  useMemo,
} from "react";

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
import DateRangePicker from "../../components/ui/DateRangePicker";

import { useI18n } from "../../i18n/context";
import type {
  Expense,
  ExpenseCategory,
} from "../../types";

interface ExpenseForm {
  categoryId: number | "";
  amount: string;
  date: string;
  description: string;
}

const PAGE_LIMIT = 20;

const getToday = () => {
  const now = new Date();

  const year = now.getFullYear();
  const month = String(
    now.getMonth() + 1
  ).padStart(2, "0");
  const day = String(
    now.getDate()
  ).padStart(2, "0");

  return `${year}-${month}-${day}`;
};

const createEmptyForm = (): ExpenseForm => ({
  categoryId: "",
  amount: "",
  date: getToday(),
  description: "",
});

const styles = `
  .expenses-page {
    width: 100%;
    min-height: 100%;
    box-sizing: border-box;
    background: var(--background);
    padding-bottom: 24px;
  }

  /* =====================================================
     SUMMARY
  ====================================================== */

  .expenses-summary {
    width: 100%;
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 12px;
    margin-bottom: var(--section-gap);
  }

  .expense-summary-card {
    min-width: 0;
    min-height: 72px;
    display: flex;
    align-items: center;
    gap: 11px;
    padding: 13px 15px;
    box-sizing: border-box;
    background: var(--card);
    border: 1px solid var(--border);
    border-radius: var(--radius-md);
    box-shadow: var(--shadow-sm);
    overflow: hidden;
  }

  .expense-summary-icon {
    width: 42px;
    height: 42px;
    flex: 0 0 42px;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 11px;
    background: var(--bg-inset);
    color: var(--ink);
    font-family: "Sora", sans-serif;
    font-size: 14px;
    font-weight: 700;
  }

  .expense-summary-content {
    min-width: 0;
    flex: 1 1 auto;
    overflow: hidden;
  }

  .expense-summary-label {
    margin-bottom: 4px;
    color: var(--soft);
    font-family: "Manrope", sans-serif;
    font-size: 11px;
    line-height: 1.2;
    font-weight: 600;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .expense-summary-value {
    color: var(--ink);
    font-family: "Sora", sans-serif;
    font-size: clamp(16px, 2vw, 21px);
    line-height: 1.2;
    font-weight: 700;
    font-variant-numeric: tabular-nums;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  /* =====================================================
     GENERIC SECTION
  ====================================================== */

  .expenses-section {
    width: 100%;
    min-width: 0;
    box-sizing: border-box;
    padding: 16px;
    background: var(--card);
    border: 1px solid var(--border);
    border-radius: var(--radius-md);
    box-shadow: var(--shadow-sm);
  }

  .expenses-section + .expenses-section {
    margin-top: var(--section-gap);
  }

  .expenses-section-header {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 14px;
    margin-bottom: 16px;
    flex-wrap: wrap;
  }

  .expenses-heading {
    min-width: 0;
    flex: 1 1 220px;
  }

  .expenses-heading-title {
    margin: 0;
    color: var(--ink);
    font-family: "Sora", sans-serif;
    font-size: 16px;
    line-height: 1.3;
    font-weight: 650;
  }

  .expenses-heading-subtitle {
    margin: 5px 0 0;
    color: var(--soft);
    font-family: "Manrope", sans-serif;
    font-size: 12px;
    line-height: 1.45;
  }

  /* =====================================================
     FILTERS
  ====================================================== */

  .expenses-filter-section {
    margin-top: var(--section-gap);
  }

  .expenses-filter-content {
    display: flex;
    align-items: center;
    justify-content: flex-end;
    gap: 8px;
    flex: 1 1 auto;
    min-width: 0;
  }

  .expenses-filter-picker {
    min-width: 0;
    flex: 0 1 auto;
  }

  .expenses-filter-clear {
    flex-shrink: 0;
  }

  /* =====================================================
     TABLE
  ====================================================== */

  .expenses-table-shell {
    width: 100%;
    min-width: 0;
    overflow-x: auto;
    overflow-y: hidden;
    -webkit-overflow-scrolling: touch;
    overscroll-behavior-x: contain;
    scrollbar-width: thin;
    border: 1px solid var(--border);
    border-radius: 12px;
    background: var(--card);
  }

  .expenses-table-shell > * {
    min-width: 760px;
  }

  .expense-category-badge {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    max-width: 180px;
    min-width: 0;
    padding: 5px 8px;
    box-sizing: border-box;
    border-radius: 8px;
    background: var(--bg-inset);
    color: var(--ink);
    font-family: "Manrope", sans-serif;
    font-size: 12px;
    font-weight: 700;
    white-space: nowrap;
  }

  .expense-category-dot {
    width: 6px;
    height: 6px;
    flex: 0 0 6px;
    border-radius: 999px;
    background: currentColor;
    opacity: 0.55;
  }

  .expense-category-text {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .expense-amount {
    display: inline-block;
    min-width: 90px;
    color: var(--ink);
    font-family: "Sora", sans-serif;
    font-size: 13px;
    line-height: 1.2;
    font-weight: 700;
    font-variant-numeric: tabular-nums;
    white-space: nowrap;
    text-align: end;
  }

  .expense-date,
  .expense-employee {
    color: var(--soft);
    font-family: "Manrope", sans-serif;
    font-size: 12px;
    white-space: nowrap;
  }

  .expense-employee {
    color: var(--ink);
  }

  .expense-description {
    display: block;
    max-width: 280px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    color: var(--ink);
    font-family: "Manrope", sans-serif;
    font-size: 12px;
  }

  .expense-actions {
    display: flex;
    align-items: center;
    justify-content: flex-end;
    gap: 2px;
    white-space: nowrap;
  }

  .expenses-pagination {
    margin-top: 16px;
    padding-top: 14px;
    border-top: 1px solid var(--border);
  }

  /* =====================================================
     CATEGORY MANAGEMENT
  ====================================================== */

  .categories-grid {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 10px;
  }

  .category-item {
    min-width: 0;
    min-height: 60px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 9px;
    padding: 10px 11px;
    box-sizing: border-box;
    border: 1px solid var(--border);
    border-radius: 11px;
    background: var(--card);
  }

  .category-info {
    min-width: 0;
    display: flex;
    align-items: center;
    gap: 8px;
    flex: 1 1 auto;
    overflow: hidden;
  }

  .category-icon {
    width: 31px;
    height: 31px;
    flex: 0 0 31px;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 8px;
    background: var(--bg-inset);
    color: var(--soft);
    font-size: 12px;
  }

  .category-name {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    color: var(--ink);
    font-family: "Manrope", sans-serif;
    font-size: 13px;
    font-weight: 650;
  }

  .category-actions {
    display: flex;
    align-items: center;
    gap: 0;
    flex-shrink: 0;
  }

  /* =====================================================
     STATES
  ====================================================== */

  .expenses-state {
    min-height: 180px;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .categories-empty {
    padding: 28px 16px;
    text-align: center;
    border-radius: var(--radius-sm);
    background: var(--surface);
    border: 1px dashed var(--border);
  }

  .categories-empty-icon {
    width: 42px;
    height: 42px;
    margin: 0 auto 10px;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 11px;
    background: var(--bg-inset);
    color: var(--soft);
    font-size: 18px;
  }

  .categories-empty-text {
    margin: 0;
    color: var(--ink);
    font-family: "Manrope", sans-serif;
    font-size: 13px;
    font-weight: 600;
  }

  /* =====================================================
     MODALS
  ====================================================== */

  .expenses-form-grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 12px;
  }

  .expenses-form-full {
    grid-column: 1 / -1;
    min-width: 0;
  }

  /* =====================================================
     TABLET
  ====================================================== */

  @media (max-width: 1100px) {
    .categories-grid {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }

    .expenses-filter-content {
      width: 100%;
      justify-content: flex-start;
    }
  }

  /* =====================================================
     MOBILE
  ====================================================== */

  @media (max-width: 760px) {
    .expenses-page {
      padding-bottom: 16px;
    }

    .expenses-summary {
      gap: 8px;
    }

    .expense-summary-card {
      min-height: 64px;
      padding: 10px 11px;
      gap: 9px;
    }

    .expense-summary-icon {
      width: 34px;
      height: 34px;
      flex-basis: 34px;
      border-radius: 9px;
      font-size: 12px;
    }

    .expense-summary-label {
      font-size: 10px;
    }

    .expense-summary-value {
      font-size: 15px;
    }

    .expenses-section {
      padding: 13px;
    }

    .expenses-section-header {
      gap: 10px;
      margin-bottom: 13px;
    }

    .expenses-heading {
      flex: 1 1 100%;
    }

    .expenses-filter-content {
      width: 100%;
      display: flex;
      align-items: center;
      justify-content: flex-start;
      gap: 7px;
      overflow-x: auto;
      scrollbar-width: none;
      -webkit-overflow-scrolling: touch;
    }

    .expenses-filter-content::-webkit-scrollbar {
      display: none;
    }

    .expenses-filter-picker {
      flex: 0 0 auto;
    }

    .expenses-filter-clear {
      flex: 0 0 auto;
    }

    .categories-grid {
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 8px;
    }

    .category-item {
      min-height: 56px;
      padding: 8px 9px;
      gap: 5px;
    }

    .category-info {
      gap: 6px;
    }

    .category-icon {
      width: 28px;
      height: 28px;
      flex-basis: 28px;
      border-radius: 7px;
      font-size: 11px;
    }

    .category-name {
      font-size: 12px;
    }

    .category-actions button {
      padding-left: 6px;
      padding-right: 6px;
    }

    .expenses-form-grid {
      grid-template-columns: 1fr;
    }

    .expenses-form-full {
      grid-column: auto;
    }
  }

  /* =====================================================
     SMALL PHONES
  ====================================================== */

  @media (max-width: 560px) {
    .expenses-summary {
      grid-template-columns: repeat(3, minmax(0, 1fr));
      gap: 7px;
    }

    .expense-summary-card {
      display: block;
      min-height: 64px;
      padding: 9px;
    }

    .expense-summary-icon {
      display: none;
    }

    .expense-summary-content {
      width: 100%;
    }

    .expense-summary-label {
      margin-bottom: 5px;
      font-size: 9px;
    }

    .expense-summary-value {
      font-size: 13px;
    }

    .expenses-section {
      padding: 11px;
      border-radius: 11px;
    }

    .expenses-heading-title {
      font-size: 15px;
    }

    .expenses-heading-subtitle {
      margin-top: 4px;
      font-size: 11px;
    }

    .expenses-table-shell {
      border-radius: 10px;
    }

    .expense-category-badge {
      max-width: 150px;
      font-size: 11px;
      padding: 4px 7px;
    }

    .expense-amount {
      min-width: 82px;
      font-size: 12px;
    }

    .expense-date,
    .expense-employee,
    .expense-description {
      font-size: 11px;
    }

    .expense-description {
      max-width: 220px;
    }

    .expenses-pagination {
      margin-top: 12px;
      padding-top: 12px;
    }

    .category-actions button {
      font-size: 11px;
      padding-left: 5px;
      padding-right: 5px;
    }
  }

  /* =====================================================
     EXTRA SMALL
  ====================================================== */

  @media (max-width: 390px) {
    .expenses-summary {
      gap: 5px;
    }

    .expense-summary-card {
      padding: 8px 7px;
    }

    .expense-summary-label {
      font-size: 8.5px;
    }

    .expense-summary-value {
      font-size: 12px;
    }

    .category-item {
      padding: 7px;
    }

    .category-name {
      font-size: 11px;
    }

    .category-actions button {
      font-size: 10px;
      padding-left: 4px;
      padding-right: 4px;
    }
  }
`;

export default function Expenses() {
  const { t } = useI18n();
  const SUCCESS_MESSAGES =
    getSuccessMessages(t);

  const [expenses, setExpenses] =
    useState<Expense[]>([]);

  const [categories, setCategories] =
    useState<ExpenseCategory[]>([]);

  const [meta, setMeta] = useState({
    page: 1,
    totalPages: 1,
    total: 0,
    limit: PAGE_LIMIT,
  });

  const [loading, setLoading] =
    useState(true);

  const [page, setPage] = useState(1);

  const [dateFrom, setDateFrom] =
    useState("");

  const [dateTo, setDateTo] =
    useState("");

  const [modalOpen, setModalOpen] =
    useState(false);

  const [editing, setEditing] =
    useState<Expense | null>(null);

  const [form, setForm] =
    useState<ExpenseForm>(
      createEmptyForm
    );

  const [saving, setSaving] =
    useState(false);

  const [categoryIdError, setCategoryIdError] =
    useState("");

  const [amountError, setAmountError] =
    useState("");

  const [descriptionError, setDescriptionError] =
    useState("");

  const [catModalOpen, setCatModalOpen] =
    useState(false);

  const [catForm, setCatForm] =
    useState("");

  const [catNameError, setCatNameError] =
    useState("");

  const [editingCat, setEditingCat] =
    useState<ExpenseCategory | null>(null);

  const [catSaving, setCatSaving] =
    useState(false);

  // =========================================================
  // FETCH EXPENSES
  // =========================================================

  const fetchExpenses = useCallback(
    async (signal?: AbortSignal) => {
      setLoading(true);

      try {
        const params: Record<
          string,
          string | number
        > = {
          page,
          limit: PAGE_LIMIT,
        };

        if (dateFrom) {
          params.from = dateFrom;
        }

        if (dateTo) {
          params.to = dateTo;
        }

        const res = await api.get(
          "/expenses",
          {
            params,
            signal,
          }
        );

        setExpenses(
          res.data.data ?? res.data
        );

        setMeta(
          res.data.meta ?? {
            page: 1,
            totalPages: 1,
            total: 0,
            limit: PAGE_LIMIT,
          }
        );
      } catch (err) {
        if (isAbortError(err)) {
          return;
        }
      } finally {
        if (!signal?.aborted) {
          setLoading(false);
        }
      }
    },
    [page, dateFrom, dateTo]
  );

  // =========================================================
  // FETCH CATEGORIES
  // =========================================================

  const fetchCategories =
    useCallback(
      async (signal?: AbortSignal) => {
        try {
          const res =
            await api.get(
              "/expense-categories",
              { signal }
            );

          setCategories(
            res.data.data ?? res.data
          );
        } catch (err) {
          if (isAbortError(err)) {
            return;
          }
        }
      },
      []
    );

  useEffect(() => {
    const controller =
      new AbortController();

    void fetchExpenses(
      controller.signal
    );

    return () =>
      controller.abort();
  }, [fetchExpenses]);

  useEffect(() => {
    const controller =
      new AbortController();

    void fetchCategories(
      controller.signal
    );

    return () =>
      controller.abort();
  }, [fetchCategories]);

  // =========================================================
  // EXPENSE MODAL
  // =========================================================

  const openCreate = useCallback(() => {
    setEditing(null);
    setForm(createEmptyForm());
    setCategoryIdError("");
    setAmountError("");
    setDescriptionError("");
    setModalOpen(true);
  }, []);

  const openEdit = useCallback(
    (expense: Expense) => {
      setEditing(expense);

      setForm({
        categoryId: expense.categoryId,
        amount: String(
          expense.amount
        ),
        date:
          expense.date.slice(0, 10),
        description:
          expense.description ?? "",
      });

      setCategoryIdError("");
      setAmountError("");
      setDescriptionError("");
      setModalOpen(true);
    },
    []
  );

  const closeExpenseModal =
    useCallback(() => {
      if (saving) return;

      setModalOpen(false);
      setEditing(null);
      setForm(createEmptyForm());
      setCategoryIdError("");
      setAmountError("");
      setDescriptionError("");
    }, [saving]);

  const handleSave = async () => {
    const parsedAmount =
      Number(form.amount);

    if (!form.categoryId) {
      setCategoryIdError(
        t.errors.common.required
      );
    } else {
      setCategoryIdError("");
    }

    if (
      !form.amount ||
      !Number.isFinite(parsedAmount)
    ) {
      setAmountError(
        t.errors.common.invalidNumber
      );
    } else if (parsedAmount <= 0) {
      setAmountError(
        t.errors.common.greaterThanZero
      );
    } else {
      setAmountError("");
    }

    if (!form.description.trim()) {
      setDescriptionError(
        t.errors.common.required
      );
    } else {
      setDescriptionError("");
    }

    if (
      !form.categoryId ||
      !form.amount ||
      !Number.isFinite(parsedAmount) ||
      parsedAmount <= 0 ||
      !form.description.trim()
    ) {
      return;
    }

    setSaving(true);

    try {
      const payload = {
        categoryId: Number(
          form.categoryId
        ),
        amount: parsedAmount,
        date: form.date,
        description:
          form.description.trim(),
      };

      if (editing) {
        await api.patch(
          `/expenses/${editing.id}`,
          payload
        );

        notify.success(
          SUCCESS_MESSAGES.expense
            .updated
        );
      } else {
        await api.post(
          "/expenses",
          payload
        );

        notify.success(
          SUCCESS_MESSAGES.expense
            .added
        );
      }

      setModalOpen(false);
      setEditing(null);
      setForm(createEmptyForm());

      await fetchExpenses();
    } catch (err) {
      notify.error(getFriendlyErrorMessage(err, t));
    } finally {
      setSaving(false);
    }
  };

  const handleDelete =
    async (id: number) => {
      if (
        !window.confirm(
          t.expenses.deleteConfirm
        )
      ) {
        return;
      }

      try {
        await api.delete(
          `/expenses/${id}`
        );

        await fetchExpenses();

        notify.warning(
          SUCCESS_MESSAGES.expense
            .deleted
        );
      } catch (err) {
        notify.error(getFriendlyErrorMessage(err, t));
      }
    };

  // =========================================================
  // CATEGORY ACTIONS
  // =========================================================

  const openCatCreate =
    useCallback(() => {
      setEditingCat(null);
      setCatForm("");
      setCatNameError("");
      setCatModalOpen(true);
    }, []);

  const openCatEdit =
    useCallback(
      (cat: ExpenseCategory) => {
        setEditingCat(cat);
        setCatForm(cat.name);
        setCatNameError("");
        setCatModalOpen(true);
      },
      []
    );

  const closeCategoryModal =
    useCallback(() => {
      if (catSaving) return;

      setCatModalOpen(false);
      setEditingCat(null);
      setCatForm("");
      setCatNameError("");
    }, [catSaving]);

  const handleCatSave =
    async () => {
      if (
        catForm.trim().length < 2
      ) {
        setCatNameError(
          t.errors.common.minLength.replace(
            "{n}",
            "2"
          )
        );
        return;
      }

      setCatNameError("");
      setCatSaving(true);

      try {
        if (editingCat) {
          await api.patch(
            `/expense-categories/${editingCat.id}`,
            {
              name: catForm.trim(),
            }
          );

          notify.success(
            SUCCESS_MESSAGES
              .expenseCategory
              .updated
          );
        } else {
          await api.post(
            "/expense-categories",
            {
              name: catForm.trim(),
            }
          );

          notify.success(
            SUCCESS_MESSAGES
              .expenseCategory
              .added
          );
        }

        setCatModalOpen(false);
        setEditingCat(null);
        setCatForm("");

        await fetchCategories();
      } catch (err) {
        notify.error(getFriendlyErrorMessage(err, t));
      } finally {
        setCatSaving(false);
      }
    };

  const handleCatDelete =
    async (id: number) => {
      if (
        !window.confirm(
          t.inventory
            .deleteCategoryConfirm
        )
      ) {
        return;
      }

      try {
        await api.delete(
          `/expense-categories/${id}`
        );

        await fetchCategories();

        notify.warning(
          SUCCESS_MESSAGES
            .expenseCategory
            .deleted
        );
      } catch (err) {
        notify.error(getFriendlyErrorMessage(err, t));
      }
    };

  // =========================================================
  // HELPERS
  // =========================================================

  const fmt = useCallback(
    (value: number) =>
      Number(value || 0).toLocaleString(
        "en-US",
        {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        }
      ),
    []
  );

  const formatDate =
    useCallback((value: string) => {
      const date = new Date(value);

      if (
        Number.isNaN(date.getTime())
      ) {
        return "—";
      }

      return date.toLocaleDateString(
        undefined,
        {
          year: "numeric",
          month: "short",
          day: "2-digit",
        }
      );
    }, []);

  const pageAmount = useMemo(
    () =>
      expenses.reduce(
        (total, expense) =>
          total +
          Number(
            expense.amount || 0
          ),
        0
      ),
    [expenses]
  );

  // =========================================================
  // TABLE COLUMNS
  // =========================================================

  const columns = useMemo(
    () => [
      
        {
        key: "description",
        label: t.description,

        render: (r: Expense) => (
          <span
            className="expense-description"
            title={r.description || ""}
          >
            {r.description || "—"}
          </span>
        ),
      },
      {
        key: "categoryName",
        label:
          t.expenses.category ||
          "Category",

        render: (r: Expense) => (
          <span className="expense-category-badge">
            <span
              className="expense-category-dot"
              aria-hidden="true"
            />

            <span className="expense-category-text">
              {r.category?.name ??
                "—"}
            </span>
          </span>
        ),
      },

      {
        key: "amount",
        label:
          t.expenses.amount ||
          "Amount",

        align: "right" as const,

        render: (r: Expense) => (
          <span className="expense-amount">
            {t.currency}{" "}
            {fmt(r.amount)}
          </span>
        ),
      },

      {
        key: "date",
        label: t.date,

        render: (r: Expense) => (
          <span className="expense-date">
            {formatDate(r.date)}
          </span>
        ),
      },

    

      {
        key: "employeeName",
        label:
          t.invoices.employee,

        render: (r: Expense) => (
          <span className="expense-employee">
            {r.employee?.name ??
              "—"}
          </span>
        ),
      },

      {
        key: "actions",
        label: "",

        render: (r: Expense) => (
          <div className="expense-actions">
            <Button
              variant="quiet"
              size="sm"
              onClick={() =>
                openEdit(r)
              }
            >
              {t.edit}
            </Button>

            <Button
              variant="quiet"
              size="sm"
              style={{
                color:
                  "var(--accent)",
              }}
              onClick={() =>
                handleDelete(r.id)
              }
            >
              {t.delete}
            </Button>
          </div>
        ),
      },
    ],
    [
      t,
      fmt,
      formatDate,
      openEdit,
    ]
  );

  return (
    <div className="expenses-page">
      <style>{styles}</style>

      {/* =====================================================
          PAGE HEADER
      ====================================================== */}

      <PageHeader
        title={t.pages.expenses}
        subtitle={
          t.pages.expensesSubtitle
        }
        actions={
          <Button onClick={openCreate}>
            +{" "}
            {t.expenses.addExpense ||
              "Add Expense"}
          </Button>
        }
      />

      {/* =====================================================
          SUMMARY
      ====================================================== */}

      <div className="expenses-summary">
        <div className="expense-summary-card">
          <div className="expense-summary-icon">
            {t.currency}
          </div>

          <div className="expense-summary-content">
            <div className="expense-summary-label">
              Page Total
            </div>

            <div className="expense-summary-value">
              {t.currency}{" "}
              {fmt(pageAmount)}
            </div>
          </div>
        </div>

        <div className="expense-summary-card">
          <div className="expense-summary-icon">
            #
          </div>

          <div className="expense-summary-content">
            <div className="expense-summary-label">
              Total Records
            </div>

            <div className="expense-summary-value">
              {meta.total}
            </div>
          </div>
        </div>

        <div className="expense-summary-card">
          <div className="expense-summary-icon">
            ◈
          </div>

          <div className="expense-summary-content">
            <div className="expense-summary-label">
              {t.inventory.categories}
            </div>

            <div className="expense-summary-value">
              {categories.length}
            </div>
          </div>
        </div>
      </div>

      {/* =====================================================
          FILTERS
      ====================================================== */}

      <section className="expenses-section expenses-filter-section">
        <div className="expenses-section-header">
          <div className="expenses-heading">
            <h3 className="expenses-heading-title">
              Filters
            </h3>

            <p className="expenses-heading-subtitle">
              Filter your expenses by
              date range.
            </p>
          </div>

          <div className="expenses-filter-content">
            <div className="expenses-filter-picker">
              <DateRangePicker
                from={dateFrom}
                to={dateTo}
                onChange={(
                  from,
                  to
                ) => {
                  setDateFrom(from);
                  setDateTo(to);
                  setPage(1);
                }}
              />
            </div>

            {(dateFrom ||
              dateTo) && (
              <div className="expenses-filter-clear">
                <Button
                  variant="quiet"
                  size="sm"
                  onClick={() => {
                    setDateFrom("");
                    setDateTo("");
                    setPage(1);
                  }}
                >
                  Clear
                </Button>
              </div>
            )}
          </div>
        </div>
      </section>

      {/* =====================================================
          EXPENSES TABLE
      ====================================================== */}

      <section className="expenses-section">
        <div className="expenses-section-header">
          <div className="expenses-heading">
            <h3 className="expenses-heading-title">
              {t.pages.expenses}
            </h3>

            <p className="expenses-heading-subtitle">
              {meta.total > 0
                ? `${meta.total} records`
                : "No expenses found."}
            </p>
          </div>
        </div>

        {loading ? (
          <div className="expenses-state">
            <LoadingSpinner size={28} />
          </div>
        ) : expenses.length ===
          0 ? (
          <div className="expenses-state">
            <EmptyState
              title={
                t.expenses
                  .noExpenses ||
                "No expenses found"
              }
              description={
                t.expenses
                  .addFirst ||
                "Add your first expense to get started"
              }
              action={
                <Button
                  onClick={
                    openCreate
                  }
                >
                  {t.expenses
                    .addExpense ||
                    "Add Expense"}
                </Button>
              }
            />
          </div>
        ) : (
          <>
            <div className="expenses-table-shell">
              <Table
                columns={columns}
                data={expenses}
                keyExtractor={(r) =>
                  String(r.id)
                }
              />
            </div>

            <div className="expenses-pagination">
              <Pagination
                currentStart={
                  meta.total > 0
                    ? (meta.page - 1) *
                        meta.limit +
                      1
                    : 0
                }
                currentEnd={Math.min(
                  meta.page *
                    meta.limit,
                  meta.total
                )}
                total={meta.total}
                currentPage={
                  meta.page
                }
                totalPages={
                  meta.totalPages
                }
                onPrev={() =>
                  setPage((p) =>
                    Math.max(
                      1,
                      p - 1
                    )
                  )
                }
                onNext={() =>
                  setPage((p) =>
                    Math.min(
                      meta.totalPages,
                      p + 1
                    )
                  )
                }
              />
            </div>
          </>
        )}
      </section>

      {/* =====================================================
          CATEGORY MANAGEMENT
      ====================================================== */}

      <section className="expenses-section">
        <div className="expenses-section-header">
          <div className="expenses-heading">
            <h3 className="expenses-heading-title">
              {t.inventory.categories}
            </h3>

            <p className="expenses-heading-subtitle">
              Manage the categories
              used by your
              expenses.
            </p>
          </div>

          <Button
            size="sm"
            onClick={openCatCreate}
          >
            +{" "}
            {t.expenses.addCategory ||
              "Add Category"}
          </Button>
        </div>

        {categories.length ===
        0 ? (
          <div className="categories-empty">
            <div className="categories-empty-icon">
              ◈
            </div>

            <p className="categories-empty-text">
              {t.inventory
                .noCategories}
            </p>
          </div>
        ) : (
          <div className="categories-grid">
            {categories.map(
              (cat) => (
                <div
                  key={cat.id}
                  className="category-item"
                >
                  <div className="category-info">
                    <div className="category-icon">
                      ◈
                    </div>

                    <span
                      className="category-name"
                      title={cat.name}
                    >
                      {cat.name}
                    </span>
                  </div>

                  <div className="category-actions">
                    <Button
                      variant="quiet"
                      size="sm"
                      onClick={() =>
                        openCatEdit(
                          cat
                        )
                      }
                    >
                      {t.edit}
                    </Button>

                    <Button
                      variant="quiet"
                      size="sm"
                      style={{
                        color:
                          "var(--accent)",
                      }}
                      onClick={() =>
                        handleCatDelete(
                          cat.id
                        )
                      }
                    >
                      {t.delete}
                    </Button>
                  </div>
                </div>
              )
            )}
          </div>
        )}
      </section>

      {/* =====================================================
          EXPENSE MODAL
      ====================================================== */}

      <Modal
        isOpen={modalOpen}
        onClose={
          closeExpenseModal
        }
        title={
          editing
            ? t.expenses
                .editExpense ||
              "Edit Expense"
            : t.expenses
                .addExpense ||
              "Add Expense"
        }
        footer={
          <>
            <Button
              variant="secondary"
              onClick={
                closeExpenseModal
              }
              disabled={saving}
            >
              {t.cancel}
            </Button>

            <Button
              onClick={
                handleSave
              }
              loading={saving}
            >
              {editing
                ? t.save
                : t.create}
            </Button>
          </>
        }
      >
        <div className="expenses-form-grid">
          <div className="expenses-form-full">
            <Select
              label={
                t.expenses
                  .category ||
                "Category"
              }
              options={[
                {
                  label:
                    t.expenses
                      .selectCategory ||
                    "Select category...",
                  value: "",
                },
                ...categories.map(
                  (c) => ({
                    label:
                      c.name,
                    value:
                      String(
                        c.id
                      ),
                  })
                ),
              ]}
              value={String(
                form.categoryId
              )}
              error={categoryIdError}
              onChange={(e) => {
                setCategoryIdError("");
                setForm({
                  ...form,
                  categoryId:
                    e.target
                      .value
                      ? Number(
                          e.target
                            .value
                        )
                      : "",
                });
              }}
            />
          </div>

          <Input
            label={
              t.expenses.amount ||
              "Amount"
            }
            type="number"
            step="0.01"
            min="0"
            inputMode="decimal"
            value={form.amount}
            error={amountError}
            onChange={(e) => {
              setAmountError("");
              setForm({
                ...form,
                amount:
                  e.target
                    .value,
              });
            }}
          />

          <Input
            label={t.date}
            type="date"
            value={form.date}
            onChange={(e) =>
              setForm({
                ...form,
                date:
                  e.target
                    .value,
              })
            }
          />

          <div className="expenses-form-full">
            <Input
              label={`${t.description} *`}
              value={
                form.description
              }
              error={descriptionError}
              onChange={(e) => {
                setDescriptionError("");
                setForm({
                  ...form,
                  description:
                    e.target
                      .value,
                });
              }}
              required
            />
          </div>
        </div>
      </Modal>

      {/* =====================================================
          CATEGORY MODAL
      ====================================================== */}

      <Modal
        isOpen={catModalOpen}
        onClose={
          closeCategoryModal
        }
        title={
          editingCat
            ? t.inventory
                .editCategory
            : t.inventory
                .newCategory
        }
        footer={
          <>
            <Button
              variant="secondary"
              onClick={
                closeCategoryModal
              }
              disabled={catSaving}
            >
              {t.cancel}
            </Button>

            <Button
              onClick={
                handleCatSave
              }
              loading={catSaving}
            >
              {editingCat
                ? t.save
                : t.create}
            </Button>
          </>
        }
      >
        <Input
          label={
            t.inventory
              .categoryName
          }
          value={catForm}
          error={catNameError}
          onChange={(e) => {
            setCatNameError("");
            setCatForm(
              e.target.value
            );
          }}
          placeholder={
            t.expenses
              .categoryPlaceholder
          }
        />
      </Modal>
    </div>
  );
}