/**
 * Deterministic natural-language understanding for the mock LLM. It exists so the demo, the tests
 * and CI run with no API key and no network, in every demo language. It is deliberately modest:
 * numbers with units, yes/no, a handful of keyword lists per language. Gemini replaces it in
 * production; see docs/LIMITATIONS.md.
 */
import { findState, type FieldKey, type Scheme, type SchemeCategory } from '@digischeme/shared';
import { guessScheme } from '../trust/linkChecker';
import { extractUrls } from '../trust/extract';

export type Command =
  | 'apply' | 'next' | 'back' | 'repeat' | 'explain' | 'no_doc' | 'results' | 'verify' | 'tracker' | 'link'
  | 'greeting' | 'medical_legal' | 'distress' | 'out_of_scope';

export interface NluInput {
  text: string;
  expecting: FieldKey | null;
  inApplication: boolean;
  schemes: Scheme[];
}
export interface NluOutput {
  fields: Partial<Record<FieldKey, unknown>>;
  command?: Command;
  slug?: string;
  intent: SchemeCategory[];
}

const words = (s: string): string[] => s.split(/\s+/).filter(Boolean);

// Indic digits -> ASCII (every Indic digit block starts at an offset where cp % 16 === 6).
export function normaliseDigits(text: string): string {
  return text.replace(/\p{Nd}/gu, (ch) => {
    const cp = ch.codePointAt(0)!;
    return cp < 0x80 ? ch : String((cp % 16) - 6);
  });
}

const tokenize = (t: string): string[] => t.toLowerCase().split(/[^\p{L}\p{M}\p{N}]+/u).filter(Boolean);
const hasAny = (hay: string, list: string[]): boolean => list.some((w) => hay.includes(w));
const tokenIn = (tokens: string[], list: string[]): boolean => tokens.some((t) => list.includes(t));
const isAscii = (w: string): boolean => /^[a-z0-9₹.]+$/.test(w);
/** Unit and age words: Latin words must match a whole token; Indic words match by stem so inflected forms count. */
const hasWord = (hay: string, list: string[]): boolean => {
  const toks = tokenize(hay);
  return list.some((w) => (isAscii(w) ? toks.includes(w) || (w === '₹' && hay.includes('₹')) : toks.some((t) => t.startsWith(w))));
};

const YES = words('yes y yeah yep ok okay sure haan han ji हाँ हां जी हो होय ਹਾਂ ਜੀ ஆம் ஆமா ಹೌದು হ্যাঁ হা అవును ఔను હા');
const NO = words('no nope nahi nahin नहीं नही नाही नको ਨਹੀਂ ਨਹੀ இல்லை இல்ல ಇಲ್ಲ না లేదు ના');

const AGE_WORDS = words('years year yrs yr old aged age साल वर्ष उम्र आयु वय वर्षांचा वर्षांची ਸਾਲ ਉਮਰ ਵਰ੍ਹੇ வயது வயதுடைய வயசு வயதில் ವರ್ಷ ವಯಸ್ಸು ವಯಸ್ಸಿನ বছর বয়স সালের సంవత్సరాల సంవత్సర ఏళ్ళు ఏళ్లు వయస్సు వయసు વર્ષ ઉંમર વય');
const MONEY_WORDS = words('rupees rupee rs inr ₹ रुपये रुपए रुपया ਰੁਪਏ ਰੁਪਈਆ ரூபாய் ರೂಪಾಯಿ ರೂ টাকা రూపాయలు రూపాయ రూ રૂપિયા');
const INCOME_WORDS = words('income earn earning earnings salary आय कमाई आमदनी ਆਮਦਨ ਕਮਾਈ வருமானம் ஆதாயம் ಆದಾಯ ಗಳಿಕೆ আয় আয়ের ఆదాయం આવક કમાણી उत्पन्न उत्पन्न');
const LAKH = words('lakh lakhs lac lacs लाख ਲੱਖ லட்சம் ಲಕ್ಷ লক্ষ లక్ష లక్షల લાખ');
const THOUSAND = words('thousand k हज़ार हजार ਹਜ਼ਾਰ ஆயிரம் ಸಾವಿರ হাজার వేల వేలు હજાર');
const CRORE = words('crore करोड़ करोड ਕਰੋੜ கோடி ಕೋಟಿ কোটি కోట్ల કરોડ');
const MONTH_WORDS = words('month monthly महीना महीने मासिक ਮਹੀਨਾ ਮਹੀਨੇ மாதம் ಮಾಸಿಕ ತಿಂಗಳು মাস মাসিক నెల నెలకు મહિને માસિક');
const HECTARE = words('hectare hectares ha हेक्टेयर हेक्टर ਹੈਕਟੇਅਰ ஹெக்டேர் ಹೆಕ್ಟೇರ್ হেক্টর హెక్టార్లు హెక్టార్ હેક્ટર');
const ACRE = words('acre acres एकड़ एकड ਏਕੜ ஏக்கர் ಎಕರೆ একর ఎకరాలు ఎకరా એકર');

