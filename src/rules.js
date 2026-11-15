'use strict';

/**
 * Offline, deterministic scam-detection engine.
 * Works without any API key so the app never fails in a demo or on a slow network.
 * Patterns cover English, Hinglish, Hindi (Devanagari), Tanglish and Tamil script.
 */

/** @typedef {{id: string, label: string, weight: number, patterns: RegExp[]}} Rule */

/** @type {Rule[]} Scam categories seen in Indian I4C / NCRP reports. */
const CATEGORIES = [
  {
    id: 'investment',
    label: 'Fake investment / stock-tip group',
    weight: 30,
    patterns: [
      /guarantee[d]?\s*(return|profit|income)/i,
      /double\s*(your)?\s*money/i,
      /\b\d{1,3}\s*%\s*(daily|per\s*day|weekly|monthly)\s*(return|profit)?/i,
      /(stock|share|ipo|f&o|option)\s*(tips?|calls?|allotment)/i,
      /\b(vip|premium)\s*(group|channel)/i,
      /institutional\s*(account|trading)|\bfii\s*account/i,
      /trading\s*app|crypto\s*(profit|investment)/i,
      /withdraw(al)?\s*(fee|tax|charges)/i,
      /munafa|मुनाफा|गारंटी|पैसा\s*डबल/i,
      /லாபம்|இரட்டிப்பு|panam\s*double/i,
    ],
  },
  {
    id: 'digital_arrest',
    label: '"Digital arrest" / fake police or agency',
    weight: 35,
    patterns: [
      /digital\s*arrest/i,
      /\b(cbi|ncb|enforcement\s*directorate|ed\s*officer|customs\s*officer|cyber\s*police|trai)\b/i,
      /money\s*laundering|hawala/i,
      /arrest\s*warrant|fir\s*(registered|filed)|case\s*(is\s*)?registered\s*against/i,
      /(stay|remain)\s*on\s*(the\s*)?(video\s*)?call|do\s*not\s*disconnect/i,
      /supreme\s*court|rbi\s*(officer|verification)/i,
      /गिरफ्तार|गिरफ़्तार|वारंट|पुलिस\s*केस/i,
      /கைது|வாரண்ட்|போலீஸ்\s*வழக்கு/i,
    ],
  },
  {
    id: 'kyc_otp',
    label: 'KYC / OTP / account-block fraud',
    weight: 30,
    patterns: [
      /\b(kyc|pan|aadhaar)\b.{0,30}(update|expire|block|suspend|verify)/i,
      /(account|card|sim)\s*(will\s*be|is|has\s*been)?\s*(blocked|suspended|deactivated|closed)/i,
      /(share|send|tell|give)\s*(me\s*)?(the\s*)?(otp|pin|cvv|password)/i,
      /\b(anydesk|teamviewer|quick\s*support|rustdesk)\b|screen\s*shar/i,
      /\.apk\b|install\s*(this\s*)?app/i,
      /खाता\s*बंद|ओटीपी\s*बताओ|केवाईसी/i,
      /கணக்கு\s*முடக்க|ஓடிபி|கேஒய்சி/i,
    ],
  },
  {
    id: 'courier',
    label: 'Courier / parcel / customs scam',
    weight: 25,
    patterns: [
      /(fedex|dhl|blue\s*dart|courier|parcel|package)\b.{0,60}(drugs?|illegal|seized|passports?|mdma|customs)/i,
      /(drugs?|illegal|seized|passports?|mdma)\b.{0,60}(fedex|dhl|courier|parcel|package)/i,
      /पार्सल|कूरियर/i,
      /பார்சல்|கூரியர்/i,
    ],
  },
  {
    id: 'task_job',
    label: 'Part-time job / task scam',
    weight: 25,
    patterns: [
      /part[\s-]*time\s*job|work\s*from\s*home/i,
      /(like|subscribe|rate|review)\s*(youtube|videos?|hotels?|products?|google\s*maps)/i,
      /prepaid\s*task|merchant\s*task|task\s*(group|commission)/i,
      /earn\s*(₹|rs\.?|inr)?\s*\d[\d,]*\s*(daily|per\s*day|a\s*day)/i,
      /घर\s*बैठे\s*कमाई/i,
      /வீட்டிலிருந்தே\s*சம்பாதி/i,
    ],
  },
  {
    id: 'reward_bill',
    label: 'Lottery / reward / electricity-bill scam',
    weight: 25,
    patterns: [
      /(won|winner|selected)\b.{0,40}(lottery|prize|lucky\s*draw|kbc|car|iphone)/i,
      /(processing|registration|delivery)\s*fee/i,
      /electricity\s*(bill|connection|power)\b.{0,60}(disconnect|cut|tonight)/i,
      /लॉटरी|इनाम|बिजली\s*कट/i,
      /லாட்டரி|பரிசு|மின்\s*இணைப்பு\s*துண்டி/i,
    ],
  },
  {
    id: 'family_voice',
    label: 'Family emergency / cloned-voice scam',
    weight: 25,
    patterns: [
      /(this\s*is\s*my\s*new\s*number|new\s*number\s*save)/i,
      /(accident|hospital|arrested|police\s*station)\b.{0,60}(send|transfer|pay)\b/i,
      /(mummy|papa|amma|appa|beta|son|daughter)\b.{0,40}(urgent|emergency|help)/i,
    ],
  },
  {
    id: 'sextortion_loan',
    label: 'Loan-app harassment / sextortion',
    weight: 30,
    patterns: [
      /(morphed|nude|private)\s*(photo|video|pics?)/i,
      /(viral|leak|send\s*to\s*(your\s*)?(contacts|family))/i,
      /instant\s*loan.{0,40}(no\s*documents|without\s*cibil)/i,
    ],
  },
];

