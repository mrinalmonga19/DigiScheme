import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { pack, type DemoModeFlags, type LanguagePack } from '@digischeme/shared';
import { api, ApiError, type LanguageOption, type SessionInfo } from '../lib/api';
import { loadFonts } from '../lib/fonts';
import { readJson, writeJson } from '../lib/storage';

const FALLBACK_LANGS: LanguageOption[] = [
  { code: 'en', english: 'English', native: 'English', bcp47: 'en-IN' }, { code: 'hi', english: 'Hindi', native: 'हिन्दी', bcp47: 'hi-IN' },
  { code: 'pa', english: 'Punjabi', native: 'ਪੰਜਾਬੀ', bcp47: 'pa-IN' }, { code: 'ta', english: 'Tamil', native: 'தமிழ்', bcp47: 'ta-IN' },
  { code: 'kn', english: 'Kannada', native: 'ಕನ್ನಡ', bcp47: 'kn-IN' }, { code: 'bn', english: 'Bengali', native: 'বাংলা', bcp47: 'bn-IN' },
  { code: 'mr', english: 'Marathi', native: 'मराठी', bcp47: 'mr-IN' }, { code: 'te', english: 'Telugu', native: 'తెలుగు', bcp47: 'te-IN' },
  { code: 'gu', english: 'Gujarati', native: 'ગુજરાતી', bcp47: 'gu-IN' },
];

interface AppState {
  session: SessionInfo | null;
  ready: boolean;
  language: string;
  languages: LanguageOption[];
  t: LanguagePack;
  demoMode: DemoModeFlags;
  lowBandwidth: boolean;
  online: boolean;
  setLanguage: (code: string) => Promise<void>;
  setLowBandwidth: (on: boolean) => Promise<void>;
  start: (consent: boolean) => Promise<void>;
  refresh: () => Promise<SessionInfo | null>;
  resetLocal: () => void;
  bcp47: string;
}

const Ctx = createContext<AppState | null>(null);
const NO_DEMO: DemoModeFlags = { llm: false, digilocker: false, aadhaar: false, language: false, any: false };

export function AppProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<SessionInfo | null>(null);
  const [ready, setReady] = useState(false);
  const [language, setLang] = useState<string>(() => readJson<string>('ds.lang') ?? 'en');
  const [languages, setLanguages] = useState<LanguageOption[]>(FALLBACK_LANGS);
  const [lowBandwidth, setLow] = useState<boolean>(() => readJson<boolean>('ds.low') ?? false);
  const [online, setOnline] = useState(typeof navigator === 'undefined' ? true : navigator.onLine);

  useEffect(() => {
    const on = () => setOnline(true), off = () => setOnline(false);
    window.addEventListener('online', on); window.addEventListener('offline', off);
    return () => { window.removeEventListener('online', on); window.removeEventListener('offline', off); };
  }, []);

  const apply = useCallback((s: SessionInfo) => {
    setSession(s);
    if (s.user) {
      setLang(s.user.language); writeJson('ds.lang', s.user.language);
      setLow(s.user.lowBandwidth); writeJson('ds.low', s.user.lowBandwidth);
    }
  }, []);

  const refresh = useCallback(async () => {
    try { const s = await api.session(); apply(s); return s; } catch { return null; }
  }, [apply]);

  useEffect(() => {
    void (async () => {
      api.languages().then((r) => setLanguages(r.languages)).catch(() => undefined);
      await refresh();
      setReady(true);
    })();
  }, [refresh]);

  useEffect(() => {
    void loadFonts(language);
    document.documentElement.lang = language;
  }, [language]);
  useEffect(() => { document.documentElement.dataset.lowBandwidth = String(lowBandwidth); }, [lowBandwidth]);

  const setLanguage = useCallback(async (code: string) => {
    setLang(code); writeJson('ds.lang', code); // instant: the UI never waits on the network to change language
    if (session?.authenticated) {
      try { apply(await api.settings({ language: code })); } catch (e) { if (!(e instanceof ApiError && e.code === 'OFFLINE')) throw e; }
    }
  }, [apply, session?.authenticated]);

  const setLowBandwidth = useCallback(async (on: boolean) => {
    setLow(on); writeJson('ds.low', on);
    if (session?.authenticated) { try { apply(await api.settings({ lowBandwidth: on })); } catch { /* local choice still applies */ } }
  }, [apply, session?.authenticated]);

  const start = useCallback(async (consent: boolean) => {
    apply(await api.startSession({ language, consent, lowBandwidth }));
  }, [apply, language, lowBandwidth]);

  const resetLocal = useCallback(() => { setSession({ authenticated: false, demoMode: session?.demoMode ?? NO_DEMO }); }, [session?.demoMode]);

  const value = useMemo<AppState>(() => ({
    session, ready, language, languages, t: pack(language), demoMode: session?.demoMode ?? NO_DEMO, lowBandwidth, online,
    setLanguage, setLowBandwidth, start, refresh, resetLocal, bcp47: languages.find((l) => l.code === language)?.bcp47 ?? 'en-IN',
  }), [session, ready, language, languages, lowBandwidth, online, setLanguage, setLowBandwidth, start, refresh, resetLocal]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useApp(): AppState {
  const v = useContext(Ctx);
  if (!v) throw new Error('useApp outside AppProvider');
  return v;
}
