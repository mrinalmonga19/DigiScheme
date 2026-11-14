/**
 * Application Kit PDF (spec 12): scheme, benefit, whitelisted official link with a QR code, document
 * checklist, prefilled values, steps, common mistakes, in the user's language plus English.
 * The Indic Noto fonts carry no Latin letters, so text is split into runs and each run is drawn
 * with the font that has its glyphs.
 */
import fs from 'node:fs';
import path from 'node:path';
import PDFDocument from 'pdfkit';
import QRCode from 'qrcode';
import { pack, tr, type Scheme } from '@digischeme/shared';
import { FONT_DIR } from '../config/paths';
import type { ApplicationEngine } from './applications';

const INDIGO = '#1F2761';
const SAFFRON = '#FF6B35';
const INK = '#1a1a2e';
const MUTED = '#5b5f77';

const SCRIPT_FONTS: Record<string, string> = {
  hi: 'NotoSansDevanagari-Regular.ttf', mr: 'NotoSansDevanagari-Regular.ttf', pa: 'NotoSansGurmukhi-Regular.ttf',
  ta: 'NotoSansTamil-Regular.ttf', kn: 'NotoSansKannada-Regular.ttf', bn: 'NotoSansBengali-Regular.ttf',
  te: 'NotoSansTelugu-Regular.ttf', gu: 'NotoSansGujarati-Regular.ttf',
};

const isIndic = (ch: string): boolean => {
  const c = ch.codePointAt(0)!;
  return (c >= 0x0900 && c <= 0x0dff) || c === 0x200c || c === 0x200d;
};

function runs(text: string): Array<{ text: string; indic: boolean }> {
  const out: Array<{ text: string; indic: boolean }> = [];
  for (const ch of text) {
    const indic = isIndic(ch);
    const last = out[out.length - 1];
    if (last && last.indic === indic) last.text += ch;
    else out.push({ text: ch, indic });
  }
  return out;
}

export interface KitOptions { scheme: Scheme; lang: string }

