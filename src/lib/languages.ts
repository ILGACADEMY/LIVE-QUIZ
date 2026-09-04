export interface Language {
  code: string;
  label: string;
  nativeLabel: string;
}

// Chosen to match a typical UAE/GCC retail floor. Add more any time — the
// AI translation call works for any language name you pass it.
export const SUPPORTED_LANGUAGES: Language[] = [
  { code: "en", label: "English", nativeLabel: "English" },
  { code: "ar", label: "Arabic", nativeLabel: "العربية" },
  { code: "hi", label: "Hindi", nativeLabel: "हिन्दी" },
  { code: "ur", label: "Urdu", nativeLabel: "اردو" },
  { code: "tl", label: "Tagalog", nativeLabel: "Tagalog" },
  { code: "fr", label: "French", nativeLabel: "Français" },
  { code: "ru", label: "Russian", nativeLabel: "Русский" },
  { code: "zh", label: "Chinese", nativeLabel: "中文" },
  { code: "es", label: "Spanish", nativeLabel: "Español" }
];

const LANGUAGE_NAME_BY_CODE = new Map(SUPPORTED_LANGUAGES.map((l) => [l.code, l.label]));

export function languageName(code: string): string {
  return LANGUAGE_NAME_BY_CODE.get(code) ?? "English";
}

/** Best-effort match of the phone's own language to one of our supported codes. */
export function detectSupportedLanguage(navigatorLanguage: string): string {
  const short = navigatorLanguage.slice(0, 2).toLowerCase();
  return SUPPORTED_LANGUAGES.some((l) => l.code === short) ? short : "en";
}
