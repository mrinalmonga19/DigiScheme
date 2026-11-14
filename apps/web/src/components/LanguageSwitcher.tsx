import { Languages } from 'lucide-react';
import { useApp } from '../state/app';

/** Present on every screen (spec 13). Native names, so a person can find their own language without reading English. */
export function LanguageSwitcher() {
  const { language, languages, setLanguage, t } = useApp();
  return (
    <label className="inline-flex items-center gap-2">
      <Languages className="h-5 w-5 text-white decor" aria-hidden />
      <span className="sr-only">{t.ui.language}</span>
      <select
        aria-label={t.ui.language}
        value={language}
        onChange={(e) => void setLanguage(e.target.value)}
        className="tap rounded-lg border border-white/30 bg-brand-700 px-2 py-1 text-base font-medium text-white focus:outline-none focus-visible:ring-4 focus-visible:ring-saffron/60"
      >
        {languages.map((l) => (
          <option key={l.code} value={l.code} lang={l.code}>{l.native}</option>
        ))}
      </select>
    </label>
  );
}
