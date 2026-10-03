import { useMemo } from "react";
import { useSettings } from "../../../lib/settings";
import { useI18n } from "../../../i18n/context";

interface PrintFilter {
  label: string;
  value: string;
}

interface PrintHeaderProps {
  titleEn: string;
  titleAr: string;
  range: { from: string; to: string };
  filters?: PrintFilter[];
}

export default function PrintHeader({
  titleEn,
  titleAr,
  range,
  filters = [],
}: PrintHeaderProps) {
  const { brand } = useSettings();
  const { t } = useI18n();

  const initial = brand.businessName.trim().charAt(0).toUpperCase() || "P";

  const generatedAt = useMemo(
    () =>
      new Intl.DateTimeFormat("en-GB", {
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
      }).format(new Date()),
    [],
  );

  const visibleFilters = filters.filter(
    ({ value }) => value.trim() !== "" && value.trim() !== "—",
  );

  return (
    <header className="print-only report-print-header" dir="ltr">
      <div className="report-header-card">
        <div className="report-brand">
          <div
            className="report-brand-mark"
            aria-hidden="true"
            style={
              brand.logoUrl
                ? {
                    background: "#fff",
                    border: "1px solid var(--report-border)",
                    padding: "2px",
                  }
                : undefined
            }
          >
            {brand.logoUrl ? (
              <img
                src={brand.logoUrl}
                alt=""
                style={{
                  width: "100%",
                  height: "100%",
                  objectFit: "contain",
                  display: "block",
                }}
              />
            ) : (
              initial
            )}
          </div>

          <div className="report-brand-copy">
            <h1>{brand.businessName}</h1>

            {(brand.address || brand.phone) && (
              <div className="report-contact">
                {brand.address && <span>{brand.address}</span>}
                {brand.phone && (
                  <span dir="ltr">{brand.phone}</span>
                )}
              </div>
            )}
          </div>
        </div>

        <div className="report-title-block" dir="rtl">
          <span className="report-badge">{t.reports.reportBadge}</span>
          <h2 dir="ltr">{titleEn}</h2>
          <p>{titleAr}</p>
        </div>
      </div>

      <div className="report-context">
        <div className="report-context-main">
          <div className="report-range">
            <span>{t.invoices.dateRange}</span>
            <strong dir="ltr">{range.from}</strong>

            {range.from !== range.to && (
              <>
                <i aria-hidden="true">—</i>
                <strong dir="ltr">{range.to}</strong>
              </>
            )}
          </div>

          {visibleFilters.length > 0 && (
            <div className="report-filters">
              {visibleFilters.map((filter, index) => (
                <span
                  className="report-filter"
                  key={`${filter.label}-${index}`}
                >
                  <b>{filter.label}</b>
                  <strong>{filter.value}</strong>
                </span>
              ))}
            </div>
          )}
        </div>

        <div className="report-generated">
          <span>{t.invoices.generated}</span>
          <strong dir="ltr">{generatedAt}</strong>
        </div>
      </div>

      <style>{`
        .report-print-header {
          display: none;
        }

        @media print {
          .report-print-header {
            --report-ink: #173f5f;
            --report-primary: #247ba0;
            --report-soft: #668397;
            --report-border: rgba(23, 63, 95, 0.14);

            display: block !important;
            margin: 0 0 10mm;
            color: var(--report-ink);
            font-family: "Manrope", "Cairo", Arial, sans-serif;
            break-inside: avoid;
            page-break-inside: avoid;
          }

          .report-header-card {
            display: flex;
            align-items: flex-start;
            justify-content: space-between;
            gap: 24px;
            padding: 14px 16px;
            border: 1px solid var(--report-border);
            border-radius: 9px;
            background: #fff;
          }

          .report-brand {
            display: flex;
            align-items: flex-start;
            gap: 10px;
            min-width: 0;
            flex: 1 1 auto;
          }

          .report-brand-mark {
            display: grid;
            width: 36px;
            height: 36px;
            flex: 0 0 36px;
            place-items: center;
            border-radius: 8px;
            background: var(--report-ink);
            color: #fff;
            font-family: "Sora", sans-serif;
            font-size: 14px;
            font-weight: 700;
            print-color-adjust: exact;
            -webkit-print-color-adjust: exact;
          }

          .report-brand-copy {
            min-width: 0;
          }

          .report-brand-copy h1 {
            margin: 0;
            color: var(--report-ink);
            font-family: "Sora", sans-serif;
            font-size: 16px;
            line-height: 1.2;
            font-weight: 700;
            overflow-wrap: anywhere;
          }

          .report-contact {
            display: flex;
            flex-wrap: wrap;
            gap: 2px 9px;
            margin-top: 4px;
            color: var(--report-soft);
            font-size: 8px;
            line-height: 1.35;
          }

          .report-title-block {
            min-width: 190px;
            max-width: 48%;
            text-align: right;
          }

          .report-badge {
            display: inline-block;
            padding: 3px 7px;
            border-radius: 999px;
            background: rgba(36, 123, 160, 0.1);
            color: var(--report-primary);
            font-size: 7px;
            line-height: 1;
            font-weight: 700;
            print-color-adjust: exact;
            -webkit-print-color-adjust: exact;
          }

          .report-title-block h2 {
            margin: 6px 0 0;
            color: var(--report-ink);
            font-family: "Sora", "Cairo", sans-serif;
            font-size: 15px;
            line-height: 1.2;
            overflow-wrap: anywhere;
          }

          .report-title-block p {
            margin: 3px 0 0;
            color: var(--report-soft);
            font-family: "Cairo", "Manrope", Arial, sans-serif;
            font-size: 9px;
            line-height: 1.35;
          }

          .report-context {
            display: flex;
            align-items: flex-start;
            justify-content: space-between;
            gap: 12px;
            padding: 7px 2px 0;
            color: var(--report-soft);
            font-size: 8px;
            line-height: 1.4;
          }

          .report-context-main {
            display: flex;
            align-items: center;
            flex-wrap: wrap;
            gap: 5px 8px;
            min-width: 0;
          }

          .report-range,
          .report-filters {
            display: flex;
            align-items: center;
            flex-wrap: wrap;
            gap: 5px 8px;
          }

          .report-range {
            white-space: nowrap;
          }

          .report-range strong,
          .report-filter strong,
          .report-generated strong {
            color: var(--report-ink);
            font-weight: 700;
          }

          .report-range i {
            color: var(--report-soft);
            font-style: normal;
          }

          .report-filters {
            margin-inline-start: 2px;
          }

          .report-filter {
            display: inline-flex;
            align-items: center;
            gap: 4px;
            max-width: 260px;
            padding: 2px 6px;
            border: 1px solid var(--report-border);
            border-radius: 999px;
            background: rgba(36, 123, 160, 0.045);
          }

          .report-filter b,
          .report-filter strong {
            overflow-wrap: anywhere;
          }

          .report-filter b {
            color: var(--report-soft);
            font-weight: 600;
          }

          .report-generated {
            display: flex;
            align-items: center;
            gap: 5px;
            flex: 0 0 auto;
            white-space: nowrap;
          }
        }

        @media print and (max-width: 600px) {
          .report-header-card {
            gap: 12px;
          }

          .report-title-block {
            min-width: 150px;
          }

          .report-context {
            flex-direction: column;
          }
        }
      `}</style>
    </header>
  );
}
