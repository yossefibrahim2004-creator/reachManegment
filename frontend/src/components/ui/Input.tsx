import React from "react";

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
}

export function Input({ label, error, style, id, ...props }: InputProps) {
  const inputId = id || (label ? label.toLowerCase().replace(/\s+/g, "-") : undefined);

  const inputStyle: React.CSSProperties = {
    fontFamily: "'Manrope', sans-serif",
    fontSize: "14px",
    color: "var(--ink)",
    backgroundColor: "var(--card)",
    border: error
      ? "1px solid var(--accent)"
      : "1px solid var(--border-strong)",
    borderRadius: "var(--radius-sm)",
    padding: "8px 12px",
    width: "100%",
    minHeight: "var(--control-h)",
    outline: "none",
    transition: "border-color 0.15s ease, box-shadow 0.15s ease",
    lineHeight: 1.4,
    boxSizing: "border-box",
    ...style,
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "6px", minWidth: 0 }}>
      {label && (
        <label
          htmlFor={inputId}
          style={{
            fontFamily: "'Manrope', sans-serif",
            fontSize: "12px",
            fontWeight: 600,
            color: "var(--soft)",
            lineHeight: 1.3,
          }}
        >
          {label}
        </label>
      )}
      <input
        id={inputId}
        style={inputStyle}
        onFocus={(e) => {
          e.currentTarget.style.borderColor = "var(--brand)";
          e.currentTarget.style.boxShadow =
            "0 0 0 3px color-mix(in srgb, var(--brand) 18%, transparent)";
        }}
        onBlur={(e) => {
          e.currentTarget.style.borderColor = error
            ? "var(--accent)"
            : "var(--border-strong)";
          e.currentTarget.style.boxShadow = "none";
        }}
        {...props}
      />
      {error && (
        <span
          style={{
            fontFamily: "'Manrope', sans-serif",
            fontSize: "12px",
            color: "var(--accent)",
          }}
        >
          {error}
        </span>
      )}
    </div>
  );
}

export default Input;
