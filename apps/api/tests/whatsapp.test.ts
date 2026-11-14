import request from 'supertest';
import twilio from 'twilio';
import { beforeEach, describe, expect, it } from 'vitest';
import { WEBHOOK_PATH, splitMessage } from '../src/channels/whatsapp';
import { env } from '../src/config/env';
import { mockAudio } from '../src/language';
import { hashPhone } from '../src/services/crypto';
import { harness, type Harness } from './appHelpers';

const URL_ = `${env.PUBLIC_BASE_URL.replace(/\/$/, '')}${WEBHOOK_PATH}`;
let n = 0;

function post(h: Harness, fields: Record<string, string>, opts: { sign?: boolean; sid?: string } = {}) {
  const params = { From: 'whatsapp:+919000000099', To: 'whatsapp:+14155238886', MessageSid: opts.sid ?? `SMtest${++n}`, NumMedia: '0', ...fields };
  const sig = opts.sign === false ? 'bad-signature' : twilio.getExpectedTwilioSignature(env.TWILIO_AUTH_TOKEN!, URL_, params);
  return request(h.app).post(WEBHOOK_PATH).set('X-Twilio-Signature', sig).type('form').send(params);
}
const text = (xml: string) => xml.replace(/<[^>]+>/g, ' ').replace(/&amp;/g, '&').replace(/\s+/g, ' ');

