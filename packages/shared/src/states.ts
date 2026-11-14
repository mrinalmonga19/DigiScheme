import type { INDIAN_STATES } from './profile';

type State = (typeof INDIAN_STATES)[number];

/**
 * Names a person might use for each state, across English, Hindi and the demo languages.
 * Matching is by substring, so inflected forms ("தமிழ்நாட்டில்") are covered by listing a stem.
 * This feeds the offline NLU only; with Gemini live, extraction does not depend on it.
 */
export const STATE_ALIASES: Record<State, string[]> = {
  'Andhra Pradesh': ['andhra pradesh', 'andhra', 'आंध्र प्रदेश', 'आंध्रप्रदेश', 'ఆంధ్రప్రదేశ్', 'ఆంధ్ర', 'ಆಂಧ್ರ', 'ஆந்திர', 'ਆਂਧਰਾ', 'আন্ধ্র', 'આંધ્ર'],
  'Arunachal Pradesh': ['arunachal', 'अरुणाचल'],
  Assam: ['assam', 'असम', 'అస్సాం', 'ಅಸ್ಸಾಂ', 'அசாம்', 'ਅਸਮ', 'অসম', 'આસામ'],
  Bihar: ['bihar', 'बिहार', 'బీహార్', 'ಬಿಹಾರ', 'பீகார்', 'ਬਿਹਾਰ', 'বিহার', 'બિહાર'],
  Chhattisgarh: ['chhattisgarh', 'chattisgarh', 'छत्तीसगढ़', 'छत्तीसगढ'],
  Goa: ['goa', 'गोवा', 'ಗೋವಾ'],
  Gujarat: ['gujarat', 'गुजरात', 'గుజరాత్', 'ಗುಜರಾತ್', 'குஜராத்', 'ਗੁਜਰਾਤ', 'গুজরাট', 'ગુજરાત'],
  Haryana: ['haryana', 'हरियाणा', 'హర్యానా', 'ಹರಿಯಾಣ', 'ஹரியானா', 'ਹਰਿਆਣਾ', 'হরিয়ানা', 'હરિયાણા'],
  'Himachal Pradesh': ['himachal', 'हिमाचल', 'ਹਿਮਾਚਲ'],
  Jharkhand: ['jharkhand', 'झारखंड', 'ਝਾਰਖੰਡ'],
  Karnataka: ['karnataka', 'कर्नाटक', 'కర్ణాటక', 'ಕರ್ನಾಟಕ', 'கர்நாடக', 'ਕਰਨਾਟਕ', 'কর্ণাটক', 'કર્ણાટક'],
  Kerala: ['kerala', 'केरल', 'కేరళ', 'ಕೇರಳ', 'கேரள', 'ਕੇਰਲ', 'কেরল', 'કેરળ'],
  'Madhya Pradesh': ['madhya pradesh', 'मध्य प्रदेश', 'मध्यप्रदेश', 'మధ్యప్రదేశ్', 'ಮಧ್ಯ ಪ್ರದೇಶ', 'மத்திய பிரதேச', 'மத்தியப் பிரதேச', 'ਮੱਧ ਪ੍ਰਦੇਸ਼', 'মধ্য প্রদেশ', 'મધ્ય પ્રદેશ'],
  Maharashtra: ['maharashtra', 'महाराष्ट्र', 'మహారాష్ట్ర', 'ಮಹಾರಾಷ್ಟ್ರ', 'மகாராஷ்டிர', 'ਮਹਾਰਾਸ਼ਟਰ', 'মহারাষ্ট্র', 'મહારાષ્ટ્ર'],
  Manipur: ['manipur', 'मणिपुर'],
  Meghalaya: ['meghalaya', 'मेघालय'],
  Mizoram: ['mizoram', 'मिज़ोरम', 'मिजोरम'],
  Nagaland: ['nagaland', 'नागालैंड'],
  Odisha: ['odisha', 'orissa', 'ओडिशा', 'उड़ीसा', 'ఒడిశా', 'ಒಡಿಶಾ', 'ஒடிசா', 'ਓਡੀਸ਼ਾ', 'ওড়িশা', 'ઓડિશા'],
  Punjab: ['punjab', 'पंजाब', 'పంజాబ్', 'ಪಂಜಾಬ್', 'பஞ்சாப்', 'ਪੰਜਾਬ', 'পাঞ্জাব', 'પંજાબ'],
  Rajasthan: ['rajasthan', 'राजस्थान', 'రాజస్థాన్', 'ರಾಜಸ್ಥಾನ', 'ராஜஸ்தான்', 'ਰਾਜਸਥਾਨ', 'রাজস্থান', 'રાજસ્થાન'],
  Sikkim: ['sikkim', 'सिक्किम'],
  'Tamil Nadu': ['tamil nadu', 'tamilnadu', 'तमिलनाडु', 'తమిళనాడు', 'ತಮಿಳುನಾಡು', 'தமிழ்நாடு', 'தமிழ்நாட்ட', 'ਤਾਮਿਲਨਾਡੂ', 'তামিলনাড়ু', 'તમિલનાડુ'],
  Telangana: ['telangana', 'तेलंगाना', 'తెలంగాణ', 'ತೆಲಂಗಾಣ', 'தெலுங்கானா', 'ਤੇਲੰਗਾਨਾ', 'তেলঙ্গানা', 'તેલંગાણા'],
  Tripura: ['tripura', 'त्रिपुरा'],
  'Uttar Pradesh': ['uttar pradesh', 'उत्तर प्रदेश', 'उत्तरप्रदेश', 'ఉత్తర ప్రదేశ్', 'ಉತ್ತರ ಪ್ರದೇಶ', 'உத்தர பிரதேச', 'உத்தரப் பிரதேச', 'ਉੱਤਰ ਪ੍ਰਦੇਸ਼', 'উত্তর প্রদেশ', 'ઉત્તર પ્રદેશ'],
  Uttarakhand: ['uttarakhand', 'uttaranchal', 'उत्तराखंड', 'ఉత్తరాఖండ్', 'ಉತ್ತರಾಖಂಡ', 'உத்தரகண்ட்', 'ਉੱਤਰਾਖੰਡ'],
  'West Bengal': ['west bengal', 'bengal', 'पश्चिम बंगाल', 'పశ్చిమ బెంగాల్', 'ಪಶ್ಚಿಮ ಬಂಗಾಳ', 'மேற்கு வங்க', 'ਪੱਛਮੀ ਬੰਗਾਲ', 'পশ্চিমবঙ্গ', 'পশ্চিম বাংলা', 'પશ્ચિમ બંગાળ'],
  'Andaman and Nicobar Islands': ['andaman', 'अंडमान'],
  Chandigarh: ['chandigarh', 'चंडीगढ़', 'चंडीगढ', 'ਚੰਡੀਗੜ੍ਹ'],
  'Dadra and Nagar Haveli and Daman and Diu': ['daman', 'dadra', 'दमन', 'दादरा'],
  Delhi: ['delhi', 'दिल्ली', 'ఢిల్లీ', 'ದೆಹಲಿ', 'ದಿಲ್ಲಿ', 'டெல்லி', 'ਦਿੱਲੀ', 'ਦਿੱਲੀ', 'দিল্লি', 'દિલ્હી'],
  'Jammu and Kashmir': ['jammu', 'kashmir', 'जम्मू', 'कश्मीर'],
  Ladakh: ['ladakh', 'लद्दाख'],
  Lakshadweep: ['lakshadweep', 'लक्षद्वीप'],
  Puducherry: ['puducherry', 'pondicherry', 'पुडुचेरी', 'पांडिचेरी', 'புதுச்சேரி'],
};

/** The state named in a free-text message, longest match first so "Uttar Pradesh" beats "Uttar". */
export function findState(text: string): State | undefined {
  const t = text.toLowerCase();
  let best: { state: State; len: number } | undefined;
  for (const [state, aliases] of Object.entries(STATE_ALIASES) as Array<[State, string[]]>) {
    for (const a of aliases) {
      const asciiAlias = /^[a-z ]+$/.test(a);
      // Latin names need word boundaries ("goa" must not match "goat"); Indic names are matched by stem.
      const hit = asciiAlias ? new RegExp(`(^|[^a-z])${a}([^a-z]|$)`).test(t) : t.includes(a);
      if (hit && (!best || a.length > best.len)) best = { state, len: a.length };
    }
  }
  return best?.state;
}
