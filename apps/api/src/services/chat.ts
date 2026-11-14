/**
 * The chat pipeline (spec 4.1). One entry point for web and WhatsApp:
 *   input (text | voice | chip) -> PII scrub -> language -> orchestrator -> Output Guard -> reply
 *   localisation -> speech -> persist.
 */
import {
  DEMO_LANGUAGE_CODES, detectByScript, pack, profileCompleteness, type ChatResponse, type ChatUiHints, type DemoModeFlags,
  type FieldKey, type SessionState, type StructuredInput,
} from '@digischeme/shared';
import { demoFlags } from '../config/env';
import { logger } from '../config/logger';
import type { SessionDoc, UserDoc } from '../db/store';
import type { AppContext } from '../context';
import type { LLMTurn } from '../llm/types';
import { suggestionsFor } from '../orchestrator/suggestions';
import type { ToolContext } from '../tools';
import { guardOutput, scrubPii } from '../trust';
import { newId } from './crypto';

export interface ChatInput {
  user: UserDoc;
  text?: string;
  structured?: StructuredInput;
  audio?: { data: Buffer; mime?: string };
  /** Reply with speech as well (voice in -> voice out, or the Listen button). */
  wantAudio?: boolean;
  /** Explicit language for this turn (language switcher). Locks the user's choice. */
  language?: string;
}

export interface ChatResult extends ChatResponse {
  userText: string;
  toolsCalled: string[];
  provider: string;
  audio: { data: Buffer; mime: string } | null;
}

const HISTORY_TURNS = 8;
const isDemoLang = (l: string) => DEMO_LANGUAGE_CODES.includes(l);

export function demoModeFlags(app: AppContext): DemoModeFlags {
  const f = demoFlags();
  // A Gemini outage flips the badge: the user is talking to the deterministic assistant right now.
  const llm = f.llm || app.llm.lastProvider === 'mock';
  return { ...f, llm, any: llm || f.digilocker || f.aadhaar || f.language };
}

export class ChatService {
  constructor(private readonly app: AppContext) {}

  async session(userId: string): Promise<SessionDoc> {
    const existing = await this.app.store.sessions.findOne({ userId });
    if (existing) return existing;
    return this.app.store.sessions.insert({
      _id: newId(), userId, messages: [], state: 'discovery', activeSchemeSlug: null, applicationId: null, applicationStep: 0,
      lastResultSlugs: [], greeted: false, lastAskedField: null, lastSuggested: [],
    });
  }

  /** Decide the language of this turn. A manual choice always wins; detection only runs on enough text. */
  private async resolveLanguage(user: UserDoc, text: string, explicit?: string): Promise<{ lang: string; changed: boolean }> {
    if (explicit && isDemoLang(explicit)) {
      const changed = explicit !== user.preferredLanguage || !user.languageLocked;
      if (changed) await this.app.store.users.updateOne({ _id: user._id }, { preferredLanguage: explicit, languageLocked: true });
      user.preferredLanguage = explicit;
      user.languageLocked = true;
      return { lang: explicit, changed };
    }
    if (user.languageLocked || text.replace(/[\s\d\p{P}]/gu, '').length < 4) return { lang: user.preferredLanguage, changed: false };
    try {
      const d = await this.app.language.detectLanguage({ text });
      const script = detectByScript(text);
      const lang = d.confidence >= 0.6 && isDemoLang(d.lang) ? d.lang : script.confidence >= 0.8 && isDemoLang(script.lang) ? script.lang : user.preferredLanguage;
      if (lang !== user.preferredLanguage) {
        await this.app.store.users.updateOne({ _id: user._id }, { preferredLanguage: lang });
        user.preferredLanguage = lang;
        return { lang, changed: true };
      }
    } catch (err) {
      logger.warn({ err: (err as Error).message }, 'language detection failed; keeping preferred language');
    }
    return { lang: user.preferredLanguage, changed: false };
  }

  private historyTurns(session: SessionDoc): LLMTurn[] {
    return session.messages.slice(-HISTORY_TURNS).map((m): LLMTurn =>
      m.role === 'user' ? { role: 'user', text: m.text } : { role: 'model', text: m.text });
  }

