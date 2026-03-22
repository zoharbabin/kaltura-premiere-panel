/**
 * Lightweight i18n system for UXP plugin localization.
 *
 * - Detects locale from UXP host at startup
 * - Falls back to English for missing keys
 * - Supports interpolation: t("key", { name: "foo" }) → "Hello foo"
 * - No external dependencies
 */
import React, { createContext, useContext, useMemo } from "react";
import en from "./locales/en.json";

/** All supported locale codes */
export const SUPPORTED_LOCALES = [
  "en",
  "de",
  "fr",
  "ja",
  "ko",
  "es",
  "zh-Hans",
  "pt-BR",
  "it",
  "ru",
  "cs",
  "da",
  "fi",
  "nb",
  "nl",
  "pl",
  "sv",
  "tr",
  "uk",
  "zh-Hant",
] as const;

export type SupportedLocale = (typeof SUPPORTED_LOCALES)[number];

type TranslationStrings = Record<string, string>;

/** Registry of loaded locale data */
const localeRegistry: Partial<Record<SupportedLocale, TranslationStrings>> = {
  en: en as TranslationStrings,
};

/** Register a locale's translations (called by lazy-loaded locale modules) */
export function registerLocale(locale: SupportedLocale, strings: TranslationStrings): void {
  localeRegistry[locale] = strings;
}

/** Detect the host app's UI locale and map to our supported locales */
export function detectLocale(): SupportedLocale {
  try {
    const host = require("uxp").host;
    const uiLocale: string = host.uiLocale ?? "en";
    return mapLocale(uiLocale);
  } catch {
    return "en";
  }
}

/** Map an Adobe locale string (e.g. "fr_FR", "zh_CN") to our supported locale */
function mapLocale(adobeLocale: string): SupportedLocale {
  const normalized = adobeLocale.replace("_", "-");

  // Exact match first
  if (SUPPORTED_LOCALES.includes(normalized as SupportedLocale)) {
    return normalized as SupportedLocale;
  }

  // Map Adobe locale codes to our codes
  const mapping: Record<string, SupportedLocale> = {
    "zh-CN": "zh-Hans",
    "zh-SG": "zh-Hans",
    "zh-TW": "zh-Hant",
    "zh-HK": "zh-Hant",
    "pt-BR": "pt-BR",
    "nb-NO": "nb",
    "nn-NO": "nb",
  };
  if (mapping[normalized]) return mapping[normalized];

  // Language-only fallback (e.g. "fr-FR" → "fr")
  const lang = normalized.split("-")[0];
  if (SUPPORTED_LOCALES.includes(lang as SupportedLocale)) {
    return lang as SupportedLocale;
  }

  return "en";
}

/**
 * Translate a key with optional interpolation.
 * Variables use {name} syntax: t("hello", { name: "World" }) → "Hello World"
 */
export function translate(
  locale: SupportedLocale,
  key: string,
  vars?: Record<string, string | number>,
): string {
  const strings = localeRegistry[locale] ?? localeRegistry.en!;
  let text = strings[key] ?? localeRegistry.en![key] ?? key;

  if (vars) {
    for (const [k, v] of Object.entries(vars)) {
      text = text.replace(new RegExp(`\\{${k}\\}`, "g"), String(v));
    }
  }

  return text;
}

/** React context for current locale */
const I18nContext = createContext<SupportedLocale>("en");

/** Provider component — wrap your app/panel root */
export const I18nProvider: React.FC<{
  locale: SupportedLocale;
  children: React.ReactNode;
}> = ({ locale, children }) =>
  React.createElement(I18nContext.Provider, { value: locale }, children);

/** Hook that returns the t() function bound to the current locale */
export function useTranslation() {
  const locale = useContext(I18nContext);
  const t = useMemo(
    () =>
      (key: string, vars?: Record<string, string | number>): string =>
        translate(locale, key, vars),
    [locale],
  );
  return { t, locale };
}
