/** Speak a reply: server audio when we have it, otherwise the browser's built-in voice for that language. */
let current: HTMLAudioElement | null = null;

/** Listeners to notify when speaking state changes (true = started, false = stopped). */
const listeners = new Set<(speaking: boolean) => void>();

export function onSpeakingChange(fn: (speaking: boolean) => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function emit(speaking: boolean) {
  listeners.forEach((fn) => fn(speaking));
}

export const isSpeaking = (): boolean => {
  if (current && !current.paused && !current.ended) return true;
  if (typeof window !== 'undefined' && 'speechSynthesis' in window) return window.speechSynthesis.speaking;
  return false;
};

export const canSpeakInBrowser = (): boolean => typeof window !== 'undefined' && 'speechSynthesis' in window;

/** Stop audio/speech silently — no emit, for internal use inside playUrl. */
function stopInternal(): void {
  if (current) { current.pause(); current = null; }
  if (canSpeakInBrowser()) window.speechSynthesis.cancel();
}

export function stopSpeaking(): void {
  stopInternal();
  emit(false);
}

export function speakInBrowser(text: string, bcp47: string): boolean {
  if (!canSpeakInBrowser()) return false;
  window.speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.lang = bcp47; u.rate = 0.92;
  const voice = window.speechSynthesis.getVoices().find((v) => v.lang.toLowerCase().startsWith(bcp47.slice(0, 2).toLowerCase()));
  if (voice) u.voice = voice;
  u.onend = () => emit(false);
  u.onerror = () => emit(false);
  window.speechSynthesis.speak(u);
  return true;
}

export async function playUrl(url: string): Promise<void> {
  stopInternal(); // stop silently — caller already set speakingId, don't reset it
  const audio = new Audio(url);
  current = audio;
  audio.onended = () => { if (current === audio) { current = null; emit(false); } };
  audio.onerror = () => { if (current === audio) { current = null; emit(false); } };
  await audio.play();
}
