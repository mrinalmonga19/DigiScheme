import { Router } from 'express';
import { z } from 'zod';
import { DEMO_LANGUAGE_CODES, LANGUAGES, pack } from '@digischeme/shared';
import { env } from '../config/env';
import type { AppContext } from '../context';
import { clearSession, issueSession, requireUser, user } from '../middleware/auth';
import { HttpError } from '../middleware/errors';
import { authLimiter } from '../middleware/limits';
import { hashPhone, newId } from '../services/crypto';
import { demoModeFlags } from '../services/chat';
import { checkLink } from '../trust';
import { linkLimiter } from '../middleware/limits';

const langSchema = z.string().refine((l) => DEMO_LANGUAGE_CODES.includes(l), 'Unsupported language');
const DEMO_OTP = '123456';

export function coreRoutes(app: AppContext): Router {
  const r = Router();

  r.get('/health', async (_req, res) => {
    const db = await app.store.healthy().catch(() => false);
    res.status(db ? 200 : 503).json({
      status: db ? 'ok' : 'degraded', store: app.store.mode, llm: app.llm.lastProvider, language: app.language.status(),
      mode: { llm: env.LLM_MODE, digilocker: env.DIGILOCKER_MODE, aadhaar: env.AADHAAR_MODE, bhashini: env.BHASHINI_MODE, whatsapp: env.WHATSAPP_MODE },
      demoMode: demoModeFlags(app), time: new Date().toISOString(),
    });
  });

  r.get('/languages', (_req, res) => {
    res.json({ languages: LANGUAGES.filter((l) => l.demo).map((l) => ({ code: l.code, english: l.english, native: l.native, bcp47: l.bcp47, script: l.script })) });
  });

  // ---- Sessions (anonymous by default; phone is optional) ----
  r.post('/auth/session', authLimiter, async (req, res) => {
    const body = z.object({ language: langSchema.optional(), consent: z.boolean().optional(), lowBandwidth: z.boolean().optional() }).parse(req.body ?? {});
    let u = req.user ?? null;
    const now = new Date().toISOString();
    if (!u) {
      if (!body.consent) throw new HttpError(400, 'CONSENT_REQUIRED', 'Please agree to the privacy notice to continue.');
      u = await app.store.users.insert({
        _id: newId(), phoneHash: null, preferredLanguage: body.language ?? 'en', languageLocked: Boolean(body.language), channel: 'web',
        verificationLevel: 'none', lowBandwidth: body.lowBandwidth ?? false,
        consentFlags: { dataProcessing: { granted: true, at: now }, digilocker: { granted: false, at: null }, aadhaarEkyc: { granted: false, at: null } },
      });
      await app.audit.log({ userId: u._id, eventType: 'session_created', result: 'web' });
    } else {
      const patch: Record<string, unknown> = {};
      if (body.language) Object.assign(patch, { preferredLanguage: body.language, languageLocked: true });
      if (body.lowBandwidth !== undefined) patch.lowBandwidth = body.lowBandwidth;
      if (body.consent && !u.consentFlags.dataProcessing.granted) patch.consentFlags = { ...u.consentFlags, dataProcessing: { granted: true, at: now } };
      if (Object.keys(patch).length) u = (await app.store.users.updateOne({ _id: u._id }, patch)) ?? u;
    }
    issueSession(res, u._id);
    res.status(201).json(await sessionView(app, u._id));
  });

  r.get('/auth/session', async (req, res) => {
    if (!req.user) return res.json({ authenticated: false, demoMode: demoModeFlags(app) });
    res.json(await sessionView(app, req.user._id));
  });

  // Optional phone link (mock OTP: the demo code is fixed and shown in the UI). Lets a user come back from another device.
  r.post('/auth/phone/start', authLimiter, requireUser, async (req, res) => {
    z.object({ phone: z.string().regex(/^\+?[\d\s-]{10,15}$/, 'Enter a valid phone number') }).parse(req.body);
    res.json({ sent: true, demo: true, hint: `Demo mode: no SMS is sent. Use code ${DEMO_OTP}.` });
  });
  r.post('/auth/phone/verify', authLimiter, requireUser, async (req, res) => {
    const body = z.object({ phone: z.string().regex(/^\+?[\d\s-]{10,15}$/), code: z.string().min(4).max(8) }).parse(req.body);
    if (body.code !== DEMO_OTP) throw new HttpError(400, 'BAD_OTP', 'That code is not correct.');
    const hash = hashPhone(body.phone);
    const existing = await app.store.users.findOne({ phoneHash: hash });
    const target = existing ?? (await app.store.users.updateOne({ _id: user(req)._id }, { phoneHash: hash }))!;
    issueSession(res, target._id);
    res.json({ linked: true, returning: Boolean(existing && existing._id !== user(req)._id) });
  });

  // ---- Settings and right to erasure ----
  r.patch('/me/settings', requireUser, async (req, res) => {
    const body = z.object({ language: langSchema.optional(), lowBandwidth: z.boolean().optional() }).parse(req.body);
    const patch: Record<string, unknown> = {};
    if (body.language) Object.assign(patch, { preferredLanguage: body.language, languageLocked: true });
    if (body.lowBandwidth !== undefined) patch.lowBandwidth = body.lowBandwidth;
    await app.store.users.updateOne({ _id: user(req)._id }, patch);
    res.json(await sessionView(app, user(req)._id));
  });

  r.delete('/me', requireUser, async (req, res) => {
    const u = user(req);
    await deleteUserData(app, u._id);
    await app.audit.log({ userId: null, eventType: 'user_data_deleted', result: 'ok' });
    clearSession(res);
    res.json({ deleted: true });
  });

  // ---- Link checker: usable without a session (people paste a suspicious message before they trust us) ----
  r.post('/links/check', linkLimiter, async (req, res) => {
    const body = z.object({ text: z.string().min(1).max(2000), language: langSchema.optional() }).parse(req.body);
    const lang = body.language ?? req.user?.preferredLanguage ?? 'en';
    const result = checkLink(body.text, app.registry.all(), lang);
    await app.audit.log({ userId: req.user?._id ?? null, eventType: 'link_checked', toolName: 'api', schemeSlug: result.suggestedOfficialLink?.schemeSlug ?? null, result: result.verdict });
    res.json({ result, advice: result.verdict === 'OFFICIAL' ? pack(lang).bot.linkOfficial : result.verdict === 'SUSPICIOUS' ? pack(lang).bot.linkSuspicious : pack(lang).bot.linkNotOfficial });
  });

  return r;
}

