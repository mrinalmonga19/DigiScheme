import { BadgeCheck, Bell, FileCheck2, Link2, Pencil, ShieldCheck } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Layout } from '../components/Layout';
import { ProgressRing } from '../components/ProgressRing';
import { api, type EligibilityResponse, type ProfileResponse, type TrackerItem } from '../lib/api';
import { useApp } from '../state/app';

const STATUSES = ['planned', 'documents_ready', 'submitted', 'approved', 'rejected'] as const;

export default function Dashboard() {
  const { t } = useApp();
  const nav = useNavigate();
  const [profile, setProfile] = useState<ProfileResponse | null>(null);
  const [trackers, setTrackers] = useState<TrackerItem[]>([]);
  const [elig, setElig] = useState<EligibilityResponse | null>(null);
  const [error, setError] = useState(false);

  const load = useCallback(async () => {
    try {
      const [p, tr, e] = await Promise.all([api.profile(), api.trackers(), api.eligibility()]);
      setProfile(p); setTrackers(tr.trackers); setElig(e);
    } catch { setError(true); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  const verifiedCount = elig?.cards.filter((c) => c.badge === 'verified').length ?? 0;
  const due = trackers.filter((x) => x.reminderAt && new Date(x.reminderAt) <= new Date() && ['planned', 'documents_ready'].includes(x.status));

  return (
    <Layout>
      <h1 className="mb-3 text-2xl font-extrabold text-brand">{t.ui.navDashboard}</h1>
      {error && <p role="alert" className="rounded-xl bg-red-50 p-3 text-red-800">{t.bot.errorFallback}</p>}
      {profile && elig && (
        <div className="flex flex-col gap-3">
          <section className="card flex flex-wrap items-center justify-between gap-3">
            <ProgressRing value={profile.completeness} label={t.ui.profileComplete} />
            <div className="text-lg"><strong className="text-2xl text-brand" data-testid="matched-count">{elig.eligibleCount}</strong> {t.ui.matched}
              {verifiedCount > 0 && <span className="ml-2 inline-flex items-center gap-1 text-verified"><BadgeCheck className="h-5 w-5" aria-hidden />{verifiedCount}</span>}</div>
          </section>

          {due.length > 0 && (
            <section className="card border-saffron bg-saffron-50" aria-label={t.ui.remindMe}>
              {due.map((d) => <p key={d.id} className="flex items-center gap-2 text-lg font-semibold"><Bell className="h-5 w-5 text-saffron-600" aria-hidden />{t.wa.reminder.replace('{scheme}', d.name)}</p>)}
            </section>
          )}

          <section className="card" aria-labelledby="quick">
            <h2 id="quick" className="mb-2 font-bold text-brand">{t.ui.quickActions}</h2>
            <div className="grid grid-cols-2 gap-2">
              <button type="button" className="btn-primary" onClick={() => nav('/chat')}>{t.ui.openChat}</button>
              <button type="button" className="btn-ghost" onClick={() => nav('/results')}>{t.ui.navResults}</button>
              <button type="button" className="btn-ghost" onClick={() => nav('/links')}><Link2 className="h-5 w-5" aria-hidden />{t.ui.navLinks}</button>
              <button type="button" className="btn-ghost" onClick={() => void api.startDigilocker().then((r) => nav(new URL(r.consentUrl).pathname + new URL(r.consentUrl).search))}><ShieldCheck className="h-5 w-5" aria-hidden />{t.bot.btnVerify}</button>
            </div>
          </section>

          <section className="card" aria-labelledby="trk">
            <h2 id="trk" className="mb-2 font-bold text-brand">{t.ui.trackers}</h2>
            {trackers.length === 0 ? <p className="text-slate-600">{t.ui.noSchemesYet}</p> : (
              <ul className="space-y-3">{trackers.map((x) => (
                <li key={x.id} className="rounded-xl border border-slate-200 p-3">
                  <Link to={`/schemes/${x.slug}`} className="font-bold text-brand underline">{x.name}</Link>
                  <label className="mt-2 flex flex-col text-sm font-semibold">
                    <span className="sr-only">{x.name}</span>
                    <select className="field" value={x.status} onChange={(e) => void api.setTracker(x.id, e.target.value).then(load)}>
                      {STATUSES.map((s) => <option key={s} value={s}>{t.ui[`st_${s}` as const]}</option>)}
                    </select>
                  </label>
                </li>))}</ul>
            )}
          </section>

          <section className="card" aria-labelledby="det">
            <h2 id="det" className="mb-2 flex items-center gap-2 font-bold text-brand"><Pencil className="h-4 w-4" aria-hidden />{t.ui.myDetails}</h2>
            {profile.fields.length === 0 ? <p className="text-slate-600">{t.ui.noSchemesYet}</p> : (
              <ul className="divide-y divide-slate-100">{profile.fields.map((f) => (
                <li key={f.key} className="flex items-center justify-between gap-2 py-2">
                  <span><span className="text-slate-600">{f.label}</span>{!f.sensitive && <strong className="ml-2">{String(f.value)}</strong>}</span>
                  <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-bold ${f.verified ? 'bg-verified-bg text-verified' : 'bg-estimated-bg text-estimated'}`}>
                    {f.verified ? <BadgeCheck className="h-3 w-3" aria-hidden /> : null}{f.verified ? t.bot.statusVerified : t.bot.statusEstimated}
                  </span>
                </li>))}</ul>
            )}
          </section>

          {profile.documents.length > 0 && (
            <section className="card" aria-labelledby="docs">
              <h2 id="docs" className="mb-2 font-bold text-brand">{t.ui.documents}</h2>
              <ul className="space-y-2">{profile.documents.map((d) => <li key={d.code} className="flex items-center gap-2"><FileCheck2 className="h-5 w-5 text-verified" aria-hidden />{d.name}<span className="text-xs text-slate-500">· {d.issuer}</span></li>)}</ul>
            </section>
          )}
        </div>
      )}
    </Layout>
  );
}
