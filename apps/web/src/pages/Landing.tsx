import { ArrowRight, MessageCircle, SearchCheck, UserRoundCheck } from 'lucide-react';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Layout } from '../components/Layout';
import { useApp } from '../state/app';

export default function Landing() {
  const { t, session, start, language, languages, setLanguage } = useApp();
  const nav = useNavigate();
  const [agreed, setAgreed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const authed = Boolean(session?.authenticated && session.user?.consent.dataProcessing.granted);

  const go = async () => {
    setBusy(true); setError(null);
    try { if (!authed) await start(true); nav('/chat'); }
    catch { setError(t.bot.errorFallback); }
    finally { setBusy(false); }
  };

  const features = [
    { icon: MessageCircle, text: t.ui.feat1 }, { icon: SearchCheck, text: t.ui.feat2 }, { icon: UserRoundCheck, text: t.ui.feat3 },
  ];
  return (
    <Layout>
      <section className="rounded-3xl bg-brand px-5 py-8 text-white">
        <h1 className="text-3xl font-extrabold leading-tight sm:text-4xl">DigiScheme</h1>
        <p className="mt-3 text-xl font-medium text-saffron-50" data-testid="tagline">{t.ui.tagline}</p>
        <ul className="mt-5 space-y-3">
          {features.map(({ icon: Icon, text }) => (
            <li key={text} className="flex items-center gap-3 text-lg"><Icon className="h-6 w-6 shrink-0 text-saffron decor" aria-hidden /> {text}</li>
          ))}
        </ul>
      </section>

      <section className="card mt-4" aria-labelledby="langs">
        <h2 id="langs" className="mb-3 text-lg font-bold text-brand">{t.ui.language}</h2>
        <div className="grid grid-cols-3 gap-2" role="radiogroup" aria-label={t.ui.language}>
          {languages.map((l) => (
            <button key={l.code} type="button" role="radio" aria-checked={l.code === language} lang={l.code} onClick={() => void setLanguage(l.code)}
              className={`tap rounded-xl border px-2 py-3 text-lg font-semibold ${l.code === language ? 'border-brand bg-brand text-white' : 'border-slate-300 bg-white text-slate-900'}`}>
              {l.native}
            </button>
          ))}
        </div>
      </section>

      <section className="card mt-4" aria-labelledby="consent">
        <h2 id="consent" className="text-lg font-bold text-brand">{t.ui.consentTitle}</h2>
        <p className="mt-2 text-base">{t.ui.consentText}</p>
        {!authed && (
          <label className="mt-4 flex items-start gap-3 text-lg">
            <input type="checkbox" className="mt-1 h-6 w-6 accent-brand" checked={agreed} onChange={(e) => setAgreed(e.target.checked)} data-testid="agree" />
            <span>{t.ui.agree}</span>
          </label>
        )}
        {error && <p role="alert" className="mt-3 text-red-700">{error}</p>}
        <button type="button" className="btn-accent mt-4 w-full text-xl" disabled={busy || (!authed && !agreed)} onClick={() => void go()} data-testid="start">
          {authed ? t.ui.openChat : t.ui.start} <ArrowRight className="h-5 w-5" aria-hidden />
        </button>
      </section>
    </Layout>
  );
}
