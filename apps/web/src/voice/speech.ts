/** Speak a reply: server audio when we have it, otherwise the browser's built-in voice for that language. */
let current: HTMLAudioElement | null = null;

export const canSpeakInBrowser = (): boolean => typeof window !== 'undefined' && 'speechSynthesis' in window;

export function stopSpeaking(): void {
  current?.pause(); current = null;
  if (canSpeakInBrowser()) window.speechSynthesis.cancel();
}

export function speakInBrowser(text: string, bcp47: string): boolean {
  if (!canSpeakInBrowser()) return false;
  window.speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.lang = bcp47; u.rate = 0.92;
  const voice = window.speechSynthesis.getVoices().find((v) => v.lang.toLowerCase().startsWith(bcp47.slice(0, 2).toLowerCase()));
  if (voice) u.voice = voice;
  window.speechSynthesis.speak(u);
  return true;
}

export async function playUrl(url: string): Promise<void> {
  stopSpeaking();
  current = new Audio(url);
  await current.play();
}