const BANK = ['bank', 'बैंक', 'ਬੈਂਕ', 'வங்கி', 'ಬ್ಯಾಂಕ್', 'ব্যাংক', 'బ్యాంకు', 'બેંક'];
const LPG = ['lpg', 'gas', 'गैस', 'ਗੈਸ', 'எரிவாயு', 'ಅನಿಲ', 'গ্যাস', 'గ్యాస్', 'ગેસ'];

const FEMALE = words('woman female girl lady महिला औरत स्त्री ਔਰਤ ਮਹਿਲਾ பெண் ಮಹಿಳೆ ಹೆಣ್ಣು নারী মহিলা స్త్రీ మహిళ સ્ત્રી મહિલા');
const MALE = words('man male boy gentleman पुरुष आदमी ਮਰਦ ஆண் ಪುರುಷ ಗಂಡು পুরুষ పురుషుడు પુરુષ');
const VILLAGE = ['village', 'rural', 'गाँव', 'गांव', 'ग्रामीण', 'ਪਿੰਡ', 'கிராம', 'ಹಳ್ಳಿ', 'ಗ್ರಾಮ', 'গ্রাম', 'గ్రామ', 'ગામ'];
const CITY = ['city', 'town', 'urban', 'शहर', 'ਸ਼ਹਿਰ', 'நகர', 'ನಗರ', 'ಪಟ್ಟಣ', 'শহর', 'పట్టణ', 'શહેર'];

