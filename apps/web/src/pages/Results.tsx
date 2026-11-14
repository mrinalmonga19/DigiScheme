import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Layout } from '../components/Layout';
import { ProgressRing } from '../components/ProgressRing';
import { SchemeCard } from '../components/SchemeCard';
import { api, ApiError, type EligibilityResponse } from '../lib/api';
import { readJson, writeJson } from '../lib/storage';
import { useApp } from '../state/app';

export default function Results() {
  const { t, language } = useApp();
  const nav = useNavigate();
  const [data, setData] = useState<EligibilityResponse | null>(null);
  const [offline, setOffline] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      try { const r = await api.eligibility(); setData(r); writeJson(`ds.results.${language}`, r); setOffline(false); }
      catch (e) {
        const cached = readJson<EligibilityResponse>(`ds.results.${language}`);
        if (cached) { setData(cached); setOffline(true); } else setError(e instanceof ApiError && e.code === 'OFFLINE' ? t.ui.offline : t.bot.errorFallback);
      }
    })();
  }, [language, t]);

  const apply = async (slug: string) => {
    try { const r = await api.startApplication(slug); nav(`/apply/${r.view.applicationId}`); } catch { setError(t.bot.errorFallback); }
  };

  return (
    <Layout>
      <h1 className="mb-3 text-2xl font-extrabold text-brand">{t.ui.resultsTitle}</h1>
      {offline && <p role="status" className="mb-3 rounded-xl bg-saffron-50 p-3 text-saffron-600">{t.ui.offline}</p>}
      {error && <p role="alert" className="rounded-xl bg-red-50 p-3 text-red-800">{error}</p>}
      {data && (
        <>
          <div className="card mb-3"><ProgressRing value={data.profileCompleteness} label={t.ui.profileComplete} /></div>
          {data.cards.length === 0 ? (
            <div className="card"><p>{t.ui.noSchemesYet}</p><button type="button" className="btn-accent mt-3" onClick={() => nav('/chat')}>{t.ui.openChat}</button></div>
          ) : (
            <div className="flex flex-col gap-3" data-testid="results">{data.cards.map((c) => <SchemeCard key={c.slug} card={c} onApply={(s) => void apply(s)} />)}</div>
          )}
          {data.notEligible.length > 0 && (
            <details className="card mt-4">
              <summary className="tap cursor-pointer py-2 font-semibold text-brand">{t.ui.whyNot} ({data.notEligible.length})</summary>
              <ul className="mt-2 space-y-2">{data.notEligible.map((n) => <li key={n.slug}><strong>{n.name}</strong>: {n.reason}</li>)}</ul>
            </details>
          )}
          {data.nextQuestion && <button type="button" className="btn-primary mt-4 w-full" onClick={() => nav('/chat')}>{data.nextQuestion}</button>}
        </>
      )}
    </Layout>
  );
}
