import { Router } from 'express';
import type { AppContext } from '../context';
import { requireAdmin } from '../middleware/auth';
import { env } from '../config/env';

/** Read-only operational view for the demo (spec 15). Guarded by ADMIN_PASSCODE; shows no user text. */
export function adminRoutes(app: AppContext): Router {
  const r = Router();
  r.use(requireAdmin);

  r.get('/overview', async (_req, res) => {
    const [users, sessions, applications, trackers, consents] = await Promise.all([
      app.store.users.count({}), app.store.sessions.count({}), app.store.applications.count({}), app.store.trackers.count({}), app.store.consents.count({}),
    ]);
    res.json({ counts: { users, sessions, applications, trackers, consents }, store: app.store.mode, schemes: app.registry.all().length });
  });

  r.get('/audit', async (_req, res) => {
    const rows = await app.audit.recent(200);
    res.json({ events: rows.map(({ _id, ...e }) => ({ id: _id, ...e, userId: e.userId ? `${e.userId.slice(0, 8)}…` : null })) });
  });

  r.get('/providers', (_req, res) => {
    res.json({
      language: app.language.status(),
      llm: { configuredMode: env.LLM_MODE, lastProvider: app.llm.lastProvider, circuitOpen: app.llm.circuitOpen, lastError: app.llm.lastError },
      verification: app.verification.demo,
      modes: { digilocker: env.DIGILOCKER_MODE, aadhaar: env.AADHAAR_MODE, bhashini: env.BHASHINI_MODE, whatsapp: env.WHATSAPP_MODE, db: app.store.mode },
    });
  });

  r.get('/schemes', (_req, res) => {
    res.json({
      schemes: app.registry.all().map((s) => ({
        slug: s.slug, name: s.name.en, level: s.level, category: s.category, ruleVersion: s.eligibilityRules.ruleVersion, lastVerifiedOn: s.lastVerifiedOn,
        dataQuality: s.dataQuality, machineTranslated: s.machineTranslated, hasGuide: s.applicationSteps.length > 0, sourceUrl: s.sourceUrl, ...(s.reviewNote ? { reviewNote: s.reviewNote } : {}),
      })),
    });
  });
  return r;
}
