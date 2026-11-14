/** localStorage can be empty, blocked or full; every read and write is guarded. Used only for small conveniences. */
export function readJson<T>(key: string): T | null {
  try { const v = localStorage.getItem(key); return v ? (JSON.parse(v) as T) : null; } catch { return null; }
}
export function writeJson(key: string, value: unknown): void {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* ignore */ }
}
export function removeKey(key: string): void {
  try { localStorage.removeItem(key); } catch { /* ignore */ }
}
