import { useState, useEffect, useCallback } from "react";
import api from "../../lib/api";
import { useDebouncedValue, isAbortError, useWorkplaces } from "../../hooks";
import { notify } from "../../lib/notify";
import { getFriendlyErrorMessage } from "../../lib/messages";
import { getSuccessMessages } from "../../lib/success-messages";
import { useI18n } from "../../i18n/context";
import { PageHeader } from "../../components/ui/PageHeader";
import { Button } from "../../components/ui/Button";
import { Input } from "../../components/ui/Input";
import { Select } from "../../components/ui/Select";
import { Table } from "../../components/ui/Table";
import { Pagination } from "../../components/ui/Pagination";
import { StatusChip } from "../../components/ui/StatusChip";
import { Modal } from "../../components/ui/Modal";
import { LoadingSpinner } from "../../components/ui/LoadingSpinner";
import { EmptyState } from "../../components/ui/EmptyState";
import type { Employee, Role } from "../../types";

interface EmployeeForm {
  name: string;
  username: string;
  role: Role | "";
  password: string;
  workplaceId: string;
}

const emptyForm: EmployeeForm = { name: "", username: "", role: "", password: "", workplaceId: "" };

export default function Employees() {
  const { t } = useI18n();
  const SUCCESS_MESSAGES = getSuccessMessages(t);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const { data: workplaces = [] } = useWorkplaces();
  const [meta, setMeta] = useState({ page: 1, totalPages: 1, total: 0, limit: 20 });
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebouncedValue(search, 300);
  const [roleFilter, setRoleFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [page, setPage] = useState(1);

  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Employee | null>(null);
  const [form, setForm] = useState<EmployeeForm>(emptyForm);
  const [saving, setSaving] = useState(false);
  const [nameError, setNameError] = useState("");
  const [usernameError, setUsernameError] = useState("");
  const [roleError, setRoleError] = useState("");
  const [passwordError, setPasswordError] = useState("");

  const [confirmOpen, setConfirmOpen] = useState(false);
  const [deactivating, setDeactivating] = useState<Employee | null>(null);

  const [resetOpen, setResetOpen] = useState(false);
  const [resetting, setResetting] = useState<Employee | null>(null);
  const [newPassword, setNewPassword] = useState("");
  const [newPasswordError, setNewPasswordError] = useState("");

  const fetchEmployees = useCallback(async (signal?: AbortSignal) => {
    setLoading(true);
    try {
      const params: Record<string, string | number> = { page, limit: 20 };
      if (debouncedSearch) params.search = debouncedSearch;
      if (roleFilter) params.role = roleFilter;
      if (statusFilter) params.isActive = statusFilter;
      const res = await api.get("/employees", { params, signal });
      setEmployees(res.data.data ?? res.data);
      setMeta(res.data.meta ?? { page: 1, totalPages: 1, total: 0, limit: 20 });
    } catch (err) {
      if (isAbortError(err)) return;
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }, [page, debouncedSearch, roleFilter, statusFilter]);

  useEffect(() => {
    const controller = new AbortController();
    void fetchEmployees(controller.signal);
    return () => controller.abort();
  }, [fetchEmployees]);

  const openCreate = () => {
    setEditing(null);
    setForm(emptyForm);
    setNameError("");
    setUsernameError("");
    setRoleError("");
    setPasswordError("");
    setModalOpen(true);
  };

  const openEdit = (emp: Employee) => {
    setEditing(emp);
    setForm({
      name: emp.name,
      username: emp.username,
      role: emp.role,
      password: "",
      workplaceId: emp.workplaceId != null ? String(emp.workplaceId) : "",
    });
    setNameError("");
    setUsernameError("");
    setRoleError("");
    setPasswordError("");
    setModalOpen(true);
  };

  const closeCreateModal = () => {
    setModalOpen(false);
    setNameError("");
    setUsernameError("");
    setRoleError("");
    setPasswordError("");
  };

  const isKiosk = form.role === "ATTENDANCE_KIOSK";
  const workplaceMissing = isKiosk && !form.workplaceId;

  const handleSave = async () => {
    let valid = true;

    if (!form.name.trim()) {
      setNameError(t.errors.common.required);
      valid = false;
    } else {
      setNameError("");
    }

    if (form.username.trim().length < 3) {
      setUsernameError(t.errors.common.minLength.replace("{n}", "3"));
      valid = false;
    } else {
      setUsernameError("");
    }

    if (!form.role) {
      setRoleError(t.errors.common.required);
      valid = false;
    } else {
      setRoleError("");
    }

    if (!editing && form.password.length < 8) {
      setPasswordError(t.errors.common.passwordLength);
      valid = false;
    } else {
      setPasswordError("");
    }

    if (workplaceMissing) valid = false;

    if (!valid) return;

    setSaving(true);
    try {
      const workplaceId = form.workplaceId ? Number(form.workplaceId) : undefined;
      if (editing) {
        await api.patch(`/employees/${editing.id}`, {
          name: form.name,
          username: form.username,
          role: form.role,
          ...(workplaceId !== undefined ? { workplaceId } : {}),
        });
        notify.success(SUCCESS_MESSAGES.employee.updated);
      } else {
        await api.post("/employees", {
          name: form.name,
          username: form.username,
          password: form.password,
          role: form.role,
          ...(workplaceId !== undefined ? { workplaceId } : {}),
        });
        notify.success(SUCCESS_MESSAGES.employee.added);
      }
      closeCreateModal();
      fetchEmployees();
    } catch (err) {
      notify.error(getFriendlyErrorMessage(err, t));
    } finally {
      setSaving(false);
    }
  };

  const handleDeactivate = async () => {
    if (!deactivating) return;
    try {
      await api.delete(`/employees/${deactivating.id}`);
      setConfirmOpen(false);
      setDeactivating(null);
      fetchEmployees();
      notify.warning(SUCCESS_MESSAGES.employee.deactivated);
    } catch (err) {
      notify.error(getFriendlyErrorMessage(err, t));
    }
  };

  const handleResetPassword = async () => {
    if (!resetting) return;
    if (newPassword.length < 8) {
      setNewPasswordError(t.errors.common.passwordLength);
      return;
    }
    setNewPasswordError("");
    try {
      await api.patch(`/employees/${resetting.id}/reset-password`, { newPassword });
      setResetOpen(false);
      setResetting(null);
      setNewPassword("");
      setNewPasswordError("");
      notify.success(SUCCESS_MESSAGES.employee.passwordReset);
    } catch (err) {
      notify.error(getFriendlyErrorMessage(err, t));
    }
  };

  const columns = [
    {
      key: "name",
      label: t.name,
      render: (r: Employee) => (
        <span style={{ fontWeight: 600 }}>{r.name}</span>
      ),
    },
    { key: "username", label: t.username },
    { key: "role", label: t.employees.role, render: (r: Employee) => <StatusChip status={r.role === "ADMIN" ? "APPROVED" : r.role === "SALES" ? "SOLD" : "AVAILABLE"} label={r.role === "ATTENDANCE_KIOSK" ? t.employees.attendanceKiosk : r.role} /> },
    {
      key: "workplace",
      label: t.employees.workplace,
      render: (r: Employee) => r.workplace?.name ?? "—",
    },
    {
      key: "isActive",
      label: t.status,
      render: (r: Employee) => <StatusChip status={r.isActive ? "ACTIVE" : "INACTIVE"} />,
    },
    { key: "createdAt", label: t.employees.created, render: (r: Employee) => new Date(r.createdAt).toLocaleDateString() },
    {
      key: "actions",
      label: "",
      render: (r: Employee) => (
        <div style={{ display: "flex", gap: "8px", justifyContent: "flex-end" }}>
          <Button variant="quiet" size="sm" onClick={() => openEdit(r)}>{t.edit}</Button>
          {r.isActive && (
            <Button variant="quiet" size="sm" style={{ color: "var(--accent)" }} onClick={() => { setDeactivating(r); setConfirmOpen(true); }}>
              {t.deactivate}
            </Button>
          )}
            <Button
              variant="quiet"
              size="sm"
              onClick={() => { setResetting(r); setNewPasswordError(""); setResetOpen(true); }}
            >
              {t.employees.resetPassword}
            </Button>
        </div>
      ),
    },
  ];

  return (
    <div>
      <PageHeader
        title={t.pages.employees}
        subtitle={t.pages.employeesSubtitle}
        actions={<Button onClick={openCreate}>{t.employees.addEmployee}</Button>}
      />

      <div className="toolbar">
        <div className="toolbar-grow">
          <Input
            placeholder={t.employees.searchPlaceholder}
            value={search}
            autoComplete="off"
            name="employee-search"
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
          />
        </div>
        <div className="toolbar-fixed">
          <Select
            options={[
              { label: t.employees.allRoles, value: "" },
              { label: t.employees.admin, value: "ADMIN" },
              { label: t.employees.sales, value: "SALES" },
              { label: t.employees.inventory, value: "INVENTORY" },
              { label: t.employees.accountant, value: "ACCOUNTANT" },
              { label: t.employees.attendanceKiosk, value: "ATTENDANCE_KIOSK" },
            ]}
            value={roleFilter}
            onChange={(e) => { setRoleFilter(e.target.value); setPage(1); }}
          />
        </div>
        <div className="toolbar-fixed">
          <Select
            options={[
              { label: t.employees.allStatus, value: "" },
              { label: t.active, value: "true" },
              { label: t.inactive, value: "false" },
            ]}
            value={statusFilter}
            onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}
          />
        </div>
      </div>

      {loading ? (
        <div className="state-block">
          <LoadingSpinner size={32} />
        </div>
      ) : employees.length === 0 ? (
        <EmptyState title={t.employees.noEmployees} description={t.employees.tryAdjusting} />
      ) : (
        <>
          <Table columns={columns} data={employees} keyExtractor={(r) => String(r.id)} />
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
        onClose={closeCreateModal}
        title={editing ? t.employees.editEmployee : t.employees.createEmployee}
        footer={
          <>
            <Button variant="secondary" onClick={closeCreateModal}>{t.cancel}</Button>
            <Button onClick={handleSave} loading={saving} disabled={workplaceMissing}>{editing ? t.save : t.create}</Button>
          </>
        }
      >
        <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
          <Input
            label={t.employees.fullName}
            value={form.name}
            name="employee-name"
            autoComplete="off"
            error={nameError}
            onChange={(e) => { setNameError(""); setForm({ ...form, name: e.target.value }); }}
          />
          <Input
            label={t.username}
            value={form.username}
            name="employee-username"
            autoComplete="username"
            error={usernameError}
            onChange={(e) => { setUsernameError(""); setForm({ ...form, username: e.target.value }); }}
          />
          <Select
            label={t.employees.role}
            options={[
              { label: t.employees.selectRole, value: "" },
              { label: t.employees.admin, value: "ADMIN" },
              { label: t.employees.sales, value: "SALES" },
              { label: t.employees.inventory, value: "INVENTORY" },
              { label: t.employees.accountant, value: "ACCOUNTANT" },
              { label: t.employees.attendanceKiosk, value: "ATTENDANCE_KIOSK" },
            ]}
            value={form.role}
            error={roleError}
            onChange={(e) => { setRoleError(""); setForm({ ...form, role: e.target.value as Role | "" }); }}
          />
          <Select
            label={t.employees.workplace}
            options={[
              { label: t.employees.selectWorkplace, value: "" },
              ...workplaces.map((w) => ({ label: w.name, value: String(w.id) })),
            ]}
            value={form.workplaceId}
            onChange={(e) => setForm({ ...form, workplaceId: e.target.value })}
            error={workplaceMissing ? t.employees.workplaceRequired : undefined}
          />
          {!editing && (
            <Input
              label={t.password}
              type="password"
              name="new-password"
              autoComplete="new-password"
              value={form.password}
              error={passwordError}
              onChange={(e) => { setPasswordError(""); setForm({ ...form, password: e.target.value }); }}
            />
          )}
        </div>
      </Modal>

      <Modal
        isOpen={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        title={t.employees.deactivateEmployee}
        footer={
          <>
            <Button variant="secondary" onClick={() => setConfirmOpen(false)}>{t.cancel}</Button>
            <Button variant="danger" onClick={handleDeactivate}>{t.deactivate}</Button>
          </>
        }
      >
        <p style={{ fontFamily: "'Manrope', sans-serif", fontSize: "14px", color: "var(--ink)" }}>
          {t.employees.deactivateConfirm} <strong>{deactivating?.name}</strong>? {t.employees.deactivateWarning}
        </p>
      </Modal>

      <Modal
        isOpen={resetOpen}
        onClose={() => { setResetOpen(false); setNewPassword(""); setNewPasswordError(""); }}
        title={t.employees.resetPasswordTitle}
        footer={
          <>
            <Button variant="secondary" onClick={() => { setResetOpen(false); setNewPassword(""); setNewPasswordError(""); }}>{t.cancel}</Button>
            <Button onClick={handleResetPassword} disabled={!newPassword}>{t.employees.resetPassword}</Button>
          </>
        }
      >
        <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
          <p style={{ fontFamily: "'Manrope', sans-serif", fontSize: "14px", color: "var(--soft)", margin: 0 }}>
            {t.employees.setNewPassword} <strong style={{ color: "var(--ink)" }}>{resetting?.name}</strong>
          </p>
          <Input
            label={t.employees.newPassword}
            type="password"
            name="new-password"
            autoComplete="new-password"
            value={newPassword}
            error={newPasswordError}
            onChange={(e) => { setNewPasswordError(""); setNewPassword(e.target.value); }}
          />
          {newPassword.length > 0 && newPassword.length < 8 && (
            <p style={{ fontFamily: "'Manrope', sans-serif", fontSize: "12px", color: "var(--accent)", margin: 0 }}>
              {t.employees.minimum8Characters}
            </p>
          )}
        </div>
      </Modal>
    </div>
  );
}