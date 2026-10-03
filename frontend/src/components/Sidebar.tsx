import { NavLink, useLocation } from "react-router-dom";
import { useEffect, useMemo, useState } from "react";
import { useAuth } from "../lib/auth";
import { useI18n } from "../i18n/context";
import { useSettings } from "../lib/settings";
import BrandLogo from "./BrandLogo";

type NavKey =
  | "home"
  | "dashboard"
  | "notifications"
  | "newInvoice"
  | "invoiceSearch"
  | "unitSearch"
  | "customers"
  | "myRequests"
  | "attendance"
  | "pendingInvoices"
  | "expenses"
  | "reports"
  | "receiveShipment"
  | "inventory"
  | "categoriesModels"
  | "invoiceDelivery"
  | "stockAdjustments"
  | "changeRequests"
  | "invoices"
  | "suppliers"
  | "stockPricing"
  | "employees"
  | "auditHistory"
  | "settings";

type UserRole = "ADMIN" | "ACCOUNTANT" | "INVENTORY" | "SALES";
type Language = "en" | "ar";

interface NavItem {
  to: string;
  key: NavKey;
  icon: string;
  primary?: boolean;
}

interface NavSection {
  id: string;
  label: string;
  items: NavItem[];
  defaultOpen?: boolean;
}

interface SidebarProps {
  open: boolean;
  onClose: () => void;
}

const DESKTOP_BREAKPOINT = 1024;

const ROLE_LABELS: Record<UserRole, Record<Language, string>> = {
  ADMIN: { en: "Admin", ar: "مدير" },
  ACCOUNTANT: { en: "Accountant", ar: "محاسب" },
  INVENTORY: { en: "Inventory", ar: "أمين المخزن" },
  SALES: { en: "Sales", ar: "مبيعات" },
};

const ICONS = {
  home: "M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6",
  dashboard:
    "M4 5a1 1 0 011-1h14a1 1 0 011 1v2a1 1 0 01-1 1H5a1 1 0 01-1-1V5zM4 13a1 1 0 011-1h6a1 1 0 011 1v6a1 1 0 01-1 1H5a1 1 0 01-1-1v-6zM16 13a1 1 0 011-1h2a1 1 0 011 1v6a1 1 0 01-1 1h-2a1 1 0 01-1-1v-6z",
  notifications:
    "M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9",
  newInvoice: "M12 4v16m8-8H4M9 7l6 6m0-6l-6 6",
  invoice:
    "M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z",
  search: "M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z",
  unitSearch: "M10 18l4-4m0 0l-4-4m4 4H3",
  customers:
    "M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z",
  requests:
    "M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2",
  changeRequests:
    "M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4",
  inventory: "M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4",
  categories:
    "M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z",
  adjustments:
    "M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4",
  money:
    "M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z",
  reports:
    "M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z",
  employees:
    "M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197m13.5-9a2.5 2.5 0 11-5 0 2.5 2.5 0 015 0z",
  attendance: "M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z",
  audit: "M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z",
  // Fixed: the original path had a typo in its final segment ("-2.37 2.37..."),
  // which drew a broken gear tooth.
  settings:
    "M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.573-1.066zM15 12a3 3 0 11-6 0 3 3 0 016 0z",
  suppliers: "M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4",
  chevron: "M19 9l-7 7-7-7",
  logout:
    "M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1",
};

