import React from "react";

interface CardProps {
  title?: string;
  children: React.ReactNode;
  actions?: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
}

export function Card({ title, children, actions, className, style }: CardProps) {
  return (
    <div
      className={`ui-card${className ? ` ${className}` : ""}`}
      style={{
        backgroundColor: "var(--card)",
        border: "1px solid var(--border)",
        borderRadius: "var(--radius-md)",
        boxShadow: "var(--shadow-sm)",
        overflow: "hidden",
        ...style,
      }}
    >
      {(title || actions) && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "14px 16px 0",
            gap: "12px",
            flexWrap: "wrap",
          }}
        >
          {title && (
            <h3
              style={{
                fontFamily: "'Sora', sans-serif",
                fontSize: "14px",
                fontWeight: 600,
                color: "var(--ink)",
                margin: 0,
                lineHeight: 1.3,
              }}
            >
              {title}
            </h3>
          )}
          {actions && (
            <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
              {actions}
            </div>
          )}
        </div>
      )}
      <div
        style={{
          padding: title || actions ? "12px 16px 16px" : "16px",
          fontFamily: "'Manrope', sans-serif",
          fontSize: "14px",
          color: "var(--ink)",
          lineHeight: 1.5,
          minWidth: 0,
        }}
      >
        {children}
      </div>
    </div>
  );
}

export default Card;
