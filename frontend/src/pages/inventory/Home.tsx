
import React from "react";
import { useNavigate } from "react-router-dom";
import api from "../../lib/api";
import { useAuth } from "../../lib/auth";
import { Card } from "../../components/ui/Card";
import { PageHeader } from "../../components/ui/PageHeader";
import { LoadingSpinner } from "../../components/ui/LoadingSpinner";
import { EmptyState } from "../../components/ui/EmptyState";
import { useI18n } from "../../i18n/context";
import type {
  Attendance,
} from "../../types";

const statTileStyle = (color: string): React.CSSProperties => ({
  backgroundColor: "var(--card)",
  border: "1px solid var(--border)",
  borderRadius: "var(--radius-md)",
  padding: "16px",
  flex: "1 1 160px",
  minWidth: 0,
  position: "relative",
  overflow: "hidden",
});

const statValueStyle: React.CSSProperties = {
  fontFamily: "'Sora', sans-serif",
  fontSize: "clamp(22px, 3vw, 28px)",
  fontWeight: 700,
  fontVariantNumeric: "tabular-nums",
  color: "var(--ink)",
  margin: "6px 0 4px",
  lineHeight: 1.15,
};

const statLabelStyle: React.CSSProperties = {
  fontFamily: "'Manrope', sans-serif",
  fontSize: "12px",
  fontWeight: 600,
  color: "var(--soft)",
  textTransform: "uppercase",
  letterSpacing: "0.03em",
  lineHeight: 1.3,
};

const statBarStyle = (color: string): React.CSSProperties => ({
  width: "40px",
  height: "4px",
  borderRadius: "2px",
  backgroundColor: color,
  marginTop: "12px",
});

const actionCardStyle: React.CSSProperties = {
  backgroundColor: "var(--card)",
  border: "1px solid var(--border)",
  borderRadius: "var(--radius-md)",
  padding: "16px 14px",
  cursor: "pointer",
  transition: "box-shadow 0.15s ease",
  textAlign: "center",
  flex: "1 1 0",
  minWidth: "140px",
};

const primaryActionStyle: React.CSSProperties = {
  ...actionCardStyle,
  backgroundColor: "var(--brand-fill)",
  color: "var(--on-brand)",
  border: "none",
};

interface InventoryCountItem {
  isSerialized: boolean;
  available?: number;
  sold?: number;
  damaged?: number;
  totalUnits?: number;
  quantityAvailable?: number;
  quantityReceived?: number;
}

interface InventoryCountResponse {
  data: InventoryCountItem[];
  meta: { page: number; limit: number; total: number; totalPages: number };
}

interface RecentShipment {
  id: number;
  date: string;
  employee?: { name: string };
  supplier?: { name: string };
  totalQuantity: number;
}

interface RecentShipmentResponse {
  data: RecentShipment[];
  meta: { page: number; limit: number; total: number; totalPages: number };
}

interface InventoryTotals {
  available: number;
  sold: number;
  damaged: number;
  total: number;
}

