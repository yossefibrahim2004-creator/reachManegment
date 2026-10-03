import React from "react";

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary" | "quiet" | "danger";
  size?: "sm" | "md" | "lg";
  loading?: boolean;
  icon?: React.ReactNode;
}

const baseStyle: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  gap: "6px",
  fontFamily: "'Manrope', sans-serif",
  fontWeight: 600,
  borderRadius: "var(--radius-sm)",
  border: "1px solid transparent",
  cursor: "pointer",
  transition: "background-color 0.15s ease, border-color 0.15s ease, color 0.15s ease, box-shadow 0.15s ease",
  lineHeight: 1,
  whiteSpace: "nowrap",
};

const sizes: Record<string, React.CSSProperties> = {
  sm: { padding: "0 12px", fontSize: "13px", minHeight: "36px" },
  md: { padding: "0 16px", fontSize: "14px", minHeight: "var(--control-h)" },
  lg: { padding: "0 24px", fontSize: "15px", minHeight: "48px" },
};

const variants: Record<string, React.CSSProperties> = {
  primary: {
    backgroundColor: "var(--brand-fill)",
    color: "var(--on-brand)",
    borderColor: "var(--brand-fill)",
  },
  secondary: {
    backgroundColor: "transparent",
    color: "var(--ink)",
    borderColor: "var(--border)",
  },
  quiet: {
    backgroundColor: "transparent",
    color: "var(--ink)",
  },
  danger: {
    backgroundColor: "var(--accent-fill)",
    color: "var(--on-accent)",
    borderColor: "var(--accent-fill)",
  },
};

const hoverStyles: Record<string, React.CSSProperties> = {
  primary: { backgroundColor: "var(--brand-fill-hover)" },
  secondary: { backgroundColor: "var(--bg-hover)" },
  quiet: { backgroundColor: "var(--bg-active)" },
  danger: { backgroundColor: "var(--accent-fill-hover)" },
};

export function Button({
  variant = "primary",
  size = "md",
  loading = false,
  icon,
  disabled,
  children,
  style,
  ...props
}: ButtonProps) {
  const [hovered, setHovered] = React.useState(false);

  const mergedStyle: React.CSSProperties = {
    ...baseStyle,
    ...sizes[size],
    ...variants[variant],
    ...(hovered && !disabled ? hoverStyles[variant] : {}),
    ...(disabled ? { opacity: 0.5, cursor: "not-allowed" } : {}),
    ...(loading ? { opacity: 0.7, cursor: "wait" } : {}),
    ...style,
  };

  return (
    <button
      style={mergedStyle}
      disabled={disabled || loading}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onFocus={(e) => {
        e.currentTarget.style.boxShadow =
          "0 0 0 3px color-mix(in srgb, var(--brand) 18%, transparent)";
      }}
      onBlur={(e) => {
        e.currentTarget.style.boxShadow = "none";
      }}
      {...props}
    >
      {loading ? (
        <span
          style={{
            width: "16px",
            height: "16px",
            border: "2px solid currentColor",
            borderTopColor: "transparent",
            borderRadius: "50%",
            animation: "spin 0.6s linear infinite",
            display: "inline-block",
          }}
        >
          <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        </span>
      ) : icon ? (
        <span style={{ display: "inline-flex", alignItems: "center" }}>{icon}</span>
      ) : null}
      {children}
    </button>
  );
}

export default Button;
