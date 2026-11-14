import { Download, Send, Volume2 } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { ChatUiHints, StructuredInput, SuggestedReply } from '@digischeme/shared';
import { api, ApiError, type ChatReply } from '../lib/api';
import { useApp } from '../state/app';
import { playUrl, speakInBrowser } from '../voice/speech';
import { MicButton } from './MicButton';
import { ProgressRing } from './ProgressRing';
import { SchemeCard } from './SchemeCard';
import { LinkVerdict } from './LinkVerdict';

interface Msg { id: number; role: 'user' | 'assistant'; text: string; ui?: ChatUiHints; audioUrl?: string | null; fallbackSpeak?: boolean }

export function Chat() {
  const { t, language, lowBandwidth, bcp47, refresh } = useApp();
  const nav = useNavigate();
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [chips, setChips] = useState<SuggestedReply[]>([]);
  const [completeness, setCompleteness] = useState(0);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const id = useRef(0);
  const endRef = useRef<HTMLDivElement>(null);
  const live = useRef<HTMLDivElement>(null);

  const push = useCallback((m: Omit<Msg, 'id'>) => setMsgs((x) => [...x, { ...m, id: ++id.current }]), []);

  useEffect(() => {
    void (async () => {
      try {
        const h = await api.history();
        if (h.messages.length > 0) {
          setMsgs(h.messages.map((m) => ({ id: ++id.current, role: m.role, text: m.text })));
          setChips(h.suggestedReplies as SuggestedReply[]);
          setCompleteness(h.profileCompleteness);
        } else {
          const w = await api.welcome(language);
          push({ role: 'assistant', text: `${w.text}\n\n${t.questions.state ?? ''}`.trim() });
        }
      } catch (e) { if (!(e instanceof ApiError && e.code === 'OFFLINE')) setError(t.bot.errorFallback); }
    })();
  }, []);
  useEffect(() => { endRef.current?.scrollIntoView({ block: 'end' }); }, [msgs.length]);

  const handleReply = useCallback((r: ChatReply, userLabel?: string) => {
    if (userLabel) push({ role: 'user', text: userLabel });
    push({ role: 'assistant', text: r.replyText, ui: r.ui, audioUrl: r.audioUrl, fallbackSpeak: r.ttsFallback === 'browser' });
    setChips(r.suggestedReplies);
    setCompleteness(r.ui.profileCompleteness);
    if (live.current) live.current.textContent = r.replyText.slice(0, 200);
    void refresh();
    if (r.audioUrl) void playUrl(r.audioUrl).catch(() => speakInBrowser(r.replyText, bcp47));
  }, [bcp47, push, refresh]);

  const run = useCallback(async (fn: () => Promise<ChatReply>, label?: string) => {
    setBusy(true); setError(null);
    try { handleReply(await fn(), label); }
    catch (e) { setError(e instanceof ApiError && e.code === 'OFFLINE' ? t.ui.offline : t.bot.errorFallback); }
    finally { setBusy(false); }
  }, [handleReply, t]);

  const send = (value: string) => {
    const v = value.trim(); if (!v || busy) return;
    setText(''); push({ role: 'user', text: v });
    void run(() => api.chat({ text: v }));
  };
  const tap = (s: SuggestedReply) => { if (!busy) void run(() => api.chat({ structured: s.structured as StructuredInput }), s.label); };

  const listen = async (m: Msg) => {
    if (m.audioUrl) { try { await playUrl(m.audioUrl); return; } catch { /* fall through */ } }
    try {
      const s = await api.speak(m.text, language);
      if (s.audioUrl) { await playUrl(s.audioUrl); return; }
    } catch { /* browser voice below */ }
    if (!speakInBrowser(m.text, bcp47)) setError(t.bot.voiceUnavailable);
  };

  const startVerify = async () => {
    const r = await api.startDigilocker();
    nav(new URL(r.consentUrl).pathname + new URL(r.consentUrl).search);
  };

  return (
    <section aria-label={t.ui.navChat} className="flex flex-col gap-3">
      <div className="card flex items-center justify-between"><ProgressRing value={completeness} label={t.ui.profileComplete} /></div>
      <div className="flex flex-col gap-3" role="log" aria-live="off" data-testid="chat-log">
        {msgs.map((m) => (
          <div key={m.id} className={`flex flex-col gap-2 ${m.role === 'user' ? 'items-end' : 'items-start'}`}>
            <div className={`max-w-[92%] whitespace-pre-line rounded-2xl px-4 py-3 text-lg leading-relaxed ${m.role === 'user' ? 'bg-brand text-white' : 'border border-slate-200 bg-white'}`} data-testid={`msg-${m.role}`}>
              {m.text}
              {m.role === 'assistant' && (
                <button type="button" className="mt-2 flex items-center gap-1 text-sm font-semibold text-brand underline" onClick={() => void listen(m)}>
                  <Volume2 className="h-4 w-4" aria-hidden /> {t.ui.listen}
                </button>
              )}
            </div>
            {m.ui?.linkCheck && <LinkVerdict result={m.ui.linkCheck} />}
            {m.ui?.results && !lowBandwidth && m.ui.results.slice(0, 3).map((c) => <SchemeCard key={c.slug} card={c} onApply={(slug) => void run(() => api.chat({ structured: { type: 'action', action: 'apply', slug } }), t.bot.btnApply)} />)}
            {m.ui?.consentUrl && <button type="button" className="btn-accent" onClick={() => void startVerify()}>{t.bot.btnVerify}</button>}
            {m.ui?.guide?.done && (
              <a className="btn-accent" href={`/api/applications/${m.ui.guide.applicationId}/kit.pdf`} download><Download className="h-5 w-5" aria-hidden /> {t.ui.downloadKit}</a>
            )}
          </div>
        ))}
        {busy && <p className="text-slate-500" role="status">…</p>}
        <div ref={endRef} />
      </div>
      {error && <p role="alert" className="rounded-xl bg-red-50 p-3 text-red-800">{error}</p>}
      <div ref={live} className="sr-only-live" aria-live="polite" />
      <div className="sticky bottom-20 flex flex-col gap-2 bg-slate-50/95 pb-2 pt-1">
        {chips.length > 0 && (
          <div className="flex flex-wrap gap-2" data-testid="chips">
            {chips.map((c, i) => <button key={`${c.label}-${i}`} type="button" className="chip" onClick={() => tap(c)} disabled={busy}>{c.label}</button>)}
          </div>
        )}
        <form className="flex items-end gap-2" onSubmit={(e) => { e.preventDefault(); send(text); }}>
          <MicButton
            disabled={busy}
            onError={setError}
            onResult={async (r) => {
              if (r.kind === 'text') { send(r.text); return; }
              await run(() => api.voiceChat(r.blob, language));
            }}
          />
          <input className="field flex-1 text-lg" value={text} onChange={(e) => setText(e.target.value)} placeholder={t.ui.typeMessage} aria-label={t.ui.typeMessage} data-testid="chat-input" lang={language} autoComplete="off" />
          <button type="submit" className="btn-primary h-14" disabled={busy || !text.trim()} aria-label={t.ui.send} data-testid="send"><Send className="h-5 w-5" aria-hidden /></button>
        </form>
      </div>
    </section>
  );
}
