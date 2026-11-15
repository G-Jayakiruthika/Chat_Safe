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
const { buildPlan } = require('./autopilot');

const MAX_TEXT_CHARS = 4000;
const MAX_BATCH = 20;
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

  /**
   * Autopilot: scan a batch of messages in one pass and return the finished work
   * for the worst one — the reply to send, the complaint to file, who to warn.
   * This is what turns a pile of forwarded messages into a single decision.
   */
  async function autopilot(body) {
    const raw = Array.isArray(body.messages) ? body.messages : [body.text];
    const messages = raw.filter((m) => typeof m === 'string' && m.trim()).slice(0, MAX_BATCH);
    if (!messages.length) throw new InputError(400, 'Field "messages" is required');

    const items = [];
    for (const text of messages) {
      const a = await analyze({ text, lang: body.lang });
      items.push({
        text: text.length > 240 ? `${text.slice(0, 240)}…` : text,
        score: a.score, level: a.level, scamType: a.scamType, verdict: a.verdict,
        categoryIds: a.categoryIds, analysis: a,
      });
    }
    items.sort((x, y) => y.score - x.score);
    const worst = items[0];
    const plan = buildPlan(worst.analysis, {
      lang: body.lang, connected: body.connected, autoActions: body.autoActions,
    });
    const counts = {};
    for (const i of items) counts[i.level] = (counts[i.level] || 0) + 1;
    return {
      scanned: items.length,
      counts,
      lang: worst.analysis.lang,
      worst: { text: worst.text, score: worst.score, level: worst.level, scamType: worst.scamType, verdict: worst.verdict },
      items: items.map(({ analysis, ...rest }) => rest),
      plan,
    };
  }

  async function upiCheck(body) {
    if (typeof body.upi !== 'string' || body.upi.length > 300) throw new InputError(400, 'Field "upi" is required');
    return checkUpi(body.upi);
  }

  return {
    analyze,
    agent,
    autopilot,
    decoy,
    upiCheck,
    languages: () => ({ languages: LANGUAGES }),
    aiEnabled: () => Boolean(gemini.enabled),
  };
}

module.exports = { createEngine, InputError, MAX_TEXT_CHARS };
