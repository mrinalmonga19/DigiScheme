import { Router } from 'express';
import jwt from 'jsonwebtoken';
import { z } from 'zod';
import { DEMO_LANGUAGE_CODES, DOCUMENT_CODES } from '@digischeme/shared';
import { env } from '../config/env';
import type { AppContext } from '../context';
import { MockVerificationProvider } from '../verification';
import { requireConsent, requireUser, user, userIdFromToken, COOKIE } from '../middleware/auth';
import { HttpError } from '../middleware/errors';
import { buildApplicationKit } from '../services/kit';

const langOf = (req: { user?: { preferredLanguage: string } }, q?: unknown) =>
  typeof q === 'string' && DEMO_LANGUAGE_CODES.includes(q) ? q : (req.user?.preferredLanguage ?? 'en');

/** Short-lived signed link for the kit PDF, so a WhatsApp user can open it without a browser session. */
export function signKitToken(userId: string, applicationId: string, lang: string): string {
  return jwt.sign({ uid: userId, aid: applicationId, lang }, env.JWT_SECRET, { expiresIn: '24h', audience: 'kit' });
}

export function flowRoutes(app: AppContext): Router {
  const r = Router();

  // ---------- Consent screen (mock DigiLocker). Authenticated by the signed state token, not the cookie. ----------
  r.get('/verify/consent/:id', async (req, res) => {
    const q = z.object({ state: z.string().min(10), language: z.string().optional() }).parse(req.query);
    res.json(await app.verification.describe(String(req.params.id), q.state, langOf(req, q.language)));
  });
  r.post('/verify/consent/:id/decision', async (req, res) => {
    const b = z.object({ state: z.string().min(10), allow: z.array(z.enum(DOCUMENT_CODES)), personaId: z.string().max(40).nullish() }).parse(req.body);
    res.json(await app.verification.grant(b.state, String(req.params.id), b.allow, b.personaId ?? null));
  });

  // The kit PDF accepts either the session cookie or a signed link token (WhatsApp).
  r.get('/applications/:id/kit.pdf', async (req, res) => {
    const id = String(req.params.id);
    let uid: string | null;
    let lang = langOf(req);
    const t = typeof req.query.t === 'string' ? req.query.t : null;
    if (t) {
      try {
        const c = jwt.verify(t, env.JWT_SECRET, { audience: 'kit' }) as { uid: string; aid: string; lang: string };
        if (c.aid !== id) throw new Error('mismatch');
        uid = c.uid; lang = c.lang;
      } catch {
        throw new HttpError(401, 'BAD_LINK', 'This download link is invalid or has expired.');
      }
    } else {
      const cookie = req.cookies?.[COOKIE] as string | undefined;
      uid = req.user?._id ?? (cookie ? userIdFromToken(cookie) : null);
    }
    if (!uid) throw new HttpError(401, 'NO_SESSION', 'Please start a session first.');
    const pdf = await buildApplicationKit(app.applications, uid, id, lang);
    const slug = (await app.applications.view(uid, id, lang)).schemeSlug;
    await app.audit.log({ userId: uid, eventType: 'kit_downloaded', schemeSlug: slug, result: 'pdf' });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="DigiScheme-Kit-${slug}.pdf"`);
    res.setHeader('Cache-Control', 'private, no-store');
    res.send(pdf);
  });
  const me = r;
  r.use(['/verify/digilocker', '/verify/consents', '/verify/ekyc', '/verify/personas', '/applications'], requireUser, requireConsent);

  me.post('/verify/digilocker/start', async (req, res) => {
    const b = z.object({ docTypes: z.array(z.enum(DOCUMENT_CODES)).optional() }).parse(req.body ?? {});
    const out = await app.verification.start(user(req), b.docTypes, user(req).preferredLanguage);
    res.status(201).json(out);
  });
  me.get('/verify/consents', async (req, res) => res.json({ consents: await app.verification.list(user(req)._id), demo: app.verification.demo }));
  me.post('/verify/consents/:id/revoke', async (req, res) => res.json(await app.verification.revoke(user(req)._id, String(req.params.id))));
  me.post('/verify/ekyc', async (req, res) => {
    const b = z.object({ demoCode: z.string().max(40).optional(), agree: z.boolean().default(false) }).parse(req.body ?? {});
    res.json(await app.verification.ekyc(user(req), b.demoCode, b.agree));
  });
  me.get('/verify/personas', (_req, res) => {
    res.json({ personas: app.provider instanceof MockVerificationProvider ? app.provider.listPersonas() : [], demo: app.verification.demo.digilocker });
  });

  // ---------- Guided application ----------
  me.post('/applications', async (req, res) => {
    const b = z.object({ slug: z.string().min(1).max(80) }).parse(req.body);
    const view = await app.applications.start(user(req)._id, b.slug, user(req).preferredLanguage);
    const s = await app.chat.session(user(req)._id);
    await app.store.sessions.updateOne({ _id: s._id }, { applicationId: view.applicationId, activeSchemeSlug: b.slug, applicationStep: view.stepNumber, state: 'application' });
    await app.audit.log({ userId: user(req)._id, eventType: 'application_started', toolName: 'api', schemeSlug: b.slug, result: 'ok' });
    res.status(201).json({ view });
  });
  me.get('/applications/:id', async (req, res) => {
    res.json({ view: await app.applications.view(user(req)._id, String(req.params.id), user(req).preferredLanguage) });
  });
  me.post('/applications/:id/step', async (req, res) => {
    const b = z.object({ action: z.enum(['next', 'back', 'repeat', 'explain', 'no_document']) }).parse(req.body);
    const view = await app.applications.act(user(req)._id, String(req.params.id), b.action, user(req).preferredLanguage);
    res.json({ view });
  });
  me.get('/applications/:id/kit-link', async (req, res) => {
    const u = user(req);
    await app.applications.view(u._id, String(req.params.id), u.preferredLanguage); // ownership check
    const t = signKitToken(u._id, String(req.params.id), u.preferredLanguage);
    res.json({ url: `${env.PUBLIC_BASE_URL}/api/applications/${req.params.id}/kit.pdf?t=${encodeURIComponent(t)}`, expiresInHours: 24 });
  });

  return r;
}
