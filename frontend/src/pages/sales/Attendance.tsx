import { useCallback, useEffect, useRef, useState } from "react";
import api from "../../lib/api";
import { isAbortError } from "../../hooks";
import { notify } from "../../lib/notify";
import { getFriendlyErrorMessage } from "../../lib/messages";
import { getSuccessMessages } from "../../lib/success-messages";
import { Button } from "../../components/ui/Button";
import { Card } from "../../components/ui/Card";
import { LoadingSpinner } from "../../components/ui/LoadingSpinner";
import { PageHeader } from "../../components/ui/PageHeader";
import { QrScanner } from "../../components/attendance/QrScanner";
import { useI18n } from "../../i18n/context";
import type { Attendance } from "../../types";

export default function Attendance() {
  const { t } = useI18n();
  const SUCCESS_MESSAGES = getSuccessMessages(t);
  const [attendance, setAttendance] = useState<Attendance | null>(null);
  const [loading, setLoading] = useState(true);
  const [scanning, setScanning] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [elapsed, setElapsed] = useState("00:00:00");
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const scanLockRef = useRef(false);

  const loadToday = useCallback(async (signal?: AbortSignal) => {
    try {
      const { data } = await api.get("/attendance/me/today", { signal });
      setAttendance(data);
    } catch (err) {
      if (isAbortError(err)) return;
      setAttendance(null);
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    void loadToday(controller.signal);
    return () => controller.abort();
  }, [loadToday]);

  const isCheckedIn = !!attendance && !attendance.checkOut;

  useEffect(() => {
    if (isCheckedIn && attendance?.checkIn) {
      const update = () => {
        const diff = Date.now() - new Date(attendance.checkIn).getTime();
        const h = Math.floor(diff / 3600000);
        const m = Math.floor((diff % 3600000) / 60000);
        const s = Math.floor((diff % 60000) / 1000);
        setElapsed(
          `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`
        );
      };
      update();
      timerRef.current = setInterval(update, 1000);
      return () => {
        if (timerRef.current) clearInterval(timerRef.current);
      };
    }
    setElapsed("00:00:00");
  }, [isCheckedIn, attendance?.checkIn]);

  const handleScan = useCallback(
    async (token: string) => {
      if (scanLockRef.current) return;
      scanLockRef.current = true;
      setSubmitting(true);
      try {
        const { data } = await api.post<Attendance>("/attendance/scan", { token });
        setAttendance(data);
        setScanning(false);
        const action = data.checkOut ? "checkedOut" : "checkedIn";
        notify.success(SUCCESS_MESSAGES.attendance[action]);
      } catch (err) {
        notify.error(getFriendlyErrorMessage(err, t));
      } finally {
        setSubmitting(false);
        scanLockRef.current = false;
      }
    },
    [SUCCESS_MESSAGES, t],
  );

  if (loading) {
    return (
      <div className="state-block">
        <LoadingSpinner size={32} />
      </div>
    );
  }

  return (
    <div>
      <PageHeader title={t.salesAttendance.myAttendance} subtitle={t.attendanceScanner.subtitle} />

      <div style={{ maxWidth: "520px", margin: "0 auto var(--section-gap)" }}>
        <Card>
          <div style={{ textAlign: "center", padding: "16px 0" }}>
            <div
              style={{
                width: "80px",
                height: "80px",
                borderRadius: "50%",
                backgroundColor: isCheckedIn ? "var(--mint-bg)" : "var(--peach-bg)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                margin: "0 auto 20px",
                border: `3px solid ${isCheckedIn ? "var(--mint)" : "var(--peach)"}`,
              }}
            >
              <svg
                width="32"
                height="32"
                viewBox="0 0 24 24"
                fill="none"
                stroke={isCheckedIn ? "var(--mint)" : "var(--peach)"}
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <circle cx="12" cy="12" r="10" />
                <polyline points="12 6 12 12 16 14" />
              </svg>
            </div>

            <h2
              style={{
                fontFamily: "'Sora', sans-serif",
                fontSize: "22px",
                fontWeight: 600,
                color: "var(--ink)",
                margin: "0 0 4px",
              }}
            >
              {isCheckedIn ? t.salesAttendance.checkedIn : t.salesAttendance.notCheckedIn}
            </h2>

            {isCheckedIn && (
              <p
                style={{
                  fontFamily: "'Sora', monospace",
                  fontSize: "36px",
                  fontWeight: 700,
                  color: "var(--ink)",
                  margin: "12px 0 0",
                  fontVariantNumeric: "tabular-nums",
                }}
              >
                {elapsed}
              </p>
            )}

            {attendance?.checkIn && (
              <p style={{ fontFamily: "'Manrope', sans-serif", fontSize: "13px", color: "var(--soft)", margin: "8px 0 0" }}>
                {t.salesAttendance.checkInTime} {new Date(attendance.checkIn).toLocaleTimeString()}
                {attendance.checkOut &&
                  ` · ${t.salesAttendance.checkOutTime} ${new Date(attendance.checkOut).toLocaleTimeString()}`}
              </p>
            )}

            {!scanning ? (
              <Button
                variant="primary"
                size="lg"
                loading={submitting}
                onClick={() => setScanning(true)}
                style={{ marginTop: "16px", width: "100%", maxWidth: "320px", minWidth: 0 }}
              >
                {t.attendanceScanner.recordAttendance}
              </Button>
            ) : (
              <div style={{ marginTop: "20px", textAlign: "start" }}>
                <p
                  style={{
                    fontFamily: "'Manrope', sans-serif",
                    fontSize: "14px",
                    color: "var(--soft)",
                    textAlign: "center",
                    margin: "0 0 12px",
                  }}
                >
                  {t.attendanceScanner.scanHint}
                </p>
                <QrScanner active={scanning} onScan={handleScan} />
                <Button
                  variant="secondary"
                  size="md"
                  style={{ marginTop: "12px", width: "100%" }}
                  onClick={() => setScanning(false)}
                  disabled={submitting}
                >
                  {t.cancel}
                </Button>
              </div>
            )}
          </div>
        </Card>
      </div>

      {attendance && (
        <div style={{ maxWidth: "480px", margin: "0 auto" }}>
          <Card title={t.salesAttendance.todaySession}>
            <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span style={{ fontFamily: "'Manrope', sans-serif", fontSize: "14px", color: "var(--soft)" }}>{t.status}</span>
                <span
                  style={{
                    fontFamily: "'Manrope', sans-serif",
                    fontSize: "14px",
                    fontWeight: 600,
                    color: isCheckedIn ? "var(--mint)" : "var(--soft)",
                  }}
                >
                  {isCheckedIn ? t.active : t.salesAttendance.closed}
                </span>
              </div>
              {attendance.workplace && (
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <span style={{ fontFamily: "'Manrope', sans-serif", fontSize: "14px", color: "var(--soft)" }}>
                    {t.attendanceScanner.workplace}
                  </span>
                  <span style={{ fontFamily: "'Manrope', sans-serif", fontSize: "14px", fontWeight: 600, color: "var(--ink)" }}>
                    {attendance.workplace.name}
                  </span>
                </div>
              )}
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span style={{ fontFamily: "'Manrope', sans-serif", fontSize: "14px", color: "var(--soft)" }}>
                  {t.salesAttendance.checkIn}
                </span>
                <span
                  style={{
                    fontFamily: "'Manrope', sans-serif",
                    fontSize: "14px",
                    fontWeight: 600,
                    color: "var(--ink)",
                    fontVariantNumeric: "tabular-nums",
                  }}
                >
                  {new Date(attendance.checkIn).toLocaleTimeString()}
                </span>
              </div>
              {attendance.checkOut && (
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <span style={{ fontFamily: "'Manrope', sans-serif", fontSize: "14px", color: "var(--soft)" }}>
                    {t.salesAttendance.checkOut}
                  </span>
                  <span
                    style={{
                      fontFamily: "'Manrope', sans-serif",
                      fontSize: "14px",
                      fontWeight: 600,
                      color: "var(--ink)",
                      fontVariantNumeric: "tabular-nums",
                    }}
                  >
                    {new Date(attendance.checkOut).toLocaleTimeString()}
                  </span>
                </div>
              )}
              <div style={{ display: "flex", justifyContent: "space-between", paddingTop: "8px", borderTop: "1px solid var(--border)" }}>
                <span style={{ fontFamily: "'Manrope', sans-serif", fontSize: "14px", color: "var(--soft)" }}>{t.date}</span>
                <span style={{ fontFamily: "'Manrope', sans-serif", fontSize: "14px", fontWeight: 600, color: "var(--ink)" }}>
                  {new Date(attendance.date).toLocaleDateString()}
                </span>
              </div>
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}