function getSections(
  role: UserRole | undefined,
  language: Language,
): NavSection[] {
  const labels =
    language === "ar"
      ? {
          overview: "نظرة عامة",
          sales: "المبيعات",
          inventory: "المخزون",
          finance: "المالية",
          people: "الموظفون والحضور",
          system: "الإدارة والنظام",
        }
      : {
          overview: "Overview",
          sales: "Sales",
          inventory: "Inventory",
          finance: "Finance",
          people: "People & attendance",
          system: "Administration",
        };

  const commonOverview: NavItem[] = [
    {
      to: "/",
      key: role === "ADMIN" ? "dashboard" : "home",
      icon: role === "ADMIN" ? ICONS.dashboard : ICONS.home,
    },
    {
      to: role === "ADMIN" ? "/admin/notifications" : "/notifications",
      key: "notifications",
      icon: ICONS.notifications,
    },
  ];

  const overview: NavSection = {
    id: "overview",
    label: labels.overview,
    items: commonOverview,
    defaultOpen: true,
  };

  if (role === "SALES" || !role) {
    return [
      overview,
      {
        id: "sales",
        label: labels.sales,
        defaultOpen: true,
        items: [
          { to: "/sales/new-invoice", key: "newInvoice", icon: ICONS.newInvoice, primary: true },
          { to: "/sales/invoice-search", key: "invoiceSearch", icon: ICONS.search },
          { to: "/sales/customers", key: "customers", icon: ICONS.customers },
          { to: "/unit-search", key: "unitSearch", icon: ICONS.unitSearch },
          { to: "/sales/my-requests", key: "myRequests", icon: ICONS.requests },
        ],
      },
      {
        id: "people",
        label: labels.people,
        items: [{ to: "/sales/attendance", key: "attendance", icon: ICONS.attendance }],
      },
    ];
  }

  if (role === "ACCOUNTANT") {
    return [
      overview,
      {
        id: "finance",
        label: labels.finance,
        defaultOpen: true,
        items: [
          { to: "/accountant/pending-invoices", key: "pendingInvoices", icon: ICONS.invoice, primary: true },
          { to: "/accountant/expenses", key: "expenses", icon: ICONS.money },
          { to: "/reports/expenses", key: "reports", icon: ICONS.reports },
        ],
      },
      {
        id: "people",
        label: labels.people,
        items: [{ to: "/accountant/attendance", key: "attendance", icon: ICONS.attendance }],
      },
    ];
  }

  if (role === "INVENTORY") {
    return [
      overview,
      {
        id: "inventory",
        label: labels.inventory,
        defaultOpen: true,
        items: [
          { to: "/inventory/delivery", key: "invoiceDelivery", icon: ICONS.inventory, primary: true },
          { to: "/inventory/receive-shipment", key: "receiveShipment", icon: ICONS.inventory },
          { to: "/inventory/stock", key: "inventory", icon: ICONS.inventory },
          { to: "/inventory/categories-models", key: "categoriesModels", icon: ICONS.categories },
          { to: "/inventory/stock-adjustments", key: "stockAdjustments", icon: ICONS.adjustments },
          { to: "/unit-search", key: "unitSearch", icon: ICONS.unitSearch },
        ],
      },
      {
        id: "people",
        label: labels.people,
        items: [{ to: "/inventory/attendance", key: "attendance", icon: ICONS.attendance }],
      },
    ];
  }

  return [
    overview,
    {
      id: "sales",
      label: labels.sales,
      defaultOpen: true,
      items: [
        { to: "/admin/new-invoice", key: "newInvoice", icon: ICONS.newInvoice, primary: true },
        { to: "/admin/invoices", key: "invoices", icon: ICONS.invoice },
        { to: "/admin/customers", key: "customers", icon: ICONS.customers },
        { to: "/admin/suppliers", key: "suppliers", icon: ICONS.suppliers },
        { to: "/admin/unit-search", key: "unitSearch", icon: ICONS.unitSearch },
      ],
    },
    {
      id: "inventory",
      label: labels.inventory,
      defaultOpen: true,
      items: [
        { to: "/admin/stock-pricing", key: "stockPricing", icon: ICONS.money },
        { to: "/admin/stock-adjustments", key: "stockAdjustments", icon: ICONS.adjustments },
      ],
    },
    {
      id: "finance",
      label: labels.finance,
      items: [
        { to: "/admin/expenses", key: "expenses", icon: ICONS.money },
        { to: "/admin/reports/revenue", key: "reports", icon: ICONS.reports },
      ],
    },
    {
      id: "people",
      label: labels.people,
      items: [
        { to: "/admin/employees", key: "employees", icon: ICONS.employees },
        { to: "/admin/attendance", key: "attendance", icon: ICONS.attendance },
      ],
    },
    {
      id: "system",
      label: labels.system,
      items: [
        { to: "/admin/change-requests", key: "changeRequests", icon: ICONS.changeRequests },
        { to: "/admin/audit", key: "auditHistory", icon: ICONS.audit },
        { to: "/admin/settings", key: "settings", icon: ICONS.settings },
      ],
    },
  ];
}

function isRouteActive(pathname: string, to: string) {
  if (to === "/") return pathname === "/";
  return pathname === to || pathname.startsWith(`${to}/`);
}

function SidebarIcon({ path, size = 18 }: { path: string; size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      viewBox="0 0 24 24"
      strokeWidth={1.7}
      aria-hidden="true"
      focusable="false"
      className="shrink-0"
    >
      <path strokeLinecap="round" strokeLinejoin="round" d={path} />
    </svg>
  );
}

const FOCUS_RING =
  "outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--brand)] focus-visible:ring-offset-0";

