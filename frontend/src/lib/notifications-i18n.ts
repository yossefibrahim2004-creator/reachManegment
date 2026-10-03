import type { TranslationKey } from "../i18n";
import type { Notification } from "../types";

export interface NotificationParams {
  model?: string;
  available?: number;
  threshold?: number;
  invoice?: string;
  reason?: string;
  receipt?: string;
  message?: string;
  customer?: string;
  total?: number;
  itemCount?: number;
  quantity?: number;
  supplier?: string;
  refund?: number;
  delta?: number;
  count?: number;
  type?: string;
  itemsSummary?: string;
  requested?: number;
}

type NotificationType =
  | "LOW_STOCK"
  | "INVOICE_PENDING_REVIEW"
  | "INVOICE_REJECTED"
  | "INVOICE_CONFIRMED"
  | "STOCK_PENDING_PRICING"
  | "CHANGE_REQUEST"
  | "RETURN_APPROVED"
  | "RETURN_REJECTED"
  | "CHANGE_REQUEST_REJECTED"
  | "PRICE_CHANGE_APPROVED"
  | "ADD_ITEM_APPROVED"
  | "ADD_ITEM_REJECTED"
  | "DELIVERY_OVERDUE"
  | "SYSTEM";

function interpolate(template: string, params: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (_, key: string) =>
    key in params ? String(params[key]) : `{${key}}`,
  );
}

// Detail templates only use params that are guaranteed to be present on
// notifications carrying a structured payload (backend writes a complete
// payload per type), so interpolation never leaves raw {placeholders}.
function interpolateDetail(template: string, params: Record<string, string | number>): string {
  return template
    .replace(/\{(\w+)\}/g, (_, key: string) => (key in params ? String(params[key]) : ""))
    .replace(/\s*([—:,])\s*(?=$)/g, "")
    .replace(/\s{2,}/g, " ")
    .trim();
}

export function getNotificationTitle(
  type: string,
  t: TranslationKey,
  params: NotificationParams = {},
): string {
  const content = t.notifications.content;
  const typeKey = type as NotificationType;

  if (typeKey in content) {
    return interpolate(content[typeKey].title, params as Record<string, string | number>);
  }

  return type
    .replace(/_/g, " ")
    .toLowerCase()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

export function getNotificationMessage(
  type: string,
  t: TranslationKey,
  params: NotificationParams = {},
  fallback?: string,
): string {
  const content = t.notifications.content;
  const typeKey = type as NotificationType;

  if (typeKey in content) {
    return interpolate(content[typeKey].message, params as Record<string, string | number>);
  }

  return fallback ?? "";
}

// Returns the extra detail line (product, qty, supplier, customer, totals…)
// for a notification, or null when there is nothing extra to show (e.g. old
// notifications created before structured payloads existed).
export function getNotificationDetail(
  type: string,
  t: TranslationKey,
  params: NotificationParams = {},
): string | null {
  const content = t.notifications.content as Record<
    string,
    { title: string; message: string; detail?: string } | undefined
  >;
  const entry = content[type];
  if (!entry?.detail) return null;

  const placeholders = [...entry.detail.matchAll(/\{(\w+)\}/g)].map((m) => m[1]);
  const hasAny = placeholders.some((key) => {
    const value = (params as Record<string, unknown>)[key];
    return value !== undefined && value !== null && value !== "";
  });
  if (!hasAny) return null;

  const rendered = interpolateDetail(entry.detail, params as Record<string, string | number>);
  return rendered.length > 0 ? rendered : null;
}

// Prefer the structured payload written by the backend; fall back to regex
// parsing of the English message for notifications created before payloads.
export function getNotificationParams(notification: Notification): NotificationParams {
  const legacy = parseNotificationParams(
    notification.title,
    notification.message,
    notification.entityId,
  );

  const payload = notification.payload;
  if (payload && typeof payload === "object" && !Array.isArray(payload)) {
    const merged: NotificationParams = { ...legacy };
    for (const [key, value] of Object.entries(payload)) {
      if (value === null || value === undefined || value === "") continue;
      if (typeof value === "number") {
        (merged as Record<string, unknown>)[key] = value;
      } else if (typeof value === "string") {
        (merged as Record<string, unknown>)[key] = value;
      } else if (Array.isArray(value)) {
        (merged as Record<string, unknown>)[key] = value.map((v) => String(v)).join(", ");
      }
    }
    return merged;
  }

  return legacy;
}

export function parseNotificationParams(
  title: string,
  message: string,
  entityId?: string | null,
): NotificationParams {
  const params: NotificationParams = {};
  const combined = title + " " + message;

  const modelMatch = combined.match(/(?:Alert:\s*|for\s+)(.+?)$/);
  if (modelMatch) params.model = modelMatch[1].trim();

  const invoiceMatch = combined.match(/Invoice\s+(?:number\s+)?(#?[\w-]+)/i);
  if (invoiceMatch) {
    params.invoice = invoiceMatch[1];
  } else {
    const invoiceMatch2 = combined.match(/(?:invoice|فاتورة)\s*(?:رقم\s*)?(#?[\w-]+)/i);
    if (invoiceMatch2) params.invoice = invoiceMatch2[1];
  }

  if (!params.invoice && entityId) {
    params.invoice = `#${entityId}`;
  }

  const reasonMatch = message.match(/Reason:\s*(.+?)(?:\.\s*Details:|\.$|$)/i);
  if (reasonMatch) params.reason = reasonMatch[1].trim();

  const receiptMatch = combined.match(/receipt\s*(?:#|رقم)\s*(\d+)/i);
  if (receiptMatch) {
    params.receipt = receiptMatch[1];
  } else if (entityId) {
    params.receipt = entityId;
  }

  const availableMatch = message.match(/has\s+(\d+)\s+units?/i);
  if (availableMatch) params.available = Number(availableMatch[1]);

  const thresholdMatch = message.match(/threshold:\s*(\d+)/i);
  if (thresholdMatch) params.threshold = Number(thresholdMatch[1]);

  return params;
}
