import React from "react";

interface EmptyStateProps {
  icon?: React.ReactNode;
  title: string;
  description?: string;
  action?: React.ReactNode;
}

export function EmptyState({ icon, title, description, action }: EmptyStateProps) {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        padding: "32px 16px",
        textAlign: "center",
      }}
    >
      {icon && (
        <div
          style={{
            color: "var(--soft)",
            marginBottom: "12px",
          }}
        >
          {icon}
        </div>
      )}
      <h3
        style={{
          fontFamily: "'Sora', sans-serif",
          fontSize: "15px",
          fontWeight: 600,
          color: "var(--ink)",
          margin: "0 0 6px",
        }}
      >
        {title}
      </h3>
      {description && (
        <p
          style={{
            fontFamily: "'Manrope', sans-serif",
            fontSize: "13px",
            color: "var(--soft)",
            margin: "0 0 16px",
            lineHeight: 1.5,
            maxWidth: "360px",
          }}
        >
          {description}
        </p>
      )}
      {action && <div>{action}</div>}
    </div>
  );
}

export default EmptyState;
