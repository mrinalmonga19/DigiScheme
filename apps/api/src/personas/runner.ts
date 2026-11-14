/**
 * Persona runner (spec 17). Plays each demo persona's script against the real HTTP app (in-process, no
 * network) and checks the expectations in personas.json. `npm run personas` prints a report; the
 * persona tests assert it. WhatsApp personas go through the signed webhook, web personas through /api.
 */
import request from 'supertest';
import twilio from 'twilio';
import type { Express } from 'express';
import type { ChatUiHints } from '@digischeme/shared';
import { WEBHOOK_PATH } from '../channels/whatsapp';
import { env } from '../config/env';
import type { AppContext } from '../context';
import { createApp } from '../app';
import { mockAudio } from '../language';
import { loadPersonas, type Persona } from '../seed/loader';

export interface StepLog { step: number; kind: string; input: string; reply: string; tools?: string[] }
export interface PersonaReport {
  persona: string;
  language: string;
  channel: string;
  ok: boolean;
  failures: string[];
  steps: StepLog[];
}

interface Observed {
  guideSlugs: string[];
  linkVerdict?: string;
  suggestedScheme?: string;
  firstAskedField?: string;
  firstResultsStatus: Record<string, string>;
  lastCards: Array<{ slug: string; status: string }>;
  notEligible: string[];
}

const ELIGIBLE = ['ELIGIBLE_VERIFIED', 'ELIGIBLE_ESTIMATED'];
const clip = (s: string, n = 220) => (s.length > n ? `${s.slice(0, n)}…` : s).replace(/\n+/g, ' ⏎ ');

function absorb(o: Observed, ui: Partial<ChatUiHints> | undefined): void {
  if (!ui) return;
  if (ui.guide?.schemeSlug && !o.guideSlugs.includes(ui.guide.schemeSlug)) o.guideSlugs.push(ui.guide.schemeSlug);
  if (ui.linkCheck) {
    o.linkVerdict = ui.linkCheck.verdict;
    if (ui.linkCheck.suggestedOfficialLink) o.suggestedScheme = ui.linkCheck.suggestedOfficialLink.schemeSlug;
  }
  if (ui.askedField && o.firstAskedField === undefined) o.firstAskedField = ui.askedField;
  if (ui.results?.length) {
    if (Object.keys(o.firstResultsStatus).length === 0) for (const c of ui.results) o.firstResultsStatus[c.slug] = c.status;
    o.lastCards = ui.results.map((c) => ({ slug: c.slug, status: c.status }));
  }
}

function signed(params: Record<string, string>): { url: string; signature: string } {
  const url = `${env.PUBLIC_BASE_URL.replace(/\/$/, '')}${WEBHOOK_PATH}`;
  return { url, signature: twilio.getExpectedTwilioSignature(env.TWILIO_AUTH_TOKEN!, url, params) };
}

