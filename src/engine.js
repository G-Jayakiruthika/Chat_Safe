'use strict';

/**
 * The Chat_Safe engine: scan, voice-agent and decoy logic shared by
 *  - the Node.js server (with Gemini), and
 *  - the browser (zero-install GitHub Pages mode, offline rules only).
 * It has no Node-only dependencies so tools/build-core.js can bundle it for the browser.
 */

const { analyzeRules, combineScores, levelFor } = require('./rules');
const { extractIndicators } = require('./extract');
const { checkUpi } = require('./upiCheck');
const { safeLang, localized, VERDICT, STEPS, decoyFallback, agentFallback, buildComplaint } = require('./content');
const { LANGUAGES, detectLanguage } = require('./languages');
const { createLru } = require('./lru');

const MAX_TEXT_CHARS = 4000;
const CACHE_SIZE = 200;

class InputError extends Error {
  /** @param {number} status @param {string} message */
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

/** @param {unknown} value */
function requireText(value) {
  if (typeof value !== 'string' || !value.trim()) throw new InputError(400, 'Field "text" is required');
  if (value.length > MAX_TEXT_CHARS) throw new InputError(413, `Text must be under ${MAX_TEXT_CHARS} characters`);
  // Strip control characters except newline and tab.
  return value.replace(/[\u0000-\u0008\u000B-\u001F\u007F]/g, '').trim();
}

/** "auto" picks the language from the message's script. */
const resolveLang = (lang, text) => (lang === 'auto' ? detectLanguage(text) : safeLang(lang));

const OFFLINE_GEMINI = Object.freeze({ enabled: false, model: 'offline' });

/**
 * @param {{gemini?: any, logger?: Pick<Console, 'error'>}} [deps]
 */
function createEngine({ gemini = OFFLINE_GEMINI, logger = console } = {}) {
  const cache = createLru(CACHE_SIZE);

  async function analyze(body) {
    const text = requireText(body.text);
    const lang = resolveLang(body.lang, text);
    const key = `${lang}\u0000${text}`;
    const cached = cache.get(key);
    if (cached) return { ...cached, cached: true };

    const indicators = extractIndicators(text);
    const upiChecks = indicators.upiIds.map(checkUpi);
    const riskyUpi = upiChecks.filter((u) => u.verdict === 'not-validated').length;
    const rules = analyzeRules(text, { suspiciousIndicators: indicators.flags.length + (riskyUpi > 0 ? 1 : 0) });

    let ai = null;
    let aiError = null;
    if (gemini.enabled) {
      try {
        ai = await gemini.analyze(text, lang);
      } catch (err) {
        aiError = 'AI engine unavailable — showing offline result';
        logger.error('[gemini]', err instanceof Error ? err.message : err);
      }
    }

    const score = combineScores(rules.score, ai?.score);
    const level = levelFor(score);
    const scamType = ai?.scamType || rules.scamType;
    const result = {
      score,
      level,
      lang,
      verdict: localized(VERDICT, lang)[level],
      scamType,
      categoryIds: rules.categories.map((c) => c.id),
      explanation: ai?.explanation || '',
      redFlags: ai?.redFlags?.length ? ai.redFlags : [...rules.tactics, ...rules.categories].map((r) => r.label),
      nextSteps: ai?.nextSteps?.length ? ai.nextSteps : localized(STEPS, lang),
      engine: ai ? `rules + ${gemini.model}` : 'rules (offline)',
      aiError,
      rules,
      indicators,
      upiChecks,
      complaint: score >= 30 ? buildComplaint({ text, score, scamType, indicators }) : '',
    };
    cache.set(key, result);
    return result;
  }

  /**
   * Voice agent: scam-like words are scanned and the verdict spoken;
   * anything else is answered as a cyber-safety question.
   */
  async function agent(body) {
    const text = requireText(body.text);
    const lang = resolveLang(body.lang, text);
    const turn = Number.isInteger(body.turn) ? body.turn : 0;

    if (analyzeRules(text).score >= 30) {
      const analysis = await analyze({ text, lang });
      const tactic = analysis.redFlags[0] ? ` ${analysis.redFlags[0]}.` : '';
      return {
        mode: 'scan',
        mood: analysis.level,
        lang,
        reply: `${analysis.verdict}${tactic} ${analysis.nextSteps[0] || ''}`.trim(),
        analysis,
      };
    }

    let reply = null;
    if (gemini.enabled) {
      try {
        reply = await gemini.agentReply(text, lang);
      } catch (err) {
        logger.error('[gemini agent]', err instanceof Error ? err.message : err);
      }
    }
    return {
      mode: 'chat',
      mood: 'safe',
      lang,
      reply: reply || agentFallback(lang, turn, text),
      engine: reply ? gemini.model : 'offline script',
    };
  }

  async function decoy(body) {
    const text = requireText(body.text);
    const lang = resolveLang(body.lang, text);
    const turn = Number.isInteger(body.turn) ? body.turn : 0;
    let reply = null;
    if (gemini.enabled) {
      try {
        reply = await gemini.decoyReply(text, lang);
      } catch (err) {
        logger.error('[gemini decoy]', err instanceof Error ? err.message : err);
      }
    }
    return { reply: reply || decoyFallback(lang, turn), engine: reply ? gemini.model : 'offline script' };
  }

  async function upiCheck(body) {
    if (typeof body.upi !== 'string' || body.upi.length > 300) throw new InputError(400, 'Field "upi" is required');
    return checkUpi(body.upi);
  }

  return {
    analyze,
    agent,
    decoy,
    upiCheck,
    languages: () => ({ languages: LANGUAGES }),
    aiEnabled: () => Boolean(gemini.enabled),
  };
}

module.exports = { createEngine, InputError, MAX_TEXT_CHARS };