export default function Sidebar({ open, onClose }: SidebarProps) {
  const { user, logout } = useAuth();
  const { t, language, setLanguage } = useI18n();
  const { brand } = useSettings();
  const { pathname } = useLocation();

  const role = user?.role as UserRole | undefined;

  const sections = useMemo(
    () => getSections(role, language),
    [role, language],
  );

  const [openSections, setOpenSections] = useState<Record<string, boolean>>(
    () =>
      Object.fromEntries(
        sections.map((s) => [s.id, s.defaultOpen ?? true]),
      ),
  );

  // Keep state in sync with the sections list AND make sure the section that
  // contains the current page is never hidden from the user.
  useEffect(() => {
    setOpenSections((current) => {
      const next = { ...current };

      sections.forEach((section) => {
        if (!(section.id in next)) {
          next[section.id] = section.defaultOpen ?? true;
        }
        if (section.items.some((item) => isRouteActive(pathname, item.to))) {
          next[section.id] = true;
        }
      });

      return next;
    });
  }, [sections, pathname]);

  // Lock body scroll while the mobile drawer is open.
  useEffect(() => {
    if (!open || window.innerWidth >= DESKTOP_BREAKPOINT) return;

    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.body.style.overflow = previous;
    };
  }, [open]);

  // Escape closes the mobile drawer.
  useEffect(() => {
    if (!open) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && window.innerWidth < DESKTOP_BREAKPOINT) {
        onClose();
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);

  const handleNavClick = () => {
    if (window.innerWidth < DESKTOP_BREAKPOINT) onClose();
  };

  const toggleSection = (sectionId: string) => {
    setOpenSections((current) => ({
      ...current,
      [sectionId]: !current[sectionId],
    }));
  };

  if (!open) return null;

  const initials =
    `${user?.firstName?.[0] ?? ""}${user?.lastName?.[0] ?? ""}`.toUpperCase() ||
    "•";
  const roleLabel = role ? ROLE_LABELS[role]?.[language] ?? role : "";

  return (
    <>
      {/* Mobile overlay */}
      <div
        className="fixed inset-0 z-40 lg:hidden"
        style={{ backgroundColor: "var(--overlay)" }}
        onClick={onClose}
        aria-hidden="true"
      />

      <aside
        id="app-sidebar"
        aria-label={t.appName}
        className="fixed start-0 top-0 bottom-0 z-50 w-[272px] max-w-[85vw] flex flex-col overflow-hidden"
        style={{
          backgroundColor: "var(--card)",
          borderInlineEnd: "1px solid var(--border)",
        }}
      >
        {/* Brand */}
        <div
          className="h-[72px] shrink-0 flex items-center px-5"
          style={{ borderBottom: "1px solid var(--border)" }}
        >
          <div className="flex items-center gap-3 min-w-0">
            <div className="shrink-0">
              <BrandLogo size={36} />
            </div>

            <div className="min-w-0">
              <span
                className="text-[15px] font-semibold block leading-tight truncate"
                style={{ color: "var(--ink)", fontFamily: "Sora, sans-serif" }}
              >
                {brand.businessName || t.appName}
              </span>

              <span
                className="text-[12px] font-medium block truncate mt-0.5"
                style={{ color: "var(--soft)" }}
              >
                {t.appSubtitle}
              </span>
            </div>
          </div>
        </div>

        {/* Navigation */}
        <nav
          className="flex-1 overflow-y-auto overscroll-contain px-3 py-3"
          aria-label="Main navigation"
        >
          <div className="space-y-2">
            {sections.map((section) => {
              const isOpen = !!openSections[section.id];
              const panelId = `nav-section-${section.id}`;

              return (
                <section key={section.id}>
                  <button
                    type="button"
                    onClick={() => toggleSection(section.id)}
                    aria-expanded={isOpen}
                    aria-controls={panelId}
                    className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg transition-colors hover:bg-[var(--row-selected)] ${FOCUS_RING}`}
                  >
                    {/* No uppercase / letter-spacing: both break Arabic letter joining */}
                    <span
                      className="flex-1 text-start text-[12px] font-semibold"
                      style={{ color: "var(--soft)" }}
                    >
                      {section.label}
                    </span>

                    <span
                      className="transition-transform duration-200 motion-reduce:transition-none"
                      style={{
                        color: "var(--soft)",
                        // Collapsed chevron points toward the inline-end, in both LTR and RTL.
                        transform: isOpen
                          ? "rotate(0deg)"
                          : language === "ar"
                            ? "rotate(90deg)"
                            : "rotate(-90deg)",
                      }}
                    >
                      <SidebarIcon path={ICONS.chevron} size={14} />
                    </span>
                  </button>

                  {/* Height animation without magic numbers: 0fr -> 1fr */}
                  <div
                    id={panelId}
                    className="grid transition-[grid-template-rows,opacity] duration-200 motion-reduce:transition-none"
                    style={{
                      gridTemplateRows: isOpen ? "1fr" : "0fr",
                      opacity: isOpen ? 1 : 0,
                    }}
                  >
                    <div className="min-h-0 overflow-hidden">
                      {/* visibility:hidden removes collapsed links from the tab order */}
                      <ul
                        className="space-y-0.5 pb-1"
                        style={{
                          visibility: isOpen ? "visible" : "hidden",
                          transition: "visibility 200ms",
                        }}
                      >
                        {section.items.map((item) => (
                          <li key={item.to}>
                            <NavLink
                              to={item.to}
                              end={item.to === "/"}
                              onClick={handleNavClick}
                              className={({ isActive }) =>
                                [
                                  "relative flex items-center gap-3 min-h-11 lg:min-h-10 px-3 rounded-lg text-[13.5px] transition-colors duration-150",
                                  FOCUS_RING,
                                  isActive
                                    ? "font-semibold bg-[var(--row-selected)] text-[color:var(--brand)]"
                                    : "font-medium text-[color:var(--ink)] hover:bg-[var(--row-selected)]",
                                ].join(" ")
                              }
                            >
                              {({ isActive }) => (
                                <>
                                  {isActive && (
                                    <span
                                      aria-hidden="true"
                                      className="absolute start-0 top-1/2 -translate-y-1/2 w-[3px] h-5 rounded-e-full"
                                      style={{ backgroundColor: "var(--brand)" }}
                                    />
                                  )}

                                  {/* Primary action = tinted icon tile (replaces the unlabeled dot) */}
                                  <span
                                    className="grid place-items-center w-7 h-7 shrink-0 rounded-md"
                                    style={
                                      item.primary && !isActive
                                        ? {
                                            color: "var(--brand)",
                                            backgroundColor:
                                              "color-mix(in srgb, var(--brand) 14%, transparent)",
                                          }
                                        : undefined
                                    }
                                  >
                                    <SidebarIcon path={item.icon} size={18} />
                                  </span>

                                  <span className="flex-1 truncate">
                                    {t.nav[item.key]}
                                  </span>
                                </>
                              )}
                            </NavLink>
                          </li>
                        ))}
                      </ul>
                    </div>
                  </div>
                </section>
              );
            })}
          </div>
        </nav>

        {/* Footer */}
        <div
          className="shrink-0"
          style={{ borderTop: "1px solid var(--border)" }}
        >
          {/* Language */}
          <div className="px-4 pt-3 pb-2">
            <div
              role="group"
              aria-label="Language"
              className="flex p-1 rounded-lg"
              style={{ backgroundColor: "var(--row-selected)" }}
            >
              {(
                [
                  { code: "en", label: "EN" },
                  { code: "ar", label: "عربي" },
                ] as const
              ).map(({ code, label }) => {
                const active = language === code;

                return (
                  <button
                    key={code}
                    type="button"
                    lang={code}
                    aria-pressed={active}
                    onClick={() => setLanguage(code)}
                    className={`flex-1 h-9 rounded-md text-[12px] font-semibold transition-all ${FOCUS_RING}`}
                    style={{
                      backgroundColor: active ? "var(--card)" : "transparent",
                      color: active ? "var(--brand)" : "var(--soft)",
                      boxShadow: active ? "var(--shadow-sm)" : "none",
                    }}
                  >
                    {label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* User */}
       {/*    <div className="px-4 pt-2 pb-4">
            <div
              className="flex items-center gap-3 p-2.5 rounded-xl"
              style={{ backgroundColor: "var(--row-selected)" }}
            >
              <div
                aria-hidden="true"
                className="w-9 h-9 shrink-0 flex items-center justify-center text-white text-[12px] font-bold rounded-lg"
                style={{ backgroundColor: "var(--accent)" }}
              >
                {initials}
              </div>

              <div className="flex-1 min-w-0">
                <p
                  className="text-[13px] font-semibold truncate"
                  style={{ color: "var(--ink)" }}
                >
                  {user?.firstName} {user?.lastName}
                </p>

                <p
                  className="text-[12px] font-medium truncate mt-0.5"
                  style={{ color: "var(--soft)" }}
                >
                  {roleLabel}
                </p>
              </div>

              <button
                type="button"
                onClick={() => logout()}
                className={`w-9 h-9 shrink-0 flex items-center justify-center rounded-lg transition-colors hover:bg-[var(--card)] ${FOCUS_RING}`}
                style={{ color: "var(--soft)" }}
                title={t.signOut}
                aria-label={t.signOut}
              >
                <SidebarIcon path={ICONS.logout} size={17} />
              </button>
            </div>
          </div> */}
        </div>
      </aside>
    </>
  );
}