export async function runPersona(app: AppContext, persona: Persona, express: Express = createApp(app)): Promise<PersonaReport> {
  const steps: StepLog[] = [];
  const failures: string[] = [];
  const obs: Observed = { guideSlugs: [], firstResultsStatus: {}, lastCards: [], notEligible: [] };
  const agent = request.agent(express);
  let n = 0;

  // ---------- transport ----------
  let sid = 0;
  const wa = async (fields: Record<string, string>) => {
    const params: Record<string, string> = { From: `whatsapp:${persona.phone}`, To: 'whatsapp:+14155238886', MessageSid: `SM${persona.id}${++sid}`, ...fields };
    const { signature } = signed(params);
    const res = await request(express).post(WEBHOOK_PATH).set('X-Twilio-Signature', signature).type('form').send(params);
    if (res.status !== 200) throw new Error(`webhook ${res.status}`);
    return res.text;
  };

  /** After a WhatsApp turn the web-style UI hints are not in the XML, so read them from the stored session via the API-free path. */
  const waState = async () => {
    const user = await app.store.users.findOne({ phoneHash: (await import('../services/crypto')).hashPhone(persona.phone) });
    if (!user) return null;
    const s = await app.chat.session(user._id);
    return { user, session: s };
  };

  const eligibilityFor = async (userId: string) => {
    const user = (await app.store.users.findOne({ _id: userId }))!;
    const { runEligibility } = await import('../eligibility');
    const { applicableSchemes, deriveIntent } = await import('../orchestrator/ladder');
    const profile = await app.profiles.get(userId);
    const schemes = applicableSchemes(app.registry.all(), profile);
    return { user, results: runEligibility(schemes, profile, { intentCategories: deriveIntent(profile) }) };
  };

  try {
    if (persona.channel === 'whatsapp') {
      for (const step of persona.script) {
        n++;
        if (step.kind === 'text') {
          const xml = await wa({ Body: step.text, NumMedia: '0' });
          steps.push({ step: n, kind: 'text', input: step.text, reply: clip(xml.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ')) });
        } else if (step.kind === 'voice') {
          const data = mockAudio(step.text).toString('base64');
          const xml = await wa({ Body: '', NumMedia: '1', MediaUrl0: `data:audio/ogg;base64,${data}`, MediaContentType0: 'audio/ogg' });
          steps.push({ step: n, kind: 'voice', input: step.text, reply: clip(xml.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ')) });
        } else throw new Error(`WhatsApp persona step kind not supported: ${step.kind}`);
        const st = await waState();
        if (st?.session.state === 'application' && st.session.activeSchemeSlug && !obs.guideSlugs.includes(st.session.activeSchemeSlug)) obs.guideSlugs.push(st.session.activeSchemeSlug);
        if (st && st.session.lastAskedField && obs.firstAskedField === undefined) obs.firstAskedField = st.session.lastAskedField;
      }
      const st = await waState();
      if (st) {
        const { results } = await eligibilityFor(st.user._id);
        obs.lastCards = results.filter((r) => r.status !== 'NOT_ELIGIBLE').map((r) => ({ slug: r.slug, status: r.status }));
        obs.notEligible = results.filter((r) => r.status === 'NOT_ELIGIBLE').map((r) => r.slug);
      } else failures.push('no user was created by the WhatsApp flow');
    } else {
      const started = await agent.post('/api/auth/session').send({ consent: true, ...(persona.lowBandwidth ? { lowBandwidth: true } : {}) });
      if (started.status !== 201) throw new Error(`session ${started.status}`);
      const userId: string = started.body.user.id;
      await app.store.users.updateOne({ _id: userId }, { demoPersonaId: persona.id });

      for (const step of persona.script) {
        n++;
        if (step.kind === 'text' || step.kind === 'voice') {
          const res = step.kind === 'text'
            ? await agent.post('/api/chat').send({ text: step.text })
            : await agent.post('/api/voice/chat').attach('audio', mockAudio(step.text), { filename: 'v.ogg', contentType: 'audio/ogg' });
          if (res.status !== 200) throw new Error(`chat ${res.status}: ${JSON.stringify(res.body)}`);
          absorb(obs, res.body.ui);
          steps.push({ step: n, kind: step.kind, input: step.text, reply: clip(res.body.replyText) });
        } else if (step.kind === 'action') {
          const structured = step.action === 'step'
            ? { type: 'action', action: 'step', stepAction: step.stepAction ?? 'next' }
            : { type: 'action', action: step.action, ...(step.slug ? { slug: step.slug } : {}) };
          const res = await agent.post('/api/chat').send({ structured });
          if (res.status !== 200) throw new Error(`action ${res.status}: ${JSON.stringify(res.body)}`);
          absorb(obs, res.body.ui);
          steps.push({ step: n, kind: 'action', input: JSON.stringify(structured), reply: clip(res.body.replyText) });
        } else if (step.kind === 'digilocker') {
          const start = await agent.post('/api/verify/digilocker/start').send({ docTypes: step.docs });
          if (start.status !== 201) throw new Error(`digilocker start ${start.status}: ${JSON.stringify(start.body)}`);
          const url = new URL(start.body.consentUrl);
          const consentId = url.pathname.split('/').pop()!;
          const state = url.searchParams.get('s')!;
          const grant = await agent.post(`/api/verify/consent/${consentId}/decision`).send({ state, allow: step.docs, personaId: persona.id });
          if (grant.status !== 200) throw new Error(`consent ${grant.status}: ${JSON.stringify(grant.body)}`);
          steps.push({ step: n, kind: 'digilocker', input: step.docs.join(','), reply: `granted: ${grant.body.fetched.map((d: { code: string }) => d.code).join(', ')}; verified fields: ${grant.body.verifiedFields.join(', ')}` });
        }
      }
      const el = await agent.post('/api/eligibility').send({});
      obs.lastCards = el.body.cards.map((c: { slug: string; status: string }) => ({ slug: c.slug, status: c.status }));
      obs.notEligible = el.body.notEligible.map((c: { slug: string }) => c.slug);
    }

    // ---------- expectations (personas.json) ----------
    const e = persona.expect as {
      eligible?: string[]; notEligible?: string[]; verified?: string[]; guideScheme?: string; linkVerdict?: string; suggestedScheme?: string;
      needsInfoFirst?: string; firstAskedField?: string;
    };
    for (const slug of e.eligible ?? []) {
      const c = obs.lastCards.find((x) => x.slug === slug);
      if (!c || !ELIGIBLE.includes(c.status)) failures.push(`expected ${slug} eligible, got ${c?.status ?? 'absent'}`);
    }
    for (const slug of e.notEligible ?? []) {
      if (!obs.notEligible.includes(slug)) failures.push(`expected ${slug} not eligible, got ${obs.lastCards.find((x) => x.slug === slug)?.status ?? 'absent'}`);
    }
    for (const slug of e.verified ?? []) {
      const c = obs.lastCards.find((x) => x.slug === slug);
      if (c?.status !== 'ELIGIBLE_VERIFIED') failures.push(`expected ${slug} ELIGIBLE_VERIFIED, got ${c?.status ?? 'absent'}`);
    }
    if (e.guideScheme && !obs.guideSlugs.includes(e.guideScheme)) failures.push(`expected a guided application for ${e.guideScheme}, saw ${obs.guideSlugs.join(',') || 'none'}`);
    if (e.linkVerdict && obs.linkVerdict !== e.linkVerdict) failures.push(`expected link verdict ${e.linkVerdict}, got ${obs.linkVerdict ?? 'none'}`);
    if (e.suggestedScheme && obs.suggestedScheme !== e.suggestedScheme) failures.push(`expected suggested scheme ${e.suggestedScheme}, got ${obs.suggestedScheme ?? 'none'}`);
    if (e.needsInfoFirst && obs.firstResultsStatus[e.needsInfoFirst] !== 'LIKELY_NEEDS_INFO') failures.push(`expected ${e.needsInfoFirst} LIKELY_NEEDS_INFO at first, got ${obs.firstResultsStatus[e.needsInfoFirst] ?? 'absent'}`);
    if (e.firstAskedField && obs.firstAskedField !== e.firstAskedField) failures.push(`expected first question about ${e.firstAskedField}, got ${obs.firstAskedField ?? 'none'}`);
  } catch (err) {
    failures.push(`run aborted: ${(err as Error).message}`);
  }
  return { persona: persona.id, language: persona.language, channel: persona.channel, ok: failures.length === 0, failures, steps };
}

export async function runAllPersonas(makeContext: () => Promise<AppContext>): Promise<PersonaReport[]> {
  const out: PersonaReport[] = [];
  for (const p of loadPersonas()) {
    const app = await makeContext(); // a fresh, empty store per persona keeps runs independent
    out.push(await runPersona(app, p));
  }
  return out;
}
