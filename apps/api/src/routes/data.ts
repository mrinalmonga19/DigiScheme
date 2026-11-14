import { Router } from 'express';
import { z } from 'zod';
import { CATEGORIES, DEMO_LANGUAGE_CODES, FIELD_DEFS, pack, profileCompleteness, tr, type SchemeCategory, type SchemeCardView } from '@digischeme/shared';
import type { AppContext } from '../context';
import { isEligible, renderRequirement, runEligibility } from '../eligibility';
import { requireConsent, requireUser, user } from '../middleware/auth';
import { HttpError } from '../middleware/errors';
import { applicableSchemes, deriveIntent, nextQuestionField } from '../orchestrator/ladder';
import { buildCard } from '../tools';
import { isSensitiveField } from '../services/profile';

export function dataRoutes(app: AppContext): Router {
  const r = Router();

  // ---- Public scheme catalogue (no personal data) ----
  r.get('/schemes', (req, res) => {
    const q = z.object({ language: z.string().optional(), category: z.enum(CATEGORIES as unknown as [string, ...string[]]).optional(), state: z.string().optional() }).parse(req.query);
    const lang = q.language && DEMO_LANGUAGE_CODES.includes(q.language) ? q.language : (req.user?.preferredLanguage ?? 'en');
    const list = app.registry.all()
      .filter((s) => (!q.category || s.category === q.category) && (!q.state || s.level === 'central' || s.states.includes(q.state)))
      .map((s) => ({
        slug: s.slug, name: tr(s.name, lang), officialName: s.name.en, benefit: tr(s.benefitSummary, lang), category: s.category, level: s.level,
        states: s.states, hasGuide: s.applicationSteps.length > 0, dataQuality: s.dataQuality, lastVerifiedOn: s.lastVerifiedOn, machineTranslated: s.machineTranslated && lang !== 'en',
      }));
    res.json({ schemes: list, count: list.length });
  });

  r.get('/schemes/:slug', (req, res) => {
    const s = app.registry.get(String(req.params.slug));
    if (!s) throw new HttpError(404, 'NOT_FOUND', 'No such scheme.');
    const lang = z.string().optional().parse(req.query.language) ?? req.user?.preferredLanguage ?? 'en';
    res.json({
      slug: s.slug, name: tr(s.name, lang), officialName: s.name.en, ministry: s.ministry, level: s.level, states: s.states, category: s.category,
      benefit: tr(s.benefitSummary, lang), notChecked: s.notChecked, hasGuide: s.applicationSteps.length > 0,
      documents: s.documentsRequired.map((d) => ({ code: d.code, name: tr(app.registry.doc(d.code)?.displayName, lang) || d.code, digilockerCanSupply: d.digilockerCanSupply, howToGet: tr(app.registry.doc(d.code)?.howToGet, lang) })),
      officialLinks: app.registry.safeLinks(s), sourceUrl: s.sourceUrl, lastVerifiedOn: s.lastVerifiedOn, dataQuality: s.dataQuality,
      ...(s.reviewNote ? { reviewNote: s.reviewNote } : {}), machineTranslated: s.machineTranslated && lang !== 'en',
    });
  });

  /** Transparency: the exact rules the engine evaluates, in words (spec 7). */
  r.get('/schemes/:slug/rules', (req, res) => {
    const s = app.registry.get(String(req.params.slug));
    if (!s) throw new HttpError(404, 'NOT_FOUND', 'No such scheme.');
    const lang = z.string().optional().parse(req.query.language) ?? req.user?.preferredLanguage ?? 'en';
    res.json({
      slug: s.slug, ruleVersion: s.eligibilityRules.ruleVersion, lastVerifiedOn: s.lastVerifiedOn, sourceUrl: s.sourceUrl,
      rules: s.eligibilityRules.all.map((n) => ('field' in n ? renderRequirement({ field: n.field, op: n.op, expected: n.value, state: 'pass' } as never, lang) : JSON.stringify(n))),
      raw: s.eligibilityRules, notChecked: s.notChecked,
    });
  });

  // ---- Everything below is about the signed-in person ----
  const me = r;
  r.use(['/eligibility', '/profile', '/trackers'], requireUser, requireConsent);

  me.post('/eligibility', async (req, res) => {
    const body = z.object({ intent: z.array(z.enum(CATEGORIES as unknown as [SchemeCategory, ...SchemeCategory[]])).optional() }).parse(req.body ?? {});
    const u = user(req);
    const profile = await app.profiles.get(u._id);
    const intent = deriveIntent(profile, body.intent ?? []);
    const schemes = applicableSchemes(app.registry.all(), profile);
    const results = runEligibility(schemes, profile, { intentCategories: intent });
    const bySlug = new Map(schemes.map((s) => [s.slug, s]));
    const cards: SchemeCardView[] = results.map((x) => buildCard(bySlug.get(x.slug)!, x, u.preferredLanguage));
    const next = nextQuestionField(profile, app.registry.all(), u.preferredLanguage, intent, results);
    res.json({
      cards: cards.filter((c) => c.status !== 'NOT_ELIGIBLE'), notEligible: cards.filter((c) => c.status === 'NOT_ELIGIBLE').map((c) => ({ slug: c.slug, name: c.name, reason: c.failed[0] ?? '' })),
      eligibleCount: results.filter((x) => isEligible(x.status)).length, profileCompleteness: profileCompleteness(profile),
      nextQuestion: next ? pack(u.preferredLanguage).questions[next] ?? null : null, nextQuestionField: next,
    });
  });

  me.get('/profile', async (req, res) => {
    const u = user(req);
    const profile = await app.profiles.get(u._id);
    const lang = u.preferredLanguage;
    res.json({
      fields: Object.entries(profile).map(([key, f]) => ({
        key, label: pack(lang).fields[key as keyof typeof FIELD_DEFS] ?? key, value: isSensitiveField(key as never) ? null : f.value,
        sensitive: isSensitiveField(key as never), source: f.source, verified: f.source !== 'self_declared', capturedAt: f.capturedAt,
      })),
      completeness: profileCompleteness(profile),
      documents: (await app.profiles.documents(u._id)).map((d) => ({
        code: d.code, name: tr(app.registry.doc(d.code)?.displayName, lang) || d.code, issuer: d.issuer, issuedOn: d.issuedOn, validUntil: d.validUntil, fetchedAt: d.fetchedAt,
      })),
    });
  });

  me.patch('/profile', async (req, res) => {
    const body = z.object({ fields: z.record(z.string(), z.union([z.string(), z.number(), z.boolean()])) }).parse(req.body);
    const out = await app.profiles.merge(user(req)._id, body.fields, 'self_declared');
    await app.audit.log({ userId: user(req)._id, eventType: 'profile_updated', toolName: 'api', result: out.applied.join(',') || 'none' });
    res.json(out);
  });

  // Delete one field, e.g. "forget my income". Verified fields are removed too: the user owns their data.
  me.delete('/profile/:field', async (req, res) => {
    const removed = await app.profiles.removeField(user(req)._id, String(req.params.field));
    res.json({ removed });
  });

  // ---- Trackers ----
  me.get('/trackers', async (req, res) => {
    const lang = user(req).preferredLanguage;
    const rows = await app.trackers.list(user(req)._id);
    res.json({
      trackers: rows.map((t) => ({
        id: t._id, slug: t.schemeSlug, name: tr(app.registry.get(t.schemeSlug)?.name, lang) || t.schemeSlug, status: t.status,
        checklistState: t.checklistState, notes: t.notes, reminderAt: t.reminderAt, updatedAt: t.updatedAt,
      })),
    });
  });
  me.post('/trackers', async (req, res) => {
    const body = z.object({ slug: z.string().max(80), status: z.enum(['planned', 'documents_ready', 'submitted', 'approved', 'rejected']).optional(), notes: z.string().max(500).optional(), reminderInDays: z.number().int().min(1).max(365).optional() }).parse(req.body);
    if (!app.registry.get(body.slug)) throw new HttpError(404, 'NOT_FOUND', 'No such scheme.');
    const t = await app.trackers.upsert(user(req)._id, body.slug, {
      ...(body.status ? { status: body.status } : {}), ...(body.notes !== undefined ? { notes: body.notes } : {}),
      ...(body.reminderInDays ? { reminderAt: new Date(Date.now() + body.reminderInDays * 86_400_000).toISOString() } : {}),
    });
    res.status(201).json({ id: t._id, slug: t.schemeSlug, status: t.status, reminderAt: t.reminderAt });
  });
  me.patch('/trackers/:id', async (req, res) => {
    const body = z.object({ status: z.enum(['planned', 'documents_ready', 'submitted', 'approved', 'rejected']).optional(), notes: z.string().max(500).optional(), checklistState: z.record(z.string(), z.boolean()).optional(), reminderAt: z.string().datetime().nullable().optional() }).parse(req.body);
    const t = await app.trackers.update(user(req)._id, String(req.params.id), body as never);
    if (!t) throw new HttpError(404, 'NOT_FOUND', 'No such tracker.');
    res.json({ id: t._id, status: t.status, reminderAt: t.reminderAt });
  });

  return r;
}