export async function sessionView(app: AppContext, userId: string) {
  const u = (await app.store.users.findOne({ _id: userId }))!;
  const profile = await app.profiles.get(userId);
  const session = await app.chat.session(userId);
  return {
    authenticated: true,
    user: {
      id: u._id, language: u.preferredLanguage, languageLocked: Boolean(u.languageLocked), channel: u.channel, lowBandwidth: Boolean(u.lowBandwidth),
      verificationLevel: u.verificationLevel, phoneLinked: Boolean(u.phoneHash), consent: u.consentFlags,
    },
    sessionState: session.state,
    hasHistory: session.messages.length > 0,
    profileFields: Object.keys(profile).length,
    demoMode: demoModeFlags(app),
  };
}

/** Right to erasure (spec 6): every record that mentions the user, not just the profile. */
export async function deleteUserData(app: AppContext, userId: string): Promise<void> {
  const s = app.store;
  await Promise.all([
    s.profiles.deleteMany({ userId }), s.sessions.deleteMany({ userId }), s.applications.deleteMany({ userId }),
    s.trackers.deleteMany({ userId }), s.consents.deleteMany({ userId }),
  ]);
  // Audit rows carry no user text; we unlink them from the person rather than keeping an identifier.
  const rows = await s.audit.find({ userId });
  for (const row of rows) await s.audit.updateOne({ _id: row._id }, { userId: null });
  await s.users.deleteMany({ _id: userId });
}
