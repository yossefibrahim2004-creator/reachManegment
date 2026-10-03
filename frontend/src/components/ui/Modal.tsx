import React from "react";
import { useI18n } from "../../i18n/context";

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
}

export function Modal({ isOpen, onClose, title, children, footer }: ModalProps) {
  const { t } = useI18n();
  const dialogRef = React.useRef<HTMLDivElement>(null);
  const previouslyFocused = React.useRef<HTMLElement | null>(null);

  React.useEffect(() => {
    if (isOpen) {
      const handleEsc = (e: KeyboardEvent) => {
        if (e.key === "Escape") onClose();
      };
      document.addEventListener("keydown", handleEsc);
      return () => document.removeEventListener("keydown", handleEsc);
    }
  }, [isOpen, onClose]);

  React.useEffect(() => {
    if (isOpen) {
      previouslyFocused.current = document.activeElement as HTMLElement;
      const dialog = dialogRef.current;
      const focusables = dialog?.querySelectorAll<HTMLElement>(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
      );
      focusables?.[0]?.focus();

      const handleTab = (e: KeyboardEvent) => {
        if (e.key !== "Tab" || !dialog) return;
        const nodes = Array.from(
          dialog.querySelectorAll<HTMLElement>(
            'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
          ),
        ).filter((el) => el.offsetParent !== null);
        if (nodes.length === 0) return;
        const first = nodes[0];
        const last = nodes[nodes.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      };
      document.addEventListener("keydown", handleTab);
      document.body.style.overflow = "hidden";
      return () => {
        document.removeEventListener("keydown", handleTab);
        document.body.style.overflow = "";
        previouslyFocused.current?.focus();
      };
    }
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={title}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 1000,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "16px",
      }}
    >
      <div
        onClick={onClose}
        aria-hidden="true"
        style={{
          position: "absolute",
          inset: 0,
          backgroundColor: "var(--overlay)",
        }}
      />
      <div
        ref={dialogRef}
        style={{
          position: "relative",
          backgroundColor: "var(--card)",
          borderRadius: "var(--radius-md)",
          boxShadow: "var(--shadow-lg)",
          border: "1px solid var(--border)",
          width: "100%",
          maxWidth: "min(520px, calc(100vw - 32px))",
          maxHeight: "calc(100vh - 32px)",
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
        }}
      >
        {title && (
          <div
            style={{
              padding: "16px 20px 0",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: "12px",
            }}
          >
            <h2
              style={{
                fontFamily: "'Sora', sans-serif",
                fontSize: "16px",
                fontWeight: 600,
                color: "var(--ink)",
                margin: 0,
                lineHeight: 1.3,
              }}
            >
              {title}
            </h2>
            <button
              onClick={onClose}
              style={{
                background: "none",
                border: "none",
                cursor: "pointer",
                padding: "6px",
                color: "var(--soft)",
                lineHeight: 1,
                fontSize: "20px",
                borderRadius: "6px",
                flexShrink: 0,
              }}
              aria-label={t.close}
            >
              ×
            </button>
          </div>
        )}
        <div
          style={{
            padding: title ? "12px 20px 16px" : "20px",
            overflowY: "auto",
            fontFamily: "'Manrope', sans-serif",
            fontSize: "14px",
            color: "var(--ink)",
            lineHeight: 1.5,
          }}
        >
          {children}
        </div>
        {footer && (
          <div
            style={{
              padding: "0 20px 16px",
              display: "flex",
              justifyContent: "flex-end",
              gap: "8px",
              flexWrap: "wrap",
            }}
          >
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}

export default Modal;
