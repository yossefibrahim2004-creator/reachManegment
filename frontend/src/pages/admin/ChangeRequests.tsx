import { useState, useEffect, useCallback } from "react";
import api from "../../lib/api";
import { isAbortError } from "../../hooks";
import { notify } from "../../lib/notify";
import { getFriendlyErrorMessage } from "../../lib/messages";
import { getSuccessMessages } from "../../lib/success-messages";
import { useI18n } from "../../i18n/context";
import { useRealtimeRefresh } from "../../hooks/useRealtimeEvents";
import { PageHeader } from "../../components/ui/PageHeader";
import { Button } from "../../components/ui/Button";
import { Select } from "../../components/ui/Select";
import { StatusChip } from "../../components/ui/StatusChip";
import { Modal } from "../../components/ui/Modal";
import { Input } from "../../components/ui/Input";
import { LoadingSpinner } from "../../components/ui/LoadingSpinner";
import { EmptyState } from "../../components/ui/EmptyState";
import type { InvoiceChangeRequest } from "../../types";

export default function ChangeRequests() {
  const { t } = useI18n();
  const SUCCESS_MESSAGES = getSuccessMessages(t);
  const [requests, setRequests] = useState<InvoiceChangeRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState("PENDING");
  const [selected, setSelected] = useState<InvoiceChangeRequest | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  const [rejectModalOpen, setRejectModalOpen] = useState(false);
  const [rejectReason, setRejectReason] = useState("");
  const [rejectReasonError, setRejectReasonError] = useState("");
  const [processing, setProcessing] = useState(false);

  const fetchRequests = useCallback(async (signal?: AbortSignal) => {
    setLoading(true);
    try {
      const params: Record<string, string> = {};
      if (statusFilter) params.status = statusFilter;
      const res = await api.get("/change-requests", { params, signal });
      setRequests(res.data.data ?? res.data);
    } catch (err) {
      if (isAbortError(err)) return;
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }, [statusFilter]);

  useEffect(() => {
    const controller = new AbortController();
    void fetchRequests(controller.signal);
    return () => controller.abort();
  }, [fetchRequests]);

  useRealtimeRefresh(() => {
    void fetchRequests();
  }, ["invoice.change-request.created"]);

  const loadDetail = async (id: number) => {
    setDetailLoading(true);
    try {
      const res = await api.get(`/change-requests/${id}`);
      setSelected(res.data);
    } catch {
      /* empty */
    } finally {
      setDetailLoading(false);
    }
  };

  const handleApprove = async (id: number) => {
    setProcessing(true);
    try {
      await api.patch(`/change-requests/${id}/approve`);
      setSelected(null);
      fetchRequests();
      notify.success(SUCCESS_MESSAGES.changeRequest.approved);
    } catch (err) {
      notify.error(getFriendlyErrorMessage(err, t));
    } finally {
      setProcessing(false);
    }
  };

  const handleReject = async () => {
    if (!selected) return;
    if (!rejectReason.trim()) {
      setRejectReasonError(t.errors.common.reasonRequired);
      return;
    }
    setRejectReasonError("");
    setProcessing(true);
    try {
      await api.patch(`/change-requests/${selected.id}/reject`, { reason: rejectReason.trim() });
      setRejectModalOpen(false);
      setRejectReason("");
      setRejectReasonError("");
      setSelected(null);
      fetchRequests();
      notify.warning(SUCCESS_MESSAGES.changeRequest.rejected);
    } catch (err) {
      notify.error(getFriendlyErrorMessage(err, t));
    } finally {
      setProcessing(false);
    }
  };

  const openRejectModal = () => {
    setRejectReason("");
    setRejectReasonError("");
    setRejectModalOpen(true);
  };

  const closeRejectModal = () => {
    setRejectModalOpen(false);
    setRejectReason("");
    setRejectReasonError("");
  };

  const fmt = (n: number) =>
    n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  return (
    <div>
      <PageHeader title={t.pages.changeRequests} subtitle={t.pages.changeRequestsSubtitle} />

      <div className="toolbar" style={{ marginBottom: "var(--section-gap)" }}>
        <div className="toolbar-fixed">
          <Select
            options={[
              { label: t.changeRequests.pending, value: "PENDING" },
              { label: t.changeRequests.approved, value: "APPROVED" },
              { label: t.changeRequests.rejected, value: "REJECTED" },
              { label: t.all, value: "" },
            ]}
            value={statusFilter}
            onChange={(e) => { setStatusFilter(e.target.value); setSelected(null); }}
          />
        </div>
      </div>

      <div className="flex flex-col gap-[var(--section-gap)] items-start xl:flex-row">
        {/* List */}
        <div style={{ flex: 1, minWidth: 0, width: "100%", maxWidth: 480 }}>
          {loading ? (
            <div className="state-block">
              <LoadingSpinner size={28} />
            </div>
          ) : requests.length === 0 ? (
            <EmptyState title={t.changeRequests.noRequests} description={t.changeRequests.noRequestsMatch} />
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
              {requests.map((req) => (
                <div
                  key={req.id}
                  onClick={() => loadDetail(req.id)}
                  style={{
                    backgroundColor: selected?.id === req.id ? "var(--row-selected)" : "var(--card)",
                    border: `1px solid ${selected?.id === req.id ? "var(--brand)" : "var(--border)"}`,
                    borderRadius: "var(--radius-md)",
                    padding: "14px 16px",
                    cursor: "pointer",
                    transition: "border-color 0.15s ease",
                    display: "flex",
                    flexDirection: "column",
                    gap: "6px",
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <span style={{ fontFamily: "'Sora', sans-serif", fontSize: "14px", fontWeight: 600, color: "var(--ink)" }}>
                      {req.type}
                    </span>
                    <StatusChip status={req.status} />
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <span style={{ fontFamily: "'Manrope', sans-serif", fontSize: "13px", color: "var(--soft)" }}>
                      {t.byName(req.requestedBy?.name ?? "Unknown")}
                    </span>
                    <span style={{ fontFamily: "'Manrope', sans-serif", fontSize: "12px", color: "var(--soft)" }}>
                      {new Date(req.createdAt).toLocaleDateString()}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Detail */}
        <div style={{ flex: 1, minWidth: 0, width: "100%" }}>
          {detailLoading ? (
            <div className="state-block">
              <LoadingSpinner size={28} />
            </div>
          ) : !selected ? (
            <EmptyState title={t.changeRequests.selectRequest} description={t.changeRequests.selectRequestHint} />
          ) : (
            <div style={{ backgroundColor: "var(--card)", border: "1px solid var(--border)", borderRadius: "var(--radius-md)", padding: "16px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "8px", marginBottom: "16px", flexWrap: "wrap" }}>
                <div>
                  <h3 style={{ fontFamily: "'Sora', sans-serif", fontSize: "16px", fontWeight: 600, color: "var(--ink)", margin: 0 }}>
                    {selected.type}
                  </h3>
                  <p style={{ fontFamily: "'Manrope', sans-serif", fontSize: "13px", color: "var(--soft)", margin: "4px 0 0" }}>
                    {t.invoices.invoiceNumber} {selected.invoice?.invoiceNumber ?? "—"}
                  </p>
                </div>
                <StatusChip status={selected.status} />
              </div>

              <div className="form-grid-wide page-section" style={{ gap: "12px" }}>
                <div>
                  <p style={{ fontFamily: "'Manrope', sans-serif", fontSize: "12px", fontWeight: 600, color: "var(--soft)", textTransform: "uppercase", letterSpacing: "0.04em", margin: "0 0 4px" }}>{t.changeRequests.requester}</p>
                  <p style={{ fontFamily: "'Manrope', sans-serif", fontSize: "14px", color: "var(--ink)", margin: 0 }}>{selected.requestedBy?.name ?? "—"}</p>
                </div>
                <div>
                  <p style={{ fontFamily: "'Manrope', sans-serif", fontSize: "12px", fontWeight: 600, color: "var(--soft)", textTransform: "uppercase", letterSpacing: "0.04em", margin: "0 0 4px" }}>{t.changeRequests.time}</p>
                  <p style={{ fontFamily: "'Manrope', sans-serif", fontSize: "14px", color: "var(--ink)", margin: 0 }}>{new Date(selected.createdAt).toLocaleString()}</p>
                </div>
              </div>

              <div style={{ marginBottom: "20px" }}>
                <p style={{ fontFamily: "'Manrope', sans-serif", fontSize: "12px", fontWeight: 600, color: "var(--soft)", textTransform: "uppercase", letterSpacing: "0.04em", margin: "0 0 8px" }}>{t.changeRequests.proposedChanges}</p>
                {selected.items?.map((item) => (
                  <div key={item.id} style={{ padding: "12px", backgroundColor: "var(--surface)", borderRadius: "8px", marginBottom: "8px" }}>
                    <div style={{ display: "flex", justifyContent: "space-between" }}>
                      <span style={{ fontFamily: "'Manrope', sans-serif", fontSize: "13px", color: "var(--ink)" }}>
                        {item.action} — {item.productUnit?.barcode ?? "N/A"}
                      </span>
                      {item.proposedPrice != null && (
                        <span style={{ fontFamily: "'Manrope', sans-serif", fontSize: "13px", fontWeight: 600, color: "var(--ink)", fontVariantNumeric: "tabular-nums" }}>
                          {t.currency} {fmt(item.proposedPrice)}
                        </span>
                      )}
                    </div>
                    {item.notes && (
                      <p style={{ fontFamily: "'Manrope', sans-serif", fontSize: "12px", color: "var(--soft)", margin: "4px 0 0" }}>{item.notes}</p>
                    )}
                  </div>
                ))}
              </div>

              <div style={{ marginBottom: "20px" }}>
                <p style={{ fontFamily: "'Manrope', sans-serif", fontSize: "12px", fontWeight: 600, color: "var(--soft)", textTransform: "uppercase", letterSpacing: "0.04em", margin: "0 0 4px" }}>{t.changeRequests.reason}</p>
                <p style={{ fontFamily: "'Manrope', sans-serif", fontSize: "14px", color: "var(--ink)", margin: 0 }}>{selected.reason || t.changeRequests.noReason}</p>
              </div>

              {selected.status === "PENDING" && (
                <div style={{ display: "flex", gap: "12px" }}>
                  <Button
                    variant="primary"
                    style={{ backgroundColor: "var(--mint-fill)", borderColor: "var(--mint-fill)" }}
                    loading={processing}
                    onClick={() => handleApprove(selected.id)}
                  >
                    {t.changeRequests.approve}
                  </Button>
                  <Button
                    variant="danger"
                    onClick={openRejectModal}
                  >
                    {t.changeRequests.reject}
                  </Button>
                </div>
              )}

              {selected.adminNote && (
                <div style={{ marginTop: "20px", padding: "12px", backgroundColor: "var(--surface)", borderRadius: "8px" }}>
                  <p style={{ fontFamily: "'Manrope', sans-serif", fontSize: "12px", fontWeight: 600, color: "var(--soft)", textTransform: "uppercase", letterSpacing: "0.04em", margin: "0 0 4px" }}>{t.changeRequests.adminNote}</p>
                  <p style={{ fontFamily: "'Manrope', sans-serif", fontSize: "14px", color: "var(--ink)", margin: 0 }}>{selected.adminNote}</p>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      <Modal
        isOpen={rejectModalOpen}
        onClose={closeRejectModal}
        title={t.changeRequests.rejectTitle}
        footer={
          <>
            <Button variant="secondary" onClick={closeRejectModal}>{t.cancel}</Button>
            <Button variant="danger" onClick={handleReject} loading={processing} disabled={!rejectReason}>{t.changeRequests.reject}</Button>
          </>
        }
      >
        <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
          <p style={{ fontFamily: "'Manrope', sans-serif", fontSize: "14px", color: "var(--soft)", margin: 0 }}>
            {t.changeRequests.rejectReasonPrompt}
          </p>
          <Input
            label={t.changeRequests.rejectReason}
            value={rejectReason}
            error={rejectReasonError}
            onChange={(e) => { setRejectReasonError(""); setRejectReason(e.target.value); }}
            placeholder={t.changeRequests.rejectReasonPlaceholder}
          />
        </div>
      </Modal>
    </div>
  );
}