'use strict';

/**
 * English plus all 22 languages in the Eighth Schedule of the Constitution of India.
 * `speech` is the BCP-47 tag passed to the browser's Web Speech API; `rtl` marks
 * right-to-left scripts so the UI can set dir="rtl".
 */
const LANGUAGES = Object.freeze([
  { code: 'en', name: 'English', native: 'English', speech: 'en-IN' },
  { code: 'as', name: 'Assamese', native: 'অসমীয়া', speech: 'as-IN' },
  { code: 'bn', name: 'Bengali', native: 'বাংলা', speech: 'bn-IN' },
  { code: 'brx', name: 'Bodo', native: 'बड़ो', speech: 'brx-IN' },
  { code: 'doi', name: 'Dogri', native: 'डोगरी', speech: 'doi-IN' },
  { code: 'gu', name: 'Gujarati', native: 'ગુજરાતી', speech: 'gu-IN' },
  { code: 'hi', name: 'Hindi', native: 'हिन्दी', speech: 'hi-IN' },
  { code: 'kn', name: 'Kannada', native: 'ಕನ್ನಡ', speech: 'kn-IN' },
  { code: 'ks', name: 'Kashmiri', native: 'کٲشُر', speech: 'ks-IN', rtl: true },
  { code: 'kok', name: 'Konkani', native: 'कोंकणी', speech: 'kok-IN' },
  { code: 'mai', name: 'Maithili', native: 'मैथिली', speech: 'mai-IN' },
  { code: 'ml', name: 'Malayalam', native: 'മലയാളം', speech: 'ml-IN' },
  { code: 'mni', name: 'Manipuri', native: 'ꯃꯤꯇꯩꯂꯣꯟ', speech: 'mni-IN' },
  { code: 'mr', name: 'Marathi', native: 'मराठी', speech: 'mr-IN' },
  { code: 'ne', name: 'Nepali', native: 'नेपाली', speech: 'ne-NP' },
  { code: 'or', name: 'Odia', native: 'ଓଡ଼ିଆ', speech: 'or-IN' },
  { code: 'pa', name: 'Punjabi', native: 'ਪੰਜਾਬੀ', speech: 'pa-IN' },
  { code: 'sa', name: 'Sanskrit', native: 'संस्कृतम्', speech: 'sa-IN' },
  { code: 'sat', name: 'Santali', native: 'ᱥᱟᱱᱛᱟᱲᱤ', speech: 'sat-IN' },
  { code: 'sd', name: 'Sindhi', native: 'سنڌي', speech: 'sd-IN', rtl: true },
  { code: 'ta', name: 'Tamil', native: 'தமிழ்', speech: 'ta-IN' },
  { code: 'te', name: 'Telugu', native: 'తెలుగు', speech: 'te-IN' },
  { code: 'ur', name: 'Urdu', native: 'اردو', speech: 'ur-IN', rtl: true },
]);

const BY_CODE = new Map(LANGUAGES.map((l) => [l.code, l]));

/** @param {unknown} code @returns {string} a supported code, defaulting to English */
const safeLang = (code) => (typeof code === 'string' && BY_CODE.has(code) ? code : 'en');

/** @param {string} code */
const languageName = (code) => BY_CODE.get(safeLang(code)).name;

module.exports = { LANGUAGES, safeLang, languageName };