export async function buildApplicationKit(engine: ApplicationEngine, userId: string, applicationId: string, lang: string): Promise<Buffer> {
  const data = await engine.kitData(userId, applicationId, lang);
  const { scheme } = data;
  const p = pack(lang);
  const en = pack('en');
  const local = lang !== 'en' && SCRIPT_FONTS[lang] !== undefined;
  const latinFont = path.join(FONT_DIR, 'NotoSans-Regular.ttf');
  const boldFont = path.join(FONT_DIR, 'NotoSans-Bold.ttf');
  const scriptFont = local ? path.join(FONT_DIR, SCRIPT_FONTS[lang]!) : latinFont;
  for (const f of [latinFont, boldFont, scriptFont]) if (!fs.existsSync(f)) throw new Error(`Missing font ${f}`);

  const doc = new PDFDocument({
    size: 'A4', margins: { top: 48, left: 48, right: 48, bottom: 84 }, bufferPages: true,
    info: { Title: `${en.kit.title}: ${scheme.name.en}`, Author: 'DigiScheme', Subject: 'Application guide (prepared, not submitted)' },
  });
  const chunks: Buffer[] = [];
  doc.on('data', (c: Buffer) => chunks.push(c));
  const done = new Promise<Buffer>((resolve) => doc.on('end', () => resolve(Buffer.concat(chunks))));

  const W = doc.page.width - 96;

  /** Draw mixed-script text, switching font per run. */
  const write = (text: string, opts: { size?: number; color?: string; bold?: boolean; width?: number; x?: number; gap?: number } = {}) => {
    const size = opts.size ?? 11;
    const rs = runs(text);
    const x = opts.x ?? doc.page.margins.left;
    rs.forEach((r, i) => {
      doc.font(r.indic ? scriptFont : opts.bold ? boldFont : latinFont).fontSize(size).fillColor(opts.color ?? INK);
      const last = i === rs.length - 1;
      if (i === 0) doc.text(r.text, x, doc.y, { width: opts.width ?? W, continued: !last, lineGap: 2 });
      else doc.text(r.text, { continued: !last, lineGap: 2 });
    });
    if (rs.length === 0) doc.moveDown(0.2);
    doc.moveDown(opts.gap ?? 0.35);
  };

  const heading = (local: string, english: string) => {
    doc.moveDown(0.5);
    const y = doc.y;
    doc.rect(doc.page.margins.left, y, 4, 16).fill(SAFFRON);
    doc.y = y;
    write(local, { size: 13, bold: true, color: INDIGO, x: doc.page.margins.left + 10, width: W - 10, gap: 0.1 });
    if (lang !== 'en' && english !== local) write(english, { size: 9, color: MUTED, x: doc.page.margins.left + 10, width: W - 10, gap: 0.3 });
    else doc.moveDown(0.2);
  };

  // ----- Header band -----
  doc.rect(0, 0, doc.page.width, 78).fill(INDIGO);
  doc.font(boldFont).fontSize(20).fillColor('#ffffff').text('DigiScheme', 48, 22);
  doc.fontSize(11).fillColor('#ffd2c2').text(en.ui.tagline, 48, 48, { width: W });
  doc.y = 96;
  write(p.kit.title, { size: 20, bold: true, color: INDIGO, gap: 0.1 });
  if (lang !== 'en') write(en.kit.title, { size: 10, color: MUTED });
  write(`${p.kit.prepared}  ·  ${new Date().toISOString().slice(0, 10)}`, { size: 9, color: MUTED });

  // ----- Scheme + benefit -----
  const schemeStartY = doc.y;
  write(tr(scheme.name, lang), { size: 16, bold: true, gap: 0.1, width: W - 130 });
  if (lang !== 'en') write(scheme.name.en, { size: 10, color: MUTED, width: W - 130 });
  write(`${p.kit.benefit}: ${tr(scheme.benefitSummary, lang)}`, { width: W - 130 });
  if (lang !== 'en') write(`${en.kit.benefit}: ${scheme.benefitSummary.en}`, { size: 9, color: MUTED, width: W - 130 });
  write(scheme.ministry, { size: 9, color: MUTED, width: W - 130 });

  // ----- Official link + QR (whitelisted only) -----
  if (data.link) {
    const qr = await QRCode.toBuffer(data.link.url, { margin: 1, width: 220, color: { dark: INDIGO, light: '#ffffff' } });
    doc.image(qr, doc.page.width - 48 - 110, schemeStartY, { width: 110 });
    doc.font(latinFont).fontSize(7).fillColor(MUTED).text(en.kit.scanQr, doc.page.width - 48 - 120, schemeStartY + 112, { width: 130, align: 'center' });
    doc.y = Math.max(doc.y, schemeStartY + 128);
    heading(p.kit.officialLink, en.kit.officialLink);
    write(`${data.link.label}: ${data.link.url}`, { color: INDIGO });
  } else {
    heading(p.kit.officialLink, en.kit.officialLink);
    write(p.kit.noLink);
  }

  // ----- Checklist -----
  heading(p.bot.guideChecklist, en.bot.guideChecklist);
  data.checklist.forEach((item, i) => {
    const e = data.checklistEn[i]!;
    const status = item.available ? p.kit.have : `${p.kit.obtain}: ${item.howToGet}`;
    write(`${item.available ? '[x]' : '[  ]'}  ${item.name}${lang !== 'en' ? `  (${e.name})` : ''}`, { bold: true, gap: 0.05 });
    write(status, { size: 9.5, color: MUTED, x: doc.page.margins.left + 22, width: W - 22 });
  });

  // ----- Prefilled values -----
  if (data.prefilled.length > 0) {
    heading(p.kit.prefilled, en.kit.prefilled);
    for (const row of data.prefilled) {
      write(`${row.officialFieldName}  →  ${row.value}${row.verified ? '  ✓' : ''}`, { gap: 0.15 });
    }
  }

  // ----- Steps -----
  heading(p.kit.steps, en.kit.steps);
  scheme.applicationSteps.forEach((s) => {
    write(`${s.step}. ${tr(s.title, lang)}`, { bold: true, gap: 0.05 });
    write(`${s.officialFieldName}`, { size: 9, color: MUTED, x: doc.page.margins.left + 14, width: W - 14, gap: 0.05 });
    write(tr(s.instruction, lang), { size: 10, x: doc.page.margins.left + 14, width: W - 14, gap: 0.1 });
    if (lang !== 'en' && s.instruction.en !== tr(s.instruction, lang)) {
      write(s.instruction.en, { size: 8.5, color: MUTED, x: doc.page.margins.left + 14, width: W - 14, gap: 0.1 });
    }
  });

  // ----- Common mistakes -----
  const mistakes = [...new Set(scheme.applicationSteps.flatMap((s) => s.commonMistakes))];
  if (mistakes.length > 0) {
    heading(p.kit.mistakes, en.kit.mistakes);
    mistakes.forEach((m) => write(`•  ${m}`, { size: 10, gap: 0.1 }));
  }
  if (scheme.notChecked.length > 0) {
    heading(p.kit.notChecked, en.kit.notChecked);
    scheme.notChecked.forEach((m) => write(`•  ${m}`, { size: 10, gap: 0.1 }));
  }

  // ----- Footer on every page -----
  const range = doc.bufferedPageRange();
  for (let i = range.start; i < range.start + range.count; i++) {
    doc.switchToPage(i);
    const bottom = doc.page.margins.bottom;
    doc.page.margins.bottom = 0; // otherwise writing near the edge spawns a blank page
    const y = doc.page.height - 56;
    doc.moveTo(48, y - 6).lineTo(doc.page.width - 48, y - 6).strokeColor(SAFFRON).lineWidth(1).stroke();
    doc.y = y;
    if (lang !== 'en') write(p.kit.footer, { size: 8, color: INDIGO, gap: 0.1 });
    write(en.kit.footer, { size: 8, color: MUTED, gap: 0 });
    doc.font(latinFont).fontSize(7).fillColor(MUTED).text(`${i + 1} / ${range.count}`, doc.page.width - 100, doc.page.height - 22, { width: 52, align: 'right' });
    doc.page.margins.bottom = bottom;
  }

  doc.end();
  return done;
}
