/**
 * WhatsApp webhook (Twilio Sandbox). Flow for a new number: choose language -> privacy notice -> chat.
 * A numeric reply selects the numbered option from the previous message, so a user never has to type
 * on a small keyboard. Every outgoing message goes through the Output Guard inside ChatService.
 */
import express, { Router } from 'express';
import { DEMO_LANGUAGES, DEMO_LANGUAGE_CODES, pack, type StructuredInput } from '@digischeme/shared';
import { WHATSAPP_MAX_CHARS, WEBHOOK_PATH, WhatsAppChannel, splitMessage } from '../channels/whatsapp';
import type { OutboundMessage } from '../channels/types';
import { env } from '../config/env';
import { logger } from '../config/logger';
import type { AppContext } from '../context';
import type { SessionDoc, UserDoc } from '../db/store';
import { loadPersonas } from '../seed/loader';
import { encryptValue, hashPhone, newId } from '../services/crypto';
import { signKitToken } from './flows';
import { deleteUserData } from './core';

type WaCommand = { type: 'wa'; cmd: 'lang'; code: string } | { type: 'wa'; cmd: 'consent' } | { type: 'wa'; cmd: 'delete'; yes: boolean };
type Chip = { label: string; structured?: StructuredInput | WaCommand };

const DELETE_WORDS = ['delete my data', 'delete data', 'मेरा डेटा हटाओ', 'डेटा हटाएं'];
const numbered = (items: string[]) => items.map((t, i) => `${i + 1}. ${t}`).join('\n');

export const whatsappChannel = new WhatsAppChannel();

