'use strict';

/**
 * Localised, offline content: safety advice per level, decoy fallback lines and the
 * 1930 complaint draft. Used when Gemini is unavailable and to keep advice consistent.
 */

const { safeLang } = require('./languages');

/** Languages with hand-written offline text. Others use Gemini, or English offline. */
const OFFLINE_LANGS = Object.freeze(['en', 'ta', 'hi']);

/**
 * Pick the offline table for a language, falling back to English.
 * @template T
 * @param {Record<string, T>} table
 * @param {unknown} lang
 * @returns {T}
 */
const localized = (table, lang) => table[safeLang(lang)] || table.en;

const VERDICT = Object.freeze({
  en: {
    safe: 'Looks safe. No common scam pattern found — still never share OTPs.',
    suspicious: 'Be careful. This message has warning signs. Verify before you act.',
    high: 'Likely a SCAM. Do not pay, do not share OTP, do not click links.',
    critical: 'DANGER — this is almost certainly a SCAM. Stop now and hang up.',
  },
  ta: {
    safe: 'பாதுகாப்பாகத் தெரிகிறது. இருந்தாலும் OTP-ஐ யாரிடமும் சொல்லாதீர்கள்.',
    suspicious: 'கவனம். இந்த செய்தியில் எச்சரிக்கை அறிகுறிகள் உள்ளன. சரிபார்த்த பின் செயல்படுங்கள்.',
    high: 'இது மோசடியாக இருக்கலாம். பணம் அனுப்பாதீர்கள், OTP சொல்லாதீர்கள், லிங்கை தொடாதீர்கள்.',
    critical: 'ஆபத்து! இது நிச்சயமாக மோசடி. உடனே அழைப்பை துண்டியுங்கள்.',
  },
  hi: {
    safe: 'सुरक्षित लगता है। फिर भी किसी को OTP न बताएं।',
    suspicious: 'सावधान। इस संदेश में चेतावनी के संकेत हैं। कुछ करने से पहले जांच लें।',
    high: 'यह धोखाधड़ी हो सकती है। पैसे न भेजें, OTP न बताएं, लिंक न खोलें।',
    critical: 'खतरा! यह लगभग निश्चित रूप से धोखाधड़ी है। तुरंत कॉल काट दें।',
  },
});

const STEPS = Object.freeze({
  en: [
    'Hang up or stop replying. Real police never arrest anyone on a video call.',
    'If money was sent, call 1930 immediately — the first hour matters most.',
    'Report the number on Sanchar Saathi "Chakshu" and file at cybercrime.gov.in.',
    'Tell a family member you trust before doing anything else.',
  ],
  ta: [
    'அழைப்பை துண்டியுங்கள். உண்மையான போலீஸ் வீடியோ அழைப்பில் கைது செய்ய மாட்டார்கள்.',
    'பணம் அனுப்பியிருந்தால் உடனே 1930-க்கு அழையுங்கள் — முதல் ஒரு மணி நேரம் முக்கியம்.',
    'சஞ்சார் சாத்தி "சக்ஷு"வில் எண்ணை புகாரளித்து cybercrime.gov.in-ல் புகார் கொடுங்கள்.',
    'எதுவும் செய்வதற்கு முன் நம்பிக்கையான குடும்ப உறுப்பினரிடம் சொல்லுங்கள்.',
  ],
  hi: [
    'कॉल काटें या जवाब देना बंद करें। असली पुलिस वीडियो कॉल पर गिरफ्तार नहीं करती।',
    'अगर पैसे भेज दिए हैं तो तुरंत 1930 पर कॉल करें — पहला घंटा सबसे ज़रूरी है।',
    'संचार साथी "चक्षु" पर नंबर की शिकायत करें और cybercrime.gov.in पर रिपोर्ट दर्ज करें।',
    'कुछ भी करने से पहले किसी भरोसेमंद परिवार वाले को बताएं।',
  ],
});

