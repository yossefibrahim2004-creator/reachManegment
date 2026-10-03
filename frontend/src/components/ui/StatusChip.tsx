import React from "react";
import { useI18n } from "../../i18n/context";

type StatusType =
  | "AVAILABLE"
  | "SOLD"
  | "DAMAGED"
  | "RESERVED"
  | "PENDING"
  | "APPROVED"
  | "REJECTED"
  | "ACTIVE"
  | "INACTIVE"
  | "PENDING_ACCOUNTANT"
  | "CONFIRMED"
  | "CANCELLED"
  | "DELIVERED"
  | "PENDING_PRICING"
  | "PRICED";

interface StatusChipProps {
  status: StatusType;
  label?: string;
}

const statusMap: Record<StatusType, { color: string; bg: string }> = {
  AVAILABLE: { color: "var(--mint)", bg: "var(--mint-bg)" },
  SOLD: { color: "var(--brand)", bg: "var(--brand-bg)" },
  DAMAGED: { color: "var(--accent)", bg: "var(--accent-bg)" },
  RESERVED: { color: "var(--peach)", bg: "var(--peach-bg)" },
  PENDING: { color: "var(--peach)", bg: "var(--peach-bg)" },
  APPROVED: { color: "var(--mint)", bg: "var(--mint-bg)" },
  REJECTED: { color: "var(--accent)", bg: "var(--accent-bg)" },
  ACTIVE: { color: "var(--mint)", bg: "var(--mint-bg)" },
  INACTIVE: { color: "var(--soft)", bg: "var(--bg-active)" },
  PENDING_ACCOUNTANT: { color: "var(--peach)", bg: "var(--peach-bg)" },
  CONFIRMED: { color: "var(--mint)", bg: "var(--mint-bg)" },
  CANCELLED: { color: "var(--accent)", bg: "var(--accent-bg)" },
  DELIVERED: { color: "var(--brand)", bg: "var(--brand-bg)" },
  PENDING_PRICING: { color: "var(--peach)", bg: "var(--peach-bg)" },
  PRICED: { color: "var(--mint)", bg: "var(--mint-bg)" },
};

export function StatusChip({ status, label }: StatusChipProps) {
  const { color, bg } = statusMap[status];
  const { t } = useI18n();
  const statusKey = status.charAt(0).toLowerCase() + status.slice(1).toLowerCase() as keyof typeof t.statusLabels;
  const displayLabel = label || (t.statusLabels as Record<string, string>)[statusKey] || status.charAt(0) + status.slice(1).toLowerCase();

  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: "6px",
        padding: "2px 10px",
        borderRadius: "999px",
        backgroundColor: bg,
        fontFamily: "'Manrope', sans-serif",
        fontSize: "12px",
        fontWeight: 600,
        color,
        lineHeight: "22px",
        whiteSpace: "nowrap",
      }}
    >
      <span
        style={{
          width: "6px",
          height: "6px",
          borderRadius: "50%",
          backgroundColor: color,
          flexShrink: 0,
        }}
      />
      {displayLabel}
    </span>
  );
}

export default StatusChip;
