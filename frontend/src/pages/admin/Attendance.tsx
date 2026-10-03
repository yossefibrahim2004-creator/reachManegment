import { useState, useEffect, useCallback } from "react";
import api from "../../lib/api";
import { useDebouncedValue, isAbortError } from "../../hooks";
import { notify } from "../../lib/notify";
import { getSuccessMessages } from "../../lib/success-messages";
import { PageHeader } from "../../components/ui/PageHeader";
import { Button } from "../../components/ui/Button";
import { Input } from "../../components/ui/Input";
import { Table } from "../../components/ui/Table";
import { Modal } from "../../components/ui/Modal";
import { LoadingSpinner } from "../../components/ui/LoadingSpinner";
import { EmptyState } from "../../components/ui/EmptyState";
import { useI18n } from "../../i18n/context";
import type { Attendance } from "../../types";

function toLocalInputValue(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export default function Attendance() {
  const { t } = useI18n();
  const SUCCESS_MESSAGES = getSuccessMessages(t);
  const [records, setRecords] = useState<Attendance[]>([]);
  const [loading, setLoading] = useState(true);
  const [employeeFilter, setEmployeeFilter] = useState("");
  const debouncedEmployeeFilter = useDebouncedValue(employeeFilter, 300);
  const [dateFilter, setDateFilter] = useState(() => new Date().toISOString().slice(0, 10));

  const [correcting, setCorrecting] = useState<Attendance | null>(null);
  const [checkInInput, setCheckInInput] = useState("");
  const [checkOutInput, setCheckOutInput] = useState("");
  const [reason, setReason] = useState("");
  const [reasonError, setReasonError] = useState("");
  const [saving, setSaving] = useState(false);

  const fetchAttendance = useCallback(async (signal?: AbortSignal) => {
    setLoading(true);
    try {
      const params: Record<string, string> = {};
      if (debouncedEmployeeFilter) params.employeeId = debouncedEmployeeFilter;
      if (dateFilter) {
        params.startDate = dateFilter;
        params.endDate = dateFilter;
      }
      const res = await api.get("/attendance", { params, signal });
      setRecords(res.data.data ?? res.data);
    } catch (err) {
      if (isAbortError(err)) return;
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }, [debouncedEmployeeFilter, dateFilter]);

  useEffect(() => {
    const controller = new AbortController();
    void fetchAttendance(controller.signal);
    return () => controller.abort();
  }, [fetchAttendance]);

  const openCorrect = (r: Attendance) => {
    setCorrecting(r);
    setCheckInInput(toLocalInputValue(r.checkIn));
    setCheckOutInput(toLocalInputValue(r.checkOut));
    setReason("");
    setReasonError("");
  };

  const handleCorrect = async () => {
    if (!correcting) return;
    if (reason.trim().length < 5) {
      setReasonError(t.adminAttendance.reasonRequired);
      return;
    }
    setSaving(true);
    try {
      const payload: Record<string, string> = { reason: reason.trim() };
      if (checkInInput) payload.checkIn = new Date(checkInInput).toISOString();
      if (checkOutInput) payload.checkOut = new Date(checkOutInput).toISOString();
      await api.patch(`/attendance/${correcting.id}/correct`, payload);
      notify.success(SUCCESS_MESSAGES.attendance.corrected);
      setCorrecting(null);
      fetchAttendance();
    } catch (err) {
      notify.error(
        (err as { response?: { data?: { message?: string } } })?.response?.data?.message ||
          t.errors.common.unexpectedError,
      );
    } finally {
      setSaving(false);
    }
  };

  const formatHours = (checkIn: string, checkOut: string | null) => {
    const start = new Date(checkIn).getTime();
    const end = checkOut ? new Date(checkOut).getTime() : Date.now();
    const hours = (end - start) / (1000 * 60 * 60);
    return hours.toFixed(1) + "h";
  };

  const totalHours = records.reduce((sum, r) => {
    const start = new Date(r.checkIn).getTime();
    const end = r.checkOut ? new Date(r.checkOut).getTime() : Date.now();
    return sum + (end - start) / (1000 * 60 * 60);
  }, 0);

  const columns = [
    {
      key: "employeeName",
      label: t.invoices.employee,
      render: (r: Attendance) => (
        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <span>{r.employee?.name ?? "—"}</span>
          {!r.checkOut && (
            <span style={{ width: 8, height: 8, borderRadius: "50%", backgroundColor: "var(--mint)", display: "inline-block" }} title={t.adminAttendance.activeSession} />
          )}
        </div>
      ),
    },
    {
      key: "checkIn",
      label: t.adminAttendance.checkIn,
      render: (r: Attendance) => new Date(r.checkIn).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
    },
    {
      key: "checkOut",
      label: t.adminAttendance.checkOut,
      render: (r: Attendance) =>
        r.checkOut ? (
          new Date(r.checkOut).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
        ) : (
          <span style={{ color: "var(--mint)", fontWeight: 600, fontSize: "12px" }}>{t.adminAttendance.inProgress}</span>
        ),
    },
    {
      key: "hours",
      label: t.adminAttendance.hours,
      align: "right" as const,
      render: (r: Attendance) => (
        <span style={{ fontVariantNumeric: "tabular-nums" }}>{formatHours(r.checkIn, r.checkOut)}</span>
      ),
    },
    {
      key: "actions",
      label: "",
      render: (r: Attendance) => (
        <div style={{ display: "flex", justifyContent: "flex-end" }}>
          <Button variant="quiet" size="sm" onClick={() => openCorrect(r)}>
            {t.adminAttendance.correct}
          </Button>
        </div>
      ),
    },
  ];

  return (
    <div>
      <PageHeader title={t.pages.attendance} subtitle={t.pages.attendanceSubtitle} />

      <div className="toolbar" style={{ marginBottom: "var(--section-gap)" }}>
        <div className="toolbar-fixed">
          <Input label={t.adminAttendance.employeeId} placeholder={t.adminAttendance.filterByEmployee} value={employeeFilter} onChange={(e) => setEmployeeFilter(e.target.value)} />
        </div>
        <div className="toolbar-fixed">
          <Input type="date" label={t.date} value={dateFilter} onChange={(e) => setDateFilter(e.target.value)} />
        </div>
      </div>

      {loading ? (
        <div className="state-block">
          <LoadingSpinner size={32} />
        </div>
      ) : records.length === 0 ? (
        <EmptyState title={t.adminAttendance.noRecords} description={t.adminAttendance.noRecordsHint} />
      ) : (
        <>
          <Table columns={columns} data={records} keyExtractor={(r) => String(r.id)} />

          <div style={{ marginTop: "16px", display: "flex", justifyContent: "flex-end" }}>
            <div style={{ backgroundColor: "var(--card)", border: "1px solid var(--border)", borderRadius: "var(--radius-sm)", padding: "12px 16px", display: "flex", alignItems: "center", gap: "12px" }}>
              <span style={{ fontFamily: "'Manrope', sans-serif", fontSize: "13px", color: "var(--soft)" }}>{t.adminAttendance.totalHours}</span>
              <span style={{ fontFamily: "'Sora', sans-serif", fontSize: "18px", fontWeight: 700, color: "var(--ink)", fontVariantNumeric: "tabular-nums" }}>
                {totalHours.toFixed(1)}h
              </span>
            </div>
          </div>
        </>
      )}

      <Modal
        isOpen={!!correcting}
        onClose={() => setCorrecting(null)}
        title={t.adminAttendance.correctTitle}
        footer={
          <>
            <Button variant="secondary" onClick={() => setCorrecting(null)}>{t.cancel}</Button>
            <Button onClick={handleCorrect} loading={saving} disabled={reason.trim().length < 5}>
              {t.save}
            </Button>
          </>
        }
      >
        <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
          <p style={{ fontFamily: "'Manrope', sans-serif", fontSize: "14px", color: "var(--soft)", margin: 0 }}>
            {correcting?.employee?.name} · {correcting ? new Date(correcting.date).toLocaleDateString() : ""}
          </p>
          <Input
            label={t.adminAttendance.checkIn}
            type="datetime-local"
            value={checkInInput}
            onChange={(e) => setCheckInInput(e.target.value)}
          />
          <Input
            label={t.adminAttendance.checkOut}
            type="datetime-local"
            value={checkOutInput}
            onChange={(e) => setCheckOutInput(e.target.value)}
          />
          <Input
            label={t.adminAttendance.reason}
            placeholder={t.adminAttendance.reasonPlaceholder}
            value={reason}
            error={reasonError}
            onChange={(e) => {
              setReason(e.target.value);
              if (reasonError) setReasonError("");
            }}
          />
        </div>
      </Modal>
    </div>
  );
}
