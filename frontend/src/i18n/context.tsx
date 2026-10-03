import { createContext, useContext, useState, useCallback, useEffect, type ReactNode } from "react";
import { languages, type Language, type TranslationKey } from "./index";

interface I18nContextType {
  language: Language;
  t: TranslationKey;
  dir: "ltr" | "rtl";
  setLanguage: (lang: Language) => void;
  toggleLanguage: () => void;
}

const I18nContext = createContext<I18nContextType | null>(null);

function getInitialLanguage(): Language {
  try {
    const stored = localStorage.getItem("pallet-lang");
    if (stored === "en" || stored === "ar") return stored;
  } catch {}
  return "en";
}

export function I18nProvider({ children }: { children: ReactNode }) {
  const [language, setLanguageState] = useState<Language>(getInitialLanguage);

  useEffect(() => {
    document.documentElement.dir = languages[language].dir;
    document.documentElement.lang = language;
    try {
      localStorage.setItem("pallet-lang", language);
    } catch {}
  }, [language]);

  const setLanguage = useCallback((lang: Language) => {
    setLanguageState(lang);
  }, []);

  const toggleLanguage = useCallback(() => {
    setLanguage(language === "en" ? "ar" : "en");
  }, [language, setLanguage]);

  const value: I18nContextType = {
    language,
    t: languages[language].translations,
    dir: languages[language].dir,
    setLanguage,
    toggleLanguage,
  };

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n() {
  const context = useContext(I18nContext);
  if (!context) throw new Error("useI18n must be used within an I18nProvider");
  return context;
}
