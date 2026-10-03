
import React from "react";
import { useI18n } from "../../i18n/context";

export interface Column<T = unknown> {
  key: string;
  label: React.ReactNode;
  align?: "left" | "right" | "center";
  width?: string | number;
  truncate?: boolean;
  sortable?: boolean;
  render?: (row: T, index: number) => React.ReactNode;
}

export interface TableProps<T = unknown> {
  columns: Column<T>[];
  data: T[] | null | undefined;
  loading?: boolean;
  loadingRowsCount?: number;
  onRowClick?: (row: T, index: number) => void;
  emptyMessage?: string;
  emptySubtext?: string;
  emptyIcon?: React.ReactNode;
  keyExtractor?: (row: T, index: number) => string;
  selectedRowKey?: string | number | null;
  density?: "compact" | "normal" | "spacious";
  sortColumn?: string | null;
  sortDirection?: "asc" | "desc" | null;
  onSort?: (columnKey: string) => void;
  className?: string;
  style?: React.CSSProperties;
}

const DENSITY_PADDING: Record<
  "compact" | "normal" | "spacious",
  string
> = {
  compact: "7px 9px",
  normal: "8px 10px",
  spacious: "11px 13px",
};

function isObjectRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export function Table<T = unknown>({
  columns,
  data,
  loading = false,
  loadingRowsCount = 5,
  onRowClick,
  emptyMessage,
  emptySubtext,
  emptyIcon,
  keyExtractor,
  selectedRowKey,
  density = "normal",
  sortColumn,
  sortDirection,
  onSort,
  className = "",
  style,
}: TableProps<T>) {
  const { t } = useI18n();

  const effectiveEmptyMessage =
    emptyMessage ?? t.noDataAvailable ?? "No data available";

  const rows = Array.isArray(data) ? data : [];
  const padding =
    DENSITY_PADDING[density] || DENSITY_PADDING.normal;

  const getRowKey = (row: T, index: number): string => {
    if (keyExtractor) {
      return String(keyExtractor(row, index));
    }

    if (isObjectRecord(row)) {
      const value = row.id ?? row.key;

      if (value !== undefined && value !== null) {
        return String(value);
      }
    }

    return String(index);
  };

  const renderCellValue = (row: T, key: string): string => {
    if (!isObjectRecord(row)) {
      return "";
    }

    const value = row[key];

    if (value === null || value === undefined) {
      return "";
    }

    return String(value);
  };

  const getAlignment = (
    align?: "left" | "right" | "center",
  ): {
    textAlign: "start" | "end" | "center";
    justifyContent:
      | "flex-start"
      | "flex-end"
      | "center";
  } => {
    if (align === "right") {
      return {
        textAlign: "end",
        justifyContent: "flex-end",
      };
    }

    if (align === "center") {
      return {
        textAlign: "center",
        justifyContent: "center",
      };
    }

    return {
      textAlign: "start",
      justifyContent: "flex-start",
    };
  };

  const renderSortIndicator = (column: Column<T>) => {
    if (!column.sortable) {
      return null;
    }

    const isSorted = sortColumn === column.key;

    return (
      <span
        className={`ui-table-sort-icon ${
          isSorted
            ? "ui-table-sort-icon-active"
            : ""
        }`}
        aria-hidden="true"
      >
        {isSorted
          ? sortDirection === "desc"
            ? "▼"
            : "▲"
          : "↕"}
      </span>
    );
  };

  const renderColumnValue = (
    row: T,
    column: Column<T>,
    rowIndex: number,
  ) => {
    if (column.render) {
      return column.render(row, rowIndex);
    }

    return renderCellValue(row, column.key);
  };

  const renderEmptyState = () => (
    <div className="ui-table-empty">
      <div className="ui-table-empty-icon">
        {emptyIcon || (
          <svg
            width="34"
            height="34"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <rect
              x="3"
              y="3"
              width="18"
              height="18"
              rx="2"
            />
            <path d="M3 9h18" />
            <path d="M9 21V9" />
          </svg>
        )}
      </div>

      <span className="ui-table-empty-title">
        {effectiveEmptyMessage}
      </span>

      {emptySubtext && (
        <span className="ui-table-empty-subtext">
          {emptySubtext}
        </span>
      )}
    </div>
  );

  return (
    <div
      className={`ui-table-container ${className}`}
      style={style}
    >
      <style>{`
        .ui-table-container {
          --ui-border: var(--border);
          --ui-surface: var(--surface);
          --ui-card: var(--card);
          --ui-subtle: var(--surface-subtle);
          --ui-ink: var(--ink);
          --ui-soft: var(--soft);
          --ui-brand: var(--brand);
          --ui-hover: var(--row-hover);
          --ui-selected: var(--row-selected);

          width: 100%;
          min-width: 0;
          border: 1px solid var(--ui-border);
          border-radius: 10px;
          overflow: hidden;
          background: var(--ui-surface);
          box-shadow: var(--shadow-sm);
        }

        .ui-table-wrapper {
          width: 100%;
          max-width: 100%;
          overflow-x: auto;
          overflow-y: hidden;
          scrollbar-width: thin;
          -webkit-overflow-scrolling: touch;
          overscroll-behavior-inline: contain;
        }

        .ui-table {
          width: 100%;
          min-width: max-content;
          border-collapse: separate;
          border-spacing: 0;
          table-layout: auto;
          background: var(--ui-card);
          color: var(--ui-ink);
          font-family:
            "Manrope",
            -apple-system,
            BlinkMacSystemFont,
            "Segoe UI",
            sans-serif;
          font-size: 12px;
          line-height: 1.35;
        }

        .ui-table-th,
        .ui-table-td {
          box-sizing: border-box;
          vertical-align: middle;
        }

        .ui-table-th {
          padding: ${padding};
          background: var(--ui-subtle);
          color: var(--ui-soft);
          border-bottom:
            1px solid var(--ui-border);
          font-size: 10px;
          font-weight: 800;
          line-height: 1.2;
          letter-spacing: 0.045em;
          text-transform: uppercase;
          white-space: nowrap;
        }

        .ui-table-td {
          padding: ${padding};
          background: var(--ui-card);
          color: var(--ui-ink);
          border-bottom:
            1px solid var(--ui-border);
        }

        .ui-table-tr {
          background: var(--ui-card);
          transition:
            background-color 120ms ease;
        }

        .ui-table-tr:last-child
          .ui-table-td {
          border-bottom: 0;
        }

        .ui-table-tr-clickable {
          cursor: pointer;
        }

        .ui-table-tr-clickable:hover
          .ui-table-td {
          background: var(--ui-hover);
        }

        .ui-table-tr-clickable:focus-visible {
          outline:
            2px solid var(--ui-brand);
          outline-offset: -2px;
        }

        .ui-table-tr-selected
          .ui-table-td {
          background: var(--ui-selected);
        }

        .ui-table-th-sortable {
          cursor: pointer;
          user-select: none;
        }

        .ui-table-th-sortable:hover {
          background: color-mix(in srgb, var(--brand) 7%, transparent);
          color: var(--ui-brand);
        }

        .ui-table-th-sortable:focus-visible {
          outline:
            2px solid var(--ui-brand);
          outline-offset: -2px;
        }

        .ui-table-sort-button {
          width: 100%;
          min-width: 0;
          display: inline-flex;
          align-items: center;
          gap: 4px;
          border: 0;
          padding: 0;
          margin: 0;
          background: transparent;
          color: inherit;
          font: inherit;
          text-align: inherit;
          cursor: pointer;
        }

        .ui-table-sort-button:focus-visible {
          outline:
            2px solid var(--ui-brand);
          outline-offset: 2px;
          border-radius: 3px;
        }

        .ui-table-sort-icon {
          flex: 0 0 auto;
          margin-inline-start: 2px;
          font-size: 8px;
          line-height: 1;
          opacity: 0.28;
        }

        .ui-table-sort-icon-active {
          opacity: 1;
          color: var(--ui-brand);
        }

        .ui-table-cell-content {
          display: flex;
          align-items: center;
          width: 100%;
          min-width: 0;
        }

        .ui-table-cell-value {
          min-width: 0;
        }

        .ui-table-truncate-text {
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }

        .ui-table-mobile-label {
          display: none;
        }

        .ui-table-empty {
          min-height: 150px;
          padding: 28px 16px;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          gap: 6px;
          max-width: 420px;
          margin: 0 auto;
          text-align: center;
        }

        .ui-table-empty-icon {
          width: 38px;
          height: 38px;
          display: grid;
          place-items: center;
          color: color-mix(in srgb, var(--ink) 25%, transparent);
        }

        .ui-table-empty-title {
          font-size: 13px;
          font-weight: 700;
          color: var(--ui-ink);
        }

        .ui-table-empty-subtext {
          max-width: 360px;
          font-size: 11px;
          line-height: 1.45;
          color: var(--ui-soft);
        }

        .ui-table-skeleton-bar {
          height: 13px;
          border-radius: 4px;
          background:
            linear-gradient(
              90deg,
              var(--bg-muted) 25%,
              var(--bg-hover) 37%,
              var(--bg-muted) 63%
            );
          background-size: 200% 100%;
          animation:
            ui-table-shimmer
            1.35s ease infinite;
        }

        @keyframes ui-table-shimmer {
          0% {
            background-position: -200% 0;
          }

          100% {
            background-position: 200% 0;
          }
        }

        /*
         * ============================================================
         * PRINT
         * ============================================================
         */

        @media print {
          @page {
            size: A4 landscape;
            margin: 12mm 10mm 14mm;
          }

          .ui-table-container {
            width: 100%;
            max-width: none;
            min-width: 0;
            border: 0;
            border-radius: 0;
            overflow: visible;
            background: #ffffff;
            box-shadow: none;
            color: #000000;
          }

          .ui-table-wrapper {
            width: 100%;
            max-width: none;
            overflow: visible;
          }

          .ui-table {
            width: 100%;
            min-width: 0;
            max-width: none;
            border-collapse: collapse;
            border-spacing: 0;
            table-layout: auto;
            background: #ffffff;
            color: #000000;
            font-family:
              Arial,
              Helvetica,
              sans-serif;
            font-size: 9pt;
            line-height: 1.25;
          }

          /*
           * Critical:
           * Browser print engines repeat THEAD on every page.
           */
          .ui-table thead {
            display: table-header-group;
          }

          .ui-table tbody {
            display: table-row-group;
          }

          .ui-table tfoot {
            display: table-footer-group;
          }

          .ui-table-tr {
            break-inside: avoid;
            page-break-inside: avoid;
            background: #ffffff !important;
            box-shadow: none !important;
          }

          .ui-table-th,
          .ui-table-td {
            break-inside: avoid;
            page-break-inside: avoid;
            background: #ffffff !important;
            color: #000000 !important;
            border: 1px solid #b8b8b8 !important;
          }

          .ui-table-th {
            padding: 6px 7px;
            background: #eeeeee !important;
            color: #000000 !important;
            font-size: 8pt;
            font-weight: 800;
            line-height: 1.15;
            letter-spacing: 0.02em;
            text-transform: uppercase;
            white-space: nowrap;
            vertical-align: middle;
          }

          .ui-table-td {
            padding: 5px 7px;
            font-size: 8.5pt;
            line-height: 1.25;
            vertical-align: middle;
            white-space: normal;
          }

          .ui-table-cell-content {
            display: block;
            width: 100%;
          }

          .ui-table-cell-value {
            min-width: 0;
            color: #000000 !important;
          }

          .ui-table-truncate-text {
            overflow: visible;
            text-overflow: clip;
            white-space: normal;
            max-width: none;
          }

          /*
           * Hide interactive-only UI.
           */
          .ui-table-sort-icon,
          .ui-table-sort-button {
            cursor: default;
          }

          .ui-table-sort-icon {
            display: none;
          }

          /*
           * Keep first column normal in print.
           * Sticky positioning can break PDF output.
           */
          .ui-table-th:first-child,
          .ui-table-td:first-child {
            position: static !important;
            inset-inline-start: auto !important;
            box-shadow: none !important;
            z-index: auto !important;
          }

          /*
           * Selected/hover states should never affect printed output.
           */
          .ui-table-tr-selected .ui-table-td,
          .ui-table-tr-clickable:hover .ui-table-td,
          .ui-table-tr-clickable:hover
            .ui-table-td:first-child {
            background: #ffffff !important;
            color: #000000 !important;
          }

          /*
           * Empty state.
           */
          .ui-table-empty {
            min-height: 80px;
            padding: 18px;
            color: #000000;
          }

          .ui-table-empty-icon {
            color: #555555;
          }

          .ui-table-empty-title {
            color: #000000;
            font-size: 10pt;
          }

          .ui-table-empty-subtext {
            color: #444444;
            font-size: 8.5pt;
          }

          /*
           * Never print the mobile labels.
           */
          .ui-table-mobile-label {
            display: none !important;
          }

          /*
           * Remove skeleton animation from print.
           */
          .ui-table-skeleton-bar {
            height: 9px;
            animation: none !important;
            background: #dddddd !important;
          }

          /*
           * Avoid breaking a table row across pages.
           */
          tr,
          td,
          th {
            break-inside: avoid;
            page-break-inside: avoid;
          }

          /*
           * Preserve enough contrast when printing.
           */
          * {
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
          }
        }

        @media (max-width: 768px) {
          .ui-table-container {
            border-radius: 8px;
          }

          .ui-table-wrapper {
            overflow-x: auto;
            overflow-y: hidden;
            scrollbar-width: thin;
            -webkit-overflow-scrolling: touch;
            overscroll-behavior-inline: contain;
            padding-bottom: 1px;
          }

          .ui-table {
            display: table;
            width: max-content;
            min-width: 100%;
            table-layout: auto;
            border-collapse: separate;
            border-spacing: 0;
            font-size: 10.5px;
          }

          .ui-table colgroup {
            display: table-column-group;
          }

          .ui-table thead {
            display: table-header-group;
          }

          .ui-table tbody {
            display: table-row-group;
          }

          .ui-table-tr {
            display: table-row;
            margin: 0;
            width: auto;
            border: 0;
            border-radius: 0;
            box-shadow: none;
            background: var(--ui-card);
          }

          .ui-table-th {
            display: table-cell;
            padding: 6px 8px;
            font-size: 8.5px;
            line-height: 1.15;
            letter-spacing: 0.035em;
            position: sticky;
            top: 0;
            z-index: 3;
          }

          .ui-table-td {
            display: table-cell;
            width: auto !important;
            min-width: 0;
            padding: 6px 8px;
            font-size: 10px;
            line-height: 1.2;
            white-space: nowrap;
          }

          .ui-table-mobile-label {
            display: none;
          }

          .ui-table-cell-content {
            display: flex;
            align-items: center;
            min-width: 0;
            width: 100%;
          }

          .ui-table-cell-value {
            min-width: 0;
            font-size: 10px;
            line-height: 1.2;
            overflow-wrap: normal;
          }

          .ui-table-truncate-text {
            max-width: 150px;
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
          }

          .ui-table-sort-button {
            min-height: 22px;
            font-size: inherit;
          }

          .ui-table-sort-icon {
            font-size: 7px;
          }

          .ui-table-empty-row {
            display: table-row;
            width: auto;
            margin: 0;
            border: 0;
            border-radius: 0;
            background: var(--ui-card);
          }

          .ui-table-empty-cell {
            display: table-cell !important;
            width: auto !important;
          }

          .ui-table-empty {
            min-height: 125px;
            padding: 22px 12px;
          }

          .ui-table-th:first-child,
          .ui-table-td:first-child {
            position: sticky;
            inset-inline-start: 0;
          }

          .ui-table-th:first-child {
            z-index: 4;
          }

          .ui-table-td:first-child {
            z-index: 2;
            background: var(--ui-card);
            box-shadow:
              1px 0 0 var(--ui-border),
              5px 0 8px color-mix(in srgb, var(--ink) 8%, transparent);
          }

          .ui-table-tr-clickable:hover
            .ui-table-td:first-child {
            background: var(--ui-hover);
          }

          .ui-table-tr-selected
            .ui-table-td:first-child {
            background: var(--ui-selected);
          }

          .ui-table-skeleton-bar {
            height: 10px;
            min-width: 42px;
          }
        }

        @media (max-width: 480px) {
          .ui-table-container {
            border-radius: 7px;
          }

          .ui-table {
            font-size: 9.5px;
          }

          .ui-table-th {
            padding: 5px 7px;
            font-size: 7.5px;
          }

          .ui-table-td {
            padding: 5px 7px;
            font-size: 9.5px;
          }

          .ui-table-cell-value {
            font-size: 9.5px;
          }

          .ui-table-truncate-text {
            max-width: 120px;
          }

          .ui-table-empty {
            min-height: 115px;
            padding: 20px 10px;
          }
        }

        @media (prefers-reduced-motion: reduce) {
          .ui-table-tr,
          .ui-table-skeleton-bar {
            transition: none;
            animation: none;
          }
        }
      `}</style>

      <div className="ui-table-wrapper">
        <table className="ui-table">
          <colgroup>
            {columns.map((column) => (
              <col
                key={column.key}
                style={{
                  width: column.width || "auto",
                }}
              />
            ))}
          </colgroup>

          <thead>
            <tr>
              {columns.map((column) => {
                const {
                  textAlign,
                  justifyContent,
                } = getAlignment(column.align);

                const isSorted =
                  sortColumn === column.key;

                return (
                  <th
                    key={column.key}
                    className={`ui-table-th ${
                      column.sortable
                        ? "ui-table-th-sortable"
                        : ""
                    }`}
                    style={{
                      padding,
                      textAlign,
                      width: column.width,
                    }}
                    aria-sort={
                      column.sortable && isSorted
                        ? sortDirection === "desc"
                          ? "descending"
                          : "ascending"
                        : column.sortable
                          ? "none"
                          : undefined
                    }
                    onClick={() => {
                      if (column.sortable) {
                        onSort?.(column.key);
                      }
                    }}
                  >
                    {column.sortable ? (
                      <button
                        type="button"
                        className="ui-table-sort-button"
                        style={{
                          justifyContent,
                        }}
                        onClick={(event) => {
                          event.stopPropagation();
                          onSort?.(column.key);
                        }}
                        aria-label={`Sort by ${
                          typeof column.label ===
                          "string"
                            ? column.label
                            : column.key
                        }`}
                      >
                        <span>
                          {column.label}
                        </span>

                        {renderSortIndicator(
                          column,
                        )}
                      </button>
                    ) : (
                      <div
                        className="ui-table-cell-content"
                        style={{
                          justifyContent,
                        }}
                      >
                        <span>
                          {column.label}
                        </span>
                      </div>
                    )}
                  </th>
                );
              })}
            </tr>
          </thead>

          <tbody>
            {loading ? (
              Array.from({
                length: Math.max(
                  1,
                  loadingRowsCount,
                ),
              }).map((_, rowIndex) => (
                <tr
                  key={`skeleton-${rowIndex}`}
                  className="ui-table-tr"
                >
                  {columns.map(
                    (
                      column,
                      columnIndex,
                    ) => (
                      <td
                        key={`skeleton-cell-${column.key}-${columnIndex}`}
                        className="ui-table-td"
                        style={{
                          width:
                            column.width,
                        }}
                      >
                        <span className="ui-table-mobile-label">
                          {column.label}
                        </span>

                        <div
                          className="ui-table-skeleton-bar"
                          style={{
                            width:
                              columnIndex ===
                              0
                                ? "68%"
                                : columnIndex ===
                                    columns.length -
                                      1
                                  ? "42%"
                                  : "56%",
                          }}
                        />
                      </td>
                    ),
                  )}
                </tr>
              ))
            ) : rows.length === 0 ? (
              <tr className="ui-table-empty-row">
                <td
                  colSpan={columns.length}
                  className="ui-table-td ui-table-empty-cell"
                  style={{
                    padding: 0,
                  }}
                >
                  {renderEmptyState()}
                </td>
              </tr>
            ) : (
              rows.map((row, rowIndex) => {
                const rowKey =
                  getRowKey(
                    row,
                    rowIndex,
                  );

                const isSelected =
                  selectedRowKey !==
                    null &&
                  selectedRowKey !==
                    undefined &&
                  rowKey ===
                    String(
                      selectedRowKey,
                    );

                const isClickable =
                  Boolean(onRowClick);

                return (
                  <tr
                    key={rowKey}
                    onClick={() =>
                      onRowClick?.(
                        row,
                        rowIndex,
                      )
                    }
                    tabIndex={
                      isClickable
                        ? 0
                        : undefined
                    }
                    role={
                      isClickable
                        ? "button"
                        : undefined
                    }
                    aria-selected={
                      isClickable
                        ? isSelected
                        : undefined
                    }
                    onKeyDown={
                      isClickable
                        ? (event) => {
                            if (
                              event.key ===
                                "Enter" ||
                              event.key ===
                                " "
                            ) {
                              event.preventDefault();

                              onRowClick?.(
                                row,
                                rowIndex,
                              );
                            }
                          }
                        : undefined
                    }
                    className={`ui-table-tr ${
                      isClickable
                        ? "ui-table-tr-clickable"
                        : ""
                    } ${
                      isSelected
                        ? "ui-table-tr-selected"
                        : ""
                    }`}
                  >
                    {columns.map(
                      (column) => {
                        const {
                          textAlign,
                          justifyContent,
                        } =
                          getAlignment(
                            column.align,
                          );

                        return (
                          <td
                            key={column.key}
                            className="ui-table-td"
                            style={{
                              padding,
                              textAlign,
                              width:
                                column.width,
                            }}
                          >
                            <span className="ui-table-mobile-label">
                              {
                                column.label
                              }
                            </span>

                            <div
                              className="ui-table-cell-content"
                              style={{
                                justifyContent,
                              }}
                            >
                              <span
                                className={`ui-table-cell-value ${
                                  column.truncate
                                    ? "ui-table-truncate-text"
                                    : ""
                                }`}
                              >
                                {renderColumnValue(
                                  row,
                                  column,
                                  rowIndex,
                                )}
                              </span>
                            </div>
                          </td>
                        );
                      },
                    )}
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default Table;