/** @type {Rule[]} Psychological pressure tactics, independent of scam type. */
const TACTICS = [
  {
    id: 'urgency',
    label: 'Urgency / time pressure',
    weight: 12,
    patterns: [
      /\b(immediately|urgent(ly)?|right\s*now|within\s*\d+\s*(min|minutes|hours?)|today\s*only|last\s*chance|before\s*\d)/i,
      /\b(act|update|click|pay|verify|respond|register|join)\s+now\b/i,
      /turant|jaldi|abhi\s*ke\s*abhi|तुरंत|जल्दी/i,
      /udane|seekiram|உடனே|சீக்கிரம்/i,
    ],
  },
  {
    id: 'secrecy',
    label: 'Asks you to keep it secret',
    weight: 15,
    patterns: [
      /(don'?t|do\s*not|never)\s*(tell|inform|share\s*with)\s*(anyone|family|bank|police)/i,
      /(confidential|secret)\s*(investigation|matter|case)/i,
      /kisi\s*ko\s*(mat|na)\s*batana|किसी\s*को\s*मत\s*बताना/i,
      /yaar(idamum|kittayum)\s*solla\s*koodathu|யாரிடமும்\s*சொல்ல/i,
    ],
  },
  {
    id: 'authority',
    label: 'Claims to be an official / authority',
    weight: 10,
    patterns: [
      /\b(officer|inspector|commissioner|government\s*of\s*india|ministry|department)\b/i,
      /अधिकारी|सरकारी/i,
      /அதிகாரி|அரசு/i,
    ],
  },
  {
    id: 'payment_ask',
    label: 'Asks you to pay or transfer money',
    weight: 15,
    patterns: [
      /\b(transfer|deposit|pay|send)\b.{0,30}(₹|rs\.?|inr|money|amount|upi|account|fees?|deposit)/i,
      /(security|refundable|verification)\s*(deposit|amount)/i,
      /\b(first|advance|upfront)\b.{0,20}\b(pay|deposit|prepaid|fee)|prepaid\s*task\s*of/i,
      /\b(transfer|deposit|pay|send)\b[\s\w.,₹-]{0,30}@[a-z]/i,
      /\bgift\s*cards?\b/i,
      /पैसे\s*भेज|ट्रांसफर/i,
      /பணம்\s*அனுப்பு|டிரான்ஸ்பர்/i,
    ],
  },
  {
    id: 'credential_ask',
    label: 'Asks for OTP / PIN / password',
    weight: 20,
    patterns: [/\b(otp|upi\s*pin|atm\s*pin|cvv|password|mpin)\b/i, /ओटीपी|पिन/i, /ஓடிபி|பின்\s*நம்பர்/i],
  },
  {
    id: 'fear',
    label: 'Threats / fear',
    weight: 12,
    patterns: [
      /\b(jail|prison|legal\s*action|penalty|seized|frozen|freeze)\b/i,
      /जेल|कार्रवाई/i,
      /சிறை|நடவடிக்கை/i,
    ],
  },
  {
    id: 'greed',
    label: 'Too-good-to-be-true gains',
    weight: 10,
    patterns: [
      /\b(free|bonus|cashback|reward|jackpot|risk[\s-]*free|100%\s*safe)\b/i,
      /\bearn\s*(₹|rs\.?|inr)?\s*\d[\d,]*\s*(daily|per\s*day|a\s*day|weekly)/i,
    ],
  },
];

const MAX_SCORE = 100;

/**
 * Run a rule list against text and return the rules that matched, with the matched phrases.
 * @param {Rule[]} rules
 * @param {string} text
 */
function matchRules(rules, text) {
  const results = [];
  for (const rule of rules) {
    const hits = new Set();
    for (const pattern of rule.patterns) {
      const m = text.match(pattern);
      if (m) hits.add(m[0].trim().slice(0, 80));
    }
    if (hits.size > 0) {
      results.push({ id: rule.id, label: rule.label, weight: rule.weight, hits: [...hits] });
    }
  }
  return results;
}

/**
 * Convert a 0-100 score into a level the UI can colour and read aloud.
 * @param {number} score
 * @returns {'safe'|'suspicious'|'high'|'critical'}
 */
function levelFor(score) {
  if (score >= 80) return 'critical';
  if (score >= 60) return 'high';
  if (score >= 30) return 'suspicious';
  return 'safe';
}

/**
 * Score a message using only local rules.
 * Each extra hit inside a rule adds a little, so repeated pressure raises the score
 * without one keyword dominating.
 * @param {string} text
 * @param {{suspiciousIndicators?: number}} [extra]
 */
function analyzeRules(text, extra = {}) {
  const input = typeof text === 'string' ? text : '';
  const categories = matchRules(CATEGORIES, input);
  const tactics = matchRules(TACTICS, input);

  let score = 0;
  for (const c of categories) score += c.weight + (c.hits.length - 1) * 5;
  for (const t of tactics) score += t.weight + (t.hits.length - 1) * 3;
  score += Math.min(extra.suspiciousIndicators || 0, 3) * 8;

  // With no pressure tactic, one lone keyword is usually a news article or a safety warning.
  // Several hits inside one category is a real pattern, so damp it only slightly.
  if (tactics.length === 0) {
    const strongest = categories.reduce((n, c) => Math.max(n, c.hits.length), 0);
    score = Math.round(score * (strongest >= 2 ? 0.85 : 0.5));
  }

  score = Math.max(0, Math.min(MAX_SCORE, Math.round(score)));
  categories.sort((a, b) => b.weight - a.weight);

  return {
    score,
    level: levelFor(score),
    scamType: categories.length > 0 ? categories[0].label : 'No known scam pattern',
    categories,
    tactics,
  };
}

/**
 * Merge the rule score with an AI score. Safety first: if either engine is very sure
 * the message is a scam, we trust it; otherwise we blend them.
 * @param {number} ruleScore
 * @param {number|null|undefined} aiScore
 */
function combineScores(ruleScore, aiScore) {
  if (typeof aiScore !== 'number' || Number.isNaN(aiScore)) return ruleScore;
  const ai = Math.max(0, Math.min(MAX_SCORE, Math.round(aiScore)));
  if (ai >= 80 || ruleScore >= 80) return Math.max(ai, ruleScore);
  return Math.round(ruleScore * 0.4 + ai * 0.6);
}

module.exports = { analyzeRules, combineScores, levelFor, CATEGORIES, TACTICS };
