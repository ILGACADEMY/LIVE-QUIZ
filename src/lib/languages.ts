export interface Language {
  code: string;
  label: string;
  nativeLabel: string;
}

// Broad coverage of widely-spoken languages — the AI translation call
// works for any language name you pass it, so this list isn't limited by
// the technology, only by picking a sensible, well-supported set. All
// codes are plain 2-letter ISO 639-1 (not script/region variants like
// "zh-Hans") so detectSupportedLanguage's simple first-2-characters match
// against the phone's own language setting keeps working for every entry.
export const SUPPORTED_LANGUAGES: Language[] = [
  { code: "en", label: "English", nativeLabel: "English" },
  { code: "ar", label: "Arabic", nativeLabel: "العربية" },
  { code: "fr", label: "French", nativeLabel: "Français" },
  { code: "es", label: "Spanish", nativeLabel: "Español" },
  { code: "de", label: "German", nativeLabel: "Deutsch" },
  { code: "it", label: "Italian", nativeLabel: "Italiano" },
  { code: "pt", label: "Portuguese", nativeLabel: "Português" },
  { code: "ru", label: "Russian", nativeLabel: "Русский" },
  { code: "zh", label: "Chinese", nativeLabel: "中文" },
  { code: "ja", label: "Japanese", nativeLabel: "日本語" },
  { code: "ko", label: "Korean", nativeLabel: "한국어" },
  { code: "hi", label: "Hindi", nativeLabel: "हिन्दी" },
  { code: "ur", label: "Urdu", nativeLabel: "اردو" },
  { code: "bn", label: "Bengali", nativeLabel: "বাংলা" },
  { code: "fa", label: "Persian", nativeLabel: "فارسی" },
  { code: "tr", label: "Turkish", nativeLabel: "Türkçe" },
  { code: "he", label: "Hebrew", nativeLabel: "עברית" },
  { code: "nl", label: "Dutch", nativeLabel: "Nederlands" },
  { code: "sv", label: "Swedish", nativeLabel: "Svenska" },
  { code: "no", label: "Norwegian", nativeLabel: "Norsk" },
  { code: "da", label: "Danish", nativeLabel: "Dansk" },
  { code: "fi", label: "Finnish", nativeLabel: "Suomi" },
  { code: "pl", label: "Polish", nativeLabel: "Polski" },
  { code: "cs", label: "Czech", nativeLabel: "Čeština" },
  { code: "el", label: "Greek", nativeLabel: "Ελληνικά" },
  { code: "ro", label: "Romanian", nativeLabel: "Română" },
  { code: "hu", label: "Hungarian", nativeLabel: "Magyar" },
  { code: "uk", label: "Ukrainian", nativeLabel: "Українська" },
  { code: "vi", label: "Vietnamese", nativeLabel: "Tiếng Việt" },
  { code: "th", label: "Thai", nativeLabel: "ไทย" },
  { code: "id", label: "Indonesian", nativeLabel: "Bahasa Indonesia" },
  { code: "ms", label: "Malay", nativeLabel: "Bahasa Melayu" },
  { code: "tl", label: "Tagalog", nativeLabel: "Tagalog" },
  { code: "sw", label: "Swahili", nativeLabel: "Kiswahili" },
  { code: "am", label: "Amharic", nativeLabel: "አማርኛ" },
  { code: "ha", label: "Hausa", nativeLabel: "Hausa" },
  { code: "ta", label: "Tamil", nativeLabel: "தமிழ்" },
  { code: "te", label: "Telugu", nativeLabel: "తెలుగు" },
  { code: "ml", label: "Malayalam", nativeLabel: "മലയാളം" },
  { code: "mr", label: "Marathi", nativeLabel: "मराठी" },
  { code: "gu", label: "Gujarati", nativeLabel: "ગુજરાતી" },
  { code: "pa", label: "Punjabi", nativeLabel: "ਪੰਜਾਬੀ" },
  { code: "si", label: "Sinhala", nativeLabel: "සිංහල" },
  { code: "ne", label: "Nepali", nativeLabel: "नेपाली" },
  { code: "km", label: "Khmer", nativeLabel: "ខ្មែរ" },
  { code: "my", label: "Burmese", nativeLabel: "မြန်မာ" },
  { code: "az", label: "Azerbaijani", nativeLabel: "Azərbaycanca" },
  { code: "kk", label: "Kazakh", nativeLabel: "Қазақша" },
  { code: "uz", label: "Uzbek", nativeLabel: "Oʻzbekcha" },
  { code: "bg", label: "Bulgarian", nativeLabel: "Български" },
  { code: "sr", label: "Serbian", nativeLabel: "Српски" },
  { code: "hr", label: "Croatian", nativeLabel: "Hrvatski" },
  { code: "sk", label: "Slovak", nativeLabel: "Slovenčina" },
  { code: "sl", label: "Slovenian", nativeLabel: "Slovenščina" },
  { code: "lt", label: "Lithuanian", nativeLabel: "Lietuvių" },
  { code: "lv", label: "Latvian", nativeLabel: "Latviešu" },
  { code: "et", label: "Estonian", nativeLabel: "Eesti" },
  { code: "sq", label: "Albanian", nativeLabel: "Shqip" },
  { code: "ka", label: "Georgian", nativeLabel: "ქართული" },
  { code: "hy", label: "Armenian", nativeLabel: "Հայերեն" },
  { code: "mn", label: "Mongolian", nativeLabel: "Монгол" }
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
