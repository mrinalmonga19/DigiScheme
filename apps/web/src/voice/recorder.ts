/** Microphone capture. Server-side ASR (Bhashini, Gemini) is preferred; the browser's own recogniser is the fallback. */
export interface Recording { stop: () => Promise<Blob> }

export const canRecord = (): boolean =>
  typeof navigator !== 'undefined' && Boolean(navigator.mediaDevices?.getUserMedia) && typeof MediaRecorder !== 'undefined';

export async function startRecording(): Promise<Recording> {
  const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
  const mime = ['audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus', 'audio/mp4'].find((m) => MediaRecorder.isTypeSupported(m));
  const rec = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
  const chunks: BlobPart[] = [];
  rec.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data); };
  rec.start();
  return {
    stop: () => new Promise<Blob>((resolve) => {
      rec.onstop = () => { stream.getTracks().forEach((t) => t.stop()); resolve(new Blob(chunks, { type: rec.mimeType || 'audio/webm' })); };
      rec.stop();
    }),
  };
}

type RecognitionCtor = new () => {
  lang: string; interimResults: boolean; maxAlternatives: number; onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null;
  onerror: (() => void) | null; onend: (() => void) | null; start: () => void; stop: () => void;
};
const recognitionCtor = (): RecognitionCtor | null => {
  const w = window as unknown as { SpeechRecognition?: RecognitionCtor; webkitSpeechRecognition?: RecognitionCtor };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
};
export const canRecognise = (): boolean => recognitionCtor() !== null;

/** One-shot browser speech recognition (Web Speech API). Resolves with the transcript, or rejects if nothing was heard. */
export function recogniseOnce(bcp47: string): { result: Promise<string>; stop: () => void } {
  const Ctor = recognitionCtor();
  if (!Ctor) return { result: Promise.reject(new Error('unsupported')), stop: () => undefined };
  const r = new Ctor();
  r.lang = bcp47; r.interimResults = false; r.maxAlternatives = 1;
  let heard = '';
  const result = new Promise<string>((resolve, reject) => {
    r.onresult = (e) => { heard = e.results[0]?.[0]?.transcript ?? ''; };
    r.onerror = () => reject(new Error('no speech'));
    r.onend = () => (heard ? resolve(heard) : reject(new Error('no speech')));
    r.start();
  });
  return { result, stop: () => r.stop() };
}