  async handle(input: ChatInput): Promise<ChatResult> {
    const { app } = this;
    const user = input.user;
    const session = await this.session(user._id);

    // ---- 1. Input: voice -> text ----
    let text = input.text ?? '';
    let spokenLang: string | undefined;
    if (input.audio) {
      const hint = input.language ?? user.preferredLanguage;
      try {
        const t = await app.language.transcribe(input.audio.data, hint, input.audio.mime);
        text = t.text;
        spokenLang = isDemoLang(t.lang) ? t.lang : undefined;
      } catch {
        const lang = hint;
        return this.simple(user, session, pack(lang).bot.voiceUnavailable, lang, null);
      }
    }
    text = text.trim().slice(0, 2000);

    // ---- 2. PII scrub, language ----
    const scrub = scrubPii(text);
    const { lang } = await this.resolveLanguage(user, scrub.text, input.language ?? (input.audio && !user.languageLocked ? spokenLang : undefined));
    const piiWarning = scrub.found.length > 0;
    if (piiWarning) await app.audit.log({ userId: user._id, eventType: 'pii_blocked', result: scrub.found.join(',') });

    // Optional English gloss: helps Gemini reason; failure never blocks the turn.
    let englishText: string | undefined;
    if (!input.structured && lang !== 'en' && scrub.text && app.llm.name === 'gemini') {
      try { englishText = (await app.language.translate(scrub.text, lang, 'en')).text; } catch { /* the original text is enough */ }
    }

    // ---- 3. Orchestrate ----
    const ui: Partial<ChatUiHints> = {};
    const tctx: ToolContext = { user, session, profile: await app.profiles.get(user._id), lang, userText: scrub.text, ui };
    const history = this.historyTurns(session);
    const out = await app.orchestrator.runTurn(tctx, {
      text: scrub.text, ...(englishText ? { englishText } : {}), ...(input.structured ? { structured: input.structured } : {}), piiWarning,
    }, history);

    // ---- 4. Localise (a model that answered in the wrong language), then guard ----
    let reply = out.replyText;
    if (lang !== 'en' && out.usedProvider === 'gemini' && detectByScript(reply).lang === 'en' && detectByScript(reply).confidence > 0.8) {
      try { reply = (await app.language.translate(reply, 'en', lang)).text; } catch { /* keep English rather than fail */ }
    }
    const guard = guardOutput(reply, lang);
    if (guard.removedLinks.length || guard.bannedClaims.length) {
      await app.audit.log({ userId: user._id, eventType: 'output_guard', result: `links=${guard.removedLinks.length};claims=${guard.bannedClaims.join('|')}` });
    }
    reply = guard.text;

    // ---- 5. UI hints, chips ----
    const profile = tctx.profile;
    const hints: ChatUiHints = {
      ...ui, profileCompleteness: ui.profileCompleteness ?? profileCompleteness(profile), sessionState: session.state as SessionState,
    };
    const askedField = (session.lastAskedField as FieldKey | null) ?? null;
    if (askedField) hints.askedField = askedField;
    const verified = Object.values(profile).some((f) => f && String(f.source).startsWith('digilocker'));
    const suggestedReplies = suggestionsFor({ lang, state: session.state as SessionState, ui: hints, askedField, verified });

    // ---- 6. Speech ----
    let audio: ChatResult['audio'] = null;
    let audioUrl: string | null = null;
    let ttsFallback: 'browser' | null = null;
    if (input.wantAudio) {
      const speech = await app.language.synthesize(reply, lang);
      if (speech) {
        audio = { data: speech.audio, mime: speech.mime };
        const id = newId();
        await app.store.media.insert({ _id: id, mime: speech.mime, dataBase64: speech.audio.toString('base64'), expiresAt: new Date(Date.now() + 15 * 60_000).toISOString() });
        audioUrl = `/api/media/${id}`;
      } else ttsFallback = 'browser';
    }

    // ---- 7. Persist (scrubbed text only) ----
    const now = new Date().toISOString();
    const userLine = input.structured ? chipLabel(input.structured, suggestedReplies, session) : scrub.text;
    session.messages.push(
      { role: 'user', text: userLine, language: lang, timestamp: now, toolCalls: [] },
      { role: 'assistant', text: reply, language: lang, timestamp: now, toolCalls: out.toolsCalled },
    );
    if (session.messages.length > 40) session.messages = session.messages.slice(-40);
    session.greeted = true;
    session.lastSuggested = suggestedReplies.map((s) => ({ label: s.label, ...(s.structured ? { structured: s.structured } : {}) }));
    await app.store.sessions.updateOne({ _id: session._id }, {
      messages: session.messages, state: session.state, activeSchemeSlug: session.activeSchemeSlug, applicationId: session.applicationId,
      applicationStep: session.applicationStep, lastResultSlugs: session.lastResultSlugs, greeted: true,
      lastAskedField: session.lastAskedField, lastSuggested: session.lastSuggested,
    });
    await app.audit.log({ userId: user._id, eventType: 'chat_turn', result: `${out.usedProvider};tools=${out.toolsCalled.join(',') || 'none'}` });

    return {
      replyText: reply, language: lang, audioUrl, ttsFallback, suggestedReplies, ui: hints, demoMode: demoModeFlags(app),
      userText: scrub.text, toolsCalled: out.toolsCalled, provider: out.usedProvider, audio,
    };
  }

  /** A canned reply that skips the orchestrator (voice failure, unreadable media). */
  async simple(user: UserDoc, session: SessionDoc, text: string, lang: string, userText: string | null): Promise<ChatResult> {
    const profile = await this.app.profiles.get(user._id);
    const ui: ChatUiHints = { profileCompleteness: profileCompleteness(profile), sessionState: session.state as SessionState };
    return {
      replyText: text, language: lang, audioUrl: null, ttsFallback: null, suggestedReplies: [], ui, demoMode: demoModeFlags(this.app),
      userText: userText ?? '', toolsCalled: [], provider: 'none', audio: null,
    };
  }

  /** Greeting + consent notice for a brand-new conversation (web landing and WhatsApp first contact). */
  welcome(lang: string): { text: string } {
    const b = pack(lang).bot;
    return { text: `${b.welcome}\n\n${b.privacyNotice}` };
  }
}

function chipLabel(s: StructuredInput, chips: Array<{ label: string }>, session: SessionDoc): string {
  void chips;
  const prev = session.lastSuggested.find((x) => JSON.stringify(x.structured) === JSON.stringify(s));
  return prev?.label ?? (s.type === 'profile' ? Object.values(s.fields).join(', ') : s.action);
}