const DECOY_FALLBACK = Object.freeze({
  en: [
    'Oh dear, wait wait, let me find my reading glasses… which bank did you say you are calling from, kanna?',
    'My grandson set up this phone, I only know the green button. Can you explain slowly what "UPI" means?',
    'Hold on, the pressure cooker is whistling! Now, you were saying the parcel had what inside?',
    'Officer sir, my late husband was also in government service. Which office are you in exactly?',
  ],
  ta: [
    'அய்யோ, கொஞ்சம் பொறு கண்ணா, கண்ணாடி எங்கே வைத்தேன்… எந்த பேங்க்ல இருந்து பேசுறீங்க சொன்னீங்க?',
    'என் பேரன் தான் இந்த போனை செட் பண்ணான், எனக்கு பச்சை பட்டன் மட்டும் தெரியும். UPI-ன்னா என்னப்பா?',
    'இருங்க, குக்கர் விசில் அடிக்குது! ம்ம், அந்த பார்சல்ல என்ன இருந்ததுன்னு சொன்னீங்க?',
    'சார், என் வீட்டுக்காரரும் அரசு வேலையில தான் இருந்தார். நீங்க எந்த ஆபீஸ்ல இருக்கீங்க?',
  ],
  hi: [
    'अरे बेटा, रुको ज़रा, मेरा चश्मा कहाँ गया… तुम कौन से बैंक से बोल रहे हो, फिर से बताना?',
    'ये फोन मेरे पोते ने सेट किया है, मुझे बस हरा बटन आता है। ये UPI क्या होता है, धीरे से समझाओ?',
    'रुको, कुकर की सीटी बज रही है! हाँ, तुम कह रहे थे पार्सल में क्या मिला?',
    'साहब, मेरे पति भी सरकारी नौकरी में थे। आप किस दफ़्तर में हो, ठीक से बताओ?',
  ],
});

/**
 * Pick a deterministic fallback line so a conversation still varies turn by turn.
 * @param {string} lang
 * @param {number} turn
 */
function decoyFallback(lang, turn) {
  const lines = localized(DECOY_FALLBACK, lang);
  const i = Math.abs(Math.trunc(Number(turn) || 0)) % lines.length;
  return lines[i];
}

/**
 * Build a ready-to-paste complaint for the National Cyber Crime Reporting Portal.
 * @param {{text: string, score: number, scamType: string, indicators: ReturnType<typeof import('./extract').extractIndicators>, now?: Date}} p
 */
function buildComplaint({ text, score, scamType, indicators, now = new Date() }) {
  const list = (label, arr) => (arr.length ? `${label}: ${arr.join(', ')}` : null);
  const excerpt = text.length > 600 ? `${text.slice(0, 600)}…` : text;
  const lines = [
    'NATIONAL CYBER CRIME REPORTING PORTAL — COMPLAINT DRAFT (prepared by Chat_Safe)',
    `Date/time noted: ${now.toISOString()}`,
    `Suspected category: ${scamType}`,
    `Chat_Safe risk score: ${score}/100`,
    '',
    'Suspect identifiers:',
    list('  UPI IDs', indicators.upiIds),
    list('  Phone numbers', indicators.phones),
    list('  Bank accounts', indicators.accounts),
    list('  IFSC', indicators.ifsc),
    list('  Links', indicators.urls),
    list('  Amounts mentioned', indicators.amounts),
    '',
    'Message / call transcript excerpt:',
    excerpt,
    '',
    'Next: call 1930 (if money was lost), file at https://cybercrime.gov.in, report the number at https://sancharsaathi.gov.in (Chakshu).',
  ];
  return lines.filter((l) => l !== null).join('\n');
}

const AGENT_FALLBACK = Object.freeze({
  en: [
    "I'm Kavach, your cyber-safety guardian. Read me or paste any message, call or payment request and I'll check it for scams.",
    'Tip: real banks, police and courier companies never ask for OTP, PIN or money over a phone or video call.',
    'Tip: before paying for stock tips or a trading account, check that the UPI ID ends in "@valid" — use my Pay-Check tab.',
    'Tip: if you already sent money, call 1930 within the first hour. Fast reporting can freeze the scammer\'s account.',
  ],
  ta: [
    'நான் கவச், உங்கள் சைபர் பாதுகாவலன். எந்த செய்தி, அழைப்பு அல்லது பண கோரிக்கையையும் சொல்லுங்கள், மோசடியா என்று சரிபார்க்கிறேன்.',
    'குறிப்பு: உண்மையான வங்கி, போலீஸ், கூரியர் யாரும் போனில் OTP, PIN அல்லது பணம் கேட்க மாட்டார்கள்.',
    'குறிப்பு: பங்கு டிப்ஸுக்கு பணம் அனுப்பும் முன் UPI ஐடி "@valid" என்று முடிகிறதா பாருங்கள்.',
    'குறிப்பு: பணம் அனுப்பிவிட்டால் முதல் ஒரு மணி நேரத்தில் 1930-க்கு அழையுங்கள்.',
  ],
  hi: [
    'मैं कवच हूँ, आपका साइबर सुरक्षा रक्षक। कोई भी संदेश, कॉल या पेमेंट रिक्वेस्ट बताइए, मैं स्कैम की जांच करूँगा।',
    'सुझाव: असली बैंक, पुलिस या कूरियर कभी फोन पर OTP, PIN या पैसे नहीं मांगते।',
    'सुझाव: स्टॉक टिप के लिए पैसे भेजने से पहले देखें कि UPI आईडी "@valid" पर खत्म होती है या नहीं।',
    'सुझाव: अगर पैसे भेज दिए हैं तो पहले घंटे में 1930 पर कॉल करें।',
  ],
});