export default function InventoryHome() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { t } = useI18n();

  const [loading, setLoading] = React.useState(true);
  const [inventoryTotals, setInventoryTotals] = React.useState<InventoryTotals>({
    available: 0,
    sold: 0,
    damaged: 0,
    total: 0,
  });
  const [attendance, setAttendance] =
    React.useState<Attendance | null>(null);
  const [recentShipments, setRecentShipments] = React.useState<RecentShipment[]>([]);

  React.useEffect(() => {
    const controller = new AbortController();
    const { signal } = controller;

    const load = async () => {
      setLoading(true);

      const [inventoryRes, attRes, receiptRes] = await Promise.allSettled([
        api.get<InventoryCountResponse>("/stock-items/inventory-count", {
          params: { page: 1, limit: 1000 },
          signal,
        }),
        api.get<Attendance | null>("/attendance/me/today", { signal }),
        api.get<RecentShipmentResponse>("/stock-receipts?limit=5", { signal }),
      ]);

      if (signal.aborted) {
        return;
      }

      if (inventoryRes.status === "fulfilled") {
        const totals = inventoryRes.value.data.data.reduce<InventoryTotals>(
          (summary, item) => ({
            available: summary.available + (item.isSerialized ? item.available || 0 : item.quantityAvailable || 0),
            sold: summary.sold + (item.isSerialized ? item.sold || 0 : 0),
            damaged: summary.damaged + (item.isSerialized ? item.damaged || 0 : 0),
            total: summary.total + (item.isSerialized ? item.totalUnits || 0 : item.quantityReceived || 0),
          }),
          { available: 0, sold: 0, damaged: 0, total: 0 },
        );
        setInventoryTotals(totals);
      } else {
        setInventoryTotals({ available: 0, sold: 0, damaged: 0, total: 0 });
      }

      if (attRes.status === "fulfilled") {
        setAttendance(attRes.value.data);
      } else {
        setAttendance(null);
      }

      if (receiptRes.status === "fulfilled") {
        setRecentShipments(receiptRes.value.data.data);
      } else {
        setRecentShipments([]);
      }

      setLoading(false);
    };

    void load();

    return () => {
      controller.abort();
    };
  }, []);

  const handleAttendance = async () => {
    navigate("/inventory/attendance");
  };

  const isCheckedIn = !!attendance && !attendance.checkOut;
  const firstName = user?.firstName ?? "there";

  if (loading) {
    return (
      <div className="state-block">
        <LoadingSpinner size={28} />
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title={`${t.salesHome.goodMorning}, ${firstName}`}
        subtitle={
          isCheckedIn
            ? t.salesHome.youAreCheckedIn
            : t.salesHome.notCheckedInYet
        }
      />

      <div
        className="stack"
        style={{
          gap: "var(--section-gap)",
        }}
      >
        {/* Primary Actions */}
        <div
          className="toolbar"
          style={{ marginBottom: 0, alignItems: "stretch" }}
        >
          <button
            type="button"
            onClick={handleAttendance}
            style={{
              ...primaryActionStyle,
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              gap: "12px",
              fontFamily: "'Sora', sans-serif",
              fontSize: "16px",
              fontWeight: 600,
              cursor: "pointer",
              padding: "16px 14px",
              minHeight: "72px",
            }}
          >
            <svg
                width="24"
                height="24"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                {isCheckedIn ? (
                  <>
                    <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                    <polyline points="16 17 21 12 16 7" />
                    <line x1="21" y1="12" x2="9" y2="12" />
                  </>
                ) : (
                  <>
                    <path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4" />
                    <polyline points="10 17 15 12 10 7" />
                    <line x1="15" y1="12" x2="3" y2="12" />
                  </>
                )}
              </svg>

            {isCheckedIn
              ? t.salesAttendance.checkOut
              : t.salesAttendance.checkIn}
          </button>

          <button
            type="button"
            onClick={() => navigate("/inventory/receive-shipment")}
            style={{
              ...actionCardStyle,
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              gap: "12px",
              fontFamily: "'Sora', sans-serif",
              fontSize: "15px",
              fontWeight: 600,
              padding: "16px 14px",
              minHeight: "64px",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.boxShadow =
                "var(--shadow-md)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.boxShadow = "none";
            }}
          >
            <svg
              width="24"
              height="24"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
              <polyline points="3.27 6.96 12 12.01 20.73 6.96" />
              <line x1="12" y1="22.08" x2="12" y2="12" />
            </svg>

            {t.nav.receiveShipment}
          </button>
        </div>

        {/* Inventory Actions */}
        <div
          className="toolbar"
          style={{ marginBottom: 0, alignItems: "stretch" }}
        >
          <button
            type="button"
            onClick={() => navigate("/inventory/stock")}
            style={actionCardStyle}
            onMouseEnter={(e) => {
              e.currentTarget.style.boxShadow =
                "var(--shadow-md)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.boxShadow = "none";
            }}
          >
            <svg
              width="24"
              height="24"
              viewBox="0 0 24 24"
              fill="none"
              stroke="var(--brand)"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              style={{ marginBottom: "8px" }}
              aria-hidden="true"
            >
              <rect
                x="2"
                y="3"
                width="20"
                height="14"
                rx="2"
                ry="2"
              />
              <line x1="8" y1="21" x2="16" y2="21" />
              <line x1="12" y1="17" x2="12" y2="21" />
            </svg>

            <div
              style={{
                fontFamily: "'Sora', sans-serif",
                fontSize: "14px",
                fontWeight: 600,
                color: "var(--ink)",
              }}
            >
              {t.nav.inventory}
            </div>
          </button>

          <button
            type="button"
            onClick={() =>
              navigate("/inventory/categories-models")
            }
            style={actionCardStyle}
            onMouseEnter={(e) => {
              e.currentTarget.style.boxShadow =
                "var(--shadow-md)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.boxShadow = "none";
            }}
          >
            <svg
              width="24"
              height="24"
              viewBox="0 0 24 24"
              fill="none"
              stroke="var(--peach)"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              style={{ marginBottom: "8px" }}
              aria-hidden="true"
            >
              <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
            </svg>

            <div
              style={{
                fontFamily: "'Sora', sans-serif",
                fontSize: "14px",
                fontWeight: 600,
                color: "var(--ink)",
              }}
            >
              {t.nav.categoriesModels}
            </div>
          </button>

          <button
            type="button"
            onClick={() => navigate("/inventory/unit-search")}
            style={actionCardStyle}
            onMouseEnter={(e) => {
              e.currentTarget.style.boxShadow =
                "var(--shadow-md)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.boxShadow = "none";
            }}
          >
            <svg
              width="24"
              height="24"
              viewBox="0 0 24 24"
              fill="none"
              stroke="var(--mint)"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              style={{ marginBottom: "8px" }}
              aria-hidden="true"
            >
              <circle cx="11" cy="11" r="8" />
              <line
                x1="21"
                y1="21"
                x2="16.65"
                y2="16.65"
              />
            </svg>

            <div
              style={{
                fontFamily: "'Sora', sans-serif",
                fontSize: "14px",
                fontWeight: 600,
                color: "var(--ink)",
              }}
            >
              {t.nav.unitSearch}
            </div>
          </button>
        </div>

        {/* Inventory Stats */}
        <div
          style={{
            display: "flex",
            gap: "16px",
            flexWrap: "wrap",
          }}
        >
          <div style={statTileStyle("var(--brand)")}>
            <div style={statLabelStyle}>
              {t.inventory.totalUnits}
            </div>

            <div
              style={statValueStyle}
              className="tabular-nums"
            >
              {inventoryTotals.total}
            </div>

            <div
              style={statBarStyle("var(--brand)")}
            />
          </div>

          <div style={statTileStyle("var(--mint)")}>
            <div style={statLabelStyle}>
              {t.inventory.available}
            </div>

            <div
              style={statValueStyle}
              className="tabular-nums"
            >
              {inventoryTotals.available}
            </div>

            <div
              style={statBarStyle("var(--mint)")}
            />
          </div>

          <div style={statTileStyle("var(--brand)")}>
            <div style={statLabelStyle}>
              {t.inventory.sold}
            </div>

            <div
              style={statValueStyle}
              className="tabular-nums"
            >
              {inventoryTotals.sold}
            </div>

            <div
              style={statBarStyle("var(--brand)")}
            />
          </div>

          <div style={statTileStyle("var(--accent)")}>
            <div style={statLabelStyle}>
              {t.inventory.damaged}
            </div>

            <div
              style={statValueStyle}
              className="tabular-nums"
            >
              {inventoryTotals.damaged}
            </div>

            <div
              style={statBarStyle("var(--accent)")}
            />
          </div>
        </div>

        {/* Recent Shipments */}
        <Card title={t.inventory.recentShipments}>
          {!Array.isArray(recentShipments) ||
          recentShipments.length === 0 ? (
            <EmptyState
              icon={
                <svg
                  width="48"
                  height="48"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
                </svg>
              }
              title={t.inventory.noShipments}
              description={t.inventory.noShipmentsHint}
            />
          ) : (
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                gap: "8px",
              }}
            >
              {recentShipments.map((s) => (
                <div
                  key={s.id}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    padding: "12px 0",
                    borderBottom:
                      "1px solid var(--border)",
                  }}
                >
                  <div>
                    <div
                      style={{
                        fontFamily: "'Manrope', sans-serif",
                        fontSize: "14px",
                        fontWeight: 600,
                        color: "var(--ink)",
                      }}
                    >
                      {s.supplier?.name ?? `Receipt #${s.id}`}
                    </div>

                    <div
                      style={{
                        fontFamily: "'Manrope', sans-serif",
                        fontSize: "12px",
                        color: "var(--soft)",
                        marginTop: "2px",
                      }}
                    >
                      {s.totalQuantity}{" "}
                      {t.inventory.units} —{" "}
                      {s.date
                        ? new Date(s.date).toLocaleDateString()
                        : "—"}
                    </div>
                  </div>

                  <div
                    style={{
                      fontFamily:
                        "'Manrope', sans-serif",
                      fontSize: "13px",
                      color: "var(--soft)",
                    }}
                  >
                    {s.employee?.name ?? "—"}
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}

