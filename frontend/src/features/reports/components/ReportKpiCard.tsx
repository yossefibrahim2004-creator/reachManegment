interface ReportKpiCardProps {
  label: string;
  value: string;
  color: string;
}

export default function ReportKpiCard({
  label,
  value,
  color,
}: ReportKpiCardProps) {
  return (
    <div
      className="kpi-card"
      style={{
        background: "var(--card)",
        border: "1px solid var(--border)",
        borderRadius: "var(--radius-md)",
        padding: "14px 16px 16px",
        position: "relative",
        overflow: "hidden",
        minWidth: 0,
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        minHeight: "96px",
        boxSizing: "border-box",
        transition:
          "transform 160ms ease, box-shadow 160ms ease, border-color 160ms ease",
      }}
    >
      {/* Subtle accent glow */}
      <div
        aria-hidden="true"
        style={{
          position: "absolute",
          top: 0,
          insetInlineStart: 0,
          width: "56px",
          height: "56px",
          background: `radial-gradient(circle at top left, ${color}18, transparent 70%)`,
          pointerEvents: "none",
        }}
      />

      {/* Content */}
      <div
        style={{
          position: "relative",
          zIndex: 1,
          minWidth: 0,
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "8px",
            minWidth: 0,
          }}
        >
          <span
            aria-hidden="true"
            style={{
              width: "6px",
              height: "6px",
              flex: "0 0 6px",
              borderRadius: "50%",
              backgroundColor: color,
              boxShadow: `0 0 0 3px ${color}14`,
            }}
          />

          <p
            title={label}
            style={{
              fontFamily: "'Manrope', sans-serif",
              fontSize: "11px",
              lineHeight: 1.3,
              fontWeight: 700,
              color: "var(--soft)",
              textTransform: "uppercase",
              letterSpacing: "0.045em",
              margin: 0,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {label}
          </p>
        </div>

        <p
          title={value}
          style={{
            fontFamily: "'Sora', sans-serif",
            fontSize: "clamp(21px, 2vw, 28px)",
            lineHeight: 1.15,
            fontWeight: 700,
            color: "var(--ink)",
            margin: "9px 0 0",
            fontVariantNumeric: "tabular-nums",
            letterSpacing: "-0.025em",
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {value}
        </p>
      </div>

      {/* Accent line */}
      <div
        aria-hidden="true"
        style={{
          position: "absolute",
          bottom: 0,
          insetInlineStart: 0,
          width: "100%",
          height: "3px",
          background: `linear-gradient(
            90deg,
            ${color},
            ${color}99
          )`,
        }}
      />

      {/* Responsive styles */}
      <style>
        {`
          .kpi-card:hover {
            transform: translateY(-1px);
            border-color: ${color}30 !important;
            box-shadow: var(--shadow-sm);
          }

          @media (max-width: 768px) {
            .kpi-card {
              min-height: 82px !important;
              padding: 11px 12px 13px !important;
              border-radius: 10px !important;
            }

            .kpi-card p:last-of-type {
              margin-top: 6px !important;
            }
          }

          @media (max-width: 480px) {
            .kpi-card {
              min-height: 74px !important;
              padding: 9px 10px 11px !important;
            }

            .kpi-card p:first-of-type {
              font-size: 9px !important;
              letter-spacing: 0.03em !important;
            }

            .kpi-card p:last-of-type {
              font-size: 18px !important;
              margin-top: 5px !important;
            }

            .kpi-card span {
              width: 5px !important;
              height: 5px !important;
              flex-basis: 5px !important;
            }
          }

          @media (max-width: 360px) {
            .kpi-card {
              min-height: 68px !important;
              padding: 8px 9px 10px !important;
            }

            .kpi-card p:first-of-type {
              font-size: 8.5px !important;
            }

            .kpi-card p:last-of-type {
              font-size: 16px !important;
            }
          }

          @media (prefers-reduced-motion: reduce) {
            .kpi-card {
              transition: none !important;
            }

            .kpi-card:hover {
              transform: none !important;
            }
          }
        `}
      </style>
    </div>
  );
}