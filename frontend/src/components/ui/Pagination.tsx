import React from "react";
import { Button } from "./Button";
import { useI18n } from "../../i18n/context";

interface PaginationProps {
  currentStart: number;
  currentEnd: number;
  total: number;
  currentPage: number;
  totalPages: number;
  onPrev: () => void;
  onNext: () => void;
  loading?: boolean;
}

export function Pagination({
  currentStart,
  currentEnd,
  total,
  currentPage,
  totalPages,
  onPrev,
  onNext,
  loading = false,
}: PaginationProps) {
  const { t } = useI18n();

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        flexWrap: "wrap",
        gap: "8px 16px",
        fontFamily: "'Manrope', sans-serif",
        fontSize: "13px",
        color: "var(--soft)",
        padding: "12px 0 4px",
      }}
    >
      <span style={{ minWidth: 0 }}>
        {t.pagination.showing} {currentStart}–{currentEnd} {t.pagination.of} {total}
      </span>
      <div style={{ display: "flex", alignItems: "center", gap: "12px", flexWrap: "wrap" }}>
        <span style={{ fontVariantNumeric: "tabular-nums" }}>
          {t.pagination.page} {currentPage} {t.pagination.ofPage} {totalPages}
        </span>
        <div style={{ display: "flex", gap: "4px" }}>
          <Button
            variant="secondary"
            size="sm"
            disabled={currentPage <= 1 || loading}
            onClick={onPrev}
          >
            {t.prev}
          </Button>
          <Button
            variant="secondary"
            size="sm"
            disabled={currentPage >= totalPages || loading}
            onClick={onNext}
          >
            {t.next}
          </Button>
        </div>
      </div>
    </div>
  );
}

export default Pagination;
