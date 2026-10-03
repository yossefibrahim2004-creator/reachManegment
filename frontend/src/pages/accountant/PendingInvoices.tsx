import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import api from "../../lib/api";
import { isAbortError } from "../../hooks";
import { notify } from "../../lib/notify";
import { getFriendlyErrorMessage } from "../../lib/messages";
import { getSuccessMessages } from "../../lib/success-messages";
import { Button } from "../../components/ui/Button";
import { Input } from "../../components/ui/Input";
import { Card } from "../../components/ui/Card";
import { Table } from "../../components/ui/Table";
import { StatusChip } from "../../components/ui/StatusChip";
import { Modal } from "../../components/ui/Modal";
import { LoadingSpinner } from "../../components/ui/LoadingSpinner";
import { EmptyState } from "../../components/ui/EmptyState";
import { PageHeader } from "../../components/ui/PageHeader";
import { useI18n } from "../../i18n/context";
import { useRealtimeRefresh } from "../../hooks/useRealtimeEvents";
import type { Invoice, PaginatedResponse } from "../../types";

export default function PendingInvoices() {
  const { t } = useI18n();
  const SUCCESS_MESSAGES = getSuccessMessages(t);
  const navigate = useNavigate();
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedInvoice, setSelectedInvoice] = useState<Invoice | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [rejectModalOpen, setRejectModalOpen] = useState(false);
  const [rejectReason, setRejectReason] = useState("");
  const [rejectReasonError, setRejectReasonError] = useState("");
  const [actionLoading, setActionLoading] = useState(false);

  const fetchInvoices = useCallback(async (signal?: AbortSignal) => {
    setLoading(true);
    try {
      const { data } = await api.get<PaginatedResponse<Invoice>>("/invoices", {
        params: { status: "PENDING_ACCOUNTANT", limit: 50 },
        signal,
      });
      setInvoices(data.data || []);
    } catch (err) {
      if (isAbortError(err)) return;
      // handle silently
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    void fetchInvoices(controller.signal);
    return () => controller.abort();
  }, [fetchInvoices]);

  useRealtimeRefresh(() => {
    void fetchInvoices();
  }, ["invoice.created", "invoice.confirmed", "invoice.rejected"]);

  const openDetail = async (invoice: Invoice) => {
    setDetailLoading(true);
    setSelectedInvoice(invoice);
    try {
      const { data } = await api.get(`/invoices/${invoice.id}`);
      setSelectedInvoice(data);
    } catch {
      // handle silently
    } finally {
      setDetailLoading(false);
    }
  };

  const handleConfirm = async () => {
    if (!selectedInvoice) return;
    setActionLoading(true);
    try {
      await api.patch(`/invoices/${selectedInvoice.id}/confirm`);
      setSelectedInvoice(null);
      fetchInvoices();
      notify.success(SUCCESS_MESSAGES.invoice.confirmed);
    } catch (err) {
      notify.error(getFriendlyErrorMessage(err, t));
    } finally {
      setActionLoading(false);
    }
  };

  const handleReject = async () => {
    if (!selectedInvoice) return;
    if (!rejectReason.trim()) {
      setRejectReasonError(t.errors.common.reasonRequired);
      return;
    }
    setRejectReasonError("");
    setActionLoading(true);
    try {
      await api.patch(`/invoices/${selectedInvoice.id}/reject`, { reason: rejectReason.trim() });
      setSelectedInvoice(null);
      setRejectModalOpen(false);
      setRejectReason("");
      fetchInvoices();
      notify.warning(SUCCESS_MESSAGES.invoice.rejected);
    } catch (err) {
      notify.error(getFriendlyErrorMessage(err, t));
    } finally {
      setActionLoading(false);
    }
  };

  const columns = [
    {
      key: "invoiceNumber",
      label: t.invoices.invoiceNumber,
      render: (row: Invoice) => (
        <span style={{ fontWeight: 600, fontVariantNumeric: "tabular-nums" }}>{row.invoiceNumber}</span>
      ),
    },
    {
      key: "customer",
      label: t.invoices.customer,
      render: (row: Invoice) => row.customer?.name || "—",
    },
    {
      key: "employee",
      label: t.invoices.employee,
      render: (row: Invoice) => row.employee?.name || "—",
    },
    {
      key: "date",
      label: t.date,
      render: (row: Invoice) => new Date(row.date).toLocaleDateString(),
    },
    {
      key: "itemCount",
      label: t.items,
      align: "center" as const,
      render: (row: Invoice) => (
        <span style={{ fontVariantNumeric: "tabular-nums" }}>{row.items?.length ?? 0}</span>
      ),
    },
    {
      key: "currentTotal",
      label: t.total,
      align: "right" as const,
      render: (row: Invoice) => (
        <span style={{ fontWeight: 600, fontVariantNumeric: "tabular-nums" }}>
          {t.currency} {Number(row.currentTotal).toFixed(2)}
        </span>
      ),
    },
    {
      key: "status",
      label: t.status,
      render: (row: Invoice) => <StatusChip status={row.status} />,
    },
  ];

  return (
    <div>
      <PageHeader
        title={t.pages.pendingInvoices}
        subtitle={t.pages.pendingInvoicesSubtitle}
      />

      {loading ? (
        <div className="state-block">
          <LoadingSpinner size={28} />
        </div>
      ) : invoices.length === 0 ? (
        <EmptyState
          title={t.invoices.noInvoices}
          description="No pending invoices to review"
          icon={
            <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
          }
        />
      ) : (
        <Table
          columns={columns}
                data={invoices}
          onRowClick={(row) => openDetail(row as unknown as Invoice)}
          keyExtractor={(row) => String((row as unknown as Invoice).id)}
        />
      )}

      <Modal
        isOpen={!!selectedInvoice}
        onClose={() => setSelectedInvoice(null)}
        title={`${t.invoices.invoiceNumber} ${selectedInvoice?.invoiceNumber || ""}`}
        footer={
          selectedInvoice?.status === "PENDING_ACCOUNTANT" ? (
            <>
              <Button variant="danger" onClick={() => { setRejectReasonError(""); setRejectModalOpen(true); }} loading={actionLoading}>
                {t.changeRequests.reject}
              </Button>
              <Button variant="primary" onClick={handleConfirm} loading={actionLoading}>
                {t.confirm}
              </Button>
            </>
          ) : undefined
        }
      >
        {detailLoading ? (
          <div className="state-block">
            <LoadingSpinner size={24} />
          </div>
        ) : selectedInvoice ? (
          <>
            {/* Items list */}
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                gap: "6px",
                marginBottom: "12px",
              }}
            >
              {selectedInvoice.items?.map((item) => (
                <div
                  key={item.id}
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    padding: "8px 0",
                    borderBottom: "1px solid var(--border)",
                  }}
                >
                  <div style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
                    <span
                      style={{
                        fontFamily: "'Manrope', sans-serif",
                        fontSize: "14px",
                        fontWeight: 600,
                        color: "var(--ink)",
                      }}
                    >
                      {item.productModel?.name || "—"}
                    </span>
                    <span
                      style={{
                        fontFamily: "'Manrope', sans-serif",
                        fontSize: "12px",
                        color: "var(--soft)",
                        fontVariantNumeric: "tabular-nums",
                      }}
                    >
                      {item.quantity} × {t.currency} {Number(item.price).toFixed(2)}
                    </span>
                  </div>

                  <span
                    style={{
                      fontFamily: "'Manrope', sans-serif",
                      fontSize: "14px",
                      fontWeight: 600,
                      fontVariantNumeric: "tabular-nums",
                      color: "var(--ink)",
                    }}
                  >
                    {t.currency} {(Number(item.quantity) * Number(item.price)).toFixed(2)}
                  </span>
                </div>
              ))}
            </div>

            {/* Totals summary */}
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                gap: "8px",
                paddingTop: "12px",
                borderTop: "1px solid var(--border)",
              }}
            >
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                }}
              >
                <span
                  style={{
                    fontFamily: "'Manrope', sans-serif",
                    fontSize: "13px",
                    color: "var(--soft)",
                  }}
                >
                  Subtotal
                </span>

                <span
                  style={{
                    fontFamily: "'Manrope', sans-serif",
                    fontSize: "13px",
                    fontWeight: 600,
                    fontVariantNumeric: "tabular-nums",
                    color: "var(--ink)",
                  }}
                >
                  {t.currency} {Number(selectedInvoice.originalTotal).toFixed(2)}
                </span>
              </div>

              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                }}
              >
                <span
                  style={{
                    fontFamily: "'Manrope', sans-serif",
                    fontSize: "13px",
                    color: "var(--soft)",
                  }}
                >
                  Discount ({Number(selectedInvoice.discountPercentage || 0).toFixed(0)}%)
                </span>

                <span
                  style={{
                    fontFamily: "'Manrope', sans-serif",
                    fontSize: "13px",
                    fontWeight: 600,
                    fontVariantNumeric: "tabular-nums",
                    color: "var(--peach)",
                  }}
                >
                  - {t.currency}{" "}
                  {(
                    Number(selectedInvoice.originalTotal || 0) -
                    Number(selectedInvoice.currentTotal || 0)
                  ).toFixed(2)}
                </span>
              </div>

              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  paddingTop: "8px",
                  borderTop: "1px solid var(--border)",
                }}
              >
                <span
                  style={{
                    fontFamily: "'Sora', sans-serif",
                    fontSize: "16px",
                    fontWeight: 700,
                    color: "var(--ink)",
                  }}
                >
                  {t.total}
                </span>

                <span
                  style={{
                    fontFamily: "'Sora', sans-serif",
                    fontSize: "16px",
                    fontWeight: 700,
                    fontVariantNumeric: "tabular-nums",
                    color: "var(--ink)",
                  }}
                >
                  {t.currency} {Number(selectedInvoice.currentTotal).toFixed(2)}
                </span>
              </div>
            </div>
          </>
        ) : null}
      </Modal>

      <Modal
        isOpen={rejectModalOpen}
        onClose={() => { setRejectModalOpen(false); setRejectReason(""); setRejectReasonError(""); }}
        title={t.changeRequests.rejectTitle}
        footer={
          <>
            <Button variant="secondary" onClick={() => { setRejectModalOpen(false); setRejectReason(""); setRejectReasonError(""); }}>{t.cancel}</Button>
            <Button variant="danger" onClick={handleReject} loading={actionLoading}>
              {t.changeRequests.reject}
            </Button>
          </>
        }
      >
        <Input
          label={t.changeRequests.rejectReason}
          value={rejectReason}
          onChange={(e) => {
            setRejectReason(e.target.value);
            setRejectReasonError("");
          }}
          placeholder={t.changeRequests.rejectReasonPlaceholder}
          error={rejectReasonError}
        />
      </Modal>
    </div>
  );
}