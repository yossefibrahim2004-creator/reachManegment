import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

export type ThemePreference = "light" | "dark" | "system";
export type ResolvedTheme = "light" | "dark";

/** Keep in sync with the inline script in index.html (FOUC prevention). */
const STORAGE_KEY = "pallet-theme";
const DEFAULT_PREFERENCE: ThemePreference = "system";
const SWITCH_TRANSITION_MS = 220;

const DARK_MEDIA_QUERY = "(prefers-color-scheme: dark)";

function isPreference(value: unknown): value is ThemePreference {
  return value === "light" || value === "dark" || value === "system";
}

function readStoredPreference(): ThemePreference {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (isPreference(stored)) return stored;
  } catch {
    // Storage can be unavailable (private mode / blocked cookies).
  }
  return DEFAULT_PREFERENCE;
}

function readSystemTheme(): ResolvedTheme {
  if (typeof window === "undefined" || !window.matchMedia) return "light";
  return window.matchMedia(DARK_MEDIA_QUERY).matches ? "dark" : "light";
}

function resolveTheme(preference: ThemePreference): ResolvedTheme {
  return preference === "system" ? readSystemTheme() : preference;
}

interface ThemeContextValue {
  /** The user's stored choice: "light" | "dark" | "system". */
  theme: ThemePreference;
  /** What is actually rendered right now: "light" | "dark". */
  resolvedTheme: ResolvedTheme;
  setTheme: (theme: ThemePreference) => void;
  /** Flips between the currently rendered light and dark themes. */
  toggleTheme: () => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

function applyToDocument(resolved: ResolvedTheme, animate: boolean) {
  const root = document.documentElement;

  if (animate && !root.classList.contains("theme-switching")) {
    root.classList.add("theme-switching");
    window.setTimeout(() => {
      root.classList.remove("theme-switching");
    }, SWITCH_TRANSITION_MS);
  }

  root.setAttribute("data-theme", resolved);
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [preference, setPreference] = useState<ThemePreference>(
    readStoredPreference,
  );
  const [systemTheme, setSystemTheme] = useState<ResolvedTheme>(
    readSystemTheme,
  );

  // Derived during render so effects never need to setState.
  const resolvedTheme: ResolvedTheme =
    preference === "system" ? systemTheme : preference;

  const isFirstRender = useRef(true);

  // Persist the choice + paint it on <html>.
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, preference);
    } catch {
      // Ignore storage failures — the in-memory preference still applies.
    }

    applyToDocument(resolvedTheme, !isFirstRender.current);
    isFirstRender.current = false;
  }, [preference, resolvedTheme]);

  // In "system" mode, follow OS changes live.
  useEffect(() => {
    if (preference !== "system" || !window.matchMedia) return;

    const media = window.matchMedia(DARK_MEDIA_QUERY);
    const onChange = (event: MediaQueryListEvent) => {
      setSystemTheme(event.matches ? "dark" : "light");
    };

    media.addEventListener("change", onChange);
    return () => media.removeEventListener("change", onChange);
  }, [preference]);

  const setTheme = useCallback((next: ThemePreference) => {
    setPreference(next);
  }, []);

  const toggleTheme = useCallback(() => {
    setPreference((current) => {
      const resolved = resolveTheme(current);
      return resolved === "dark" ? "light" : "dark";
    });
  }, []);

  const value = useMemo<ThemeContextValue>(
    () => ({ theme: preference, resolvedTheme, setTheme, toggleTheme }),
    [preference, resolvedTheme, setTheme, toggleTheme],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) throw new Error("useTheme must be used within a ThemeProvider");
  return context;
}
