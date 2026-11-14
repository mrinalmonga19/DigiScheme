/** Fonts load per language, so a Tamil user never downloads Gurmukhi (matters on slow data). */
const loaders: Record<string, () => Promise<unknown>> = {
  en: () => Promise.all([import('@fontsource/noto-sans/400.css'), import('@fontsource/noto-sans/700.css')]),
  hi: () => Promise.all([import('@fontsource/noto-sans-devanagari/400.css'), import('@fontsource/noto-sans-devanagari/700.css')]),
  mr: () => loaders.hi!(),
  pa: () => Promise.all([import('@fontsource/noto-sans-gurmukhi/400.css'), import('@fontsource/noto-sans-gurmukhi/700.css')]),
  ta: () => Promise.all([import('@fontsource/noto-sans-tamil/400.css'), import('@fontsource/noto-sans-tamil/700.css')]),
  kn: () => Promise.all([import('@fontsource/noto-sans-kannada/400.css'), import('@fontsource/noto-sans-kannada/700.css')]),
  bn: () => Promise.all([import('@fontsource/noto-sans-bengali/400.css'), import('@fontsource/noto-sans-bengali/700.css')]),
  te: () => Promise.all([import('@fontsource/noto-sans-telugu/400.css'), import('@fontsource/noto-sans-telugu/700.css')]),
  gu: () => Promise.all([import('@fontsource/noto-sans-gujarati/400.css'), import('@fontsource/noto-sans-gujarati/700.css')]),
};
const loaded = new Set<string>();
export async function loadFonts(lang: string): Promise<void> {
  for (const l of ['en', lang]) {
    if (loaded.has(l)) continue;
    loaded.add(l);
    try { await loaders[l]?.(); } catch { /* system fonts are an acceptable fallback */ }
  }
}
