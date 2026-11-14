'use strict';

const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const { analyzeRules, combineScores, levelFor } = require('./rules');
const { extractIndicators } = require('./extract');
const { checkUpi } = require('./upiCheck');
const { safeLang, VERDICT, STEPS, decoyFallback, buildComplaint } = require('./content');

const PUBLIC_DIR = path.join(__dirname, '..', 'public');
const MAX_BODY_BYTES = 16 * 1024;
const MAX_TEXT_CHARS = 4000;
const RATE_LIMIT = { windowMs: 60_000, max: 30 };
const CACHE_SIZE = 200;

const MIME = Object.freeze({
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.webmanifest': 'application/manifest+json',
});

const SECURITY_HEADERS = Object.freeze({
  'Content-Security-Policy':
    "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; " +
    "base-uri 'none'; form-action 'self'; frame-ancestors 'none'; object-src 'none'",
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'no-referrer',
  'Permissions-Policy': 'camera=(), geolocation=(), microphone=(self)',
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Strict-Transport-Security': 'max-age=31536000; includeSubDomains',
});

class HttpError extends Error {
  /** @param {number} status @param {string} message */
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

/** Small LRU cache: Map keeps insertion order, so the first key is the oldest. */
function createLru(limit) {
  const map = new Map();
  return {
    get(key) {
      if (!map.has(key)) return undefined;
      const v = map.get(key);
      map.delete(key);
      map.set(key, v);
      return v;
    },
    set(key, value) {
      if (map.has(key)) map.delete(key);
      map.set(key, value);
      if (map.size > limit) map.delete(map.keys().next().value);
    },
    get size() {
      return map.size;
    },
  };
}

/** Fixed-window per-IP rate limiter. */
function createRateLimiter({ windowMs, max }, now = Date.now) {
  const hits = new Map();
  return (ip) => {
    const t = now();
    const entry = hits.get(ip);
    if (!entry || t - entry.start >= windowMs) {
      hits.set(ip, { start: t, count: 1 });
      if (hits.size > 10_000) hits.clear(); // memory guard
      return true;
    }
    entry.count += 1;
    return entry.count <= max;
  };
}

/** @param {http.ServerResponse} res @param {number} status @param {unknown} body */
function sendJson(res, status, body) {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    ...SECURITY_HEADERS,
    'Content-Type': MIME['.json'],
    'Content-Length': Buffer.byteLength(payload),
    'Cache-Control': 'no-store',
  });
  res.end(payload);
}

/** @param {http.IncomingMessage} req */
function readJson(req) {
  return new Promise((resolve, reject) => {
    if (!String(req.headers['content-type'] || '').includes('application/json')) {
      reject(new HttpError(415, 'Content-Type must be application/json'));
      return;
    }
    let size = 0;
    let tooLarge = false;
    const chunks = [];
    req.on('data', (chunk) => {
      if (tooLarge) return; // keep draining so the 413 response can be delivered
      size += chunk.length;
      if (size > MAX_BODY_BYTES) {
        tooLarge = true;
        chunks.length = 0;
        reject(new HttpError(413, 'Request too large'));
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => {
      if (tooLarge) return;
      try {
        const parsed = JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
        if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('not an object');
        resolve(parsed);
      } catch {
        reject(new HttpError(400, 'Invalid JSON body'));
      }
    });
    req.on('error', reject);
  });
}

/** @param {unknown} value */
function requireText(value) {
  if (typeof value !== 'string' || !value.trim()) throw new HttpError(400, 'Field "text" is required');
  if (value.length > MAX_TEXT_CHARS) throw new HttpError(413, `Text must be under ${MAX_TEXT_CHARS} characters`);
  // Strip control characters except newline and tab.
  return value.replace(/[\u0000-\u0008\u000B-\u001F\u007F]/g, '').trim();
}

/**
 * Build the HTTP request handler.
 * @param {{gemini: ReturnType<typeof import('./gemini').createGeminiClient>, logger?: Pick<Console, 'error'>}} deps
 */
function createHandler({ gemini, logger = console }) {
  const cache = createLru(CACHE_SIZE);
  const allow = createRateLimiter(RATE_LIMIT);

  async function analyze(body) {
    const text = requireText(body.text);
    const lang = safeLang(body.lang);
    const key = crypto.createHash('sha256').update(`${lang}\u0000${text}`).digest('hex');
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
      verdict: VERDICT[lang][level],
      scamType,
      explanation: ai?.explanation || '',
      redFlags: ai?.redFlags?.length ? ai.redFlags : [...rules.tactics, ...rules.categories].map((r) => r.label),
      nextSteps: ai?.nextSteps?.length ? ai.nextSteps : STEPS[lang],
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

  async function decoy(body) {
    const text = requireText(body.text);
    const lang = safeLang(body.lang);
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

  const routes = {
    'GET /api/health': async () => ({ ok: true, ai: gemini.enabled }),
    'POST /api/analyze': analyze,
    'POST /api/decoy': decoy,
    'POST /api/upi-check': async (body) => {
      if (typeof body.upi !== 'string' || body.upi.length > 300) throw new HttpError(400, 'Field "upi" is required');
      return checkUpi(body.upi);
    },
  };

  function serveStatic(req, res, pathname) {
    const rel = pathname === '/' ? 'index.html' : pathname.slice(1);
    const filePath = path.normalize(path.join(PUBLIC_DIR, rel));
    const ext = path.extname(filePath);
    if (!filePath.startsWith(PUBLIC_DIR + path.sep) || !MIME[ext]) {
      sendJson(res, 404, { error: 'Not found' });
      return;
    }
    fs.readFile(filePath, (err, data) => {
      if (err) {
        sendJson(res, 404, { error: 'Not found' });
        return;
      }
      res.writeHead(200, {
        ...SECURITY_HEADERS,
        'Content-Type': MIME[ext],
        'Cache-Control': ext === '.html' ? 'no-cache' : 'public, max-age=3600',
      });
      res.end(req.method === 'HEAD' ? undefined : data);
    });
  }

  return async function handler(req, res) {
    const { pathname } = new URL(req.url || '/', 'http://localhost');
    const route = routes[`${req.method} ${pathname}`];

    if (!route) {
      if (pathname.startsWith('/api/')) {
        sendJson(res, 404, { error: 'Not found' });
        return;
      }
      if (req.method === 'GET' || req.method === 'HEAD') {
        serveStatic(req, res, pathname);
        return;
      }
      sendJson(res, 405, { error: 'Method not allowed' });
      return;
    }

    const ip = String(req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'unknown').split(',')[0].trim();
    if (req.method === 'POST' && !allow(ip)) {
      sendJson(res, 429, { error: 'Too many requests. Please wait a minute.' });
      return;
    }

    try {
      const body = req.method === 'POST' ? await readJson(req) : {};
      sendJson(res, 200, await route(body));
    } catch (err) {
      const status = err instanceof HttpError ? err.status : 500;
      if (status === 500) logger.error('[server]', err);
      sendJson(res, status, { error: status === 500 ? 'Internal error' : err.message });
    }
  };
}

/** @param {Parameters<typeof createHandler>[0]} deps */
function createServer(deps) {
  const server = http.createServer(createHandler(deps));
  server.requestTimeout = 20_000;
  server.headersTimeout = 10_000;
  return server;
}

module.exports = { createServer, createHandler, createLru, createRateLimiter, HttpError, MAX_TEXT_CHARS };
