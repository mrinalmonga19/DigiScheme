import { ExternalLink } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Layout } from '../components/Layout';
import { api, type SchemeDetail as Detail } from '../lib/api';
import { useApp } from '../state/app';

export default function SchemeDetail() {
  const { slug = '' } = useParams();
  const { t, language, session } = useApp();
  const nav = useNavigate();
  const [d, setD] = useState<Detail | null>(null);
  const [rules, setRules] = useState<{ ruleVersion: string; rules: string[]; sourceUrl: string } | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    setD(null); setError(false);
    api.scheme(slug, language).then(setD).catch(() => setError(true));
    api.rules(slug, language).then(setRules).catch(() => undefined);
  }, [slug, language]);

  const apply = async () => {
    const r = await api.startApplication(slug);
    nav(`/apply/${r.view.applicationId}`);
  };

  return (
    <Layout>
      {error && <p role="alert" className="rounded-xl bg-red-50 p-3 text-red-800">{t.bot.errorFallback}</p>}
      {d && (
        <article className="flex flex-col gap-3">
          <h1 className="text-2xl font-extrabold text-brand">{d.name}</h1>
          {d.name !== d.officialName && <p className="-mt-2 text-slate-500" lang="en">{d.officialName}</p>}
          <p className="text-lg">{d.benefit}</p>
          <p className="text-sm text-slate-600">{d.ministry} · {d.level === 'central' ? t.ui.central : t.ui.stateLevel}</p>
          {d.dataQuality === 'needs_review' && <p className="rounded-xl bg-estimated-bg p-3 font-medium text-estimated">{t.ui.underReview}</p>}
          {d.machineTranslated && <p className="text-sm text-slate-600">Machine-translated text. Check details on the official website.</p>}

          <section className="card"><h2 className="font-bold text-brand">{t.ui.documents}</h2>
            <ul className="mt-2 space-y-2">{d.documents.map((x) => <li key={x.code}><strong>{x.name}</strong><br /><span className="text-sm text-slate-600">{t.ui.howToGet}: {x.howToGet}</span></li>)}</ul>
          </section>
          {d.notChecked.length > 0 && <section className="card"><h2 className="font-bold text-brand">{t.bot.alsoRequired}</h2><ul className="ml-5 mt-2 list-disc">{d.notChecked.map((n) => <li key={n}>{n}</li>)}</ul></section>}
          {rules && (
            <details className="card"><summary className="tap cursor-pointer py-2 font-bold text-brand">{t.ui.whyQualify}</summary>
              <ul className="ml-5 list-disc space-y-1">{rules.rules.map((r) => <li key={r}>{r}</li>)}</ul>
              <p className="mt-2 text-xs text-slate-500">v{rules.ruleVersion} · {d.lastVerifiedOn}</p>
            </details>
          )}
          <div className="flex flex-wrap gap-2">
            {d.officialLinks.map((l) => <a key={l.url} className="btn-ghost" href={l.url} target="_blank" rel="noreferrer noopener">{l.label || t.ui.officialSite} <ExternalLink className="h-4 w-4" aria-hidden /></a>)}
            {d.hasGuide && session?.authenticated && <button type="button" className="btn-accent" onClick={() => void apply()}>{t.bot.btnApply}</button>}
          </div>
          <Link to="/schemes" className="mt-2 underline">{t.ui.allSchemes}</Link>
        </article>
      )}
    </Layout>
  );
}
