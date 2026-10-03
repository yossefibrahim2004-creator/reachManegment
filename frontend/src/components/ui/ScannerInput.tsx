import React from "react";
import { useI18n } from "../../i18n/context";

/* ------------------------------------------------------------------ */
/* Key mapping: الزرار الفيزيائي (event.code) → حرف لاتيني (US layout)  */
/* بغض النظر عن لغة الكيبورد الحالية (عربي / إنجليزي).                  */
/* ------------------------------------------------------------------ */

const SHIFTED_DIGITS = ")!@#$%^&*(";

// [عادي, مع Shift]
const SYMBOLS: Record<string, [string, string]> = {
  Period: [".", ">"],
  Comma: [",", "<"],
  Minus: ["-", "_"],
  Equal: ["=", "+"],
  Slash: ["/", "?"],
  Backslash: ["\\", "|"],
  Semicolon: [";", ":"],
  Quote: ["'", '"'],
  BracketLeft: ["[", "{"],
  BracketRight: ["]", "}"],
  Backquote: ["`", "~"],
  Space: [" ", " "],
};

const NUMPAD: Record<string, string> = {
  NumpadDecimal: ".",
  NumpadSubtract: "-",
  NumpadAdd: "+",
  NumpadMultiply: "*",
  NumpadDivide: "/",
};

/** بترجع null لو الزرار مش حرف (Backspace, Arrows, Tab, ...) */
export function codeToLatinChar(e: React.KeyboardEvent): string | null {
  const { code, shiftKey } = e;

  if (/^Digit\d$/.test(code)) {
    const d = code.slice(5);
    return shiftKey ? SHIFTED_DIGITS[Number(d)] : d;
  }

  if (/^Numpad\d$/.test(code)) return code.slice(6);
  if (code in NUMPAD) return NUMPAD[code];

  if (/^Key[A-Z]$/.test(code)) {
    const letter = code.slice(3);
    // Shift و CapsLock بيلغوا بعض (XOR)
    const upper = shiftKey !== e.getModifierState("CapsLock");
    return upper ? letter : letter.toLowerCase();
  }

  const sym = SYMBOLS[code];
  return sym ? sym[shiftKey ? 1 : 0] : null;
}

/* ------------------------------------------------------------------ */
/* Component                                                           */
/* ------------------------------------------------------------------ */

interface ScannerInputProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, "onKeyDown"> {
  onScan: (value: string) => void;
  success?: boolean;
  error?: boolean;
}

export const ScannerInput = React.forwardRef<HTMLInputElement, ScannerInputProps>(function ScannerInput(
  { onScan, success, error, style, ...props },
  ref,
) {
  const internalRef = React.useRef<HTMLInputElement>(null);
  const { t } = useI18n();

  const setRefs = React.useCallback((node: HTMLInputElement | null) => {
    internalRef.current = node;

    if (typeof ref === "function") {
      ref(node);
      return;
    }

    if (ref) {
      ref.current = node;
    }
  }, [ref]);

  React.useEffect(() => {
    internalRef.current?.focus();
  }, []);

  const borderColor = error
    ? "var(--accent)"
    : success
      ? "var(--mint)"
      : "var(--border-strong)";

  const focusBorderColor = error ? "var(--accent)" : "var(--mint)";

  const inputStyle: React.CSSProperties = {
    fontFamily: "'Manrope', sans-serif",
    fontSize: "16px",
    fontWeight: 600,
    letterSpacing: "0.04em",
    fontVariantNumeric: "tabular-nums",
    color: "var(--ink)",
    backgroundColor: "var(--card)",
    border: `2px solid ${borderColor}`,
    borderRadius: "var(--radius-md)",
    // logical padding: يتبع اتجاه الصفحة زي الأيقونة بالظبط
    paddingBlock: "16px",
    paddingInlineStart: "52px",
    paddingInlineEnd: "16px",
    width: "100%",
    outline: "none",
    transition: "border-color 0.2s ease, box-shadow 0.2s ease",
    lineHeight: 1.5,
    boxSizing: "border-box",
    minHeight: "56px",
    // الباركود لاتيني: النص نفسه يتعرض LTR من غير ما نقلب اتجاه الـ padding
    unicodeBidi: "plaintext",
    ...style,
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      const target = e.currentTarget;
      const value = target.value.trim();
      if (value) {
        onScan(value);
        target.value = "";
      }
      return;
    }

    // سيب الاختصارات (Ctrl+V ...) والـ IME في حالهم
    if (e.ctrlKey || e.metaKey || e.altKey || e.nativeEvent.isComposing) return;

    const ch = codeToLatinChar(e);
    if (ch === null) return; // Backspace, Arrows, Tab... تشتغل عادي

    // امنع الحرف العربي واكتب اللاتيني مكانه عند الـ cursor
    e.preventDefault();
    const el = e.currentTarget;
    const start = el.selectionStart ?? el.value.length;
    const end = el.selectionEnd ?? el.value.length;
    el.setRangeText(ch, start, end, "end");
    // setRangeText مش بتطلّع input event، فبنطلّعه عشان onChange يشتغل
    el.dispatchEvent(new Event("input", { bubbles: true }));
  };

  return (
    <div style={{ position: "relative" }}>
      <div
        style={{
          position: "absolute",
          insetInlineStart: "16px",
          top: "50%",
          transform: "translateY(-50%)",
          pointerEvents: "none",
          color: success ? "var(--mint)" : error ? "var(--accent)" : "var(--soft)",
        }}
      >
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M3 7V5a2 2 0 0 1 2-2h2" />
          <path d="M17 3h2a2 2 0 0 1 2 2v2" />
          <path d="M21 17v2a2 2 0 0 1-2 2h-2" />
          <path d="M7 21H5a2 2 0 0 1-2-2v-2" />
          <line x1="7" y1="12" x2="17" y2="12" />
          <line x1="7" y1="8" x2="17" y2="8" />
          <line x1="7" y1="16" x2="17" y2="16" />
        </svg>
      </div>
      <input
        ref={setRefs}
        style={inputStyle}
        placeholder={t.scannerInputPlaceholder}
        autoComplete="off"
        autoCorrect="off"
        autoCapitalize="off"
        spellCheck={false}
        onKeyDown={handleKeyDown}
        onFocus={(e) => {
          e.currentTarget.style.borderColor = focusBorderColor;
          e.currentTarget.style.boxShadow = `0 0 0 2px ${focusBorderColor}`;
        }}
        onBlur={(e) => {
          e.currentTarget.style.borderColor = borderColor;
          e.currentTarget.style.boxShadow = "none";
        }}
        {...props}
      />
    </div>
  );
});

export default ScannerInput;