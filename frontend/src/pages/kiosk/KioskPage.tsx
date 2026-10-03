import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import api from "../../lib/api";
import { useAuth } from "../../lib/auth";
import { useI18n } from "../../i18n/context";
import { QrDisplay } from "../../components/attendance/QrDisplay";
import { LoadingSpinner } from "../../components/ui/LoadingSpinner";
import type { AttendanceAction, KioskContext, KioskQrResponse } from "../../types";

const POLL_MARGIN_MS = 1500;

export default function KioskPage() {
  const { t } = useI18n();
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [action, setAction] = useState<AttendanceAction>("CHECK_IN");
  const [context, setContext] = useState<KioskContext | null>(null);
  const [qr, setQr] = useState<KioskQrResponse | null>(null);
  const [secondsLeft, setSecondsLeft] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const inFlightRef = useRef(false);

  const fetchQr = useCallback(async (nextAction: AttendanceAction) => {
    if (inFlightRef.current) return;
    inFlightRef.current = true;
    try {
      const { data } = await api.post<KioskQrResponse>("/attendance/kiosk/qr", {
        action: nextAction,
      });
      setQr(data);
      setError("");
      const remaining = Math.max(
        0,
        Math.floor((new Date(data.expiresAt).getTime() - Date.now()) / 1000),
      );
      setSecondsLeft(remaining);
    } catch (err) {
      const payload =
        err && typeof err === "object" && "response" in err
          ? (err as { response?: { data?: { message?: string } } }).response?.data?.message
          : undefined;
      setError(payload || t.kiosk.loadFailed);
      setQr(null);
    } finally {
      inFlightRef.current = false;
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    if (!user || user.role !== "ATTENDANCE_KIOSK") {
      navigate("/kiosk/login", { replace: true });
      return;
    }
    const controller = new AbortController();
    const { signal } = controller;
    (async () => {
      try {
        const { data } = await api.get<KioskContext>("/attendance/kiosk/me", { signal });
        if (!signal.aborted) setContext(data);
      } catch {
        if (!signal.aborted) setError(t.kiosk.notConfigured);
      } finally {
        if (!signal.aborted) setLoading(false);
      }
    })();
    return () => controller.abort();
  }, [user, navigate, t]);

  useEffect(() => {
    if (!context) return;
    void fetchQr(action);
  }, [action, context, fetchQr]);

  useEffect(() => {
    if (!context || qr || !error) return;
    const timer = setTimeout(() => {
      void fetchQr(action);
    }, 3000);
    return () => clearTimeout(timer);
  }, [context, qr, error, action, fetchQr]);

  useEffect(() => {
    if (!qr) return;
    const timer = setInterval(() => {
      if (document.visibilityState !== "visible") return;
      const remaining = Math.max(
        0,
        Math.floor((new Date(qr.expiresAt).getTime() - Date.now()) / 1000),
      );
      setSecondsLeft(remaining);
      if (remaining <= 0) {
        void fetchQr(action);
      }
    }, 1000);
    return () => clearInterval(timer);
  }, [qr, action, fetchQr]);

  useEffect(() => {
    if (!qr) return;
    const ms = Math.max(
      POLL_MARGIN_MS,
      new Date(qr.expiresAt).getTime() - Date.now(),
    );
    const timeout = setTimeout(() => {
      if (document.visibilityState !== "visible") return;
      void fetchQr(action);
    }, ms);
    return () => clearTimeout(timeout);
  }, [qr, action, fetchQr]);

  const handleLogout = async () => {
    await logout();
    navigate("/kiosk/login", { replace: true });
  };

  if (loading || !context) {
    return (
      <div
        className="min-h-screen flex flex-col items-center justify-center gap-4"
        style={{ backgroundColor: "#0B0D12", color: "#fff" }}
      >
        <LoadingSpinner size={40} color="#fff" />
        <p style={{ fontFamily: "'Manrope', sans-serif" }}>{error || t.loading}</p>
        {error && (
          <button
            onClick={handleLogout}
            className="px-4 py-2 rounded-lg text-sm"
            style={{ backgroundColor: "#4169A1", color: "#fff" }}
          >
            {t.signOut}
          </button>
        )}
      </div>
    );
  }

  const title = action === "CHECK_IN" ? t.kiosk.checkIn : t.kiosk.checkOut;

  return (
    <div
      className="min-h-screen flex flex-col"
      style={{ backgroundColor: "#0B0D12", color: "#fff" }}
      data-testid="kiosk-page"
    >
      <header
        className="flex items-center justify-between px-6 py-4"
        style={{ borderBottom: "1px solid rgba(255,255,255,0.08)" }}
      >
        <div>
          <div
            style={{
              fontFamily: "'Sora', sans-serif",
              fontWeight: 700,
              fontSize: 22,
              letterSpacing: "0.04em",
            }}
          >
            {t.kiosk.title}
          </div>
          <div style={{ fontFamily: "'Manrope', sans-serif", opacity: 0.75, fontSize: 16 }}>
            {context.workplace.name}
          </div>
        </div>
        <button
          onClick={handleLogout}
          className="px-4 py-2 rounded-lg text-sm font-semibold"
          style={{
            backgroundColor: "transparent",
            color: "rgba(255,255,255,0.7)",
            border: "1px solid rgba(255,255,255,0.2)",
          }}
        >
          {t.signOut}
        </button>
      </header>

      <nav className="flex justify-center gap-3 px-4 py-6">
        {(["CHECK_IN", "CHECK_OUT"] as AttendanceAction[]).map((tab) => {
          const active = tab === action;
          return (
            <button
              key={tab}
              type="button"
              onClick={() => setAction(tab)}
              aria-pressed={active}
              style={{
                fontFamily: "'Sora', sans-serif",
                fontWeight: 700,
                fontSize: 22,
                letterSpacing: "0.06em",
                padding: "16px 40px",
                borderRadius: 12,
                border: active ? "2px solid #4169A1" : "2px solid rgba(255,255,255,0.15)",
                backgroundColor: active ? "#4169A1" : "transparent",
                color: active ? "#fff" : "rgba(255,255,255,0.65)",
                cursor: "pointer",
                minWidth: 220,
              }}
            >
              {tab === "CHECK_IN" ? t.kiosk.checkIn : t.kiosk.checkOut}
            </button>
          );
        })}
      </nav>

      <main className="flex-1 flex flex-col items-center justify-center px-4 pb-10 gap-6">
        <h1
          style={{
            fontFamily: "'Sora', sans-serif",
            fontSize: 42,
            fontWeight: 700,
            margin: 0,
          }}
        >
          {title}
        </h1>

        <div
          style={{
            backgroundColor: "#fff",
            padding: 24,
            borderRadius: 24,
            minHeight: 360,
            minWidth: 360,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          {qr ? (
            <QrDisplay token={qr.token} size={320} />
          ) : (
            <div className="flex flex-col items-center gap-4">
              <p style={{ color: "#69707D", fontFamily: "'Manrope', sans-serif" }}>
                {error || t.loading}
              </p>
              {error && (
                <button
                  type="button"
                  onClick={() => void fetchQr(action)}
                  className="px-4 py-2 rounded-lg text-sm"
                  style={{ backgroundColor: "#4169A1", color: "#fff" }}
                >
                  {t.kiosk.retry}
                </button>
              )}
            </div>
          )}
        </div>

        <p style={{ fontFamily: "'Manrope', sans-serif", fontSize: 22, opacity: 0.85, margin: 0 }}>
          {t.kiosk.scanInstruction}
        </p>

        <p
          style={{
            fontFamily: "'Sora', sans-serif",
            fontSize: 28,
            fontWeight: 600,
            color: secondsLeft <= 5 ? "#F87171" : "#93C5FD",
            margin: 0,
            fontVariantNumeric: "tabular-nums",
          }}
        >
          {t.kiosk.validFor}: {secondsLeft}s
        </p>

        {error && (
          <p style={{ color: "#FCA5A5", fontFamily: "'Manrope', sans-serif", margin: 0 }}>
            {error}
          </p>
        )}
      </main>
    </div>
  );
}
