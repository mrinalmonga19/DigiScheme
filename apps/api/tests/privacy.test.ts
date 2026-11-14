import { describe, expect, it } from 'vitest';
import { loadPersonas } from '../src/seed/loader';
import { guardOutput, scrubPii } from '../src/trust';
import { harness, signedIn } from './appHelpers';

async function consentAll(h: Awaited<ReturnType<typeof harness>>, agent: Awaited<ReturnType<typeof signedIn>>['agent'], persona = 'gurpreet') {
  const start = await agent.post('/api/verify/digilocker/start').send({});
  const url = new URL(start.body.consentUrl);
  const id = url.pathname.split('/').pop()!;
  const state = url.searchParams.get('s')!;
  const res = await agent.post(`/api/verify/consent/${id}/decision`).send({ state, allow: start.body.docTypes ?? ['income_certificate', 'caste_certificate', 'domicile_certificate', 'school_certificate'], personaId: persona });
  return { id, state, res };
}

describe('sensitive data at rest', () => {
  it('encrypts sensitive profile values and never logs them', async () => {
    const h = await harness();
    const { agent, userId } = await signedIn(h, 'en');
    await agent.patch('/api/profile').send({ fields: { annualFamilyIncome: 123456, age: 33 } });
    const raw = JSON.stringify(await h.ctx.store.profiles.findOne({ userId }));
    expect(raw).not.toContain('123456');
    expect(raw).toContain('enc');
    const view = await agent.get('/api/profile');
    const income = view.body.fields.find((f: { key: string }) => f.key === 'annualFamilyIncome');
    expect(income.sensitive).toBe(true);
    expect(income.value).toBeNull(); // the API never returns sensitive values
    expect(JSON.stringify(await h.ctx.store.audit.find({}))).not.toContain('123456');
  });
});

describe('consent and verified data', () => {
  it('DigiLocker consent verifies fields; self-declared edits cannot overwrite verified values', async () => {
    const h = await harness();
    const { agent } = await signedIn(h, 'pa');
    const { res } = await consentAll(h, agent);
    expect(res.status).toBe(200);
    expect(res.body.verifiedFields).toEqual(expect.arrayContaining(['category', 'annualFamilyIncome']));
    const patch = await agent.patch('/api/profile').send({ fields: { category: 'general' } });
    expect(patch.body.protectedFields).toContain('category');
    const p = await agent.get('/api/profile');
    expect(p.body.fields.find((f: { key: string }) => f.key === 'category').verified).toBe(true);
  });

  it('only fetches the document types the citizen allowed', async () => {
    const h = await harness();
    const { agent } = await signedIn(h, 'pa');
    const start = await agent.post('/api/verify/digilocker/start').send({});
    const url = new URL(start.body.consentUrl);
    const res = await agent.post(`/api/verify/consent/${url.pathname.split('/').pop()}/decision`).send({ state: url.searchParams.get('s'), allow: ['income_certificate'], personaId: 'gurpreet' });
    expect(res.body.fetched.map((d: { code: string }) => d.code)).toEqual(['income_certificate']);
    expect(res.body.verifiedFields).not.toContain('category');
  });

  it('a consent link cannot be used twice, or with a tampered state', async () => {
    const h = await harness();
    const { agent } = await signedIn(h, 'pa');
    const { id, state } = await consentAll(h, agent);
    const again = await agent.post(`/api/verify/consent/${id}/decision`).send({ state, allow: ['income_certificate'] });
    expect(again.status).toBe(409);
    const start = await agent.post('/api/verify/digilocker/start').send({});
    const u = new URL(start.body.consentUrl);
    const bad = await agent.post(`/api/verify/consent/${u.pathname.split('/').pop()}/decision`).send({ state: `${u.searchParams.get('s')}x`, allow: ['income_certificate'] });
    expect(bad.status).toBe(400);
  });

  it('revoking consent downgrades verified fields to self-declared and removes the documents', async () => {
    const h = await harness();
    const { agent } = await signedIn(h, 'pa');
    const { id } = await consentAll(h, agent);
    const rev = await agent.post(`/api/verify/consents/${id}/revoke`).send({});
    expect(rev.status).toBe(200);
    expect(rev.body.downgraded.length).toBeGreaterThan(0);
    const p = await agent.get('/api/profile');
    expect(p.body.fields.every((f: { verified: boolean }) => !f.verified)).toBe(true);
    expect(p.body.documents).toEqual([]);
    const el = await agent.post('/api/eligibility').send({});
    expect(el.body.cards.every((c: { badge: string }) => c.badge !== 'verified')).toBe(true);
  });

  it('mock Aadhaar eKYC needs consent and a valid demo code, and yields only year of birth, gender and state', async () => {
    const h = await harness();
    const { agent } = await signedIn(h, 'en');
    expect((await agent.post('/api/verify/ekyc').send({ demoCode: '123456' })).status).toBe(403);
    expect((await agent.post('/api/verify/ekyc').send({ demoCode: 'nope', agree: true })).status).toBe(400);
    const p = loadPersonas().find((x) => x.id === 'gurpreet')!;
    const ok = await agent.post('/api/verify/ekyc').send({ demoCode: p.ekyc.demoCode, agree: true });
    expect(ok.status).toBe(200);
    expect(ok.body.demo).toBe(true);
    expect(ok.body.verifiedFields.sort()).toEqual(['age', 'gender', 'state']);
    const prof = await agent.get('/api/profile');
    expect(prof.body.fields.find((f: { key: string }) => f.key === 'state').verified).toBe(true);
  });
});

