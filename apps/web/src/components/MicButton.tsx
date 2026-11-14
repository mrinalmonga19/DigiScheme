import { Loader2, Mic, Square } from 'lucide-react';
import { useRef, useState } from 'react';
import { useApp } from '../state/app';
import { canRecognise, canRecord, recogniseOnce, startRecording, type Recording } from '../voice/recorder';

type Result = { kind: 'audio'; blob: Blob } | { kind: 'text'; text: string };

/** Tap to start, tap to stop. Works with MediaRecorder (server ASR) or the browser recogniser; hides itself if neither exists. */
export function MicButton({ onResult, onError, disabled }: { onResult: (r: Result) => void | Promise<void>; onError: (message: string) => void; disabled?: boolean }) {
  const { t, bcp47 } = useApp();
  const [state, setState] = useState<'idle' | 'listening' | 'busy'>('idle');
  const rec = useRef<Recording | null>(null);
  const reco = useRef<{ result: Promise<string>; stop: () => void } | null>(null);

  if (!canRecord() && !canRecognise()) return null;

  const start = async () => {
    try {
      if (canRecord()) { rec.current = await startRecording(); setState('listening'); return; }
      reco.current = recogniseOnce(bcp47); setState('listening');
      const text = await reco.current.result; setState('busy'); await onResult({ kind: 'text', text });
    } catch {
      onError(t.bot.voiceUnavailable);
    } finally {
      if (!rec.current) setState('idle');
    }
  };
  const stop = async () => {
    if (rec.current) {
      setState('busy');
      const r = rec.current; rec.current = null;
      try { await onResult({ kind: 'audio', blob: await r.stop() }); } catch { onError(t.bot.voiceUnavailable); } finally { setState('idle'); }
    } else reco.current?.stop();
  };

  return (
    <button
      type="button" disabled={disabled || state === 'busy'} data-testid="mic"
      onClick={() => void (state === 'listening' ? stop() : start())}
      aria-pressed={state === 'listening'} aria-label={state === 'listening' ? t.ui.listening : t.ui.tapToSpeak}
      className={`tap flex h-14 w-14 shrink-0 items-center justify-center rounded-full text-white shadow focus:outline-none focus-visible:ring-4 focus-visible:ring-saffron/50 ${state === 'listening' ? 'animate-pulse bg-red-600' : 'bg-saffron'}`}
    >
      {state === 'busy' ? <Loader2 className="h-6 w-6 animate-spin" aria-hidden /> : state === 'listening' ? <Square className="h-6 w-6" aria-hidden /> : <Mic className="h-6 w-6" aria-hidden />}
    </button>
  );
}
