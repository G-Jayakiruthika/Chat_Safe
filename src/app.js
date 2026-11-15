'use strict';

const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');

const { createEngine, InputError, MAX_TEXT_CHARS } = require('./engine');
const { createIntegrations } = require('./integrations');
const { createLru } = require('./lru');
const { buildCore } = require('../tools/build-core');

const PUBLIC_DIR = path.join(__dirname, '..', 'public');
const MAX_BODY_BYTES = 16 * 1024;
const MAX_WEBHOOK_BYTES = 256 * 1024;
const RATE_LIMIT = { windowMs: 60_000, max: 30 };

const MIME = Object.freeze({
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.webmanifest': 'application/manifest+json',
});

const SECURITY_HEADERS = Object.freeze({
  'Content-Security-Policy':
    "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; " +
    "media-src 'self'; worker-src 'self'; manifest-src 'self'; base-uri 'none'; form-action 'self'; " +
    "frame-ancestors 'none'; object-src 'none'",
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

/** Fixed-window per-key rate limiter. */
function createRateLimiter({ windowMs, max }, now = Date.now) {
  const hits = new Map();
  return (key) => {
    const t = now();
    const entry = hits.get(key);
    if (!entry || t - entry.start >= windowMs) {
      hits.set(key, { start: t, count: 1 });
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

/** @param {http.ServerResponse} res @param {number} status @param {string} text */
function sendText(res, status, text) {
  res.writeHead(status, { ...SECURITY_HEADERS, 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(text);
}

/**
 * Read the raw request body with a size limit. Keeps draining after the limit so the
 * error response can still be delivered.
 * @param {http.IncomingMessage} req
 * @param {number} limit
 * @returns {Promise<Buffer>}
 */
function readRaw(req, limit) {
  return new Promise((resolve, reject) => {
    let size = 0;
    let tooLarge = false;
    const chunks = [];
    req.on('data', (chunk) => {
      if (tooLarge) return;
      size += chunk.length;
      if (size > limit) {
        tooLarge = true;
        chunks.length = 0;
        reject(new HttpError(413, 'Request too large'));
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => {
      if (!tooLarge) resolve(Buffer.concat(chunks));
    });
    req.on('error', reject);
  });
}

/** @param {http.IncomingMessage} req @param {number} [limit] */
async function readJson(req, limit = MAX_BODY_BYTES) {
  if (!String(req.headers['content-type'] || '').includes('application/json')) {
    throw new HttpError(415, 'Content-Type must be application/json');
  }
  const raw = await readRaw(req, limit);
  try {
    const parsed = JSON.parse(raw.toString('utf8') || '{}');
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('not an object');
    return parsed;
  } catch {
    throw new HttpError(400, 'Invalid JSON body');
  }
}

/**
 * Build the HTTP request handler.
 * @param {{
 *   gemini: ReturnType<typeof import('./gemini').createGeminiClient>,
 *   env?: Record<string, string|undefined>,
 *   fetchImpl?: typeof fetch,
 *   logger?: Pick<Console, 'error'>,
 * }} deps
 */
function createHandler({ gemini, env = {}, fetchImpl, logger = console }) {
  const engine = createEngine({ gemini, logger });
  const integrations = createIntegrations({
    env,
    fetchImpl,
    logger,
    runAgent: (text) => engine.agent({ text, lang: 'auto' }),
  });
  const allow = createRateLimiter(RATE_LIMIT);
  const allowWebhook = createRateLimiter({ windowMs: 60_000, max: 600 });
  let coreJs = null; // built once, lazily

  const routes = {
    'GET /api/health': async () => ({ ok: true, ai: engine.aiEnabled() }),
    'GET /api/languages': async () => engine.languages(),
    'GET /api/integrations': async () => integrations.status(),
    'POST /api/agent': engine.agent,
    'POST /api/analyze': engine.analyze,
    'POST /api/decoy': engine.decoy,
    'POST /api/upi-check': engine.upiCheck,
  };

  /** Telegram and Meta webhooks: authenticated by secret / signature, not by rate of a single IP. */
  async function webhook(req, res, pathname, url) {
    if (!allowWebhook(pathname)) return sendJson(res, 429, { error: 'Too many requests' });
    let out;
    if (pathname === '/webhooks/meta' && req.method === 'GET') {
      out = integrations.handleMetaVerify(url.searchParams);
    } else if (pathname === '/webhooks/meta' && req.method === 'POST') {
      out = integrations.handleMetaEvent(req.headers, await readRaw(req, MAX_WEBHOOK_BYTES));
    } else if (pathname === '/webhooks/telegram' && req.method === 'POST') {
      out = integrations.handleTelegram(req.headers, await readJson(req, MAX_WEBHOOK_BYTES));
    } else {
      return sendJson(res, 405, { error: 'Method not allowed' });
    }
    if (out.text !== undefined) sendText(res, out.status, out.text);
    else sendJson(res, out.status, out.body);
    return out.task;
  }

  function serveStatic(req, res, pathname) {
    if (pathname === '/core.js') {
      coreJs = coreJs || buildCore();
      res.writeHead(200, { ...SECURITY_HEADERS, 'Content-Type': MIME['.js'], 'Cache-Control': 'public, max-age=3600' });
      res.end(req.method === 'HEAD' ? undefined : coreJs);
      return;
    }
    const rel = pathname.endsWith('/') ? `${pathname.slice(1)}index.html` : pathname.slice(1);
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
      const headers = {
        ...SECURITY_HEADERS,
        'Content-Type': MIME[ext],
        'Cache-Control': ext === '.html' || rel === 'sw.js' ? 'no-cache' : 'public, max-age=3600',
      };
      res.writeHead(200, headers);
      res.end(req.method === 'HEAD' ? undefined : data);
    });
  }

  return async function handler(req, res) {
    const url = new URL(req.url || '/', 'http://localhost');
    const { pathname } = url;

    try {
      if (pathname.startsWith('/webhooks/')) {
        await webhook(req, res, pathname, url);
        return;
      }

      const route = routes[`${req.method} ${pathname}`];
      if (!route) {
        if (pathname.startsWith('/api/')) return sendJson(res, 404, { error: 'Not found' });
        if (req.method === 'GET' || req.method === 'HEAD') return serveStatic(req, res, pathname);
        return sendJson(res, 405, { error: 'Method not allowed' });
      }

      const ip = String(req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'unknown').split(',')[0].trim();
      if (req.method === 'POST' && !allow(ip)) {
        return sendJson(res, 429, { error: 'Too many requests. Please wait a minute.' });
      }
      const body = req.method === 'POST' ? await readJson(req) : {};
      return sendJson(res, 200, await route(body));
    } catch (err) {
      const known = err instanceof HttpError || err instanceof InputError;
      const status = known ? err.status : 500;
      if (status === 500) logger.error('[server]', err);
      if (!res.headersSent) sendJson(res, status, { error: status === 500 ? 'Internal error' : err.message });
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
