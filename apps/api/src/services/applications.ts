/**
 * Guided application engine (spec 12). The assistant presents one step at a time, in the user's
 * language, shows the official field name as it appears on the real form, prefills what the profile
 * can supply, and never claims anything was submitted: the citizen submits on the official site.
 */
import {
  fmt, pack, tr, type ChecklistItem, type DocumentCode, type GuideStepView, type Profile, type Scheme, type StepAction,
} from '@digischeme/shared';
import type { ApplicationDoc, Store, VerifiedDocumentMeta } from '../db/store';
import { renderValue } from '../eligibility';
import type { Registry } from './registry';
import { newId } from './crypto';
import { ProfileService } from './profile';

export class ApplicationError extends Error {
  constructor(public readonly code: 'UNKNOWN_SCHEME' | 'NO_GUIDE' | 'NOT_FOUND', message: string) {
    super(message);
  }
}

const today = () => new Date().toISOString().slice(0, 10);

export function schemeDisplayName(scheme: Scheme, lang: string): { name: string; officialName: string } {
  return { name: tr(scheme.name, lang), officialName: scheme.name.en };
}

export class ApplicationEngine {
  constructor(
    private readonly store: Store,
    private readonly registry: Registry,
    private readonly profiles: ProfileService,
  ) {}

  hasGuide(scheme: Scheme): boolean {
    return scheme.applicationSteps.length > 0;
  }

  buildChecklist(scheme: Scheme, docs: VerifiedDocumentMeta[], lang: string): ChecklistItem[] {
    return scheme.documentsRequired.map((req) => {
      const type = this.registry.doc(req.code);
      const held = docs.find((d) => d.code === req.code && (d.validUntil === null || d.validUntil >= today()));
      return {
        code: req.code,
        name: type ? tr(type.displayName, lang) : req.code,
        available: Boolean(held),
        digilockerCanSupply: req.digilockerCanSupply,
        howToGet: type ? tr(type.howToGet, lang) : '',
      };
    });
  }

  private async load(userId: string, applicationId: string): Promise<{ app: ApplicationDoc; scheme: Scheme }> {
    const app = await this.store.applications.findOne({ _id: applicationId });
    if (!app || app.userId !== userId) throw new ApplicationError('NOT_FOUND', 'Application not found');
    const scheme = this.registry.get(app.schemeSlug);
    if (!scheme) throw new ApplicationError('UNKNOWN_SCHEME', 'Scheme not found');
    return { app, scheme };
  }

  async start(userId: string, slug: string, lang: string): Promise<GuideStepView> {
    const scheme = this.registry.get(slug);
    if (!scheme) throw new ApplicationError('UNKNOWN_SCHEME', `Unknown scheme: ${slug}`);
    if (!this.hasGuide(scheme)) throw new ApplicationError('NO_GUIDE', `No guided application for ${slug} yet`);
    const app = await this.store.applications.insert({ _id: newId(), userId, schemeSlug: slug, stepIndex: 0, completed: false });
    return this.view(userId, app._id, lang);
  }

  async act(userId: string, applicationId: string, action: StepAction, lang: string): Promise<GuideStepView> {
    const { app, scheme } = await this.load(userId, applicationId);
    const total = scheme.applicationSteps.length;
    let idx = app.stepIndex;
    if (action === 'next') idx = Math.min(idx + 1, total);
    if (action === 'back') idx = Math.max(idx - 1, 0);
    if (idx !== app.stepIndex) await this.store.applications.updateOne({ _id: app._id }, { stepIndex: idx, completed: idx >= total });
    return this.view(userId, applicationId, lang, action === 'explain' || action === 'no_document' ? action : undefined);
  }

  async view(userId: string, applicationId: string, lang: string, extra?: 'explain' | 'no_document'): Promise<GuideStepView> {
    const { app, scheme } = await this.load(userId, applicationId);
    const profile = await this.profiles.get(userId);
    const docs = await this.profiles.documents(userId);
    const checklist = this.buildChecklist(scheme, docs, lang);
    const total = scheme.applicationSteps.length;
    const p = pack(lang);
    const link = this.registry.safeLinks(scheme)[0] ?? null;
    const { name } = schemeDisplayName(scheme, lang);
    const base = { applicationId, schemeSlug: scheme.slug, schemeName: name, totalSteps: total, checklist, officialLink: link };

    if (app.stepIndex >= total) {
      return {
        ...base, stepNumber: total, title: p.bot.guideDone, officialFieldName: '', instruction: p.bot.guideDone,
        prefill: null, commonMistakes: [], documentNeeded: null, done: true,
      };
    }
    const step = scheme.applicationSteps[app.stepIndex]!;
    const pf = step.prefillFrom ? profile[step.prefillFrom] : undefined;
    const doc = step.documentNeeded ? checklist.find((c) => c.code === step.documentNeeded) ?? null : null;
    let note: string | undefined;
    if (extra === 'explain') {
      note = [tr(step.instruction, lang), step.commonMistakes.length ? `${p.kit.mistakes}: ${step.commonMistakes.join('; ')}` : '']
        .filter(Boolean).join('\n');
    } else if (extra === 'no_document') {
      const how = doc?.howToGet || (step.documentNeeded ? '' : p.bot.unsure);
      note = how ? fmt(p.bot.guideDocMissing, { how }) : p.bot.unsure;
    }
    return {
      ...base,
      stepNumber: app.stepIndex + 1,
      title: tr(step.title, lang),
      officialFieldName: step.officialFieldName,
      instruction: tr(step.instruction, lang),
      prefill: pf && step.prefillFrom ? { value: renderValue(step.prefillFrom, pf.value, lang), source: pf.source } : null,
      commonMistakes: step.commonMistakes,
      documentNeeded: doc,
      done: false,
      ...(note ? { note } : {}),
    };
  }

  /** Everything the Application Kit PDF needs. */
  async kitData(userId: string, applicationId: string, lang: string) {
    const { scheme } = await this.load(userId, applicationId);
    const profile: Profile = await this.profiles.get(userId);
    const docs = await this.profiles.documents(userId);
    const prefilled = scheme.applicationSteps
      .filter((s) => s.prefillFrom && profile[s.prefillFrom])
      .map((s) => ({
        officialFieldName: s.officialFieldName,
        value: renderValue(s.prefillFrom!, profile[s.prefillFrom!]!.value, lang),
        verified: profile[s.prefillFrom!]!.source !== 'self_declared',
      }));
    return {
      scheme,
      lang,
      checklist: this.buildChecklist(scheme, docs, lang),
      checklistEn: this.buildChecklist(scheme, docs, 'en'),
      prefilled,
      link: this.registry.safeLinks(scheme)[0] ?? null,
    };
  }

  /** Document codes still to arrange, for tracker checklists. */
  missingDocuments(scheme: Scheme, docs: VerifiedDocumentMeta[]): DocumentCode[] {
    return scheme.documentsRequired.map((d) => d.code).filter((c) => !docs.some((d) => d.code === c));
  }
}
