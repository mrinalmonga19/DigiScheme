import twilio from 'twilio';
import { env } from '../config/env';
import { logger } from '../config/logger';
import type { IMessagingChannel, InboundMessage, OutboundMessage } from './types';

const MAX_MEDIA_BYTES = 8 * 1024 * 1024;
export const WHATSAPP_MAX_CHARS = 1500;
export const WEBHOOK_PATH = '/api/webhooks/whatsapp';

/** Split on paragraph, then sentence boundaries, so no message exceeds WhatsApp's limit and none is cut mid-word. */
export function splitMessage(text: string, max = WHATSAPP_MAX_CHARS): string[] {
  if (text.length <= max) return [text];
  const out: string[] = [];
  let cur = '';
  const push = () => { if (cur.trim()) out.push(cur.trim()); cur = ''; };
  for (const para of text.split(/\n{2,}/)) {
    if ((cur + '\n\n' + para).length <= max) { cur = cur ? `${cur}\n\n${para}` : para; continue; }
    push();
    if (para.length <= max) { cur = para; continue; }
    for (const piece of para.split(/(?<=[.!?।])\s+|\n/)) {
      if ((cur + ' ' + piece).length > max) push();
      if (piece.length > max) { for (let i = 0; i < piece.length; i += max) out.push(piece.slice(i, i + max)); continue; }
      cur = cur ? `${cur} ${piece}` : piece;
    }
  }
  push();
  return out;
}

/** Twilio only ever serves media from its own hosts; refusing everything else closes an SSRF hole. */
const isTwilioHost = (u: URL) => u.protocol === 'https:' && (u.hostname === 'api.twilio.com' || u.hostname.endsWith('.twilio.com'));

export class WhatsAppChannel implements IMessagingChannel {
  readonly name = 'whatsapp' as const;
  readonly mode = env.WHATSAPP_MODE;
  /** Messages the mock channel "sent" (reminders). Exposed for tests and the admin view. */
  readonly outbox: Array<{ to: string; body: string; mediaUrl?: string; at: string }> = [];

  validate({ signature, url, params }: { signature: string | undefined; url: string; params: Record<string, string> }): boolean {
    if (!signature || !env.TWILIO_AUTH_TOKEN) return false;
    return twilio.validateRequest(env.TWILIO_AUTH_TOKEN, signature, url, params);
  }

  parseInbound(p: Record<string, string>): InboundMessage {
    const n = Math.min(Number(p.NumMedia ?? 0) || 0, 5);
    const media = Array.from({ length: n }, (_, i) => ({ url: p[`MediaUrl${i}`] ?? '', contentType: p[`MediaContentType${i}`] ?? '' })).filter((m) => m.url);
    const from = p.From ?? '';
    return { id: p.MessageSid ?? p.SmsMessageSid ?? '', from, phone: from.replace(/^whatsapp:/, ''), text: (p.Body ?? '').trim(), media };
  }

  renderReply(messages: OutboundMessage[]): string {
    const res = new twilio.twiml.MessagingResponse();
    for (const m of messages) {
      const msg = res.message(m.body);
      if (m.mediaUrl) msg.media(m.mediaUrl);
    }
    return res.toString();
  }

  async send(toPhone: string, message: OutboundMessage): Promise<void> {
    const at = new Date().toISOString();
    if (this.mode === 'mock' || !env.TWILIO_ACCOUNT_SID || !env.TWILIO_AUTH_TOKEN) {
      this.outbox.push({ to: toPhone, body: message.body, ...(message.mediaUrl ? { mediaUrl: message.mediaUrl } : {}), at });
      return;
    }
    const client = twilio(env.TWILIO_ACCOUNT_SID, env.TWILIO_AUTH_TOKEN);
    for (const body of splitMessage(message.body)) {
      await client.messages.create({ from: env.TWILIO_WHATSAPP_FROM, to: `whatsapp:${toPhone}`, body, ...(message.mediaUrl ? { mediaUrl: [message.mediaUrl] } : {}) });
    }
  }

  async fetchMedia(url: string, contentType: string): Promise<Buffer> {
    void contentType;
    if (url.startsWith('data:')) {
      const m = /^data:[^;,]*(;base64)?,(.*)$/s.exec(url);
      if (!m) throw new Error('bad data URL');
      const buf = m[1] ? Buffer.from(m[2]!, 'base64') : Buffer.from(decodeURIComponent(m[2]!), 'utf8');
      if (buf.length > MAX_MEDIA_BYTES) throw new Error('media too large');
      return buf;
    }
    const u = new URL(url);
    if (!isTwilioHost(u)) throw new Error('media host not allowed');
    const headers: Record<string, string> = {};
    if (env.TWILIO_ACCOUNT_SID && env.TWILIO_AUTH_TOKEN) headers.Authorization = `Basic ${Buffer.from(`${env.TWILIO_ACCOUNT_SID}:${env.TWILIO_AUTH_TOKEN}`).toString('base64')}`;
    const res = await fetch(u, { headers, signal: AbortSignal.timeout(10_000) });
    if (!res.ok) throw new Error(`media fetch failed: ${res.status}`);
    const len = Number(res.headers.get('content-length') ?? 0);
    if (len > MAX_MEDIA_BYTES) throw new Error('media too large');
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length > MAX_MEDIA_BYTES) throw new Error('media too large');
    logger.debug({ bytes: buf.length }, 'whatsapp media fetched');
    return buf;
  }
}