const OCC = {
  street_vendor: ['street vendor', 'vendor', 'hawker', 'रेहड़ी', 'ठेला', 'फेरी', 'ਰੇਹੜੀ', 'ਫੇਰੀ', 'தெருவோர', 'ಬೀದಿ ಬದಿ', 'ফেরিওয়ালা', 'వీధి వ్యాపార', 'શેરી ફેરિયા', 'पथविक्रेता'],
  daily_wage: ['daily wage', 'dihadi', 'labour', 'laborer', 'labourer', 'मज़दूर', 'मजदूर', 'दिहाड़ी', 'ਮਜ਼ਦੂਰ', 'ਦਿਹਾੜੀ', 'கூலி', 'ಕೂಲಿ', 'দিনমজুর', 'শ্রমিক', 'मजूर', 'కూలీ', 'મજૂર'],
  farmer: ['farmer', 'kisan', 'cultivat', 'किसान', 'खेती', 'ਕਿਸਾਨ', 'ਖੇਤੀ', 'விவசாயி', 'விவசாய', 'ರೈತ', 'ಕೃಷಿ', 'কৃষক', 'চাষি', 'शेतकरी', 'రైతు', 'వ్యవసాయ', 'ખેડૂત'],
  student: ['student', 'विद्यार्थी', 'छात्र', 'छात्रा', 'ਵਿਦਿਆਰਥੀ', 'மாணவ', 'ವಿದ್ಯಾರ್ಥಿ', 'ছাত্র', 'ছাত্রী', 'విద్యార్థి', 'વિદ્યાર્થી'],
  homemaker: ['homemaker', 'housewife', 'गृहिणी', 'ਘਰੇਲੂ', 'இல்லத்தரசி', 'ಗೃಹಿಣಿ', 'গৃহিণী', 'గృహిణి', 'ગૃહિણી'],
  unemployed: ['unemployed', 'jobless', 'बेरोज़गार', 'बेरोजगार', 'ਬੇਰੁਜ਼ਗਾਰ', 'ನಿರುದ್ಯೋಗಿ', 'বেকার', 'నిరుద్యోగ', 'બેરોજગાર'],
  salaried: ['salaried', 'नौकरीपेशा', 'सरकारी नौकरी', 'private job'],
  senior: ['senior citizen', 'वरिष्ठ नागरिक', 'ਬਜ਼ੁਰਗ ਨਾਗਰਿਕ'],
  self_employed: ['self employed', 'self-employed', 'shop', 'business', 'दुकान', 'व्यापार', 'ਦੁਕਾਨ', 'ਕਾਰੋਬਾਰ', 'கடை', 'ಅಂಗಡಿ', 'দোকান', 'వ్యాపార', 'દુકાન'],
  artisan: ['artisan', 'carpenter', 'potter', 'blacksmith', 'tailor', 'weaver', 'बढ़ई', 'कुम्हार', 'लोहार', 'दर्ज़ी', 'सुनार', 'मोची', 'ਤਰਖਾਣ', 'ਦਰਜ਼ੀ', 'ਲੁਹਾਰ'],
};
const EDU = {
  postgrad: ['postgraduate', 'post graduate', 'masters', 'm.tech', 'mtech', 'mba', 'पोस्ट ग्रेजुएट'],
  college: ['engineering', 'college', 'degree', 'b.tech', 'btech', 'undergraduate', 'university', 'कॉलेज', 'इंजीनियरिंग', 'विश्वविद्यालय', 'ਕਾਲਜ', 'ਇੰਜੀਨੀਅਰਿੰਗ', 'கல்லூரி', 'பொறியியல்', 'ಕಾಲೇಜು', 'ಎಂಜಿನಿಯರಿಂಗ್', 'কলেজ', 'ইঞ্জিনিয়ারিং', 'ఇంజనీరింగ్', 'కళాశాల', 'કોલેજ', 'એન્જિનિયરિંગ'],
  diploma: ['diploma', 'iti', 'polytechnic', 'डिप्लोमा'],
  c12: ['class 12', '12th', 'plus two', '11th', 'class 11', 'बारहवीं', 'ग्यारहवीं'],
  c10: ['class 10', '10th', '9th', 'class 9', 'दसवीं', 'नौवीं'],
  c8: ['class 8', '8th', 'आठवीं'],
};

