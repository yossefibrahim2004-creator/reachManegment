import React, { type ReactNode } from "react";
import { Button } from "../../../components/ui/Button";
import { LoadingSpinner } from "../../../components/ui/LoadingSpinner";
import { EmptyState } from "../../../components/ui/EmptyState";
import { Table } from "../../../components/ui/Table";
import { useReportDetails } from "../hooks/useReportDetails";
import { useI18n } from "../../../i18n/context";

export interface DetailColumn<T> {
  key: string;
  label: string;
  align?: "left" | "right" | "center";
  render?: (item: T) => ReactNode;
}

interface ReportDetailRowProps<T> {
  rowId?: number | string | null;
  from: string;
  to: string;
  endpoint: string;
  label?: string;
  detailTitle?: string;
  detailColumns: DetailColumn<T>[];
  emptyMessage?: string;
  transform?: (payload: any) => T[];
  groupBy?: (item: T) => string | null | undefined;
  groupLabel?: (groupKey: string) => ReactNode;
}

export function ReportDetailRow<T>({
  rowId,
  from,
  to,
  endpoint,
  label = "Show Details",
  detailTitle,
  detailColumns,
  emptyMessage = "No details available",
  transform,
}: ReportDetailRowProps<T>) {
  const { t } = useI18n();
  const [expanded, setExpanded] = React.useState(false);

  const detailQuery = useReportDetails<{ items?: T[] }>({
    endpoint: rowId ? `${endpoint}/${rowId}/details` : `${endpoint}/details`,
    params: { from, to },
    enabled: expanded,
  });

  const rows = React.useMemo(() => {
    const payload = detailQuery.data as any;
    if (!payload) return [] as T[];
    return transform ? transform(payload) : payload.items ?? [];
  }, [detailQuery.data, transform]);

  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-start", gap: "10px", minWidth: 140 }}>
      <Button type="button" variant={expanded ? "primary" : "secondary"} size="sm" onClick={() => setExpanded((prev) => !prev)} style={{ minWidth: 120, boxShadow: expanded ? "var(--shadow-md)" : "none" }}>
        {expanded ? t.reports.hideDetails : label}
      </Button>

      {expanded && (
        <div style={{ width: "100%", marginTop: "4px", padding: "16px", borderRadius: "var(--radius-md)", border: "1px solid var(--border)", background: "linear-gradient(180deg, color-mix(in srgb, var(--brand) 2%, transparent), transparent)" }}>
          {detailQuery.isLoading ? (
          <div className="state-block">
              <LoadingSpinner size={22} />
            </div>
          ) : detailQuery.isError ? (
            <EmptyState title={t.reports.failedToLoadDetails} description={t.reports.couldNotLoadDetails} />
          ) : rows.length === 0 ? (
            <EmptyState title={emptyMessage} description={t.reports.noTransactionsForRow} />
          ) : (
            <div>
              {detailTitle && (
                <div style={{ marginBottom: "8px", fontWeight: 700, color: "var(--ink)" }}>{detailTitle}</div>
              )}
              <Table columns={detailColumns as any[]} data={rows} emptyMessage={emptyMessage} />
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export function ReportDetailPanel<T>({
  rowId,
  from,
  to,
  endpoint,
  detailTitle,
  detailColumns,
  emptyMessage = "No details available",
  transform,
  enabled = true,
  groupBy,
  groupLabel,
}: ReportDetailRowProps<T> & { enabled?: boolean }) {
  const { t } = useI18n();
  const detailQuery = useReportDetails<{ items?: T[] }>({
    endpoint: rowId ? `${endpoint}/${rowId}/details` : `${endpoint}/details`,
    params: { from, to },
    enabled: enabled,
  });

  const rows = React.useMemo(() => {
    const payload = detailQuery.data as any;
    if (!payload) return [] as T[];
    return transform ? transform(payload) : payload.items ?? [];
  }, [detailQuery.data, transform]);

  const groupedRows = React.useMemo(() => {
    if (!groupBy) {
      return [{ key: "all", label: null, rows }];
    }

    const groups = new Map<string, T[]>();
    rows.forEach((row: T) => {
      const groupKey = groupBy(row);
      const normalizedKey = (groupKey ?? t.other).trim() || t.other;
      if (!groups.has(normalizedKey)) {
        groups.set(normalizedKey, []);
      }
      groups.get(normalizedKey)!.push(row);
    });

    return Array.from(groups.entries()).map(([groupKey, groupItems]) => ({
      key: groupKey,
      label: groupLabel ? groupLabel(groupKey) : groupKey,
      rows: groupItems,
    }));
  }, [groupBy, groupLabel, rows]);

  if (!enabled) return null;

  return (
    <div style={{ width: "100%", marginTop: "14px", padding: "16px", borderRadius: "var(--radius-md)", border: "1px solid var(--border)", background: "linear-gradient(180deg, color-mix(in srgb, var(--brand) 2%, transparent), transparent)", boxShadow: "var(--shadow-sm)" }}>
      {detailQuery.isLoading ? (
        <div className="state-block">
          <LoadingSpinner size={22} />
        </div>
      ) : detailQuery.isError ? (
        <EmptyState title={t.reports.failedToLoadDetails} description={t.reports.couldNotLoadDetails} />
      ) : rows.length === 0 ? (
        <EmptyState title={emptyMessage} description={t.reports.noTransactionsForRow} />
      ) : (
        <div>
          {detailTitle && (
            <div style={{ marginBottom: "12px", fontWeight: 700, color: "var(--ink)" }}>{detailTitle}</div>
          )}
          <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
            {groupedRows.map((group) => (
              <div key={group.key}>
                {group.label && (
                  <div style={{ marginBottom: "8px", padding: "8px 10px", borderRadius: "10px", background: "var(--brand-bg)", border: "1px solid color-mix(in srgb, var(--brand) 25%, transparent)", color: "var(--ink)", fontWeight: 700, fontSize: "13px" }}>
                    {group.label}
                  </div>
                )}
                <Table columns={detailColumns as any[]} data={group.rows} emptyMessage={emptyMessage} />
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export default function ReportDetailTable<T>({
  data,
  detailColumns,
  title,
  emptyMessage,
}: {
  data: T[] | null | undefined;
  detailColumns: DetailColumn<T>[];
  title?: string;
  emptyMessage?: string;
}) {
  const { t } = useI18n();
  if (!data || data.length === 0) {
    return <EmptyState title={emptyMessage ?? t.reports.noDetailsAvailable} description={t.reports.noTransactionsForRow} />;
  }

  return (
    <div>
      {title && <div style={{ marginBottom: "8px", fontWeight: 700, color: "var(--ink)" }}>{title}</div>}
      <Table columns={detailColumns as any[]} data={data} emptyMessage={emptyMessage ?? t.reports.noDetailsAvailable} />
    </div>
  );
}
