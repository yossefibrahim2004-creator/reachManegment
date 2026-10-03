import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import api from "../../lib/api";
import { isAbortError } from "../../hooks";
import { Button } from "../../components/ui/Button";
import { StatusChip } from "../../components/ui/StatusChip";
import { LoadingSpinner } from "../../components/ui/LoadingSpinner";
import { useI18n } from "../../i18n/context";
import { useSettings } from "../../lib/settings";
import BrandLogo from "../../components/BrandLogo";
import PrintButton from "../../features/reports/components/PrintButton";
import PrintHeader from "../../features/reports/components/PrintHeader";
import type { Invoice, InvoiceAuditLog } from "../../types";

const formatMoney = (value: unknown) => Number(value ?? 0).toFixed(2);

const formatDate = (value: string | Date) =>
  new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(new Date(value));

const formatDateTime = (value: string | Date) =>
  new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(value));

export default function AdminInvoiceDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { t } = useI18n();
  const { brand } = useSettings();

  const [invoice, setInvoice] = useState<Invoice | null>(null);
  const [auditLogs, setAuditLogs] = useState<InvoiceAuditLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [auditLoading, setAuditLoading] = useState(true);

  useEffect(() => {
    if (!id) {
      setLoading(false);
      setAuditLoading(false);
      return;
    }

    const controller = new AbortController();
    const { signal } = controller;

    async function loadInvoice() {
      try {
        const response = await api.get(`/invoices/${id}`, { signal });
        setInvoice(response.data);
      } catch (err) {
        if (isAbortError(err)) return;
        setInvoice(null);
      } finally {
        if (!signal.aborted) setLoading(false);
      }
    }

    async function loadAudit() {
      try {
        const response = await api.get(`/audit/invoices/${id}`, { signal });
        setAuditLogs(Array.isArray(response.data) ? response.data : []);
      } catch (err) {
        if (isAbortError(err)) return;
        setAuditLogs([]);
      } finally {
        if (!signal.aborted) setAuditLoading(false);
      }
    }

    void loadInvoice();
    void loadAudit();

    return () => {
      controller.abort();
    };
  }, [id]);

  const invoiceDate = useMemo(
    () => (invoice ? formatDate(invoice.date) : ""),
    [invoice],
  );

  const items = invoice?.items ?? [];

  if (loading) {
    return (
      <>
        <div
          className="invoice-state"
          role="status"
          aria-label="Loading invoice"
        >
          <LoadingSpinner size={32} />
        </div>
        <InvoiceStyles />
      </>
    );
  }

  if (!invoice) {
    return (
      <div className="invoice-state invoice-empty">
        <p>{t.invoices.invoiceNotFound}</p>
        <Button
          variant="secondary"
          onClick={() => navigate("/sales/invoice-search")}
        >
          {t.invoices.backToSearch}
        </Button>
        <InvoiceStyles />
      </div>
    );
  }

  return (
    <div className="invoice-page" dir="rtl">
      <div className="invoice-ambient invoice-ambient-top" aria-hidden="true" />
      <div
        className="invoice-ambient invoice-ambient-side"
        aria-hidden="true"
      />

      <div className="invoice-container">
        <header className="invoice-toolbar no-print">
          <div className="invoice-brand">
            <BrandLogo size={42} radius={10} />
            <span>
              <strong>{brand.businessName}</strong>
              <small>{t.invoiceDesk} · Invoice Desk</small>
            </span>
          </div>

          <div className="invoice-actions">
            <PrintButton />

            {invoice.status === "CONFIRMED" || invoice.status === "DELIVERED" ? (
              <>
                <Button
                  variant="secondary"
                  onClick={() =>
                    navigate(`/sales/change-request/${invoice.id}?type=EDIT`)
                  }
                >
                  {t.invoices.requestEdit}
                </Button>
                <Button
                  variant="secondary"
                  onClick={() =>
                    navigate(`/sales/change-request/${invoice.id}?type=RETURN`)
                  }
                >
                  {t.invoices.requestReturn}
                </Button>
              </>
            ) : null}

            <Button
              variant="secondary"
              onClick={() => navigate("/sales/invoice-search")}
            >
              <svg
                aria-hidden="true"
                width="17"
                height="17"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M5 12h14M13 6l6 6-6 6" />
              </svg>
              {t.invoices.backToSearch}
            </Button>
          </div>
        </header>

        <div className="print-area">
          <PrintHeader
            titleEn={`Invoice ${invoice.invoiceNumber}`}
            titleAr={t.invoices.salesInvoice}
            range={{ from: invoiceDate, to: invoiceDate }}
            filters={[
              {
                label: t.invoices.customer,
                value: invoice.customer?.name || "—",
              },
              {
                label: t.status,
                value: invoice.status || "—",
              },
            ]}
          />

          <section className="invoice-panel invoice-overview">
            <div className="invoice-title-row">
              <div>
                <p className="invoice-kicker">فاتورة · INVOICE</p>
                <h1 dir="ltr">{invoice.invoiceNumber}</h1>
              </div>
              <StatusChip status={invoice.status} />
            </div>

            <dl className="invoice-meta">
              <div>
                <dt>{t.date}</dt>
                <dd dir="ltr">{invoiceDate}</dd>
              </div>

              <div>
                <dt>{t.invoices.customer}</dt>
                <dd>{invoice.customer?.name || "—"}</dd>
              </div>

              <div>
                <dt>{t.invoices.employee}</dt>
                <dd>{invoice.employee?.name || "—"}</dd>
              </div>

              <div>
                <dt>{t.status}</dt>
                <dd>{invoice.status}</dd>
              </div>
            </dl>
          </section>

          <section className="invoice-panel invoice-items-panel">
            <div className="invoice-section-head">
              <h2>{t.invoices.invoiceItems}</h2>
              <span aria-label={`${items.length}`}>{items.length}</span>
            </div>

            <div className="invoice-table-wrap">
              <table className="invoice-table">
                <thead>
                  <tr>
                    <th scope="col">{t.invoices.product}</th>
                    <th scope="col" className="cell-center">
                      {t.invoices.qty}
                    </th>
                    <th scope="col" className="cell-end">
                      {t.newInvoice.price}
                    </th>
                    <th scope="col" className="cell-end">
                      {t.invoices.currentTotal}
                    </th>
                  </tr>
                </thead>

                <tbody>
                  {items.length === 0 ? (
                    <tr>
                      <td className="invoice-no-data" colSpan={4}>
                        {t.invoices.noItems}
                      </td>
                    </tr>
                  ) : (
                    items.map((item: any, index) => {
                      const quantity = Number(item.quantity ?? 1);
                      const price = Number(item.price ?? 0);
                      const itemTotal = price * quantity;

                      return (
                        <tr
                          key={String(
                            item.id ??
                              item.productUnit?.barcode ??
                              index,
                          )}
                        >
                          <td>
                            <strong>
                              {item.productUnit?.productModel?.name ||
                                item.productModel?.name ||
                                "—"}
                            </strong>

                            {item.productUnit?.barcode && (
                              <small dir="ltr">
                                {item.productUnit.barcode}
                              </small>
                            )}
                          </td>

                          <td className="cell-center numeric">
                            {quantity}
                            {item.productModel?.unit === "METER" ? ` ${t.uom.METER}` : ""}
                          </td>

                          <td className="cell-end numeric">
                            {t.currency} {formatMoney(price)}
                          </td>

                          <td className="cell-end numeric total-cell">
                            {t.currency} {formatMoney(itemTotal)}
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </section>

          <section className="invoice-summary">
            <h2>الملخص المالي · Summary</h2>

            <dl>
              <div>
                <dt>{t.invoices.originalTotal}</dt>
                <dd>
                  {t.currency} {formatMoney(invoice.originalTotal)}
                </dd>
              </div>

              <div className="invoice-summary-total">
                <dt>{t.invoices.currentTotal}</dt>
                <dd>
                  {t.currency} {formatMoney(invoice.currentTotal)}
                </dd>
              </div>
            </dl>
          </section>

          <section className="invoice-panel invoice-audit">
            <div className="invoice-section-head">
              <h2>{t.pages.auditHistory}</h2>
              <span aria-label={`${auditLogs.length}`}>
                {auditLoading ? "…" : auditLogs.length}
              </span>
            </div>

            {auditLoading ? (
              <p className="invoice-no-data">
                <LoadingSpinner size={20} />
              </p>
            ) : auditLogs.length === 0 ? (
              <p className="invoice-no-data">{t.invoices.noAuditEntries}</p>
            ) : (
              <ol className="invoice-timeline">
                {auditLogs.map((entry) => (
                  <li key={String(entry.id)}>
                    <span className="timeline-dot" aria-hidden="true" />

                    <div>
                      <strong>
                        {t.auditHistory.actions?.[entry.action as keyof typeof t.auditHistory.actions] ?? entry.action}
                      </strong>
                      <small>{entry.employee?.name || "—"}</small>
                    </div>

                    <time dateTime={entry.timestamp} dir="ltr">
                      {formatDateTime(entry.timestamp)}
                    </time>
                  </li>
                ))}
              </ol>
            )}
          </section>
        </div>
      </div>

      <InvoiceStyles />
    </div>
  );
}

function InvoiceStyles() {
  return (
    <style>{`
      .invoice-page,
      .invoice-state {
        --invoice-bg: #f6f8fa;
        --invoice-ink: #173f5f;
        --invoice-primary: #247ba0;
        --invoice-danger: #f25f5c;
        --invoice-soft: #668397;
        --invoice-border: rgba(23, 63, 95, 0.12);
        --invoice-surface: rgba(255, 255, 255, 0.78);

        min-height: 100vh;
        font-family: "Manrope", "Cairo", Arial, sans-serif;
        color: var(--invoice-ink);
      }

      .invoice-page {
        position: relative;
        overflow: hidden;
        background: var(--invoice-bg);
        padding: 32px;
      }

      .invoice-container {
        position: relative;
        z-index: 1;
        width: min(100%, 960px);
        margin: 0 auto;
      }

      .invoice-ambient {
        position: absolute;
        pointer-events: none;
        border-radius: 32px;
      }

      .invoice-ambient-top {
        width: 430px;
        height: 430px;
        top: -180px;
        right: -120px;
        background: rgba(36, 123, 160, 0.1);
        transform: rotate(14deg);
      }

      .invoice-ambient-side {
        width: 360px;
        height: 360px;
        top: 42%;
        left: -190px;
        background: rgba(23, 63, 95, 0.07);
        transform: rotate(-12deg);
      }

      .invoice-toolbar {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 16px;
        margin-bottom: 26px;
      }

      .invoice-brand {
        display: flex;
        align-items: center;
        gap: 12px;
      }

      .invoice-brand-mark {
        display: grid;
        width: 42px;
        height: 42px;
        place-items: center;
        border-radius: 10px;
        background: var(--invoice-ink);
        color: #fff;
        font-family: "Sora", sans-serif;
        font-weight: 700;
      }

      .invoice-brand strong,
      .invoice-brand small {
        display: block;
      }

      .invoice-brand strong {
        font-family: "Sora", sans-serif;
        font-size: 16px;
      }

      .invoice-brand small {
        margin-top: 3px;
        color: var(--invoice-soft);
        font-size: 11px;
      }

      .invoice-actions {
        display: flex;
        align-items: center;
        gap: 8px;
      }

      .invoice-actions button {
        display: inline-flex;
        align-items: center;
        gap: 7px;
      }

      .invoice-panel {
        border: 1px solid var(--invoice-border);
        border-radius: 18px;
        background: var(--invoice-surface);
        box-shadow: 0 18px 50px rgba(23, 63, 95, 0.06);
        backdrop-filter: blur(22px);
      }

      .invoice-overview {
        padding: 28px;
        margin-bottom: 22px;
      }

      .invoice-title-row {
        display: flex;
        align-items: flex-start;
        justify-content: space-between;
        gap: 18px;
      }

      .invoice-kicker {
        margin: 0 0 5px;
        color: var(--invoice-soft);
        font-size: 11px;
        font-weight: 700;
      }

      .invoice-title-row h1 {
        margin: 0;
        font-family: "Sora", "Cairo", sans-serif;
        font-size: clamp(26px, 4vw, 38px);
        line-height: 1.2;
        letter-spacing: 0;
      }

      .invoice-meta {
        display: grid;
        grid-template-columns: repeat(4, minmax(0, 1fr));
        gap: 22px;
        margin: 28px 0 0;
      }

      .invoice-meta dt {
        color: var(--invoice-soft);
        font-size: 11px;
      }

      .invoice-meta dd {
        margin: 5px 0 0;
        font-family: "Sora", "Cairo", sans-serif;
        font-size: 13px;
        font-weight: 600;
        overflow-wrap: anywhere;
      }

      .invoice-items-panel {
        margin-bottom: 22px;
        overflow: hidden;
      }

      .invoice-section-head {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 18px 22px;
        border-bottom: 1px solid var(--invoice-border);
      }

      .invoice-section-head h2,
      .invoice-summary h2 {
        margin: 0;
        font-family: "Sora", "Cairo", sans-serif;
        font-size: 17px;
      }

      .invoice-section-head > span {
        display: grid;
        min-width: 25px;
        height: 25px;
        padding: 0 7px;
        place-items: center;
        border-radius: 999px;
        background: rgba(36, 123, 160, 0.1);
        color: var(--invoice-primary);
        font-size: 11px;
        font-weight: 700;
      }

      .invoice-table-wrap {
        overflow-x: auto;
      }

      .invoice-table {
        width: 100%;
        min-width: 650px;
        border-collapse: collapse;
        text-align: start;
      }

      .invoice-table thead {
        display: table-header-group;
      }

      .invoice-table th {
        padding: 12px 22px;
        background: rgba(36, 123, 160, 0.055);
        color: var(--invoice-soft);
        font-size: 11px;
        font-weight: 700;
      }

      .invoice-table td {
        padding: 16px 22px;
        border-top: 1px solid var(--invoice-border);
        font-size: 13px;
      }

      .invoice-table tbody tr:first-child td {
        border-top: 0;
      }

      .invoice-table tbody tr:hover {
        background: rgba(36, 123, 160, 0.035);
      }

      .invoice-table td strong,
      .invoice-table td small {
        display: block;
      }

      .invoice-table td strong {
        font-weight: 700;
      }

      .invoice-table td small {
        margin-top: 4px;
        color: var(--invoice-soft);
        font-size: 10px;
        text-align: end;
      }

      .cell-center {
        text-align: center;
      }

      .cell-end {
        text-align: start;
      }

      .numeric {
        direction: ltr;
        font-variant-numeric: tabular-nums;
        white-space: nowrap;
      }

      .total-cell {
        font-family: "Sora", sans-serif;
        font-weight: 700;
      }

      .invoice-summary {
        margin-bottom: 22px;
        padding: 26px 28px;
        border-radius: 18px;
        background: var(--invoice-ink);
        color: #fff;
        box-shadow: 0 20px 45px rgba(23, 63, 95, 0.16);
      }

      .invoice-summary dl {
        margin: 20px 0 0;
      }

      .invoice-summary dl > div {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 20px;
        padding: 8px 0;
      }

      .invoice-summary dt {
        color: rgba(255, 255, 255, 0.7);
        font-size: 13px;
      }

      .invoice-summary dd {
        margin: 0;
        direction: ltr;
        font-family: "Sora", sans-serif;
        font-weight: 700;
        font-variant-numeric: tabular-nums;
      }

      .invoice-summary-total {
        margin-top: 10px;
        padding-top: 17px !important;
        border-top: 1px solid rgba(255, 255, 255, 0.18);
      }

      .invoice-summary-total dt {
        color: #fff;
        font-weight: 700;
      }

      .invoice-summary-total dd {
        font-size: 24px;
      }

      .invoice-audit {
        overflow: hidden;
      }

      .invoice-timeline {
        margin: 0;
        padding: 7px 22px;
        list-style: none;
      }

      .invoice-timeline li {
        display: grid;
        grid-template-columns: 10px minmax(0, 1fr) auto;
        align-items: center;
        gap: 12px;
        padding: 14px 0;
        border-bottom: 1px solid var(--invoice-border);
      }

      .invoice-timeline li:last-child {
        border-bottom: 0;
      }

      .timeline-dot {
        width: 8px;
        height: 8px;
        border-radius: 50%;
        background: var(--invoice-primary);
        box-shadow: 0 0 0 4px rgba(36, 123, 160, 0.1);
      }

      .invoice-timeline strong,
      .invoice-timeline small {
        display: block;
      }

      .invoice-timeline strong {
        font-size: 13px;
        text-transform: capitalize;
      }

      .invoice-timeline small,
      .invoice-timeline time {
        margin-top: 3px;
        color: var(--invoice-soft);
        font-size: 10px;
      }

      .invoice-timeline time {
        direction: ltr;
        font-variant-numeric: tabular-nums;
        white-space: nowrap;
      }

      .invoice-no-data {
        display: grid;
        min-height: 74px;
        place-items: center;
        margin: 0;
        padding: 20px !important;
        color: var(--invoice-soft);
        text-align: center !important;
      }

      .invoice-state {
        display: grid;
        min-height: 55vh;
        place-items: center;
        padding: 60px 20px;
        background: var(--invoice-bg);
        text-align: center;
      }

      .invoice-empty {
        align-content: center;
        gap: 14px;
        color: var(--invoice-soft);
      }

      .invoice-empty p {
        margin: 0;
      }

      @media (max-width: 720px) {
        .invoice-page {
          padding: 20px 14px;
        }

        .invoice-toolbar {
          align-items: flex-start;
        }

        .invoice-brand small {
          display: none;
        }

        .invoice-actions {
          flex-wrap: wrap;
          justify-content: flex-end;
        }

        .invoice-overview {
          padding: 22px 18px;
        }

        .invoice-title-row {
          align-items: flex-start;
          flex-direction: column;
        }

        .invoice-meta {
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 18px 14px;
        }

        .invoice-summary {
          padding: 23px 20px;
        }

        .invoice-timeline li {
          grid-template-columns: 10px minmax(0, 1fr);
        }

        .invoice-timeline time {
          grid-column: 2;
        }
      }

      @media (prefers-reduced-motion: no-preference) {
        .invoice-panel {
          animation: invoice-rise 0.4s ease both;
        }

        @keyframes invoice-rise {
          from {
            opacity: 0;
            transform: translateY(8px);
          }

          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
      }

      @media print {
        @page {
          size: A4;
          margin: 10mm;
        }

        .no-print,
        .invoice-ambient {
          display: none !important;
        }

        .invoice-page {
          min-height: auto;
          padding: 0;
          overflow: visible;
          background: #fff;
        }

        .invoice-container {
          width: 100%;
          max-width: none;
        }

        .print-area {
          width: 100%;
        }

        .invoice-panel,
        .invoice-summary {
          box-shadow: none;
          backdrop-filter: none;
        }

        .invoice-overview,
        .invoice-summary,
        .invoice-audit {
          break-inside: avoid;
          page-break-inside: avoid;
        }

        .invoice-items-panel {
          break-inside: auto;
          page-break-inside: auto;
        }

        .invoice-panel {
          border-radius: 8px;
          background: #fff;
        }

        .invoice-overview {
          padding: 14px 16px;
          margin-bottom: 9mm;
        }

        .invoice-title-row h1 {
          font-size: 23px;
        }

        .invoice-meta {
          margin-top: 14px;
          gap: 12px 18px;
        }

        .invoice-items-panel,
        .invoice-summary {
          margin-bottom: 9mm;
        }

        .invoice-section-head {
          padding: 9px 12px;
        }

        .invoice-table-wrap {
          overflow: visible;
        }

        .invoice-table {
          min-width: 0;
          table-layout: fixed;
        }

        .invoice-table th {
          padding: 6px 9px;
          print-color-adjust: exact;
          -webkit-print-color-adjust: exact;
        }

        .invoice-table td {
          padding: 7px 9px;
          break-inside: avoid;
          page-break-inside: avoid;
        }

        .invoice-table tr {
          break-inside: avoid;
          page-break-inside: avoid;
        }

        .invoice-table td small {
          margin-top: 2px;
        }

        .invoice-summary {
          padding: 13px 16px;
          print-color-adjust: exact;
          -webkit-print-color-adjust: exact;
        }

        .invoice-summary dl {
          margin-top: 8px;
        }

        .invoice-summary-total dd {
          font-size: 20px;
        }

        .invoice-timeline {
          padding: 4px 12px;
        }

        .invoice-timeline li {
          padding: 7px 0;
          break-inside: avoid;
          page-break-inside: avoid;
        }

        .invoice-state {
          min-height: auto;
        }

        .invoice-page,
        .invoice-panel,
        .invoice-summary {
          color-adjust: exact;
          -webkit-print-color-adjust: exact;
          print-color-adjust: exact;
        }
      }
    `}</style>
  );
}