const INTENT: Array<[SchemeCategory[], string[]]> = [
  [['pension', 'social_security', 'health'], ['old age', 'pension', 'senior', 'retire', 'वृद्ध', 'बुढ़ापा', 'पेंशन', 'ਬੁਢਾਪਾ', 'ਪੈਨਸ਼ਨ', 'வயதான', 'முதியோர்', 'ಮುಪ್ಪು', 'ವೃದ್ಧ', 'ಪಿಂಚಣಿ', 'বার্ধক্য', 'বৃদ্ধ', 'పింఛను', 'వృద్ధ', 'વૃદ્ધ', 'પેન્શન']],
  [['education'], ['scholarship', 'study', 'fees', 'छात्रवृत्ति', 'पढ़ाई', 'ਵਜ਼ੀਫ਼ਾ', 'ਪੜ੍ਹਾਈ', 'உதவித்தொகை', 'ಶಿಷ್ಯವೇತನ', 'বৃত্তি', 'ఉపకార', 'શિષ્યવૃત્તિ']],
  [['finance'], ['loan', 'credit', 'लोन', 'ऋण', 'कर्ज', 'ਕਰਜ਼', 'கடன்', 'ಸಾಲ', 'ঋণ', 'రుణ', 'લોન']],
  [['health'], ['health', 'hospital', 'treatment', 'insurance', 'इलाज', 'अस्पताल', 'बीमा', 'ਇਲਾਜ', 'ਬੀਮਾ', 'மருத்துவ', 'காப்பீடு', 'ಆರೋಗ್ಯ', 'ವಿಮೆ', 'চিকিৎসা', 'ఆరోగ్య', 'આરોગ્ય']],
  [['housing'], ['house', 'housing', 'आवास', 'मकान', 'ਮਕਾਨ', 'வீடு', 'ಮನೆ', 'বাড়ি', 'ఇల్లు', 'ઘર']],
  [['employment'], ['job', 'employment', 'work', 'रोज़गार', 'रोजगार', 'ਰੁਜ਼ਗਾਰ', 'வேலைவாய்ப்பு', 'ಉದ್ಯೋಗ', 'কর্মসংস্থান', 'ఉపాధి', 'રોજગાર']],
  [['women_child'], ['pregnan', 'baby', 'daughter', 'गर्भ', 'बेटी', 'ਗਰਭ', 'ਧੀ', 'கர்ப்ப', 'மகள்', 'ಗರ್ಭ', 'ಮಗಳು', 'গর্ভ', 'গর্ভ', 'గర్భ', 'ગર્ભ']],
  [['agriculture'], ['crop', 'farm', 'फसल', 'खेती', 'ਫਸਲ', 'பயிர்', 'ಬೆಳೆ', 'ফসল', 'పంట', 'પાક']],
];

const CMD = {
  next: words('next continue proceed अगला अगले आगे ਅਗਲਾ ਅੱਗੇ அடுத்து ಮುಂದೆ ಮುಂದಿನ পরবর্তী এগিয়ে पुढे पुढील తరువాత ముందుకు આગળ પછી'),
  back: words('back previous पीछे पिछला ਪਿੱਛੇ ਪਿਛਲਾ பின்னால் முந்தைய ಹಿಂದೆ ಹಿಂದಿನ পিছনে আগের मागे మునుపటి వెనుకకు પાછળ'),
  repeat: words('repeat again दोहराओ दोहराएं दोबारा ਦੁਹਰਾਓ ਫਿਰ மீண்டும் ಪುನಃ ಮತ್ತೆ আবার पुन्हा మళ్ళీ ફરીથી'),
  explain: words('explain why समझाओ समझाइए ਸਮਝਾਓ விளக்கு விளக்குங்கள் ವಿವರಿಸಿ ব্যাখ্যা समजवा వివరించండి સમજાવો'),
};
const DOC_WORDS = ['document', 'दस्तावेज़', 'दस्तावेज', 'कागज', 'ਦਸਤਾਵੇਜ਼', 'ஆவண', 'ದಾಖಲೆ', 'নথি', 'कागदपत्र', 'పత్రం', 'દસ્તાવેજ', 'certificate', 'card', 'passbook'];
const NEG_PHRASE = ["don't have", 'do not have', 'dont have', 'no document', 'without', 'नहीं है', 'नहीं हैं', 'नहीं मिला', 'ਨਹੀਂ ਹੈ', 'இல்லை', 'ಇಲ್ಲ', 'নেই', 'नाही', 'లేదు', 'નથી'];
const APPLY = ['apply', 'application', 'help me apply', 'आवेदन', 'अर्जी', 'ਅਰਜ਼ੀ', 'ਅਪਲਾਈ', 'விண்ணப்ப', 'ಅರ್ಜಿ', 'আবেদন', 'अर्ज', 'దరఖాస్తు', 'અરજી'];
const RESULTS = ['show my', 'my schemes', 'results', 'what schemes', 'which schemes', 'योजनाएं', 'योजनाएँ', 'योजनाओं', 'ਸਕੀਮ', 'ਯੋਜਨਾਵਾਂ', 'திட்டங்கள', 'ಯೋಜನೆಗಳು', 'প্রকল্প', 'योजना दाखव', 'పథకాలు', 'યોજનાઓ'];
const VERIFY = ['digilocker', 'verify', 'सत्यापित', 'ਤਸਦੀਕ', 'சரிபார்', 'ಪರಿಶೀಲ', 'যাচাই', 'पडताळ', 'ధృవీక', 'ચકાસ'];
const TRACK = ['track', 'remind', 'reminder', 'ट्रैक', 'याद दिला', 'ਯਾਦ', 'நினைவூட்ட', 'ಜ್ಞಾಪನೆ', 'মনে করিয়ে', 'आठवण', 'గుర్తు', 'યાદ'];
const SCAM = ['scam', 'fraud', 'fake', 'is this real', 'ठगी', 'धोखा', 'फर्जी', 'नकली', 'ਧੋਖਾ', 'ਠੱਗੀ', 'மோசடி', 'ಮೋಸ', 'প্রতারণা', 'फसवणूक', 'మోసం', 'છેતરપિંડી'];
const GREETING = words('hi hello hey namaste नमस्ते नमस्कार ਸਤ ਸ੍ਰੀ ਅਕਾਲ ਨਮਸਤੇ வணக்கம் ನಮಸ್ಕಾರ নমস্কার নমস্তে నమస్కారం నమస్తే નમસ્તે');
const MEDICAL_LEGAL = ['doctor', 'medicine', 'which tablet', 'diagnos', 'lawyer', 'court case', 'sue ', 'वकील', 'अदालत', 'दवा', 'ਵਕੀਲ', 'ਅਦਾਲਤ', 'ਦਵਾਈ', 'மருந்து', 'வழக்கறிஞர்', 'ವಕೀಲ', 'ওষুধ', 'উকিল'];
const DISTRESS = ['hungry', 'no food', 'lost my job', 'very sad', 'cannot cope', 'भूखा', 'भूखे', 'परेशान', 'ਭੁੱਖਾ', 'ਪਰੇਸ਼ਾਨ', 'பசி', 'ಹಸಿವು', 'ক্ষুধার্ত', 'ఆకలి', 'ભૂખ'];

