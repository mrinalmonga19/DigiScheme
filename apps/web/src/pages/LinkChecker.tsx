import { useState } from 'react';
import { Layout } from '../components/Layout';
import { LinkVerdict } from '../components/LinkVerdict';
import { api } from '../lib/api';
import { useApp } from '../state/app';
import type { LinkCheckResult } from '@digischeme/shared';

export default function LinkChecker() {
  const { t, language } = useApp();
  const [text, setText] = useState('');
  const [result, setResult] = useState<LinkCheckResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);

  const check = async () => {
    if (!text.trim()) return;
    setBusy(true); setError(false);
    try { setResult((await api.checkLink(text, language)).result); } catch { setError(true); } finally { setBusy(false); }
  };
  return (
    <Layout>
      <h1 className="mb-3 text-2xl font-extrabold text-brand">{t.ui.navLinks}</h1>
      <label className="block">
        <span className="mb-1 block text-lg font-semibold">{t.ui.pasteLink}</span>
        <textarea className="field min-h-32 text-lg" value={text} onChange={(e) => setText(e.target.value)} lang={language} data-testid="link-input" />
      </label>
      <button type="button" className="btn-primary mt-3 w-full text-lg" onClick={() => void check()} disabled={busy || !text.trim()} data-testid="link-check">{t.ui.check}</button>
      {error && <p role="alert" className="mt-3 rounded-xl bg-red-50 p-3 text-red-800">{t.bot.errorFallback}</p>}
      {result && <div className="mt-4"><LinkVerdict result={result} /></div>}
    </Layout>
  );
}
