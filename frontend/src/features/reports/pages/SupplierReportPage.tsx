
import { useState, useEffect, useCallback, useMemo } from "react";
import api from "../../../lib/api";
import { isAbortError, useSuppliersOptions } from "../../../hooks";
import { Card } from "../../../components/ui/Card";
import { Table } from "../../../components/ui/Table";
import { Pagination } from "../../../components/ui/Pagination";
import { LoadingSpinner } from "../../../components/ui/LoadingSpinner";
import { EmptyState } from "../../../components/ui/EmptyState";
import { Select } from "../../../components/ui/Select";
import { Button } from "../../../components/ui/Button";
import { useI18n } from "../../../i18n/context";
import { useReportPrint } from "../hooks/useReportPrint";
import PrintButton from "../components/PrintButton";
import ExcelExportButton from "../components/ExcelExportButton";
import PrintHeader from "../components/PrintHeader";
import DateRangePicker from "../../../components/ui/DateRangePicker";
import { ReportDetailPanel } from "../components/ReportDetailTable";
import type {
  SupplierReportResponse,
  SupplierReportRow,
} from "../types";

const fmt = (n: number) =>
  n.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

export default function SupplierReportPage() {
  const { t } = useI18n();
  const { printLimit, requestPrint, notifyReady } = useReportPrint();

  const [dateFrom, setDateFrom] = useState(() => {
    const d = new Date();
    d.setDate(1);
    return d.toISOString().slice(0, 10);
  });

  const [dateTo, setDateTo] = useState(
    () => new Date().toISOString().slice(0, 10)
  );

  const [supplierFilter, setSupplierFilter] = useState("");

  // Frontend-only invoice/receipt number filter
  const [invoiceNumberFilter, setInvoiceNumberFilter] = useState("");

  const { data: supplierRows = [] } = useSuppliersOptions();

  const supplierOptions = useMemo(
    () =>
      supplierRows.map((supplier) => ({
        label: supplier.name,
        value: String(supplier.id),
      })),
    [supplierRows]
  );

  const [data, setData] = useState<SupplierReportResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [selectedSupplier, setSelectedSupplier] =
    useState<SupplierReportRow | null>(null);
  const [detailMode, setDetailMode] = useState<
    "all" | "selected" | null
  >(null);

  const showAllDetails = detailMode === "all";
  const showSelectedDetails =
    detailMode === "selected" && !!selectedSupplier;

  const fetchData = useCallback(
    async (signal?: AbortSignal) => {
      setLoading(true);

      try {
        const params: Record<string, string | number> = {
          page: printLimit ? 1 : page,
          limit: printLimit || 20,
        };

        if (dateFrom) {
          params.from = dateFrom;
        }

        if (dateTo) {
          params.to = dateTo;
        }

        if (supplierFilter) {
          params.supplierId = Number(supplierFilter);
        }

        const { data: res } = await api.get<SupplierReportResponse>(
          "/reports/suppliers",
          {
            params,
            signal,
          }
        );

        setData(res);

        if (printLimit) {
          notifyReady();
        }
      } catch (err) {
        if (isAbortError(err)) return;

        // Error state preserved — data remains null
      } finally {
        if (!signal?.aborted) {
          setLoading(false);
        }
      }
    },
    [
      page,
      dateFrom,
      dateTo,
      supplierFilter,
      printLimit,
      notifyReady,
    ]
  );

  useEffect(() => {
    const controller = new AbortController();

    void fetchData(controller.signal);

    return () => controller.abort();
  }, [fetchData]);

  // Frontend-only filtering by receipt/invoice number
  const filteredItems = useMemo(() => {
    const rows = data?.items ?? [];
    const query = invoiceNumberFilter.trim().toLowerCase();

    if (!query) {
      return rows;
    }

    return rows.filter((row) =>
      (row.receiptNumbers ?? []).some((receiptNumber) =>
        String(receiptNumber).toLowerCase().includes(query)
      )
    );
  }, [data?.items, invoiceNumberFilter]);

  const columns = [
    {
      key: "supplierName",
      label: t.nav.supplierName || "Supplier",
      render: (row: SupplierReportRow) => (
        <span style={{ fontWeight: 600 }}>
          {row.supplierName}
        </span>
      ),
    },
    {
      key: "receiptNumbers",
      label: t.nav.receipts || "Receipt Numbers",
      render: (row: SupplierReportRow) => {
        const values = row.receiptNumbers ?? [];

        return values.length > 0
          ? values.slice(0, 6).join(", ") +
              (values.length > 6 ? " +" : "")
          : "—";
      },
    },
    {
      key: "receiptCount",
      label: t.nav.receipts || "Receipts",
      align: "right" as const,
      render: (row: SupplierReportRow) => (
        <span
          style={{
            fontVariantNumeric: "tabular-nums",
          }}
        >
          {row.receiptCount}
        </span>
      ),
    },
    {
      key: "totalQuantityReceived",
      label: t.nav.totalUnits || "Total Units",
      align: "right" as const,
      render: (row: SupplierReportRow) => (
        <span
          style={{
            fontVariantNumeric: "tabular-nums",
          }}
        >
          {row.totalQuantityReceived}
        </span>
      ),
    },
    {
      key: "totalPurchaseValue",
      label: t.total,
      align: "right" as const,
      render: (row: SupplierReportRow) => (
        <span
          style={{
            fontVariantNumeric: "tabular-nums",
            fontWeight: 600,
          }}
        >
          {t.currency} {fmt(row.totalPurchaseValue)}
        </span>
      ),
    },
  ];

  return (
    <div>
      <div
        className="no-print toolbar"
        style={{
          marginBottom: "var(--section-gap)",
        }}
      >
        <DateRangePicker
          from={dateFrom}
          to={dateTo}
          onChange={(f, t) => {
            setDateFrom(f);
            setDateTo(t);
            setPage(1);
          }}
        />

        <Select
          label={
            t.nav.supplier ||
            t.invoices.customer ||
            "Supplier"
          }
          value={supplierFilter}
          onChange={(event) => {
            setSupplierFilter(event.target.value);
            setPage(1);
            setSelectedSupplier(null);
            setDetailMode(null);
          }}
          options={[
            {
              label:
                t.nav.allSuppliers ||
                "All suppliers",
              value: "",
            },
            ...supplierOptions,
          ]}
          style={{ minWidth: 190 }}
        />

        {/* Frontend-only invoice number filter */}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: "6px",
            minWidth: 210,
          }}
        >
          <label
            htmlFor="supplier-report-invoice-filter"
            style={{
              fontSize: "13px",
              fontWeight: 600,
            }}
          >
            {t.reports.invoiceNumber ||
              "Invoice Number"}
          </label>

          <input
            id="supplier-report-invoice-filter"
            type="text"
            value={invoiceNumberFilter}
            onChange={(event) => {
              setInvoiceNumberFilter(
                event.target.value
              );
              setSelectedSupplier(null);
              setDetailMode(null);
            }}
            placeholder="RCPT-00017"
            autoComplete="off"
            dir="ltr"
            style={{
              height: "38px",
              minWidth: "210px",
              padding: "0 10px",
              borderRadius: "8px",
              border: "1px solid var(--border)",
              background: "var(--surface)",
              color: "var(--text)",
              fontSize: "14px",
            }}
          />
        </div>

        <PrintButton onClick={requestPrint} />

        <ExcelExportButton
          filename="supplier-report"
          rows={filteredItems}
        />
      </div>

      <div className="print-area">
        <PrintHeader
          titleEn={
            t.reports.supplierReport ||
            "Supplier Report"
          }
          titleAr={
            t.reports.supplierReport ||
            "تقرير الموردين"
          }
          range={{
            from: dateFrom,
            to: dateTo,
          }}
          filters={[
            ...(supplierFilter
              ? [
                  {
                    label:
                      t.nav.supplier ||
                      "Supplier",
                    value:
                      supplierOptions.find(
                        (option) =>
                          option.value ===
                          supplierFilter
                      )?.label ||
                      (t.nav.supplierName ||
                        "Selected supplier"),
                  },
                ]
              : []),
            ...(invoiceNumberFilter
              ? [
                  {
                    label:
                      t.reports.invoiceNumber ||
                      "Invoice Number",
                    value: invoiceNumberFilter,
                  },
                ]
              : []),
          ]}
        />

        {loading ? (
          <div className="state-block">
            <LoadingSpinner size={32} />
          </div>
        ) : !data ? (
          <EmptyState
            title={t.noData}
            description={
              t.nav.noSupplierData ||
              "No supplier data for this period"
            }
          />
        ) : filteredItems.length === 0 ? (
          <EmptyState
            title={t.noData}
            description={
              invoiceNumberFilter
                ? `${t.reports.invoiceNumber || "Invoice Number"}: ${invoiceNumberFilter}`
                : t.nav.noSupplierData ||
                  "No supplier data for this period"
            }
          />
        ) : (
          <Card
            title={
              t.reports.supplierReport ||
              "Supplier Report"
            }
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                gap: "12px",
                marginBottom: "12px",
                flexWrap: "wrap",
              }}
            >
              <div
                style={{
                  display: "flex",
                  gap: "8px",
                  alignItems: "center",
                  flexWrap: "wrap",
                }}
              >
                <Button
                  type="button"
                  variant={
                    showAllDetails
                      ? "primary"
                      : "secondary"
                  }
                  size="sm"
                  onClick={() => {
                    if (showAllDetails) {
                      setDetailMode(null);
                      return;
                    }

                    setSelectedSupplier(null);
                    setDetailMode("all");
                  }}
                >
                  {showAllDetails
                    ? t.reports.hideDetails
                    : t.reports.showAllDetails}
                </Button>

                <Button
                  type="button"
                  variant={
                    showSelectedDetails
                      ? "primary"
                      : "secondary"
                  }
                  size="sm"
                  disabled={!selectedSupplier}
                  onClick={() => {
                    if (showSelectedDetails) {
                      setDetailMode(null);
                      return;
                    }

                    setDetailMode("selected");
                  }}
                >
                  {showSelectedDetails
                    ? t.reports.hideDetails
                    : t.reports.showSelected}
                </Button>
              </div>

              {selectedSupplier && (
                <span
                  style={{
                    color: "var(--soft)",
                    fontSize: "12px",
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "6px",
                  }}
                >
                  <span
                    style={{
                      width: "8px",
                      height: "8px",
                      borderRadius: "50%",
                      background: "var(--brand)",
                      display: "inline-block",
                    }}
                  />

                  {t.reports.selected}:{" "}
                  {selectedSupplier.supplierName}
                </span>
              )}
            </div>

            <Table
              columns={columns}
              data={filteredItems as any[]}
              emptyMessage={t.noData}
              onRowClick={(row: SupplierReportRow) => {
                setSelectedSupplier(row);
                setDetailMode("selected");
              }}
            />

            {(showAllDetails ||
              showSelectedDetails) && (
              <ReportDetailPanel
                rowId={
                  selectedSupplier?.supplierId ??
                  null
                }
                from={dateFrom}
                to={dateTo}
                endpoint="/reports/suppliers"
                detailTitle={
                  selectedSupplier
                    ? t.reports.supplierReceipts
                    : t.reports.allSupplierReceipts
                }
                groupBy={(item: any) =>
                  item.supplierName ||
                  selectedSupplier?.supplierName ||
                  t.reports.unknown
                }
                groupLabel={(groupKey) =>
                  `${t.nav.supplier}: ${groupKey}`
                }
                transform={(payload: any) =>
                  (payload?.items ?? []).flatMap(
                    (receipt: any) =>
                      (receipt.items ?? []).map(
                        (item: any) => ({
                          receiptNumber:
                            receipt.receiptNumber,
                          receiptDate:
                            receipt.receiptDate,
                          supplierName:
                            receipt.supplierName ||
                            selectedSupplier?.supplierName ||
                            t.reports.unknown,
                          productName:
                            item.productName,
                          quantityReceived:
                            item.quantityReceived,
                          unitPrice:
                            item.unitPrice,
                          lineTotal:
                            item.lineTotal,
                        })
                      )
                  )
                }
                detailColumns={[
                  {
                    key: "receiptNumber",
                    label:
                      t.reports.invoiceNumber,
                  },
                  {
                    key: "receiptDate",
                    label: t.date,
                    render: (item: any) =>
                      new Date(
                        item.receiptDate
                      ).toLocaleDateString(),
                  },
                  {
                    key: "supplierName",
                    label: t.nav.supplier,
                    render: (item: any) =>
                      item.supplierName ??
                      selectedSupplier?.supplierName ??
                      "—",
                  },
                  {
                    key: "productName",
                    label: t.reports.product,
                  },
                  {
                    key: "quantityReceived",
                    label: t.reports.qtySold,
                    align: "right",
                  },
                  {
                    key: "unitPrice",
                    label: t.reports.unitPrice,
                    align: "right",
                    render: (item: any) =>
                      `EGP ${fmt(
                        item.unitPrice
                      )}`,
                  },
                  {
                    key: "lineTotal",
                    label: t.reports.lineTotal,
                    align: "right",
                    render: (item: any) =>
                      `EGP ${fmt(
                        item.lineTotal
                      )}`,
                  },
                ]}
              />
            )}

            {!printLimit &&
              data.meta.totalPages > 1 && (
                <Pagination
                  currentStart={
                    (data.meta.page - 1) *
                      data.meta.limit +
                    1
                  }
                  currentEnd={Math.min(
                    data.meta.page *
                      data.meta.limit,
                    data.meta.total
                  )}
                  total={data.meta.total}
                  currentPage={data.meta.page}
                  totalPages={
                    data.meta.totalPages
                  }
                  onPrev={() =>
                    setPage((p) =>
                      Math.max(1, p - 1)
                    )
                  }
                  onNext={() =>
                    setPage((p) =>
                      Math.min(
                        data.meta.totalPages,
                        p + 1
                      )
                    )
                  }
                />
              )}
          </Card>
        )}
      </div>
    </div>
  );
}
