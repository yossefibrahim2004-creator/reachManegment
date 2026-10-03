import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import api from "../../lib/api";
import { isAbortError } from "../../hooks";
import { Button } from "../../components/ui/Button";
import { Table } from "../../components/ui/Table";
import { Pagination } from "../../components/ui/Pagination";
import { StatusChip } from "../../components/ui/StatusChip";
import { LoadingSpinner } from "../../components/ui/LoadingSpinner";
import { EmptyState } from "../../components/ui/EmptyState";
import { PageHeader } from "../../components/ui/PageHeader";
import { useI18n } from "../../i18n/context";
import type { InvoiceChangeRequest, PaginatedResponse } from "../../types";

export default function MyRequests() {
  const navigate = useNavigate();
  const { t } = useI18n();
  const [requests, setRequests] = useState<PaginatedResponse<InvoiceChangeRequest> | null>(null);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);

  const fetchRequests = useCallback(async (signal?: AbortSignal) => {
    setLoading(true);
    try {
      const { data } = await api.get<PaginatedResponse<InvoiceChangeRequest>>("/change-requests", {
        params: { page, limit: 15, scope: "mine" },
        signal,
      });
      setRequests(data);
    } catch (err) {
      if (isAbortError(err)) return;
      // handle silently
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }, [page]);

  useEffect(() => {
    const controller = new AbortController();
    void fetchRequests(controller.signal);
    return () => controller.abort();
  }, [fetchRequests]);

  const columns = [
    {
      key: "invoice",
      label: t.myRequests.invoice,
      render: (row: InvoiceChangeRequest) => (
        <span style={{ fontWeight: 600, fontVariantNumeric: "tabular-nums" }}>
          {row.invoice?.invoiceNumber || `#${row.invoiceId}`}
        </span>
      ),
    },
    {
      key: "type",
      label: t.myRequests.type,
      render: (row: InvoiceChangeRequest) => (
        <span style={{ textTransform: "capitalize", fontWeight: 500 }}>{row.type.replace(/_/g, " ").toLowerCase()}</span>
      ),
    },
    {
      key: "reason",
      label: t.myRequests.reason,
      render: (row: InvoiceChangeRequest) => (
        <span style={{ color: "var(--soft)", maxWidth: "200px", display: "inline-block", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {row.reason}
        </span>
      ),
    },
    {
      key: "status",
      label: t.status,
      render: (row: InvoiceChangeRequest) => <StatusChip status={row.status} />,
    },
    {
      key: "createdAt",
      label: t.myRequests.submitted,
      render: (row: InvoiceChangeRequest) => (
        <span style={{ fontVariantNumeric: "tabular-nums", fontSize: "13px" }}>
          {new Date(row.createdAt).toLocaleDateString()}
        </span>
      ),
    },
  ];

  const data = requests?.data || [];
  const meta = requests?.meta;

  return (
    <div>
      <PageHeader
        title={t.pages.myRequests}
        subtitle={t.pages.myRequestsSubtitle}
        actions={
          <Button onClick={() => navigate("/sales/change-request")}>
            + {t.myRequests.newRequest}
          </Button>
        }
      />

      {loading ? (
        <div className="state-block">
          <LoadingSpinner size={28} />
        </div>
      ) : data.length === 0 ? (
        <EmptyState
          title={t.myRequests.noRequests}
          description={t.myRequests.noRequestsHint}
          icon={
            <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
            </svg>
          }
        />
      ) : (
        <>
          <Table
            columns={columns}
            data={data}
            onRowClick={(row) => {
              const req = row as unknown as InvoiceChangeRequest;
              if (req.invoiceId) navigate(`/sales/invoice/${req.invoiceId}`);
            }}
            keyExtractor={(row) => String((row as unknown as InvoiceChangeRequest).id)}
          />
          {meta && meta.totalPages > 1 && (
            <Pagination
              currentStart={(meta.page - 1) * meta.limit + 1}
              currentEnd={Math.min(meta.page * meta.limit, meta.total)}
              total={meta.total}
              currentPage={meta.page}
              totalPages={meta.totalPages}
              onPrev={() => setPage((p) => Math.max(1, p - 1))}
              onNext={() => setPage((p) => Math.min(meta.totalPages, p + 1))}
              loading={loading}
            />
          )}
        </>
      )}
    </div>
  );
}
