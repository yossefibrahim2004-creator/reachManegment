import React from "react";

interface PageHeaderProps {
  title: string;
  subtitle?: string;
  actions?: React.ReactNode;
}

export function PageHeader({ title, subtitle, actions }: PageHeaderProps) {
  return (
    <div
      className="page-section"
      style={{
        display: "flex",
        alignItems: "flex-start",
        justifyContent: "space-between",
        gap: "12px",
        flexWrap: "wrap",
        paddingBottom: "4px",
      }}
    >
      <div style={{ minWidth: 0, flex: "1 1 240px" }}>
        <h1
          style={{
            fontFamily: "'Sora', sans-serif",
            fontSize: "clamp(20px, 3vw, 26px)",
            fontWeight: 600,
            color: "var(--ink)",
            margin: 0,
            lineHeight: 1.25,
            letterSpacing: "-0.01em",
          }}
        >
          {title}
        </h1>
        {subtitle && (
          <p
            style={{
              fontFamily: "'Manrope', sans-serif",
              fontSize: "13px",
              color: "var(--soft)",
              margin: "4px 0 0",
              lineHeight: 1.45,
            }}
          >
            {subtitle}
          </p>
        )}
      </div>
      {actions && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "8px",
            flexShrink: 0,
            flexWrap: "wrap",
          }}
        >
          {actions}
        </div>
      )}
    </div>
  );
}

export default PageHeader;
