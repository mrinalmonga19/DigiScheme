import { Trash2 } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Layout } from '../components/Layout';
import { api } from '../lib/api';
import { removeKey } from '../lib/storage';
import { useApp } from '../state/app';

export default function Settings() {
  const { t, language, languages, setLanguage, lowBandwidth, setLowBandwidth, session, resetLocal, refresh } = useApp();
  const nav = useNavigate();
  const [consents, setConsents] = useState<Awaited<ReturnType<typeof api.consents>> | null>(null);
  const [confirm, setConfirm] = useState(false);
  const [ekyc, setEkyc] = useState('');
  const [msg, setMsg] = useState<string | null>(null);

  const load = useCallback(() => { api.consents().then(setConsents).catch(() => setConsents(null)); }, []);
  useEffect(load, [load]);

  const wipe = async () => {
    await api.deleteMe();
    ['ds.lang', 'ds.low', `ds.results.${language}`].forEach(removeKey);
    resetLocal(); nav('/');
  };
  const verify = async () => {
    try { const r = await api.ekyc(ekyc || undefined, true); setMsg(`${t.bot.statusVerified}: ${r.verifiedFields.join(', ')}`); void refresh(); }
    catch { setMsg(t.bot.errorFallback); }
  };

  return (
    <Layout>
      <h1 className="mb-3 text-2xl font-extrabold text-brand">{t.ui.navSettings}</h1>
      <div className="flex flex-col gap-3">
        <section className="card"><h2 className="mb-2 font-bold text-brand">{t.ui.language}</h2>
          <select className="field" value={language} onChange={(e) => void setLanguage(e.target.value)} aria-label={t.ui.language}>{languages.map((l) => <option key={l.code} value={l.code}>{l.native} ({l.english})</option>)}</select>
        </section>
        <section className="card"><label className="flex items-center gap-3 text-lg"><input type="checkbox" className="h-6 w-6 accent-brand" checked={lowBandwidth} onChange={(e) => void setLowBandwidth(e.target.checked)} data-testid="low-bandwidth" />{t.ui.lowBandwidth}</label></section>

        <section className="card"><h2 className="mb-2 font-bold text-brand">{t.ui.consent}</h2>
          <p className="mb-2 text-base">{t.ui.consentText}</p>
          {session?.user && <ul className="mb-3 text-sm text-slate-700"><li>Data processing: {session.user.consent.dataProcessing.granted ? '✔' : '✘'}</li><li>DigiLocker: {session.user.consent.digilocker.granted ? '✔' : '✘'}</li></ul>}
          {consents?.consents.filter((c) => c.status === 'granted').map((c) => (
            <div key={c.consentId} className="mb-2 flex items-center justify-between gap-2 rounded-xl border border-slate-200 p-3">
              <span>{c.provider === 'digilocker' ? 'DigiLocker' : 'Aadhaar eKYC'}: {c.grantedDocTypes.length} {t.ui.documents}{c.demo ? ' (demo)' : ''}</span>
              <button type="button" className="btn-ghost" onClick={() => void api.revoke(c.consentId).then(load)}>{t.ui.revoke}</button>
            </div>
          ))}
          <div className="mt-2 flex gap-2"><input className="field" value={ekyc} onChange={(e) => setEkyc(e.target.value)} placeholder="Demo code" aria-label={t.ui.verifyIdentity} />
            <button type="button" className="btn-ghost shrink-0" onClick={() => void verify()}>{t.ui.verifyIdentity}</button></div>
          {msg && <p role="status" className="mt-2 text-base">{msg}</p>}
        </section>

        <section className="card border-red-200"><h2 className="mb-2 font-bold text-red-800">{t.ui.deleteData}</h2>
          {!confirm ? <button type="button" className="btn-danger" onClick={() => setConfirm(true)} data-testid="delete"><Trash2 className="h-5 w-5" aria-hidden />{t.ui.deleteData}</button> : (
            <div><p className="mb-3 text-base">{t.ui.deleteConfirm}</p>
              <div className="grid grid-cols-2 gap-2"><button type="button" className="btn-ghost" onClick={() => setConfirm(false)}>{t.ui.cancel}</button>
                <button type="button" className="btn-danger" onClick={() => void wipe()} data-testid="delete-confirm">{t.ui.deleteData}</button></div></div>
          )}
        </section>
        <p className="text-sm text-slate-600">{t.ui.grievance}: grievance@digischeme.example</p>
      </div>
    </Layout>
  );
}
