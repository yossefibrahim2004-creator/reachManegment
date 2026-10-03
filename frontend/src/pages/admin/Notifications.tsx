import { useState, useEffect, useCallback } from "react";
import api from "../../lib/api";
import { isAbortError } from "../../hooks";
import { notify } from "../../lib/notify";
import { getSuccessMessages } from "../../lib/success-messages";
import { getNotificationTitle, getNotificationMessage, getNotificationDetail, getNotificationParams } from "../../lib/notifications-i18n";
import { emitUnreadChanged } from "../../lib/notification-events";
import { PageHeader } from "../../components/ui/PageHeader";
import { Button } from "../../components/ui/Button";
import { LoadingSpinner } from "../../components/ui/LoadingSpinner";
import { EmptyState } from "../../components/ui/EmptyState";
import { Pagination } from "../../components/ui/Pagination";
import { useI18n } from "../../i18n/context";
import type { Notification } from "../../types";

type Tab = "unread" | "all";

const PAGE_SIZE = 25;

interface ListMeta {
  page: number;
  total: number;
  totalPages: number;
}

export default function Notifications() {
  const { t } = useI18n();
  const SUCCESS_MESSAGES = getSuccessMessages(t);
  const [tab, setTab] = useState<Tab>("unread");
  const [page, setPage] = useState(1);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [meta, setMeta] = useState<ListMeta>({ page: 1, total: 0, totalPages: 1 });
  const [unreadTotal, setUnreadTotal] = useState(0);
  const [loading, setLoading] = useState(true);

  const timeAgo = (dateStr: string) => {
    const now = new Date();
    const date = new Date(dateStr);
    const diffMs = now.getTime() - date.getTime();
    const diffMin = Math.floor(diffMs / 60000);
    const diffH = Math.floor(diffMin / 60);
    const diffD = Math.floor(diffH / 24);

    if (diffMin < 1) return t.notifications.timeAgo.justNow;
    if (diffMin < 60) return t.notifications.timeAgo.minutesAgo.replace("{n}", String(diffMin));
    if (diffH < 24) return t.notifications.timeAgo.hoursAgo.replace("{n}", String(diffH));
    return t.notifications.timeAgo.daysAgo.replace("{n}", String(diffD));
  };

  const fetchNotifications = useCallback(async (signal?: AbortSignal) => {
    setLoading(true);
    try {
      const params: Record<string, string | number> = { page, limit: PAGE_SIZE };
      if (tab === "unread") params.unreadOnly = "true";
      const [listRes, countRes] = await Promise.all([
        api.get("/notifications", { params, signal }),
        api.get("/notifications/unread-count", { signal }),
      ]);
      setNotifications(listRes.data.data ?? listRes.data);
      const serverMeta = listRes.data.meta;
      setMeta({
        page: serverMeta?.page ?? page,
        total: serverMeta?.total ?? 0,
        totalPages: serverMeta?.totalPages ?? 1,
      });
      setUnreadTotal(countRes.data?.count ?? 0);
    } catch (err) {
      if (isAbortError(err)) return;
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }, [tab, page]);

  useEffect(() => {
    const controller = new AbortController();
    void fetchNotifications(controller.signal);
    return () => controller.abort();
  }, [fetchNotifications]);

  const switchTab = (next: Tab) => {
    if (next === tab) return;
    setTab(next);
    setPage(1);
  };

  const markAsRead = async (id: number) => {
    try {
      await api.patch(`/notifications/${id}/read`);
      setUnreadTotal((prev) => Math.max(0, prev - 1));
      const remainingOnPage = notifications.filter((n) => n.id !== id).length;
      setNotifications((prev) => {
        const next = prev.map((n) => (n.id === id ? { ...n, isRead: true } : n));
        // On the unread tab a read notification no longer belongs — remove it.
        return tab === "unread" ? next.filter((n) => n.id !== id) : next;
      });
      setMeta((prev) => ({ ...prev, total: Math.max(0, prev.total - 1) }));
      // If the current unread page emptied out, step back one page.
      if (tab === "unread" && remainingOnPage === 0 && page > 1) {
        setPage((prev) => prev - 1);
      }
      emitUnreadChanged();
      notify.info(SUCCESS_MESSAGES.notification.read);
    } catch {
      /* empty */
    }
  };

  const markAllAsRead = async () => {
    if (unreadTotal <= 0) return;

    try {
      await api.patch("/notifications/read-all");
      setUnreadTotal(0);
      setNotifications((prev) => {
        const next = prev.map((n) => ({ ...n, isRead: true }));
        return tab === "unread" ? [] : next;
      });
      if (tab === "unread") {
        setMeta({ page: 1, total: 0, totalPages: 1 });
        setPage(1);
      }
      emitUnreadChanged();
      notify.info(SUCCESS_MESSAGES.notification.allRead);
    } catch {
      /* empty */
    }
  };

  const typeIcon = (type: string) => {
    const iconMap: Record<string, { emoji: string; color: string }> = {
      LOW_STOCK: { emoji: "⚠", color: "var(--peach)" },
      INVOICE_RETURNED: { emoji: "↩", color: "var(--accent)" },
      RETURN_APPROVED: { emoji: "↩", color: "var(--mint)" },
      RETURN_REJECTED: { emoji: "↩", color: "var(--accent)" },
      CHANGE_REQUEST: { emoji: "✎", color: "var(--brand)" },
      CHANGE_REQUEST_REJECTED: { emoji: "✎", color: "var(--accent)" },
      PRICE_CHANGE_APPROVED: { emoji: "💲", color: "var(--mint)" },
      ADD_ITEM_APPROVED: { emoji: "➕", color: "var(--mint)" },
      ADD_ITEM_REJECTED: { emoji: "➕", color: "var(--accent)" },
      EXPENSE_ALERT: { emoji: "💰", color: "var(--peach)" },
      ATTENDANCE: { emoji: "🕐", color: "var(--mint)" },
      INVOICE_PENDING_REVIEW: { emoji: "📋", color: "var(--peach)" },
      INVOICE_REJECTED: { emoji: "❌", color: "var(--accent)" },
      INVOICE_CONFIRMED: { emoji: "✅", color: "var(--mint)" },
/*       DELIVERY_PENDING: { emoji: "📦", color: "var(--brand)" },
 */      DELIVERY_OVERDUE: { emoji: "⏰", color: "var(--accent)" },
      STOCK_PENDING_PRICING: { emoji: "💲", color: "var(--peach)" },
    };
    const icon = iconMap[type] || { emoji: "●", color: "var(--soft)" };
    return (
      <span
        style={{
          width: 40,
          height: 40,
          borderRadius: "10px",
          backgroundColor: `${icon.color}15`,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: "18px",
          flexShrink: 0,
        }}
      >
        {icon.emoji}
      </span>
    );
  };

  return (
    <div>
      <PageHeader
        title={t.pages.notifications}
        subtitle={t.pages.notificationsSubtitle}
        actions={
          unreadTotal > 0 ? (
            <Button variant="secondary" onClick={markAllAsRead}>{t.notifications.markAllRead}</Button>
          ) : undefined
        }
      />

      {/* Tabs */}
      <div style={{ display: "flex", gap: "4px", marginBottom: "var(--section-gap)", borderBottom: "1px solid var(--border)", paddingBottom: "1px", overflowX: "auto" }}>
        {(["unread", "all"] as Tab[]).map((tKey) => (
          <button
            key={tKey}
            onClick={() => switchTab(tKey)}
            style={{
              fontFamily: "'Manrope', sans-serif",
              fontSize: "14px",
              fontWeight: 600,
              padding: "8px 16px",
              borderRadius: "var(--radius-sm) var(--radius-sm) 0 0",
              border: "none",
              cursor: "pointer",
              backgroundColor: tab === tKey ? "var(--card)" : "transparent",
              color: tab === tKey ? "var(--ink)" : "var(--soft)",
              borderBottom: tab === tKey ? "2px solid var(--brand)" : "2px solid transparent",
              transition: "all 0.15s ease",
              minHeight: "36px",
              whiteSpace: "nowrap",
            }}
          >
            {tKey === "unread" ? `${t.notifications.unread}${unreadTotal > 0 ? ` (${unreadTotal})` : ""}` : t.all}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="state-block">
          <LoadingSpinner size={32} />
        </div>
      ) : notifications.length === 0 ? (
        <EmptyState
          title={t.notifications.noNotifications}
          description={tab === "unread" ? t.notifications.allCaughtUp : t.notifications.noNotificationsYet}
        />
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
          {notifications.map((n) => {
            const params = getNotificationParams(n);
            const detail = getNotificationDetail(n.type, t, params);
            return (
            <div
              key={n.id}
              style={{
                backgroundColor: "var(--card)",
                border: `1px solid ${n.isRead ? "var(--border)" : "var(--brand)"}`,
                borderRadius: "var(--radius-md)",
                padding: "16px 20px",
                display: "flex",
                alignItems: "flex-start",
                gap: "16px",
                opacity: n.isRead ? 0.7 : 1,
              }}
            >
              {typeIcon(n.type)}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "12px" }}>
                  <div>
                    <h4 style={{ fontFamily: "'Sora', sans-serif", fontSize: "14px", fontWeight: 600, color: "var(--ink)", margin: "0 0 4px" }}>
                      {getNotificationTitle(n.type, t, params)}
                    </h4>
                    <p style={{ fontFamily: "'Manrope', sans-serif", fontSize: "13px", color: "var(--soft)", margin: 0, lineHeight: 1.5 }}>
                      {getNotificationMessage(n.type, t, params, n.message)}
                    </p>
                    {detail && (
                      <p style={{
                        fontFamily: "'Manrope', sans-serif",
                        fontSize: "12px",
                        color: "var(--ink)",
                        backgroundColor: "var(--brand-bg)",
                        border: "1px solid color-mix(in srgb, var(--brand) 25%, transparent)",
                        borderRadius: "var(--radius-sm)",
                        margin: "8px 0 0",
                        padding: "6px 10px",
                        lineHeight: 1.5,
                      }}>
                        {detail}
                      </p>
                    )}
                  </div>
                  <span style={{ fontFamily: "'Manrope', sans-serif", fontSize: "12px", color: "var(--soft)", whiteSpace: "nowrap", flexShrink: 0 }}>
                    {timeAgo(n.createdAt)}
                  </span>
                </div>
                {!n.isRead && (
                  <div style={{ marginTop: "10px" }}>
                    <Button variant="quiet" size="sm" onClick={() => markAsRead(n.id)}>{t.notifications.markAsRead}</Button>
                  </div>
                )}
              </div>
            </div>
            );
          })}
        </div>
      )}

      {!loading && meta.totalPages > 1 && (
        <Pagination
          currentStart={(meta.page - 1) * PAGE_SIZE + 1}
          currentEnd={Math.min(meta.page * PAGE_SIZE, meta.total)}
          total={meta.total}
          currentPage={meta.page}
          totalPages={meta.totalPages}
          loading={loading}
          onPrev={() => setPage((p) => Math.max(1, p - 1))}
          onNext={() => setPage((p) => Math.min(meta.totalPages, p + 1))}
        />
      )}
    </div>
  );
}
