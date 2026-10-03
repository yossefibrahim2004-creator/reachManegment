import { useAuth } from "../lib/auth";
import { useI18n } from "../i18n/context";
import { useSettings } from "../lib/settings";
import { useTheme, type ThemePreference } from "../lib/theme";
import { useState, useEffect, useRef, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import api from "../lib/api";
import { subscribeUnreadChanged } from "../lib/notification-events";

const SunIcon = () => (
  <svg
    className="h-[18px] w-[18px]"
    fill="none"
    stroke="currentColor"
    viewBox="0 0 24 24"
    strokeWidth={1.8}
    aria-hidden="true"
  >
    <circle cx="12" cy="12" r="4" />
    <path
      strokeLinecap="round"
      d="M12 2.5v2M12 19.5v2M4.28 4.28l1.42 1.42M18.3 18.3l1.42 1.42M2.5 12h2M19.5 12h2M4.28 19.72l1.42-1.42M18.3 5.7l1.42-1.42"
    />
  </svg>
);

const MoonIcon = () => (
  <svg
    className="h-[18px] w-[18px]"
    fill="none"
    stroke="currentColor"
    viewBox="0 0 24 24"
    strokeWidth={1.8}
    aria-hidden="true"
  >
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"
    />
  </svg>
);

const MonitorIcon = () => (
  <svg
    className="h-[18px] w-[18px]"
    fill="none"
    stroke="currentColor"
    viewBox="0 0 24 24"
    strokeWidth={1.8}
    aria-hidden="true"
  >
    <rect x="3" y="4" width="18" height="13" rx="2" />
    <path strokeLinecap="round" d="M8.5 21h7M12 17v4" />
  </svg>
);

const CheckIcon = () => (
  <svg
    className="ms-auto h-3.5 w-3.5"
    fill="none"
    stroke="currentColor"
    viewBox="0 0 24 24"
    strokeWidth={2.4}
    aria-hidden="true"
  >
    <path strokeLinecap="round" strokeLinejoin="round" d="M20 6 9 17l-5-5" />
  </svg>
);

interface TopBarProps {
  onMenuToggle: () => void;
  isMenuOpen: boolean;
}

export default function TopBar({
  onMenuToggle,
  isMenuOpen,
}: TopBarProps) {
  const { user, logout } = useAuth();
  const { t, language } = useI18n();
  const { brand } = useSettings();
  const { theme, resolvedTheme, setTheme } = useTheme();
  const navigate = useNavigate();

  const [unreadCount, setUnreadCount] = useState(0);
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [isThemeMenuOpen, setIsThemeMenuOpen] = useState(false);
  const themeMenuRef = useRef<HTMLDivElement>(null);

  // Close the theme menu on outside click / Escape.
  useEffect(() => {
    if (!isThemeMenuOpen) return;

    const onPointerDown = (event: PointerEvent) => {
      if (!themeMenuRef.current?.contains(event.target as Node)) {
        setIsThemeMenuOpen(false);
      }
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setIsThemeMenuOpen(false);
    };

    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [isThemeMenuOpen]);

  useEffect(() => {
    let isMounted = true;

    const fetchUnread = async () => {
      if (document.visibilityState !== "visible") return;

      try {
        const { data } = await api.get("/notifications/unread-count");

        if (!isMounted) return;

        setUnreadCount(data?.count ?? data?.meta?.total ?? 0);
      } catch {
        // Notifications are non-critical.
      }
    };

    void fetchUnread();

    const interval = window.setInterval(() => {
      void fetchUnread();
    }, 30000);

    const onVisibility = () => {
      if (document.visibilityState === "visible") {
        void fetchUnread();
      }
    };

    // Refresh immediately when any page marks notifications as read.
    const unsubscribe = subscribeUnreadChanged(() => {
      void fetchUnread();
    });

    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      isMounted = false;
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisibility);
      unsubscribe();
    };
  }, []);

  const locale = language === "ar" ? "ar-EG" : "en-US";

  const today = new Date().toLocaleDateString(locale, {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  const handleNotificationsClick = () => {
    // The notifications page is available to every role so anyone who
    // receives notifications can read them and clear the bell badge.
    navigate("/notifications");
  };

  const handleLogout = async () => {
    if (isLoggingOut) return;

    setIsLoggingOut(true);

    try {
      await logout();
    } finally {
      setIsLoggingOut(false);
    }
  };

  const themeOptions: Array<{
    value: ThemePreference;
    label: string;
    hint: string;
    icon: ReactNode;
  }> = [
    {
      value: "light",
      label: t.theme.light,
      hint: t.theme.lightDesc,
      icon: <SunIcon />,
    },
    {
      value: "dark",
      label: t.theme.dark,
      hint: t.theme.darkDesc,
      icon: <MoonIcon />,
    },
    {
      value: "system",
      label: t.theme.system,
      hint: t.theme.systemDesc,
      icon: <MonitorIcon />,
    },
  ];

  const currentThemeIcon =
    resolvedTheme === "dark" ? <MoonIcon /> : <SunIcon />;

  const displayName =
    [user?.firstName, user?.lastName].filter(Boolean).join(" ") ||
    user?.username ||
    "User";

  const userInitial =
    user?.firstName?.charAt(0) ||
    user?.lastName?.charAt(0) ||
    user?.username?.charAt(0) ||
    "U";

  return (
    <header
      className="sticky top-0 z-30 h-14 w-full border-b backdrop-blur-xl sm:h-[60px]"
      style={{
        backgroundColor: "color-mix(in srgb, var(--card) 94%, transparent)",
        borderColor: "var(--border)",
      }}
    >
      <div className="flex h-full items-center justify-between gap-2 px-3 sm:gap-3 sm:px-5">
        {/* LEFT */}
        <div className="flex min-w-0 items-center gap-2 sm:gap-3">
          {/* MENU BUTTON */}
          <button
            type="button"
            onClick={onMenuToggle}
            aria-label={isMenuOpen ? t.nav.closeMenu : t.nav.openMenu}
            aria-expanded={isMenuOpen}
            aria-controls="app-sidebar"
            className="group relative flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border outline-none transition-all duration-200 hover:-translate-y-[1px] hover:shadow-sm focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:ring-offset-2 active:translate-y-0"
            style={{
              color: "var(--ink)",
              cursor: "pointer",
              backgroundColor: "var(--background)",
              borderColor: isMenuOpen
                ? "var(--accent)"
                : "var(--border)",
              boxShadow: isMenuOpen
                ? "0 0 0 1px color-mix(in srgb, var(--accent) 12%, transparent)"
                : "none",
            }}
          >
            <span
              className="relative flex h-5 w-5 items-center justify-center"
              aria-hidden="true"
            >
              {/* TOP BAR */}
              <span
                className="absolute h-[1.8px] w-[18px] rounded-full transition-all duration-200 ease-out"
                style={{
                  backgroundColor: "currentColor",
                  transform: isMenuOpen
                    ? "rotate(45deg)"
                    : "translateY(-5.5px)",
                }}
              />

              {/* MIDDLE BAR */}
              <span
                className="absolute h-[1.8px] w-[18px] rounded-full transition-all duration-150 ease-out"
                style={{
                  backgroundColor: "currentColor",
                  opacity: isMenuOpen ? 0 : 1,
                  transform: isMenuOpen ? "scaleX(0)" : "translateY(0)",
                }}
              />

              {/* BOTTOM BAR */}
              <span
                className="absolute h-[1.8px] w-[18px] rounded-full transition-all duration-200 ease-out"
                style={{
                  backgroundColor: "currentColor",
                  transform: isMenuOpen
                    ? "rotate(-45deg)"
                    : "translateY(5.5px)",
                }}
              />
            </span>
          </button>

          {/* DIVIDER */}
          <div
            className="hidden h-8 w-px sm:block"
            style={{ backgroundColor: "var(--border)" }}
          />

          {/* PAGE INFO */}
          <div className="min-w-0">
            <div className="flex min-w-0 items-center gap-2">
              <h1
                className="truncate text-[15px] font-semibold tracking-[-0.01em] sm:text-base"
                style={{
                  color: "var(--ink)",
                }}
              >
                {brand.businessName || t.appName}
              </h1>
            </div>

            <p
              className="mt-0.5 truncate text-[11px] font-medium sm:text-xs"
              style={{
                color: "var(--soft)",
                letterSpacing: language === "ar" ? "0" : "0.01em",
              }}
            >
              {today}
            </p>
          </div>
        </div>

        {/* RIGHT */}
        <div className="flex shrink-0 items-center gap-2 sm:gap-3">
          {/* NOTIFICATIONS */}
          <button
            type="button"
            onClick={handleNotificationsClick}
            title={t.nav.notifications}
            aria-label={`${t.nav.notifications}${
              unreadCount > 0 ? `, ${unreadCount} ${t.notifications.unread}` : ""
            }`}
            className="group relative flex h-10 w-10 items-center justify-center rounded-xl border outline-none transition-all duration-200 hover:-translate-y-[1px] hover:shadow-sm focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:ring-offset-2 active:translate-y-0"
            style={{
              color: "var(--ink)",
              backgroundColor: "var(--background)",
              borderColor: "var(--border)",
              cursor: "pointer",
            }}
          >
            <svg
              className="h-[19px] w-[19px] transition-transform duration-200 group-hover:scale-105"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
              strokeWidth={1.8}
              aria-hidden="true"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"
              />
            </svg>

            {unreadCount > 0 && (
              <span
                className="absolute -end-1 -top-1 flex h-[18px] min-w-[18px] items-center justify-center rounded-full border-2 px-1 text-[8px] font-bold leading-none"
                style={{
                  backgroundColor: "var(--accent-fill)",
                  color: "var(--on-accent)",
                  borderColor: "var(--card)",
                }}
                aria-hidden="true"
              >
                {unreadCount > 99 ? "99+" : unreadCount}
              </span>
            )}
          </button>

          {/* THEME TOGGLE */}
          <div className="relative" ref={themeMenuRef}>
            <button
              type="button"
              onClick={() => setIsThemeMenuOpen((open) => !open)}
              title={t.theme.toggle}
              aria-label={t.theme.toggle}
              aria-haspopup="menu"
              aria-expanded={isThemeMenuOpen}
              className="group flex h-10 w-10 items-center justify-center rounded-xl border outline-none transition-all duration-200 hover:-translate-y-[1px] hover:shadow-sm focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:ring-offset-2 active:translate-y-0"
              style={{
                color: "var(--ink)",
                backgroundColor: "var(--background)",
                borderColor: isThemeMenuOpen
                  ? "var(--brand)"
                  : "var(--border)",
                cursor: "pointer",
              }}
            >
              <span key={resolvedTheme} className="theme-icon flex">
                {currentThemeIcon}
              </span>
            </button>

            {isThemeMenuOpen && (
              <div
                role="menu"
                aria-label={t.theme.label}
                className="absolute end-0 top-full z-50 mt-2 w-52 overflow-hidden rounded-xl border py-1"
                style={{
                  backgroundColor: "var(--bg-elevated)",
                  borderColor: "var(--border)",
                  boxShadow: "var(--shadow-lg)",
                }}
              >
                {themeOptions.map((option) => {
                  const isSelected = theme === option.value;
                  return (
                    <button
                      key={option.value}
                      type="button"
                      role="menuitemradio"
                      aria-checked={isSelected}
                      onClick={() => {
                        setTheme(option.value);
                        setIsThemeMenuOpen(false);
                      }}
                      className="flex w-full items-center gap-2.5 px-3 py-2 text-start text-xs font-semibold outline-none transition-colors focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--brand)]"
                      style={{
                        backgroundColor: isSelected
                          ? "var(--brand-fill)"
                          : "transparent",
                        color: isSelected ? "var(--on-brand)" : "var(--ink)",
                        border: "none",
                        cursor: "pointer",
                      }}
                    >
                      {option.icon}
                      <span className="flex flex-col">
                        <span>{option.label}</span>
                        <span
                          className="text-[10px] font-medium"
                          style={{
                            color: isSelected
                              ? "color-mix(in srgb, var(--on-brand) 75%, transparent)"
                              : "var(--soft)",
                          }}
                        >
                          {option.hint}
                        </span>
                      </span>
                      {isSelected && <CheckIcon />}
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* USER */}
          <div
            className="hidden h-10 items-center gap-2.5 rounded-xl border px-3 md:flex"
            style={{
              backgroundColor: "var(--background)",
              borderColor: "var(--border)",
            }}
          >
            <div
              className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-[11px] font-bold"
              style={{
                backgroundColor: "var(--accent-fill)",
                color: "var(--on-accent)",
              }}
            >
              {userInitial.toUpperCase()}
            </div>

            <div className="min-w-0 max-w-[140px]">
              <p
                className="truncate text-xs font-semibold"
                style={{ color: "var(--ink)" }}
              >
                {displayName}
              </p>

              {user?.role && (
                <p
                  className="truncate text-[10px] font-medium"
                  style={{ color: "var(--soft)" }}
                >
                  {user.role}
                </p>
              )}
            </div>
          </div>

          {/* LOGOUT */}
          <button
            type="button"
            onClick={handleLogout}
            disabled={isLoggingOut}
            aria-label={t.signOut}
            className="group flex h-10 items-center gap-2 rounded-xl px-3.5 text-xs font-semibold outline-none transition-all duration-200 hover:-translate-y-[1px] hover:shadow-sm focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:ring-offset-2 active:translate-y-0 disabled:cursor-not-allowed disabled:opacity-60 sm:px-4 sm:text-sm"
            style={{
              backgroundColor: "var(--accent-fill)",
              color: "var(--on-accent)",
            }}
          >
            {isLoggingOut ? (
              <svg
                className="h-4 w-4 animate-spin"
                viewBox="0 0 24 24"
                fill="none"
                aria-hidden="true"
              >
                <circle
                  className="opacity-30"
                  cx="12"
                  cy="12"
                  r="9"
                  stroke="currentColor"
                  strokeWidth="2"
                />
                <path
                  d="M21 12a9 9 0 00-9-9"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                />
              </svg>
            ) : (
              <svg
                className="h-4 w-4 transition-transform duration-200 group-hover:translate-x-0.5"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
                strokeWidth={1.9}
                aria-hidden="true"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M15 3h4a2 2 0 012 2v14a2 2 0 01-2 2h-4"
                />
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M10 17l5-5-5-5M15 12H3"
                />
              </svg>
            )}

            <span className="hidden sm:inline">
              {t.signOut}
            </span>
          </button>
        </div>
      </div>
    </header>
  );
}