/** Pull numbers out of text, keeping their positions so units can be matched to them. */
function numbers(text: string): Array<{ value: number; start: number; end: number }> {
  const out: Array<{ value: number; start: number; end: number }> = [];
  for (const m of text.matchAll(/\d[\d,]*(?:\.\d+)?/g)) {
    const value = Number(m[0].replace(/,/g, ''));
    if (Number.isFinite(value)) out.push({ value, start: m.index, end: m.index + m[0].length });
  }
  return out;
}

const after = (text: string, end: number, n: number): string => text.slice(end, end + n).toLowerCase();
const before = (text: string, start: number, n: number): string => text.slice(Math.max(0, start - n), start).toLowerCase();

function parseIncome(text: string, expecting: FieldKey | null, claimed: Set<number>): number | undefined {
  const nums = numbers(text);
  for (const [i, n] of nums.entries()) {
    if (claimed.has(i)) continue;
    const tail = after(text, n.end, 14);
    const head = before(text, n.start, 22);
    const money = hasWord(tail, MONEY_WORDS) || head.includes('₹') || /\brs\.?\s*$/.test(head) || hasWord(tail, LAKH) || hasWord(tail, CRORE);
    const incomeCue = hasWord(head, INCOME_WORDS) || hasWord(after(text, n.end, 30), INCOME_WORDS);
    if (!money && !incomeCue && !(expecting === 'annualFamilyIncome')) continue;
    let v = n.value;
    if (hasWord(tail, CRORE)) v *= 10_000_000;
    else if (hasWord(tail, LAKH)) v *= 100_000;
    else if (hasWord(tail, THOUSAND)) v *= 1000;
    if (hasWord(text, MONTH_WORDS)) v *= 12;
    claimed.add(i);
    return Math.round(v);
  }
  return undefined;
}