export function webhookRoutes(app: AppContext): Router {
  const r = Router();
  const channel = whatsappChannel;
  const personas = loadPersonas();

  r.post('/whatsapp', express.urlencoded({ extended: false, limit: '64kb' }), async (req, res) => {
    const params = req.body as Record<string, string>;
    const url = `${env.PUBLIC_BASE_URL.replace(/\/$/, '')}${WEBHOOK_PATH}`;
    if (!channel.validate({ signature: req.header('x-twilio-signature'), url, params })) {
      return void res.status(403).type('text/plain').send('Invalid signature');
    }
    const inbound = channel.parseInbound(params);
    if (!inbound.from) return void res.status(400).type('text/plain').send('Missing sender');

    const xml = (msgs: OutboundMessage[]) => res.type('text/xml').send(channel.renderReply(msgs));
    try {
      // Twilio retries on timeouts; the same MessageSid must never be processed twice.
      if (inbound.id) {
        if (await app.store.dedupe.findOne({ _id: inbound.id })) return void xml([]);
        await app.store.dedupe.insert({ _id: inbound.id, seenAt: new Date().toISOString() });
      }
      const msgs = await handleInbound(app, inbound);
      xml(msgs.flatMap((m) => splitMessage(m.body).map((body, i) => ({ body, ...(i === 0 && m.mediaUrl ? { mediaUrl: m.mediaUrl } : {}) }))));
    } catch (err) {
      logger.error({ err: (err as Error).message }, 'whatsapp handler failed');
      xml([{ body: pack('en').bot.errorFallback }]);
    }
  });

  async function findOrCreateUser(phone: string): Promise<{ user: UserDoc; isNew: boolean }> {
    const hash = hashPhone(phone);
    const existing = await app.store.users.findOne({ phoneHash: hash });
    if (existing) return { user: existing, isNew: false };
    const persona = personas.find((p) => hashPhone(p.phone) === hash);
    const user = await app.store.users.insert({
      _id: newId(), phoneHash: hash, preferredLanguage: 'en', languageLocked: false, channel: 'whatsapp', verificationLevel: 'none',
      consentFlags: { dataProcessing: { granted: false, at: null }, digilocker: { granted: false, at: null }, aadhaarEkyc: { granted: false, at: null } },
      ...(persona ? { demoPersonaId: persona.id } : {}),
    });
    await app.audit.log({ userId: user._id, eventType: 'session_created', result: 'whatsapp' });
    return { user, isNew: true };
  }

  const saveChips = (session: SessionDoc, chips: Chip[]) =>
    app.store.sessions.updateOne({ _id: session._id }, { lastSuggested: chips });

  const languageMenu = async (session: SessionDoc): Promise<OutboundMessage> => {
    const chips: Chip[] = DEMO_LANGUAGES.map((l) => ({ label: l.native, structured: { type: 'wa', cmd: 'lang', code: l.code } }));
    await saveChips(session, chips);
    return { body: `${pack('en').wa.chooseLanguage}\n${numbered(DEMO_LANGUAGES.map((l) => `${l.native} (${l.english})`))}\n\n${pack('en').bot.privacyNotice}\n${pack('en').wa.agree}` };
  };

  const consentPrompt = async (session: SessionDoc, lang: string): Promise<OutboundMessage> => {
    const p = pack(lang);
    await saveChips(session, [{ label: p.values.yes, structured: { type: 'wa', cmd: 'consent' } }]);
    return { body: `${p.bot.welcome}\n\n${p.bot.privacyNotice}\n\n${p.wa.agree}\n1. ${p.ui.start}` };
  };

  async function handleInbound(app: AppContext, inbound: ReturnType<WhatsAppChannel['parseInbound']>): Promise<OutboundMessage[]> {
    const { user: found, isNew } = await findOrCreateUser(inbound.phone);
    let user = found;
    const session = await app.chat.session(user._id);
    const lang = user.preferredLanguage;
    const p = pack(lang);

    // ---- Onboarding: language, then consent ----
    if (!user.languageLocked) {
      const pick = /^\s*(\d{1,2})\s*$/.exec(inbound.text);
      const chip = pick ? (session.lastSuggested[Number(pick[1]) - 1] as Chip | undefined) : undefined;
      if (!isNew && chip?.structured && (chip.structured as WaCommand).type === 'wa' && (chip.structured as WaCommand).cmd === 'lang') {
        const code = (chip.structured as Extract<WaCommand, { cmd: 'lang' }>).code;
        // Replying with a number is the agreement the notice describes ("By replying with a number you agree"), so picking a language also records consent.
        const now = new Date().toISOString();
        user = (await app.store.users.updateOne({ _id: user._id }, {
          preferredLanguage: code, languageLocked: true,
          consentFlags: { ...user.consentFlags, dataProcessing: { granted: true, at: now } },
          // Needed only so reminders can reach the user; deleted with everything else.
          phoneEnc: encryptValue(inbound.phone),
        })) ?? user;
        await saveChips(session, []);
        await app.audit.log({ userId: user._id, eventType: 'consent_data_processing', result: 'whatsapp' });
        const np = pack(code);
        return [{ body: `${np.bot.welcome}\n\n${np.bot.privacyNotice}` }, { body: np.questions.state ?? np.bot.askGeneric }];
      }
      return [await languageMenu(session)];
    }
    if (!user.consentFlags.dataProcessing.granted) {
      const pick = /^\s*1\s*$/.test(inbound.text);
      if (pick) {
        const now = new Date().toISOString();
        user = (await app.store.users.updateOne({ _id: user._id }, {
          consentFlags: { ...user.consentFlags, dataProcessing: { granted: true, at: now } },
          // Needed only so reminders can reach the user; deleted with everything else.
          phoneEnc: encryptValue(inbound.phone),
        })) ?? user;
        await saveChips(session, []);
        await app.audit.log({ userId: user._id, eventType: 'consent_data_processing', result: 'whatsapp' });
        return [{ body: p.bot.welcome }, { body: p.questions.state ?? p.bot.askGeneric }];
      }
      return [await consentPrompt(session, lang)];
    }

    // ---- Numbered replies select the chip shown last ----
    let structured: StructuredInput | undefined;
    let text = inbound.text;
    const pick = /^\s*(\d{1,2})\s*[.)]?\s*$/.exec(text);
    if (pick) {
      const chip = session.lastSuggested[Number(pick[1]) - 1] as Chip | undefined;
      const s = chip?.structured as StructuredInput | WaCommand | undefined;
      if (s && s.type === 'wa') {
        if (s.cmd === 'delete') {
          await saveChips(session, []);
          if (!s.yes) return [{ body: p.bot.noted }];
          await deleteUserData(app, user._id);
          return [{ body: p.bot.noted }];
        }
      } else if (s) { structured = s; text = ''; }
    }

    // ---- Data deletion by keyword ----
    if (!structured && DELETE_WORDS.some((w) => text.toLowerCase().includes(w)) || text.toLowerCase().includes(p.ui.deleteData.toLowerCase())) {
      await saveChips(session, [
        { label: p.values.yes, structured: { type: 'wa', cmd: 'delete', yes: true } },
        { label: p.values.no, structured: { type: 'wa', cmd: 'delete', yes: false } },
      ]);
      return [{ body: `${p.ui.deleteConfirm}\n${numbered([p.values.yes, p.values.no])}` }];
    }

    // ---- Media: voice notes are transcribed; pictures get an honest "I cannot read this yet" ----
    let audio: { data: Buffer; mime: string } | undefined;
    const voice = inbound.media.find((m) => m.contentType.startsWith('audio/'));
    if (voice && !structured) {
      try {
        audio = { data: await channel.fetchMedia(voice.url, voice.contentType), mime: voice.contentType };
      } catch (err) {
        logger.warn({ err: (err as Error).message }, 'voice note could not be fetched');
        return [{ body: p.bot.voiceUnavailable }];
      }
    } else if (inbound.media.length > 0 && !text && !structured) {
      return [{ body: p.bot.imageAck }];
    }
    if (!text && !audio && !structured) return [{ body: p.bot.welcome }];

    const out = await app.chat.handle({
      user, ...(text ? { text } : {}), ...(structured ? { structured } : {}), ...(audio ? { audio } : {}), wantAudio: Boolean(audio),
    });

    const msgs: OutboundMessage[] = [];
    let body = out.replyText;
    if (out.suggestedReplies.length > 0) body += `\n\n${p.wa.options}\n${numbered(out.suggestedReplies.map((s) => s.label))}`;
    // The spoken reply is attached only when the server has a TTS voice; otherwise text alone is the honest answer.
    const mediaUrl = out.audioUrl ? `${env.PUBLIC_BASE_URL.replace(/\/$/, '')}${out.audioUrl}` : undefined;
    msgs.push({ body, ...(mediaUrl ? { mediaUrl } : {}) });

    // A finished guide delivers its kit as a PDF the user can open and keep.
    if (out.ui.guide?.done) {
      const token = signKitToken(user._id, out.ui.guide.applicationId, out.language);
      msgs.push({
        body: `${pack(out.language).wa.kitReady}`,
        mediaUrl: `${env.PUBLIC_BASE_URL.replace(/\/$/, '')}/api/applications/${out.ui.guide.applicationId}/kit.pdf?t=${encodeURIComponent(token)}`,
      });
    }
    void WHATSAPP_MAX_CHARS; void DEMO_LANGUAGE_CODES;
    return msgs;
  }

  return r;
}
