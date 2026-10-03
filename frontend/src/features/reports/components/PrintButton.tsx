import { useState } from "react";
import { useI18n } from "../../../i18n/context";

interface PrintButtonProps {
  onClick?: () => void;
}

export default function PrintButton({ onClick }: PrintButtonProps) {
  const { t } = useI18n();
  const [isPrinting, setIsPrinting] = useState(false);

  const handleClick = () => {
    if (isPrinting) return;
    if (onClick) {
      setIsPrinting(true);
      onClick();
      setTimeout(() => setIsPrinting(false), 3000);
    } else {
      window.print();
    }
  };

  return (
    <button
      className="no-print"
      onClick={handleClick}
      disabled={isPrinting}
      style={{
        display: "flex",
        alignItems: "center",
        gap: "8px",
        padding: "10px 20px",
        borderRadius: "10px",
        border: "1px solid var(--border)",
        backgroundColor: isPrinting ? "var(--surface)" : "var(--card)",
        color: "var(--ink)",
        fontFamily: "'Manrope', sans-serif",
        fontSize: "14px",
        fontWeight: 600,
        cursor: isPrinting ? "not-allowed" : "pointer",
        opacity: isPrinting ? 0.7 : 1,
        transition: "all 0.15s ease",
      }}
      onMouseEnter={(e) => {
        if (!isPrinting)
          e.currentTarget.style.backgroundColor = "var(--surface)";
      }}
      onMouseLeave={(e) => {
        if (!isPrinting) e.currentTarget.style.backgroundColor = "var(--card)";
      }}
    >
      {isPrinting ? (
        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          style={{ animation: "spin 1s linear infinite" }}
        >
          <path d="M21 12a9 9 0 1 1-6.219-8.56" />
        </svg>
      ) : (
        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <polyline points="6 9 6 2 18 2 18 9" />
          <path d="M6 18H4a2 2 0 0 1-2-2a-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2a5a2 2 0 0 1-2 2h-2" />
          <rect x="6" y="14" width="12" height="8" />
        </svg>
      )}
      {isPrinting ? "Preparing..." : t.reports.print}
    </button>
  );
}
