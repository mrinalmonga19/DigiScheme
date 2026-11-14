import { ArrowLeft, ArrowRight, BookOpen, CheckCircle2, Download, FileX, Repeat2, Save } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import type { GuideStepView } from '@digischeme/shared';
import { Layout } from '../components/Layout';
import { api } from '../lib/api';
import { useApp } from '../state/app';

export default function Application() {
  const { id = '' } = useParams();
  const { t } = useApp();
  const nav = useNavigate();
  const [v, setV] = useState<GuideStepView | null>(null);
  const [error, setError] = useState(false);
  const [saved, setSaved] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => { api.application(id).then((r) => setV(r.view)).catch(() => setError(true)); }, [id]);
  const act = useCallback(async (a: string) => { try { setV((await api.step(id, a)).view); } catch { setError(true); } }, [id]);
  const track = async () => { if (v) { await api.addTracker(v.schemeSlug, 7); setSaved(true); } };
  const copy = async () => { if (v?.prefill) { try { await navigator.clipboard.writeText(v.prefill.value); setCopied(true); setTimeout(() => setCopied(false), 1500); } catch { /* clipboard blocked */ } } };

  return (
    <Layout>
      {error && <p role="alert" className="rounded-xl bg-red-50 p-3 text-red-800">{t.bot.errorFallback}</p>}
      {v && (
        <div className="flex flex-col gap-3" data-testid="guide">
          <h1 className="text-xl font-extrabold text-brand">{v.schemeName}</h1>
          <p className="text-sm text-slate-600">{t.bot.guideStart.replace('{scheme}', v.schemeName)}</p>
          {!v.done ? (
            <>
              <div className="h-3 overflow-hidden rounded-full bg-slate-200" role="progressbar" aria-valuemin={1} aria-valuemax={v.totalSteps} aria-valuenow={v.stepNumber}>
                <div className="h-full bg-saffron" style={{ width: `${(v.stepNumber / v.totalSteps) * 100}%` }} />
              </div>
              <article className="card" aria-live="polite">
                <p className="text-sm font-bold uppercase text-saffron-600">{t.bot.guideStep.replace('{n}', String(v.stepNumber)).replace('{total}', String(v.totalSteps)).replace('{title}', '')}</p>
                <h2 className="text-xl font-bold text-brand">{v.title}</h2>
                <p className="mt-2 rounded-lg bg-brand-50 p-2 text-base"><BookOpen className="mr-1 inline h-4 w-4" aria-hidden />{t.bot.guideOnForm.replace('{field}', v.officialFieldName)}</p>
                <p className="mt-3 text-lg">{v.instruction}</p>
                {v.prefill && (
                  <div className="mt-3 flex items-center justify-between gap-2 rounded-xl border border-verified/40 bg-verified-bg p-3">
                    <span className="text-lg font-bold">{t.bot.guidePrefill.replace('{value}', v.prefill.value)}</span>
                    <button type="button" className="btn-ghost" onClick={() => void copy()}>{copied ? t.ui.copied : t.ui.copy}</button>
                  </div>
                )}
                {v.documentNeeded && (
                  <p className="mt-3 flex items-center gap-2 text-base">{v.documentNeeded.available ? <CheckCircle2 className="h-5 w-5 text-verified" aria-hidden /> : <FileX className="h-5 w-5 text-estimated" aria-hidden />}
                    <strong>{v.documentNeeded.name}</strong>{v.documentNeeded.available && <span className="text-verified">({t.ui.alreadyHave})</span>}</p>
                )}
                {v.note && <p className="mt-2 rounded-lg bg-estimated-bg p-2 text-base">{v.note}</p>}
                {v.commonMistakes.length > 0 && <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-slate-700">{v.commonMistakes.map((m) => <li key={m}>⚠ {m}</li>)}</ul>}
              </article>
              <div className="grid grid-cols-2 gap-2">
                <button type="button" className="btn-ghost" onClick={() => void act('back')} disabled={v.stepNumber <= 1}><ArrowLeft className="h-5 w-5" aria-hidden />{t.bot.btnBack}</button>
                <button type="button" className="btn-primary" onClick={() => void act('next')} data-testid="next">{t.bot.btnNext}<ArrowRight className="h-5 w-5" aria-hidden /></button>
                <button type="button" className="btn-ghost" onClick={() => void act('repeat')}><Repeat2 className="h-5 w-5" aria-hidden />{t.bot.btnRepeat}</button>
                <button type="button" className="btn-ghost" onClick={() => void act('explain')}>{t.bot.btnExplain}</button>
                {v.documentNeeded && !v.documentNeeded.available && <button type="button" className="btn-ghost col-span-2" onClick={() => void act('no_document')}>{t.bot.btnNoDoc}</button>}
              </div>
            </>
          ) : (
            <article className="card" data-testid="guide-done">
              <p className="text-lg">{t.bot.guideDone}</p>
              <div className="mt-3 flex flex-col gap-2">
                <a className="btn-accent" href={`/api/applications/${v.applicationId}/kit.pdf`} download data-testid="kit"><Download className="h-5 w-5" aria-hidden />{t.ui.downloadKit}</a>
                {v.officialLink && <a className="btn-ghost" href={v.officialLink.url} target="_blank" rel="noreferrer noopener">{v.officialLink.label}</a>}
                <button type="button" className="btn-ghost" onClick={() => void track()} disabled={saved}><Save className="h-5 w-5" aria-hidden />{saved ? t.bot.trackerSaved : t.ui.saveTracker}</button>
                <button type="button" className="btn-ghost" onClick={() => nav('/dashboard')}>{t.ui.navDashboard}</button>
              </div>
            </article>
          )}
        </div>
      )}
    </Layout>
  );
}