/** Offline answers to the most common questions, matched by keywords in any of the three scripts. */
const AGENT_FAQ = Object.freeze([
  {
    match: /digital\s*arrest|डिजिटल\s*अरेस्ट|டிஜிட்டல்\s*கைது/i,
    en: '"Digital arrest" is a scam. Fake CBI, police or customs officers keep you on a video call and demand money. Real police never arrest anyone on a video call. Hang up and call 1930.',
    ta: '"டிஜிட்டல் கைது" ஒரு மோசடி. போலி CBI, போலீஸ் வீடியோ அழைப்பில் வைத்து பணம் கேட்பார்கள். உண்மையான போலீஸ் வீடியோ அழைப்பில் கைது செய்ய மாட்டார்கள். துண்டித்து 1930-க்கு அழையுங்கள்.',
    hi: '"डिजिटल अरेस्ट" एक धोखा है। नकली CBI या पुलिस वीडियो कॉल पर रोककर पैसे मांगते हैं। असली पुलिस वीडियो कॉल पर गिरफ्तार नहीं करती। कॉल काटें और 1930 पर कॉल करें।',
  },
  {
    match: /sent\s*money|lost\s*money|cheated|पैसे\s*भेज|ठग\s*को|பணம்\s*அனுப்பி/i,
    en: 'Act fast. Call 1930 now — the first hour matters most. Then call your bank to block the transaction and file a complaint at cybercrime.gov.in. Keep screenshots of every message.',
    ta: 'உடனே செயல்படுங்கள். இப்போதே 1930-க்கு அழையுங்கள் — முதல் ஒரு மணி நேரம் முக்கியம். பின் உங்கள் வங்கியை அழைத்து பரிவர்த்தனையை நிறுத்தி, cybercrime.gov.in-ல் புகார் கொடுங்கள்.',
    hi: 'जल्दी करें। अभी 1930 पर कॉल करें — पहला घंटा सबसे ज़रूरी है। फिर बैंक को कॉल करके ट्रांज़ैक्शन रुकवाएं और cybercrime.gov.in पर शिकायत करें। सभी संदेशों के स्क्रीनशॉट रखें।',
  },
  {
    match: /\bbank\b|बैंक|வங்கி/i,
    en: 'Hang up and call the number printed on the back of your card or in your bank app. A real bank will never ask for your OTP, PIN, CVV or ask you to install an app.',
    ta: 'அழைப்பை துண்டித்து, உங்கள் கார்டின் பின்புறம் அல்லது வங்கி ஆப்பில் உள்ள எண்ணுக்கு நீங்களே அழையுங்கள். உண்மையான வங்கி OTP, PIN, CVV கேட்காது.',
    hi: 'कॉल काटें और अपने कार्ड के पीछे या बैंक ऐप में दिए नंबर पर खुद कॉल करें। असली बैंक कभी OTP, PIN, CVV नहीं मांगता, न ही कोई ऐप डाउनलोड करवाता है।',
  },
]);

/**
 * Offline reply for the voice agent when the AI is not available.
 * Answers common questions first, then cycles through safety tips.
 * @param {string} lang
 * @param {number} turn
 * @param {string} [question]
 */
function agentFallback(lang, turn, question = '') {
  const faq = AGENT_FAQ.find((f) => f.match.test(question));
  if (faq) return faq[safeLang(lang)] || faq.en;
  const lines = localized(AGENT_FALLBACK, lang);
  return lines[Math.abs(Math.trunc(Number(turn) || 0)) % lines.length];
}

module.exports = { OFFLINE_LANGS, safeLang, localized, VERDICT, STEPS, decoyFallback, agentFallback, buildComplaint };
