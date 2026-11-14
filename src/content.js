'use strict';

/**
 * Localised, offline content: safety advice per level, decoy fallback lines and the
 * 1930 complaint draft. Used when Gemini is unavailable and to keep advice consistent.
 */

const SUPPORTED_LANGS = Object.freeze(['en', 'ta', 'hi']);

/** @param {unknown} lang */
const safeLang = (lang) => (SUPPORTED_LANGS.includes(/** @type {string} */ (lang)) ? /** @type {string} */ (lang) : 'en');

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
  const lines = DECOY_FALLBACK[safeLang(lang)];
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
    'NATIONAL CYBER CRIME REPORTING PORTAL — COMPLAINT DRAFT (prepared by CALLSAFE)',
    `Date/time noted: ${now.toISOString()}`,
    `Suspected category: ${scamType}`,
    `CALLSAFE risk score: ${score}/100`,
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

module.exports = { SUPPORTED_LANGS, safeLang, VERDICT, STEPS, decoyFallback, buildComplaint };