describe('right to erasure', () => {
  it('DELETE /api/me removes every record for the user and ends the session', async () => {
    const h = await harness();
    const { agent, userId } = await signedIn(h, 'pa');
    await consentAll(h, agent);
    await agent.post('/api/chat').send({ text: 'ਮੈਂ ਪੰਜਾਬ ਤੋਂ ਹਾਂ, ਮੇਰੀ ਉਮਰ 19 ਸਾਲ ਹੈ।' });
    await agent.post('/api/trackers').send({ slug: 'pm-kisan', reminderInDays: 3 });
    await agent.post('/api/applications').send({ slug: 'pm-kisan' });
    const del = await agent.delete('/api/me');
    expect(del.status).toBe(200);
    for (const c of ['users', 'profiles', 'sessions', 'applications', 'trackers', 'consents'] as const) {
      expect(await (h.ctx.store[c] as { count(f: object): Promise<number> }).count({}), c).toBe(0);
    }
    const audit = await h.ctx.store.audit.find({});
    expect(audit.every((a) => a.userId !== userId)).toBe(true);
    expect((await agent.post('/api/chat').send({ text: 'hi' })).status).toBe(401);
  });

  it('a user can forget a single field', async () => {
    const h = await harness();
    const { agent } = await signedIn(h, 'en');
    await agent.patch('/api/profile').send({ fields: { age: 40, state: 'Kerala' } });
    expect((await agent.delete('/api/profile/age')).body.removed).toBe(true);
    const p = await agent.get('/api/profile');
    expect(p.body.fields.map((f: { key: string }) => f.key)).toEqual(['state']);
  });
});

describe('PII scrubber and Output Guard', () => {
  it.each([
    ['my aadhaar 1234 5678 9012', 'aadhaar'],
    ['1234-5678-9012', 'aadhaar'],
    ['otp is 482913', 'otp'],
    ['call 9876543210', 'phone'],
    ['ABCDE1234F is my pan', 'pan'],
    ['card 4111 1111 1111 1111', 'long_number'],
  ])('masks %s', (text, kind) => {
    const r = scrubPii(text);
    expect(r.found).toContain(kind);
    expect(r.text).not.toMatch(/\d{6,}/);
  });
  it('leaves helplines and ordinary numbers alone', () => {
    expect(scrubPii('call 1800 11 0001 or 112').text).toContain('1800');
    expect(scrubPii('I am 58 years old and earn 96000 a year').text).toContain('96000');
  });
  it('Output Guard masks PII a model might repeat, and removes banned promises', () => {
    const g = guardOutput('Your Aadhaar 1234 5678 9012 is saved. We guarantee approval. I have submitted your application.', 'en');
    expect(g.text).not.toContain('1234 5678 9012');
    expect(g.bannedClaims).toEqual(expect.arrayContaining(['guarantee', 'auto_submitted']));
  });
  it('Output Guard keeps official links and strips look-alikes, in the user language', () => {
    const g = guardOutput('Official: https://pmkisan.gov.in/ fake: http://pmkisan-gov.in.example.xyz/apply', 'hi');
    expect(g.text).toContain('https://pmkisan.gov.in/');
    expect(g.removedLinks.length).toBe(1);
    expect(g.text).toMatch(/लिंक हटाया/);
  });
});
