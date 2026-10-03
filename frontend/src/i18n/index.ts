import en from "./en";
import ar from "./ar";

type Widen<T> = T extends string
  ? string
  : T extends (...args: infer A) => infer R
    ? (...args: A) => R
    : T extends readonly unknown[]
      ? Widen<T[number]>[]
      : T extends object
        ? { [K in keyof T]: Widen<T[K]> }
        : T;

export type TranslationKey = Widen<typeof en>;
export type Language = "en" | "ar";

export const languages: Record<Language, { label: string; dir: "ltr" | "rtl"; translations: TranslationKey }> = {
  en: { label: "English", dir: "ltr", translations: en },
  ar: { label: "العربية", dir: "rtl", translations: ar },
};

export { en, ar };