function parseAge(text: string, expecting: FieldKey | null, claimed: Set<number>): number | undefined {
  const nums = numbers(text);
  for (const [i, n] of nums.entries()) {
    if (claimed.has(i) || n.value < 0 || n.value > 120 || !Number.isInteger(n.value)) continue;
    const tail = after(text, n.end, 16);
    const head = before(text, n.start, 16);
    const ageCue = hasWord(tail, AGE_WORDS) || hasWord(head, AGE_WORDS) || /(?:i am|i'm|im)\s*$/.test(head);
    if (ageCue && !hasWord(tail, MONEY_WORDS) && !hasWord(tail, HECTARE)) { claimed.add(i); return n.value; }
    if (expecting === 'age' && nums.length === 1) { claimed.add(i); return n.value; }
  }
  return undefined;
}

function parseLand(text: string, expecting: FieldKey | null, claimed: Set<number>): number | undefined {
  const lower = text.toLowerCase();
  if (hasAny(lower, ['landless', 'no land', 'भूमिहीन', 'ज़मीन नहीं', 'जमीन नहीं'])) return 0;
  const nums = numbers(text);
  for (const [i, n] of nums.entries()) {
    if (claimed.has(i)) continue;
    const tail = after(text, n.end, 16);
    if (hasWord(tail, HECTARE)) { claimed.add(i); return n.value; }
    if (hasWord(tail, ACRE)) { claimed.add(i); return Math.round(n.value * 0.4047 * 100) / 100; }
    if (expecting === 'landholdingHectares' && nums.length === 1) { claimed.add(i); return n.value; }
  }
  return undefined;
}

export function nlu(input: NluInput): NluOutput {
  const raw = input.text.trim();
  const text = normaliseDigits(raw);
  const lower = text.toLowerCase();
  const tokens = tokenize(text);
  const out: NluOutput = { fields: {}, intent: [] };
  const f = out.fields;

  for (const [cats, kws] of INTENT) if (hasAny(lower, kws)) out.intent.push(...cats);

  // ---- A pasted link or "is this a scam?" is a link check and nothing else. ----
  if (extractUrls(text).length > 0 || (hasAny(lower, SCAM) && /[a-z0-9-]+\.[a-z]{2,}/i.test(lower))) {
    out.command = 'link';
    return out;
  }

  // ---- Inside an application, text is navigation. ----
  if (input.inApplication) {
    const docMention = hasAny(lower, DOC_WORDS) && hasAny(lower, NEG_PHRASE);
    if (docMention || hasAny(lower, ["i don't have", 'i do not have'])) out.command = 'no_doc';
    else if (tokenIn(tokens, CMD.explain)) out.command = 'explain';
    else if (tokenIn(tokens, CMD.back)) out.command = 'back';
    else if (tokenIn(tokens, CMD.repeat)) out.command = 'repeat';
    else if (tokenIn(tokens, CMD.next)) out.command = 'next';
    else if (hasAny(lower, TRACK)) out.command = 'tracker';
    else out.command = 'repeat'; // anything else: show the current step again rather than guess
    return out;
  }

  // ---- Profile facts ----
  const claimed = new Set<number>();
  const income = parseIncome(text, input.expecting, claimed);
  if (income !== undefined) f.annualFamilyIncome = income;
  const land = parseLand(text, input.expecting, claimed);
  if (land !== undefined) f.landholdingHectares = land;
  const age = parseAge(text, input.expecting, claimed);
  if (age !== undefined) f.age = age;

  const state = findState(text);
  if (state) f.state = state;

  if (hasAny(lower, OCC.street_vendor)) { f.isStreetVendor = true; f.occupation = 'self_employed'; }
  else if (hasAny(lower, OCC.daily_wage)) f.occupation = 'daily_wage_worker';
  else if (hasAny(lower, OCC.farmer)) f.occupation = 'farmer';
  else if (hasAny(lower, OCC.student)) f.occupation = 'student';
  else if (hasAny(lower, OCC.homemaker)) f.occupation = 'homemaker';
  else if (hasAny(lower, OCC.unemployed)) f.occupation = 'unemployed';
  else if (hasAny(lower, OCC.senior)) f.occupation = 'senior_citizen';
  else if (hasAny(lower, OCC.salaried)) f.occupation = 'salaried';
  else if (hasAny(lower, OCC.artisan)) { f.isArtisan = true; f.occupation = 'self_employed'; }
  else if (hasAny(lower, OCC.self_employed)) f.occupation = 'self_employed';

  if (f.occupation === 'student' || hasAny(lower, EDU.college) || hasAny(lower, EDU.diploma) || hasAny(lower, EDU.c12) || hasAny(lower, EDU.c10) || hasAny(lower, EDU.c8)) {
    if (hasAny(lower, EDU.postgrad)) f.educationLevel = 'postgraduate';
    else if (hasAny(lower, EDU.college)) f.educationLevel = 'undergraduate';
    else if (hasAny(lower, EDU.diploma)) f.educationLevel = 'diploma';
    else if (hasAny(lower, EDU.c12)) f.educationLevel = 'class_11_12';
    else if (hasAny(lower, EDU.c10)) f.educationLevel = 'class_9_10';
    else if (hasAny(lower, EDU.c8)) f.educationLevel = 'class_8';
  }

  // Category: upper-case tokens are unambiguous ("SC", "OBC"); lower-case only when we just asked.
  const upperTokens = text.split(/[^A-Za-z]+/).filter(Boolean);
  for (const c of ['SC', 'ST', 'OBC', 'EWS'] as const) {
    if (upperTokens.includes(c) || (input.expecting === 'category' && tokens.includes(c.toLowerCase()))) { f.category = c; break; }
  }
  if (!f.category && (hasAny(lower, ['general category', 'general caste', 'सामान्य श्रेणी']) || (input.expecting === 'category' && tokens.includes('general')))) f.category = 'General';

  if (tokenIn(tokens, FEMALE)) f.gender = 'female';
  else if (tokenIn(tokens, MALE)) f.gender = 'male';

  if (hasAny(lower, VILLAGE)) f.residence = 'rural';
  else if (hasAny(lower, CITY)) f.residence = 'urban';

  // ---- Yes / no, applied to what we just asked (or to a topic named in the same sentence) ----
  const yes = tokenIn(tokens, YES);
  const no = tokenIn(tokens, NO);
  if (yes !== no) {
    const answer = yes;
    if (hasAny(lower, BANK)) f.hasBankAccount = answer;
    else if (hasAny(lower, LPG)) f.hasLPGConnection = answer;
    else if (input.expecting && isBooleanField(input.expecting) && f[input.expecting] === undefined) f[input.expecting] = answer;
  } else if (hasAny(lower, BANK) && !yes && !no && input.expecting === 'hasBankAccount') {
    f.hasBankAccount = true;
  }

  // ---- Commands (only when nothing else explains the message) ----
  const slug = guessScheme(lower, input.schemes)?.slug;
  if (slug) out.slug = slug;
  const hasFacts = Object.keys(f).length > 0;
  if (hasAny(lower, VERIFY)) out.command = 'verify';
  else if (hasAny(lower, TRACK)) out.command = 'tracker';
  else if (hasAny(lower, APPLY) && (!hasFacts || out.slug)) out.command = 'apply';
  else if (hasAny(lower, RESULTS)) out.command = 'results';
  else if (!hasFacts && hasAny(lower, MEDICAL_LEGAL)) out.command = 'medical_legal';
  else if (hasAny(lower, DISTRESS)) out.command = 'distress';
  else if (!hasFacts && tokenIn(tokens, GREETING)) out.command = 'greeting';
  else if (!hasFacts && out.intent.length === 0 && tokens.length > 0) out.command = 'out_of_scope';
  return out;
}

const BOOLEAN_FIELDS: FieldKey[] = [
  'hasBankAccount', 'hasLPGConnection', 'hasPuccaHouse', 'isIncomeTaxPayer', 'isEPFOMember', 'isBPL', 'isGovtEmployee',
  'isStreetVendor', 'isArtisan', 'isPregnantOrNewMother', 'hasGirlChildUnder10', 'isCAPFWard', 'isHeadOfFamily',
  'hasDisability', 'class12Above80thPercentile',
];
export const isBooleanField = (k: FieldKey): boolean => BOOLEAN_FIELDS.includes(k);
