import React, {
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import { useI18n } from "../../i18n/context";

interface SelectOption {
  label: string;
  value: string;
  disabled?: boolean;
}

interface SelectProps
  extends Omit<
    React.SelectHTMLAttributes<HTMLSelectElement>,
    "children"
  > {
  label?: string;
  error?: string;
  options: SelectOption[];
  placeholder?: string;
  searchablePlaceholder?: string;
  loading?: boolean;
  clearable?: boolean;
  noResultsText?: string;
  loadingText?: string;
}

export function Select({
  label,
  error,
  options,
  placeholder,
  searchablePlaceholder,
  loading = false,
  clearable = true,
  noResultsText,
  loadingText,
  style,
  id,
  value,
  defaultValue,
  onChange,
  onBlur,
  onFocus,
  disabled,
  required,
  name,
  "aria-label": ariaLabel,
  "aria-describedby": ariaDescribedBy,
  className,
  ...props
}: SelectProps) {
  const { t } = useI18n();
  const resolvedPlaceholder = placeholder ?? t.selectPlaceholder ?? "Select an option";
  const resolvedSearchPlaceholder = searchablePlaceholder ?? t.searchPlaceholder ?? "Search...";
  const resolvedNoResults = noResultsText ?? t.noResults ?? "No results found";
  const resolvedLoading = loadingText ?? t.loading ?? "Loading...";
  const generatedId = useId();
  const selectId =
    id ||
    (label
      ? label.toLowerCase().replace(/\s+/g, "-")
      : `select-${generatedId}`);

  const wrapperRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const optionRefs = useRef<Array<HTMLButtonElement | null>>([]);

  const isControlled = value !== undefined;

  const initialValue = useMemo(() => {
    if (typeof defaultValue === "string") {
      return defaultValue;
    }

    if (Array.isArray(defaultValue) && defaultValue.length > 0) {
      return defaultValue[0];
    }

    return "";
  }, [defaultValue]);

  const [internalValue, setInternalValue] = useState(initialValue);
  const selectedValue = isControlled ? String(value ?? "") : internalValue;

  const selectedOption = useMemo(
    () => options.find((option) => option.value === selectedValue),
    [options, selectedValue]
  );

  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [highlightedIndex, setHighlightedIndex] = useState(-1);

  // Position of the portal-rendered menu, computed from the trigger's
  // bounding box. Recalculated on open, and kept in sync on scroll/resize
  // so the menu tracks the trigger even inside scrollable containers
  // (e.g. a Modal body with overflowY: auto).
  const [menuPosition, setMenuPosition] = useState<{
    top: number;
    left: number;
    width: number;
    placement: "bottom" | "top";
  } | null>(null);

  const normalizedSearch = search.trim().toLowerCase();

  const filteredOptions = useMemo(() => {
    if (!normalizedSearch) {
      return options;
    }

    return options.filter((option) =>
      option.label.toLowerCase().includes(normalizedSearch)
    );
  }, [options, normalizedSearch]);

  const enabledFilteredOptions = useMemo(
    () => filteredOptions.filter((option) => !option.disabled),
    [filteredOptions]
  );

  useEffect(() => {
    if (!open) {
      setSearch("");
      setHighlightedIndex(-1);
      return;
    }

    const selectedIndex = enabledFilteredOptions.findIndex(
      (option) => option.value === selectedValue
    );

    setHighlightedIndex(selectedIndex >= 0 ? selectedIndex : 0);
  }, [open, enabledFilteredOptions, selectedValue]);

  useEffect(() => {
    if (highlightedIndex < 0) {
      return;
    }

    optionRefs.current[highlightedIndex]?.scrollIntoView({
      block: "nearest",
    });
  }, [highlightedIndex]);

  // Compute (and keep updated) the menu's fixed-position coordinates
  // relative to the viewport, based on the trigger's current position.
  const updateMenuPosition = () => {
    const trigger = triggerRef.current;
    if (!trigger) return;

    const rect = trigger.getBoundingClientRect();
    const viewportHeight = window.innerHeight;
    const estimatedMenuHeight = menuRef.current?.offsetHeight ?? 320;
    const spaceBelow = viewportHeight - rect.bottom;
    const spaceAbove = rect.top;

    const placement: "bottom" | "top" =
      spaceBelow < estimatedMenuHeight && spaceAbove > spaceBelow
        ? "top"
        : "bottom";

    setMenuPosition({
      top: placement === "bottom" ? rect.bottom + 6 : rect.top - 6,
      left: rect.left,
      width: rect.width,
      placement,
    });
  };

  useLayoutEffect(() => {
    if (!open) {
      setMenuPosition(null);
      return;
    }

    updateMenuPosition();

    // Recompute on any scroll (capture phase so it catches scrolling
    // inside a Modal body too, not just window scroll) and on resize.
    const handleReposition = () => updateMenuPosition();

    window.addEventListener("scroll", handleReposition, true);
    window.addEventListener("resize", handleReposition);

    return () => {
      window.removeEventListener("scroll", handleReposition, true);
      window.removeEventListener("resize", handleReposition);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    const handleOutsideClick = (event: MouseEvent) => {
      const target = event.target as Node;
      const clickedWrapper = wrapperRef.current?.contains(target);
      const clickedMenu = menuRef.current?.contains(target);

      if (!clickedWrapper && !clickedMenu) {
        setOpen(false);
      }
    };

    document.addEventListener("mousedown", handleOutsideClick);

    return () => {
      document.removeEventListener("mousedown", handleOutsideClick);
    };
  }, []);

  useEffect(() => {
    if (selectedValue && !options.some((option) => option.value === selectedValue)) {
      if (!isControlled) {
        setInternalValue("");
      }
    }
  }, [options, selectedValue, isControlled]);

  const emitChange = (nextValue: string) => {
    if (!isControlled) {
      setInternalValue(nextValue);
    }

    if (onChange) {
      const syntheticEvent = {
        target: {
          name,
          value: nextValue,
        },
        currentTarget: {
          name,
          value: nextValue,
        },
      } as React.ChangeEvent<HTMLSelectElement>;

      onChange(syntheticEvent);
    }
  };

  const handleSelect = (option: SelectOption) => {
    if (disabled || option.disabled) {
      return;
    }

    emitChange(option.value);
    setOpen(false);
    setSearch("");
  };

  const handleClear = (event: React.MouseEvent<HTMLButtonElement>) => {
    event.preventDefault();
    event.stopPropagation();

    if (disabled) {
      return;
    }

    emitChange("");
    setSearch("");
    setHighlightedIndex(-1);
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (disabled) {
      return;
    }

    if (event.key === "ArrowDown") {
      event.preventDefault();

      if (!open) {
        setOpen(true);
        return;
      }

      if (enabledFilteredOptions.length === 0) {
        return;
      }

      setHighlightedIndex((current) => {
        const next = current + 1;
        return next >= enabledFilteredOptions.length ? 0 : next;
      });

      return;
    }

    if (event.key === "ArrowUp") {
      event.preventDefault();

      if (!open) {
        setOpen(true);
        return;
      }

      if (enabledFilteredOptions.length === 0) {
        return;
      }

      setHighlightedIndex((current) => {
        if (current <= 0) {
          return enabledFilteredOptions.length - 1;
        }

        return current - 1;
      });

      return;
    }

    if (event.key === "Enter") {
      event.preventDefault();

      if (!open) {
        setOpen(true);
        return;
      }

      const highlighted =
        enabledFilteredOptions[highlightedIndex];

      if (highlighted) {
        handleSelect(highlighted);
      }

      return;
    }

    if (event.key === "Escape") {
      event.preventDefault();
      setOpen(false);
      setSearch("");
      return;
    }

    if (event.key === "Tab") {
      setOpen(false);
      setSearch("");
    }
  };

  const handleInputFocus = (
    event: React.FocusEvent<HTMLInputElement>
  ) => {
    if (!disabled) {
      setOpen(true);
    }

    onFocus?.(
      event as unknown as React.FocusEvent<HTMLSelectElement>
    );
  };

  const handleInputBlur = (
    event: React.FocusEvent<HTMLInputElement>
  ) => {
    onBlur?.(
      event as unknown as React.FocusEvent<HTMLSelectElement>
    );
  };

  const hasValue = Boolean(selectedOption);

  const containerStyle: React.CSSProperties = {
    position: "relative",
    width: "100%",
    ...style,
  };

  const triggerStyle: React.CSSProperties = {
    width: "100%",
    minHeight: "var(--control-h)",
    display: "flex",
    alignItems: "center",
    gap: "8px",
    padding: "8px 36px 8px 12px",
    border: error
      ? "1px solid var(--accent)"
      : open
        ? "1px solid var(--brand)"
        : "1px solid var(--border-strong)",
    borderRadius: "var(--radius-sm)",
    backgroundColor: "var(--card)",
    color: hasValue ? "var(--ink)" : "var(--soft)",
    fontFamily: "'Manrope', sans-serif",
    fontSize: "14px",
    lineHeight: 1.4,
    boxSizing: "border-box",
    cursor: disabled ? "not-allowed" : "pointer",
    opacity: disabled ? 0.6 : 1,
    transition: "border-color 0.15s ease, box-shadow 0.15s ease",
    outline: "none",
    boxShadow: open
      ? "0 0 0 3px color-mix(in srgb, var(--brand) 18%, transparent)"
      : "none",
    textAlign: "start",
  };

  // Menu is now rendered in a portal at document.body, positioned with
  // `fixed` using viewport coordinates from getBoundingClientRect, so it
  // is never clipped by an ancestor's overflow (e.g. Modal body) and
  // always sits above everything via a very high z-index.
  const menuStyle: React.CSSProperties = menuPosition
    ? {
        position: "fixed",
        zIndex: 10000,
        top: menuPosition.placement === "bottom" ? menuPosition.top : undefined,
        bottom:
          menuPosition.placement === "top"
            ? window.innerHeight - menuPosition.top
            : undefined,
        left: menuPosition.left,
        width: menuPosition.width,
        backgroundColor: "var(--card)",
        border: "1px solid var(--border)",
        borderRadius: "10px",
        boxShadow:
          "var(--shadow-lg)",
        overflow: "hidden",
      }
    : { display: "none" };

  const searchContainerStyle: React.CSSProperties = {
    padding: "8px",
    borderBottom: "1px solid var(--border)",
    backgroundColor: "var(--card)",
  };

  const searchInputStyle: React.CSSProperties = {
    width: "100%",
    height: "40px",
    boxSizing: "border-box",
    border: "1px solid var(--border)",
    borderRadius: "7px",
    outline: "none",
    padding: "8px 10px 8px 34px",
    backgroundColor: "var(--bg-inset)",
    color: "var(--ink)",
    fontFamily: "'Manrope', sans-serif",
    fontSize: "13px",
  };

  const optionsContainerStyle: React.CSSProperties = {
    maxHeight: "260px",
    overflowY: "auto",
    padding: "4px",
  };

  const optionStyle = (
    active: boolean,
    selected: boolean,
    optionDisabled: boolean
  ): React.CSSProperties => ({
    width: "100%",
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: "10px",
    border: "none",
    borderRadius: "7px",
    padding: "9px 10px",
    backgroundColor: active
      ? "color-mix(in srgb, var(--brand) 9%, transparent)"
      : "transparent",
    color: optionDisabled
      ? "var(--muted)"
      : selected
        ? "var(--brand)"
        : "var(--ink)",
    fontFamily: "'Manrope', sans-serif",
    fontSize: "13px",
    fontWeight: selected ? 600 : 500,
    textAlign: "start",
    cursor: optionDisabled ? "not-allowed" : "pointer",
    opacity: optionDisabled ? 0.5 : 1,
    transition: "background-color 0.12s ease",
  });

  const menuContent = open && !disabled && (
    <div ref={menuRef} style={menuStyle}>
      <div style={searchContainerStyle}>
        <div style={{ position: "relative" }}>
          <span
            style={{
              position: "absolute",
              insetInlineStart: "11px",
              top: "50%",
              transform: "translateY(-50%)",
              color: "var(--muted)",
              fontSize: "14px",
              pointerEvents: "none",
            }}
          >
            ⌕
          </span>

          <input
            ref={searchInputRef}
            type="text"
            value={search}
            placeholder={resolvedSearchPlaceholder}
            autoComplete="off"
            onChange={(event) => {
              setSearch(event.target.value);
              setHighlightedIndex(0);
            }}
            onKeyDown={handleKeyDown}
            onFocus={handleInputFocus}
            onBlur={handleInputBlur}
            style={searchInputStyle}
          />
        </div>
      </div>

      <div
        role="listbox"
        aria-label={label || "Options"}
        style={optionsContainerStyle}
      >
        {loading ? (
          <div
            style={{
              padding: "18px 12px",
              textAlign: "center",
              color: "var(--muted)",
              fontFamily: "'Manrope', sans-serif",
              fontSize: "13px",
            }}
          >
            {resolvedLoading}
          </div>
        ) : filteredOptions.length === 0 ? (
          <div
            style={{
              padding: "18px 12px",
              textAlign: "center",
              color: "var(--muted)",
              fontFamily: "'Manrope', sans-serif",
              fontSize: "13px",
            }}
          >
            {resolvedNoResults}
          </div>
        ) : (
          filteredOptions.map((option) => {
            const enabledIndex = enabledFilteredOptions.findIndex(
              (item) => item.value === option.value
            );

            const isHighlighted = enabledIndex === highlightedIndex;
            const isSelected = option.value === selectedValue;

            return (
              <button
                key={option.value}
                ref={(element) => {
                  if (enabledIndex >= 0) {
                    optionRefs.current[enabledIndex] = element;
                  }
                }}
                type="button"
                role="option"
                aria-selected={isSelected}
                disabled={option.disabled}
                onMouseEnter={() => {
                  if (!option.disabled && enabledIndex >= 0) {
                    setHighlightedIndex(enabledIndex);
                  }
                }}
                onClick={() => handleSelect(option)}
                style={optionStyle(
                  isHighlighted,
                  isSelected,
                  Boolean(option.disabled)
                )}
              >
                <span
                  style={{
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                >
                  {option.label}
                </span>

                {isSelected && (
                  <span
                    style={{
                      flexShrink: 0,
                      fontSize: "14px",
                      fontWeight: 700,
                      color: "var(--brand)",
                    }}
                  >
                    ✓
                  </span>
                )}
              </button>
            );
          })
        )}
      </div>
    </div>
  );

  return (
    <div
      ref={wrapperRef}
      className={className}
      style={{
        display: "flex",
        flexDirection: "column",
        gap: "6px",
      }}
    >
      {label && (
        <label
          htmlFor={selectId}
          style={{
            fontFamily: "'Manrope', sans-serif",
            fontSize: "13px",
            fontWeight: 600,
            color: "var(--ink)",
          }}
        >
          {label}
          {required && (
            <span
              style={{
                color: "var(--accent)",
                marginInlineStart: "3px",
              }}
            >
              *
            </span>
          )}
        </label>
      )}

      <div style={containerStyle}>
        <button
          ref={triggerRef}
          type="button"
          id={selectId}
          disabled={disabled}
          aria-label={ariaLabel || label}
          aria-haspopup="listbox"
          aria-expanded={open}
          aria-invalid={Boolean(error)}
          aria-describedby={ariaDescribedBy}
          onClick={() => {
            if (disabled) {
              return;
            }

            setOpen((current) => !current);

            setTimeout(() => {
              searchInputRef.current?.focus();
            }, 0);
          }}
          style={triggerStyle}
        >
          <span
            style={{
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
              flex: 1,
              textAlign: "start",
            }}
          >
            {selectedOption?.label || resolvedPlaceholder}
          </span>

          {hasValue && clearable && !disabled && (
            <span
              role="button"
              tabIndex={-1}
              onClick={(event) => {
                event.preventDefault();
                event.stopPropagation();
              }}
              style={{
                position: "absolute",
                insetInlineEnd: "28px",
                top: "50%",
                transform: "translateY(-50%)",
                width: "20px",
                height: "20px",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                borderRadius: "50%",
                color: "var(--muted)",
                fontSize: "16px",
                lineHeight: 1,
                cursor: "pointer",
              }}
              onMouseDown={handleClear}
              aria-label={t.clearSelection ?? "Clear selection"}
            >
              ×
            </span>
          )}

          <span
            style={{
              position: "absolute",
              insetInlineEnd: "11px",
              top: "50%",
              transform: `translateY(-50%) rotate(${open ? 180 : 0}deg)`,
              transition: "transform 0.15s ease",
              fontSize: "11px",
              color: "var(--muted)",
              pointerEvents: "none",
            }}
          >
            ▼
          </span>
        </button>

        {/* Keeps form semantics / compatibility with existing forms */}
        <select
          {...props}
          name={name}
          value={selectedValue}
          onChange={() => undefined}
          disabled={disabled}
          required={required}
          tabIndex={-1}
          aria-hidden="true"
          style={{
            position: "absolute",
            width: 1,
            height: 1,
            padding: 0,
            margin: -1,
            overflow: "hidden",
            clip: "rect(0, 0, 0, 0)",
            whiteSpace: "nowrap",
            border: 0,
          }}
        >
          <option value="" />
          {options.map((option) => (
            <option
              key={option.value}
              value={option.value}
              disabled={option.disabled}
            >
              {option.label}
            </option>
          ))}
        </select>
      </div>

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

      {typeof document !== "undefined" &&
        menuContent &&
        createPortal(menuContent, document.body)}
    </div>
  );
}

export default Select;