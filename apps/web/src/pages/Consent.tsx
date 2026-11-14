import { ShieldCheck } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { DemoBadge } from '../components/Badge';
import { Layout } from '../components/Layout';
import { api, ApiError, type ConsentView } from '../lib/api';
import { useApp } from '../state/app';

/** The consent screen the DigiLocker adapter redirects to. In demo mode it is our own, clearly labelled, simulation. */
export default function Consent() {
  const { id = '' } = useParams();
  const [sp] = useSearchParams();
  const state = sp.get('s') ?? '';
  const { t, language } = useApp();
  const nav = useNavigate();
  const [v, setV] = useState<ConsentView | null>(null);
  const [allow, setAllow] = useState<Record<string, boolean>>({});
  const [persona, setPersona] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.consent(id, state, language).then((c) => {
      setV(c); setAllow(Object.fromEntries(c.documents.map((d) => [d.code, true]))); setPersona(c.defaultPersonaId ?? null);
    }).catch((e) => setError(e instanceof ApiError ? e.message : t.bot.errorFallback));
  }, [id, state, language, t]);

  const decide = async (yes: boolean) => {
    if (!v) return;
    try {
      const r = await api.decide(id, state, yes ? Object.keys(allow).filter((k) => allow[k]) : [], persona);
      setDone(r.status);
      if (r.status === 'granted') {
        // Fire-and-forget: run eligibility with the newly verified data so results appear in chat
        try {
          await api.chat({
            structured: { type: 'action', action: 'results' },
            language,
            userLabel: '✅ DigiLocker connected',
          } as Parameters<typeof api.chat>[0]);
        } catch { /* non-fatal – user can still see results by tapping Results chip */ }
      }
      setTimeout(() => nav('/chat'), 1600);
    } catch (e) { setError(e instanceof ApiError ? e.message : t.bot.errorFallback); }
  };

  return (
    <Layout>
      <div className="mb-3 flex items-center gap-2"><ShieldCheck className="h-7 w-7 text-brand" aria-hidden /><h1 className="text-2xl font-extrabold text-brand">{t.ui.consentTitle}</h1></div>
      {error && <p role="alert" className="rounded-xl bg-red-50 p-3 text-red-800">{error}</p>}
      {done && <p role="status" className="rounded-xl bg-verified-bg p-4 text-lg font-bold text-verified" data-testid="consent-done">{done === 'granted' ? t.bot.statusVerified : t.ui.deny}</p>}
      {v && !done && (
        <div className="card flex flex-col gap-4">
          {v.demo && <div className="flex items-center gap-2" data-testid="consent-demo"><DemoBadge /><span className="font-semibold">{t.ui.simulatedDigilocker}</span></div>}
          <p className="text-base">{v.purpose}</p>
          <fieldset><legend className="mb-2 font-bold">{t.ui.documents}</legend>
            {v.documents.map((d) => (
              <label key={d.code} className="flex items-start gap-3 py-2 text-lg">
                <input type="checkbox" className="mt-1 h-6 w-6 accent-brand" checked={Boolean(allow[d.code])} onChange={(e) => setAllow({ ...allow, [d.code]: e.target.checked })} />
                <span>{d.name}<br /><span className="text-sm text-slate-600">{d.usedFor.join(', ')}</span></span>
              </label>
            ))}
          </fieldset>
          {v.demo && v.personas && (
            <label className="block text-base"><span className="font-semibold">Demo identity</span>
              <select className="field mt-1" value={persona ?? ''} onChange={(e) => setPersona(e.target.value || null)}>
                {v.personas.map((p) => <option key={p.id} value={p.id}>{p.name} ({p.language})</option>)}
              </select>
            </label>
          )}
          <p className="text-sm text-slate-600">{v.retentionDays} days · {t.ui.revoke}: {t.ui.navSettings}</p>
          <div className="grid grid-cols-2 gap-2">
            <button type="button" className="btn-ghost" onClick={() => void decide(false)} data-testid="deny">{t.ui.deny}</button>
            <button type="button" className="btn-accent" onClick={() => void decide(true)} data-testid="allow">{t.ui.allow}</button>
          </div>
        </div>
      )}
    </Layout>
  );
}
