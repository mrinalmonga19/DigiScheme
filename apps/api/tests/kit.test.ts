import { DEMO_LANGUAGE_CODES } from '@digischeme/shared';
import jwt from 'jsonwebtoken';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { env } from '../src/config/env';
import { buildApplicationKit } from '../src/services/kit';
import { harness, signedIn } from './appHelpers';

describe('Application Kit PDF', () => {
  it('builds a valid PDF for every guided scheme in every language', async () => {
    const h = await harness();
    const guided = h.ctx.registry.all().filter((s) => s.applicationSteps.length > 0);
    expect(guided.length).toBeGreaterThanOrEqual(8);
    const { userId } = await signedIn(h, 'en');
    for (const s of guided) {
      const app = await h.ctx.applications.start(userId, s.slug, 'en');
      for (const lang of DEMO_LANGUAGE_CODES) {
        const pdf = await buildApplicationKit(h.ctx.applications, userId, app.applicationId, lang);
        expect(pdf.subarray(0, 5).toString(), `${s.slug}/${lang}`).toBe('%PDF-');
        expect(pdf.length, `${s.slug}/${lang}`).toBeGreaterThan(4000);
      }
    }
  }, 120_000);

  it('requires the owner (cookie) or a valid signed link', async () => {
    const h = await harness();
    const a = await signedIn(h, 'en');
    const b = await signedIn(h, 'en');
    const started = await a.agent.post('/api/applications').send({ slug: 'pm-kisan' });
    const id = started.body.view.applicationId as string;
    expect((await request(h.app).get(`/api/applications/${id}/kit.pdf`)).status).toBe(401);
    expect((await b.agent.get(`/api/applications/${id}/kit.pdf`)).status).toBe(404); // someone else's application
    expect((await a.agent.get(`/api/applications/${id}/kit.pdf`)).status).toBe(200);

    const link = await a.agent.get(`/api/applications/${id}/kit-link`);
    const path = new URL(link.body.url).pathname + new URL(link.body.url).search;
    expect((await request(h.app).get(path)).status).toBe(200);
    const expired = jwt.sign({ uid: a.userId, aid: id, lang: 'en' }, env.JWT_SECRET, { expiresIn: -10, audience: 'kit' });
    expect((await request(h.app).get(`/api/applications/${id}/kit.pdf?t=${expired}`)).status).toBe(401);
    const other = jwt.sign({ uid: a.userId, aid: 'someone-else', lang: 'en' }, env.JWT_SECRET, { expiresIn: 60, audience: 'kit' });
    expect((await request(h.app).get(`/api/applications/${id}/kit.pdf?t=${other}`)).status).toBe(401);
  });

  it('prefills from the profile, marks verified values, and never claims anything was submitted', async () => {
    const h = await harness();
    const { agent, userId } = await signedIn(h, 'en');
    await agent.patch('/api/profile').send({ fields: { state: 'Karnataka', landholdingHectares: 2 } });
    const app = await h.ctx.applications.start(userId, 'pm-kisan', 'en');
    const data = await h.ctx.applications.kitData(userId, app.applicationId, 'en');
    expect(data.prefilled.map((p) => p.officialFieldName).length).toBeGreaterThan(0);
    expect(data.prefilled.every((p) => p.verified === false)).toBe(true);
    expect(data.link?.url).toMatch(/\.gov\.in/);
  });
});

describe('guided application engine', () => {
  it('walks forward and back, handles a missing document, and finishes with the official link', async () => {
    const h = await harness();
    const { agent } = await signedIn(h, 'en');
    const start = (await agent.post('/api/applications').send({ slug: 'pm-svanidhi' })).body.view;
    expect(start.stepNumber).toBe(1);
    const act = async (a: string) => (await agent.post(`/api/applications/${start.applicationId}/step`).send({ action: a })).body.view;
    expect((await act('next')).stepNumber).toBe(2);
    expect((await act('back')).stepNumber).toBe(1);
    const docStep = await (async () => { let v = await act('next'); while (!v.documentNeeded && !v.done) v = await act('next'); return v; })();
    const alt = await act('no_document');
    expect(alt.note).toBeTruthy();
    expect(alt.stepNumber).toBe(docStep.stepNumber);
    let v = alt; let guard = 0;
    while (!v.done && guard++ < 20) v = await act('next');
    expect(v.done).toBe(true);
    expect(v.officialLink.url).toMatch(/gov\.in/);
  });

  it('says honestly when a scheme has no guide yet', async () => {
    const h = await harness();
    const { agent } = await signedIn(h, 'en');
    const noGuide = h.ctx.registry.all().find((s) => s.applicationSteps.length === 0)!;
    const res = await agent.post('/api/applications').send({ slug: noGuide.slug });
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('NO_GUIDE');
  });
});
