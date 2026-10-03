import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import axios from "axios";
import api from "./api";
import type { AppSetting } from "../types";

export interface BrandInfo {
  businessName: string;
  address: string | null;
  phone: string | null;
  logoUrl: string | null;
}

const DEFAULT_BRAND: BrandInfo = {
  businessName: "Pallet POS",
  address: null,
  phone: null,
  logoUrl: null,
};

interface SettingsContextValue {
  brand: BrandInfo;
  /** Full authenticated settings payload, or null before load / when logged out. */
  settings: AppSetting | null;
  ready: boolean;
  refresh: () => Promise<void>;
}

const SettingsContext = createContext<SettingsContextValue | null>(null);

function pickBrand(data: Partial<BrandInfo> | null | undefined): BrandInfo {
  return {
    businessName: data?.businessName?.trim() || DEFAULT_BRAND.businessName,
    address: data?.address || null,
    phone: data?.phone || null,
    logoUrl: data?.logoUrl || null,
  };
}

function authHeaders(): Record<string, string> {
  const token = localStorage.getItem("accessToken");
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export async function uploadLogo(file: File): Promise<BrandInfo> {
  const formData = new FormData();
  formData.append("file", file);
  const { data } = await axios.post("/api/settings/logo", formData, {
    headers: authHeaders(),
  });
  return pickBrand(data);
}

export async function removeLogo(): Promise<BrandInfo> {
  const { data } = await axios.delete("/api/settings/logo", {
    headers: authHeaders(),
  });
  return pickBrand(data);
}

export function SettingsProvider({ children }: { children: ReactNode }) {
  const [brand, setBrand] = useState<BrandInfo>(DEFAULT_BRAND);
  const [settings, setSettings] = useState<AppSetting | null>(null);
  const [ready, setReady] = useState(false);

  const refresh = useCallback(async () => {
    try {
      if (localStorage.getItem("accessToken")) {
        try {
          const { data } = await api.get<AppSetting>("/settings");
          setSettings(data);
          setBrand(pickBrand(data));
          return;
        } catch {
          // fall back to the public brand endpoint
        }
      }
      setSettings(null);
      const { data } = await axios.get("/api/settings/brand");
      setBrand(pickBrand(data));
    } catch {
      // keep the last known brand on network failure
    } finally {
      setReady(true);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    document.title = brand.businessName;
    document.documentElement.style.setProperty(
      "--print-company",
      JSON.stringify(brand.businessName),
    );

    let link = document.querySelector<HTMLLinkElement>("link[rel~='icon']");
    if (!link) {
      link = document.createElement("link");
      link.rel = "icon";
      document.head.appendChild(link);
    }
    if (brand.logoUrl) {
      const path = brand.logoUrl.split("?")[0].toLowerCase();
      link.type = path.endsWith(".svg")
        ? "image/svg+xml"
        : path.endsWith(".png")
          ? "image/png"
          : path.endsWith(".jpg") || path.endsWith(".jpeg")
            ? "image/jpeg"
            : path.endsWith(".webp")
              ? "image/webp"
              : "image/png";
      link.href = brand.logoUrl;
    } else {
      link.type = "image/svg+xml";
      link.href = "/favicon.svg";
    }
  }, [brand.businessName, brand.logoUrl]);

  const value = useMemo(
    () => ({ brand, settings, ready, refresh }),
    [brand, settings, ready, refresh],
  );

  return (
    <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>
  );
}

export function useSettings(): SettingsContextValue {
  const context = useContext(SettingsContext);
  if (!context) {
    throw new Error("useSettings must be used within a SettingsProvider");
  }
  return context;
}
