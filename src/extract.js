'use strict';

/**
 * Pulls scammer identifiers out of a conversation so they can go straight into
 * a 1930 / cybercrime.gov.in complaint. Every list is de-duplicated and capped.
 */

const LIMIT = 10;

const PATTERNS = Object.freeze({
  // UPI IDs: handle@psp. Must not look like an e-mail domain with a dot after @.
  upi: /\b[a-z0-9][a-z0-9._-]{1,255}@[a-z][a-z0-9]{1,63}\b(?!\.[a-z])/gi,
  // Indian mobile numbers, with optional +91 / 0 prefix and separators.
  phone: /(?<![\d])(?:\+?91[\s-]?|0)?[6-9]\d{4}[\s-]?\d{5}(?![\d])/g,
  url: /\b(?:https?:\/\/|www\.)[^\s<>"')]+|\b(?:bit\.ly|tinyurl\.com|t\.me|wa\.me|rb\.gy|cutt\.ly)\/[^\s<>"')]+/gi,
  // Bank accounts are 9–18 digits; IFSC is 4 letters + 0 + 6 alphanumerics.
  account: /(?<![\d])\d{9,18}(?![\d])/g,
  ifsc: /\b[A-Z]{4}0[A-Z0-9]{6}\b/g,
  amount: /(?:₹|rs\.?|inr)\s?\d[\d,]*(?:\.\d{1,2})?/gi,
});

const SHORTENERS = /^(?:https?:\/\/)?(?:bit\.ly|tinyurl\.com|rb\.gy|cutt\.ly|is\.gd|t\.co)\//i;
const CHAT_INVITES = /^(?:https?:\/\/)?(?:t\.me|telegram\.me|chat\.whatsapp\.com|wa\.me)\//i;
const APK = /\.apk(?:$|[?#])/i;

/**
 * @param {string} text
 * @param {RegExp} pattern
 * @param {(s: string) => string} [normalise]
 */
function unique(text, pattern, normalise = (s) => s) {
  const out = new Set();
  for (const m of text.matchAll(pattern)) {
    out.add(normalise(m[0]));
    if (out.size >= LIMIT) break;
  }
  return [...out];
}

const digitsOnly = (s) => s.replace(/\D/g, '');

/**
 * Extract identifiers and flag the ones that are suspicious on their own.
 * @param {string} text
 */
function extractIndicators(text) {
  const input = typeof text === 'string' ? text : '';

  const phones = unique(input, PATTERNS.phone, (s) => digitsOnly(s).slice(-10));
  const phoneSet = new Set(phones);
  const accounts = unique(input, PATTERNS.account).filter((a) => !phoneSet.has(a.slice(-10)) || a.length > 12);
  const urls = unique(input, PATTERNS.url, (s) => s.replace(/[.,;:!?]+$/, ''));

  const flags = [];
  for (const u of urls) {
    if (SHORTENERS.test(u)) flags.push({ value: u, reason: 'Shortened link hides the real website' });
    else if (CHAT_INVITES.test(u)) flags.push({ value: u, reason: 'Invite to a private Telegram/WhatsApp group' });
    if (APK.test(u)) flags.push({ value: u, reason: 'Direct app download (.apk) — can take over your phone' });
  }

  return {
    upiIds: unique(input, PATTERNS.upi, (s) => s.toLowerCase()),
    phones,
    urls,
    accounts,
    ifsc: unique(input, PATTERNS.ifsc),
    amounts: unique(input, PATTERNS.amount),
    flags,
  };
}

module.exports = { extractIndicators };