describe('WhatsApp webhook', () => {
  let h: Harness;
  beforeEach(async () => { h = await harness(); });

  it('rejects a request with a bad signature and does nothing', async () => {
    const res = await post(h, { Body: 'hi' }, { sign: false });
    expect(res.status).toBe(403);
    expect(await h.ctx.store.users.count({})).toBe(0);
  });

  it('first contact shows the language menu with the privacy notice', async () => {
    const res = await post(h, { Body: 'hello' });
    expect(res.status).toBe(200);
    expect(res.type).toBe('text/xml');
    const t = text(res.text);
    expect(t).toContain('1. English');
    expect(t).toContain('4. தமிழ்');
    expect(t).toMatch(/never ask for your Aadhaar/i);
    expect(await h.ctx.store.users.count({})).toBe(1);
  });

  it('choosing a language by number records consent, stores only a hash of the number, and starts in that language', async () => {
    await post(h, { Body: 'hello' });
    const res = await post(h, { Body: '2' });
    expect(text(res.text)).toMatch(/नमस्ते/);
    const u = (await h.ctx.store.users.find({}))[0]!;
    expect(u.preferredLanguage).toBe('hi');
    expect(u.consentFlags.dataProcessing.granted).toBe(true);
    expect(u.phoneHash).toBe(hashPhone('+919000000099'));
    expect(JSON.stringify(u)).not.toContain('9000000099');
  });

  async function onboard(lang = '1') { await post(h, { Body: 'hello' }); await post(h, { Body: lang }); }

  it('numbered replies pick the suggested option', async () => {
    await onboard();
    const a = await post(h, { Body: 'I am 30 years old and live in Karnataka' });
    expect(text(a.text)).toMatch(/1\. Student/);
    const b = await post(h, { Body: '2' }); // Farmer
    expect(text(b.text)).toMatch(/PM-KISAN/);
  });

  it('is idempotent: Twilio retrying the same MessageSid is processed once', async () => {
    await onboard();
    await post(h, { Body: 'I am a farmer in Karnataka, 45' }, { sid: 'SMdup' });
    const before = (await h.ctx.store.sessions.find({}))[0]!.messages.length;
    const again = await post(h, { Body: 'I am a farmer in Karnataka, 45' }, { sid: 'SMdup' });
    expect(again.status).toBe(200);
    expect(text(again.text).trim()).toBe('');
    expect((await h.ctx.store.sessions.find({}))[0]!.messages.length).toBe(before);
  });

  it('transcribes a voice note and answers', async () => {
    await onboard();
    const data = mockAudio('I am a farmer in Karnataka and I am 45 years old').toString('base64');
    const res = await post(h, { Body: '', NumMedia: '1', MediaUrl0: `data:audio/ogg;base64,${data}`, MediaContentType0: 'audio/ogg' });
    expect(text(res.text)).toMatch(/PM-KISAN/);
  });

  it('answers a picture honestly instead of pretending to read it', async () => {
    await onboard();
    const res = await post(h, { Body: '', NumMedia: '1', MediaUrl0: 'data:image/png;base64,iVBORw0KGgo=', MediaContentType0: 'image/png' });
    expect(text(res.text)).toMatch(/cannot read pictures/i);
  });

  it('refuses media from hosts other than Twilio', async () => {
    await onboard();
    const res = await post(h, { Body: '', NumMedia: '1', MediaUrl0: 'http://169.254.169.254/latest/meta-data', MediaContentType0: 'audio/ogg' });
    expect(res.status).toBe(200);
    expect(text(res.text)).toMatch(/could not hear|type your message/i);
  });

  it('delivers the Application Kit as a PDF link when the guide finishes', async () => {
    await onboard();
    await post(h, { Body: 'I am a farmer in Karnataka, 45' });
    await post(h, { Body: '2 hectares' });
    await post(h, { Body: 'help me apply' });
    let last = '';
    for (let i = 0; i < 7; i++) last = (await post(h, { Body: 'next' })).text;
    expect(last).toMatch(/<Media>[^<]*kit\.pdf\?t=/);
    const mediaUrl = /<Media>([^<]+)<\/Media>/.exec(last)![1]!.replace(/&amp;/g, '&');
    const pdf = await request(h.app).get(new URL(mediaUrl).pathname + new URL(mediaUrl).search);
    expect(pdf.status).toBe(200);
    expect(pdf.headers['content-type']).toBe('application/pdf');
  });

  it('"delete my data" asks first, then erases everything for that number', async () => {
    await onboard();
    await post(h, { Body: 'I am a farmer in Karnataka, 45' });
    const ask = await post(h, { Body: 'delete my data' });
    expect(text(ask.text)).toMatch(/removes your profile/i);
    await post(h, { Body: '1' });
    expect(await h.ctx.store.users.count({})).toBe(0);
    expect(await h.ctx.store.profiles.count({})).toBe(0);
    expect(await h.ctx.store.sessions.count({})).toBe(0);
  });

  it('sends reminders to the stored number (mock channel) and only once', async () => {
    const { whatsappChannel } = await import('../src/routes/webhooks');
    const { ReminderService } = await import('../src/services/reminders');
    await onboard();
    await post(h, { Body: 'I am a farmer in Karnataka, 45' });
    const u = (await h.ctx.store.users.find({}))[0]!;
    await h.ctx.trackers.upsert(u._id, 'pm-kisan', { reminderAt: new Date(Date.now() - 1000).toISOString() });
    const svc = new ReminderService(h.ctx, whatsappChannel);
    expect(await svc.tick()).toBe(1);
    expect(await svc.tick()).toBe(0);
    expect(whatsappChannel.outbox.at(-1)?.to).toBe('+919000000099');
  });
});

describe('message splitting', () => {
  it('keeps short messages whole', () => expect(splitMessage('hello')).toEqual(['hello']));
  it('splits long text at paragraph and sentence boundaries without losing anything', () => {
    const long = Array.from({ length: 60 }, (_, i) => `Sentence number ${i} is here.`).join(' ');
    const parts = splitMessage(long, 300);
    expect(parts.length).toBeGreaterThan(3);
    expect(parts.every((p) => p.length <= 300)).toBe(true);
    expect(parts.join(' ').replace(/\s+/g, ' ')).toBe(long);
  });
  it('splits a single huge token as a last resort', () => {
    expect(splitMessage('x'.repeat(2500), 1000).map((p) => p.length)).toEqual([1000, 1000, 500]);
  });
});
