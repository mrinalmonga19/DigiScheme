import { Router } from 'express';
import multer from 'multer';
import { z } from 'zod';
import { DEMO_LANGUAGE_CODES, FIELD_KEYS, profileCompleteness, type StructuredInput } from '@digischeme/shared';
import type { AppContext } from '../context';
import { requireConsent, requireUser, user } from '../middleware/auth';
import { HttpError } from '../middleware/errors';
import { chatLimiter } from '../middleware/limits';
import type { ChatResult } from '../services/chat';

const langSchema = z.string().refine((l) => DEMO_LANGUAGE_CODES.includes(l), 'Unsupported language');
const structuredSchema: z.ZodType<StructuredInput> = z.union([
  z.object({ type: z.literal('profile'), fields: z.record(z.string(), z.unknown()).refine((f) => Object.keys(f).every((k) => (FIELD_KEYS as readonly string[]).includes(k)), 'Unknown profile field') }),
  z.object({
    type: z.literal('action'), action: z.enum(['apply', 'details', 'results', 'verify', 'step', 'track']),
    slug: z.string().max(80).optional(), stepAction: z.enum(['next', 'back', 'repeat', 'explain', 'no_document']).optional(),
  }),
]) as z.ZodType<StructuredInput>;

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 8 * 1024 * 1024, files: 1 } });

/** Strip server-only fields before sending a chat result to a client. */
const publicResult = (r: ChatResult) => {
  const { audio: _audio, toolsCalled: _t, provider: _p, ...rest } = r;
  return rest;
};

export function chatRoutes(app: AppContext): Router {
  const r = Router();
  r.use(['/chat', '/voice'], requireUser, requireConsent);

  r.get('/chat/welcome', (req, res) => {
    const lang = z.string().optional().parse(req.query.language) ?? user(req).preferredLanguage;
    res.json({ language: lang, ...app.chat.welcome(DEMO_LANGUAGE_CODES.includes(lang) ? lang : 'en') });
  });

  r.get('/chat/history', async (req, res) => {
    const s = await app.chat.session(user(req)._id);
    const profile = await app.profiles.get(user(req)._id);
    res.json({
      messages: s.messages.map((m) => ({ role: m.role, text: m.text, language: m.language, timestamp: m.timestamp, ...(m.ui ? { ui: m.ui } : {}) })),
      state: s.state, suggestedReplies: s.lastSuggested, profileCompleteness: profileCompleteness(profile),
    });
  });

  r.post('/chat', chatLimiter, async (req, res) => {
    const body = z.object({
      text: z.string().max(2000).optional(), structured: structuredSchema.optional(), language: langSchema.optional(), wantAudio: z.boolean().optional(),
      userLabel: z.string().max(100).optional(),
    }).refine((b) => (b.text && b.text.trim().length > 0) || b.structured, 'Send some text or a structured action').parse(req.body);
    const out = await app.chat.handle({
      user: user(req), ...(body.text ? { text: body.text } : {}), ...(body.structured ? { structured: body.structured } : {}),
      ...(body.language ? { language: body.language } : {}), wantAudio: body.wantAudio ?? false,
      ...(body.userLabel ? { userLabel: body.userLabel } : {}),
    });
    res.json(publicResult(out));
  });

  // ---- Voice ----
  r.post('/voice/transcribe', chatLimiter, upload.single('audio'), async (req, res) => {
    if (!req.file) throw new HttpError(400, 'NO_AUDIO', 'Attach an audio file in the "audio" field.');
    const lang = langSchema.optional().parse(req.body?.language) ?? user(req).preferredLanguage;
    const t = await app.language.transcribe(req.file.buffer, lang, req.file.mimetype);
    res.json({ text: t.text, language: t.lang, provider: t.provider });
  });

  r.post('/voice/chat', chatLimiter, upload.single('audio'), async (req, res) => {
    if (!req.file) throw new HttpError(400, 'NO_AUDIO', 'Attach an audio file in the "audio" field.');
    const language = langSchema.optional().parse(req.body?.language);
    const out = await app.chat.handle({
      user: user(req), audio: { data: req.file.buffer, mime: req.file.mimetype }, wantAudio: true, ...(language ? { language } : {}),
    });
    res.json({ ...publicResult(out), transcript: out.userText });
  });

  r.post('/voice/speak', chatLimiter, async (req, res) => {
    const body = z.object({ text: z.string().min(1).max(1500), language: langSchema.optional() }).parse(req.body);
    const lang = body.language ?? user(req).preferredLanguage;
    const speech = await app.language.synthesize(body.text, lang);
    if (!speech) return res.json({ audioUrl: null, ttsFallback: 'browser' });
    const id = crypto.randomUUID();
    await app.store.media.insert({ _id: id, mime: speech.mime, dataBase64: speech.audio.toString('base64'), expiresAt: new Date(Date.now() + 15 * 60_000).toISOString() });
    res.json({ audioUrl: `/api/media/${id}`, ttsFallback: null });
  });

  return r;
}

/** Audio is served by an unguessable id so <audio> elements work without custom headers; it expires in 15 minutes. */
export function mediaRoutes(app: AppContext): Router {
  const r = Router();
  r.get('/media/:id', async (req, res) => {
    const m = await app.store.media.findOne({ _id: String(req.params.id) });
    if (!m || m.expiresAt < new Date().toISOString()) throw new HttpError(404, 'NOT_FOUND', 'That audio is no longer available.');
    res.setHeader('Content-Type', m.mime);
    res.setHeader('Cache-Control', 'private, max-age=600');
    res.send(Buffer.from(m.dataBase64, 'base64'));
  });
  return r;
}
