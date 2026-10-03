import { useState, useRef, useEffect } from "react";
import { useI18n } from "../../i18n/context";

interface DateRangePickerProps {
  from: string;
  to: string;
  onChange: (from: string, to: string) => void;
}

function fmt(d: string, locale: string) {
  if (!d) return "";

  const date = new Date(d + "T00:00:00");

  if (isNaN(date.getTime())) return d;

  return date.toLocaleDateString(locale, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function toISO(d: Date) {
  return d.toISOString().slice(0, 10);
}

export function DateRangePicker({
  from,
  to,
  onChange,
}: DateRangePickerProps) {
  const { t, language } = useI18n();

  const isAr = language === "ar";
  const locale = isAr ? "ar-EG" : "en-GB";

  const [open, setOpen] = useState(false);
  const [draftFrom, setDraftFrom] = useState(from);
  const [draftTo, setDraftTo] = useState(to);

  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setDraftFrom(from);
    setDraftTo(to);
  }, [from, to, open]);

  useEffect(() => {
    if (!open) return;

    const handleClick = (e: MouseEvent) => {
      if (
        rootRef.current &&
        !rootRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    };

    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
      }
    };

    document.addEventListener("mousedown", handleClick);
    document.addEventListener("keydown", handleKey);

    return () => {
      document.removeEventListener("mousedown", handleClick);
      document.removeEventListener("keydown", handleKey);
    };
  }, [open]);

  const presets: { label: string; get: () => [string, string] }[] = [
    {
      label: t.today,
      get: () => {
        const d = new Date();
        return [toISO(d), toISO(d)];
      },
    },
    {
      label: t.thisWeek,
      get: () => {
        const d = new Date();
        const day = d.getDay();

        const start = new Date(d);
        start.setDate(d.getDate() - day);

        return [toISO(start), toISO(d)];
      },
    },
    {
      label: t.thisMonth,
      get: () => {
        const d = new Date();

        const start = new Date(
          d.getFullYear(),
          d.getMonth(),
          1
        );

        return [toISO(start), toISO(d)];
      },
    },
    {
      label: t.lastMonth,
      get: () => {
        const d = new Date();

        const start = new Date(
          d.getFullYear(),
          d.getMonth() - 1,
          1
        );

        const end = new Date(
          d.getFullYear(),
          d.getMonth(),
          0
        );

        return [toISO(start), toISO(end)];
      },
    },
    {
      label: t.thisYear,
      get: () => {
        const d = new Date();

        const start = new Date(
          d.getFullYear(),
          0,
          1
        );

        return [toISO(start), toISO(d)];
      },
    },
  ];

  const apply = (f: string, tt: string) => {
    onChange(f, tt);
    setOpen(false);
  };

  const label =
    from && to
      ? `${fmt(from, locale)}  –  ${fmt(to, locale)}`
      : t.selectPeriod ??
        (isAr ? "اختر الفترة" : "Select period");

  return (
    <>
      <div
        ref={rootRef}
        style={{
          position: "relative",
          width: "100%",
          maxWidth: "100%",
          fontFamily: "'Manrope', sans-serif",
        }}
      >
        <label
          style={{
            display: "block",
            fontSize: "12px",
            fontWeight: 600,
            color: "var(--soft)",
            marginBottom: "6px",
            textTransform: "uppercase",
            letterSpacing: "0.04em",
            lineHeight: 1.3,
          }}
        >
          {t.reports.period || t.date}
        </label>

        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          aria-haspopup="dialog"
          style={{
            display: "flex",
            alignItems: "center",
            gap: "8px",
            width: "100%",
            minWidth: 0,
            minHeight: "var(--control-h)",
            padding: "9px 12px",
            borderRadius: "var(--radius-sm)",
            border: `1px solid ${
              open
                ? "var(--brand)"
                : "var(--border-strong)"
            }`,
            backgroundColor: "var(--card)",
            color: "var(--ink)",
            fontFamily: "inherit",
            fontSize: "14px",
            cursor: "pointer",
            textAlign: "start",
            transition:
              "border-color 0.15s ease, box-shadow 0.15s ease",
            boxShadow: open
              ? "0 0 0 3px color-mix(in srgb, var(--brand) 18%, transparent)"
              : "none",
            boxSizing: "border-box",
            overflow: "hidden",
          }}
        >
          <CalendarIcon />

          <span
            style={{
              flex: 1,
              minWidth: 0,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {label}
          </span>

          <ChevronIcon open={open} />
        </button>

        {open && (
          <div
            role="dialog"
            aria-label={
              isAr ? "اختيار الفترة" : "Select date range"
            }
            style={{
              position: "absolute",
              top: "calc(100% + 8px)",
              insetInlineStart: 0,
              zIndex: 100,
              width: "max-content",
              maxWidth: "calc(100vw - 24px)",
              minWidth: 0,
              display: "flex",
              flexDirection: "row",
              backgroundColor: "var(--card)",
              border: "1px solid var(--border)",
              borderRadius: "14px",
              boxShadow: "var(--shadow-lg)",
              overflow: "hidden",
              boxSizing: "border-box",
            }}
          >
            {/* Presets */}
            <div
              style={{
                width: "150px",
                flexShrink: 0,
                padding: "10px",
                display: "flex",
                flexDirection: "column",
                gap: "2px",
                borderInlineEnd: "1px solid var(--border)",
                backgroundColor: "var(--bg-inset)",
                boxSizing: "border-box",
              }}
            >
              {presets.map((p) => (
                <button
                  key={p.label}
                  type="button"
                  onClick={() => apply(...p.get())}
                  style={{
                    textAlign: "start",
                    width: "100%",
                    minHeight: "38px",
                    padding: "8px 10px",
                    borderRadius: "8px",
                    border: "none",
                    background: "transparent",
                    color: "var(--ink)",
                    fontSize: "13px",
                    cursor: "pointer",
                    fontFamily: "inherit",
                    transition:
                      "background-color 0.15s ease",
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.backgroundColor =
                      "var(--bg-hover)";
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.backgroundColor =
                      "transparent";
                  }}
                >
                  {p.label}
                </button>
              ))}
            </div>

            {/* Manual range */}
            <div
              style={{
                minWidth: 0,
                padding: "16px",
                display: "flex",
                flexDirection: "column",
                gap: "12px",
                boxSizing: "border-box",
              }}
            >
              <div
                style={{
                  display: "flex",
                  gap: "10px",
                  minWidth: 0,
                }}
              >
                <FieldDate
                  label={t.from}
                  value={draftFrom}
                  max={draftTo || undefined}
                  onChange={setDraftFrom}
                />

                <FieldDate
                  label={t.to}
                  value={draftTo}
                  min={draftFrom || undefined}
                  onChange={setDraftTo}
                />
              </div>

              <div
                style={{
                  display: "flex",
                  justifyContent: "flex-end",
                  gap: "8px",
                  marginTop: "4px",
                }}
              >
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  style={{
                    minHeight: "38px",
                    padding: "8px 14px",
                    borderRadius: "8px",
                    border: "1px solid var(--border)",
                    background: "transparent",
                    color: "var(--soft)",
                    fontSize: "13px",
                    cursor: "pointer",
                    fontFamily: "inherit",
                  }}
                >
                  {t.cancel}
                </button>

                <button
                  type="button"
                  disabled={!draftFrom || !draftTo}
                  onClick={() =>
                    apply(draftFrom, draftTo)
                  }
                  style={{
                    minHeight: "38px",
                    padding: "8px 16px",
                    borderRadius: "8px",
                    border: "none",
                    background: "var(--brand-fill)",
                    color: "var(--on-brand)",
                    fontSize: "13px",
                    fontWeight: 600,
                    cursor:
                      draftFrom && draftTo
                        ? "pointer"
                        : "not-allowed",
                    opacity:
                      draftFrom && draftTo ? 1 : 0.5,
                    fontFamily: "inherit",
                  }}
                >
                  {t.apply}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Responsive styles */}
      <style>
        {`
          @media (max-width: 700px) {
            .date-range-picker-mobile-fix {
              width: 100%;
            }
          }
        `}
      </style>
    </>
  );
}

function FieldDate({
  label,
  value,
  min,
  max,
  onChange,
}: {
  label: string;
  value: string;
  min?: string;
  max?: string;
  onChange: (v: string) => void;
}) {
  return (
    <div
      style={{
        width: "150px",
        minWidth: 0,
        flex: "1 1 0",
      }}
    >
      <label
        style={{
          display: "block",
          fontSize: "11px",
          fontWeight: 600,
          color: "var(--soft)",
          marginBottom: "4px",
          textTransform: "uppercase",
          letterSpacing: "0.04em",
        }}
      >
        {label}
      </label>

      <input
        type="date"
        value={value}
        min={min}
        max={max}
        onChange={(e) => onChange(e.target.value)}
        dir="ltr"
        style={{
          width: "100%",
          minWidth: 0,
          minHeight: "38px",
          padding: "8px 10px",
          borderRadius: "8px",
          border: "1px solid var(--border)",
          backgroundColor: "var(--card)",
          color: "var(--ink)",
          fontFamily: "inherit",
          fontSize: "13px",
          outline: "none",
          boxSizing: "border-box",
        }}
      />
    </div>
  );
}

function CalendarIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="var(--soft)"
      strokeWidth="2"
      aria-hidden="true"
      style={{
        flexShrink: 0,
      }}
    >
      <rect
        x="3"
        y="4"
        width="18"
        height="18"
        rx="3"
      />
      <path d="M16 2v4M8 2v4M3 10h18" />
    </svg>
  );
}

function ChevronIcon({ open }: { open: boolean }) {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="var(--soft)"
      strokeWidth="2"
      aria-hidden="true"
      style={{
        flexShrink: 0,
        transition: "transform 0.15s ease",
        transform: open
          ? "rotate(180deg)"
          : "none",
      }}
    >
      <path d="M6 9l6 6 6-6" />
    </svg>
  );
}

export default DateRangePicker;