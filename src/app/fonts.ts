import { Noto_Sans_JP, Noto_Sans_KR, Noto_Sans_SC, Noto_Sans_Symbols_2, Noto_Sans_TC } from "next/font/google";

/**
 * Fallback fonts for player / alliance names the device can't draw (Korean, Japanese,
 * Chinese, symbols like ★ ✿). Self-hosted by Next.js and split by character range, so a
 * browser only downloads a piece when a name actually uses those characters. They come
 * after the system fonts (see body in globals.css): Latin text keeps the system font.
 *
 * Next.js reads these options at build time: they must be literal values (no spread).
 */
const korean = Noto_Sans_KR({
  display: "swap",
  preload: false,
  adjustFontFallback: false,
  variable: "--font-fallback-kr",
});
const japanese = Noto_Sans_JP({
  display: "swap",
  preload: false,
  adjustFontFallback: false,
  variable: "--font-fallback-jp",
});
const simplifiedChinese = Noto_Sans_SC({
  display: "swap",
  preload: false,
  adjustFontFallback: false,
  variable: "--font-fallback-sc",
});
const traditionalChinese = Noto_Sans_TC({
  display: "swap",
  preload: false,
  adjustFontFallback: false,
  variable: "--font-fallback-tc",
});
const symbols = Noto_Sans_Symbols_2({
  weight: "400",
  display: "swap",
  preload: false,
  adjustFontFallback: false,
  variable: "--font-fallback-symbols",
});

/** On <html>: declares the --font-fallback-* variables */
export const fallbackFontVariables = [korean, japanese, simplifiedChinese, traditionalChinese, symbols]
  .map((font) => font.variable)
  .join(" ");
