'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { createServer, createLru, createRateLimiter, MAX_TEXT_CHARS } = require('../src/app');

const quietLogger = { error() {} };

function fakeGemini({ enabled = false, analyze, decoyReply } = {}) {
  return {
    enabled,
    model: 'fake-gemini',
    analyze: analyze || (async () => null),
    decoyReply: decoyReply || (async () => null),
  };
}

async function withServer(gemini, fn) {
  const server = createServer({ gemini, logger: quietLogger });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    await fn(base);
  } finally {
    await new Promise((r) => server.close(r));
  }
}

const post = (base, path, body, headers = { 'Content-Type': 'application/json' }) =>
  fetch(base + path, { method: 'POST', headers, body: typeof body === 'string' ? body : JSON.stringify(body) });

test('health endpoint reports AI status', async () => {
  await withServer(fakeGemini(), async (base) => {
    const res = await fetch(`${base}/api/health`);
    assert.equal(res.status, 200);
    assert.deepEqual(await res.json(), { ok: true, ai: false, accounts: false });
  });
});

test('analyze works offline and builds a complaint for risky text', async () => {
  await withServer(fakeGemini(), async (base) => {
    const res = await post(base, '/api/analyze', {
      text: 'CBI officer: digital arrest warrant. Do not tell anyone. Transfer ₹90,000 to fraud.acc@ybl immediately.',
      lang: 'hi',
    });
    assert.equal(res.status, 200);
    const r = await res.json();
    assert.equal(r.level, 'critical');
    assert.equal(r.engine, 'rules (offline)');
    assert.match(r.verdict, /खतरा/);
    assert.equal(r.upiChecks[0].verdict, 'not-validated');
    assert.match(r.complaint, /fraud\.acc@ybl/);
    assert.equal(r.nextSteps.length, 4);
  });
});

test('safe text gets no complaint draft', async () => {
  await withServer(fakeGemini(), async (base) => {
    const r = await (await post(base, '/api/analyze', { text: 'See you at lunch tomorrow' })).json();
    assert.equal(r.level, 'safe');
    assert.equal(r.complaint, '');
  });
});

test('AI result is blended in and identical requests are cached', async () => {
  let calls = 0;
  const gemini = fakeGemini({
    enabled: true,
    analyze: async () => {
      calls += 1;
      return { score: 90, scamType: 'Investment fraud', redFlags: ['Guaranteed returns'], explanation: 'Fake group.', nextSteps: ['Leave group'] };
    },
  });
  await withServer(gemini, async (base) => {
    const body = { text: 'Join our stock group', lang: 'en' };
    const first = await (await post(base, '/api/analyze', body)).json();
    const second = await (await post(base, '/api/analyze', body)).json();
    assert.equal(first.score, 90);
    assert.equal(first.engine, 'rules + fake-gemini');
    assert.deepEqual(first.redFlags, ['Guaranteed returns']);
    assert.equal(second.cached, true);
    assert.equal(calls, 1);
  });
});

test('AI failure falls back to rules without failing the request', async () => {
  const gemini = fakeGemini({ enabled: true, analyze: async () => { throw new Error('quota'); } });
  await withServer(gemini, async (base) => {
    const r = await (await post(base, '/api/analyze', { text: 'share OTP immediately' })).json();
    assert.equal(r.engine, 'rules (offline)');
    assert.match(r.aiError, /unavailable/);
    assert.ok(r.score > 0);
  });
});

test('input validation errors', async () => {
  await withServer(fakeGemini(), async (base) => {
    assert.equal((await post(base, '/api/analyze', {})).status, 400);
    assert.equal((await post(base, '/api/analyze', { text: '   ' })).status, 400);
    assert.equal((await post(base, '/api/analyze', { text: 'a'.repeat(MAX_TEXT_CHARS + 1) })).status, 413);
    assert.equal((await post(base, '/api/analyze', '{bad json')).status, 400);
    assert.equal((await post(base, '/api/analyze', '[1,2]')).status, 400);
    assert.equal((await post(base, '/api/analyze', { text: 'x' }, { 'Content-Type': 'text/plain' })).status, 415);
    assert.equal((await post(base, '/api/analyze', JSON.stringify({ text: 'x'.repeat(20000) }))).status, 413);
    assert.equal((await post(base, '/api/upi-check', { upi: 5 })).status, 400);
  });
});

test('upi-check endpoint', async () => {
  await withServer(fakeGemini(), async (base) => {
    const r = await (await post(base, '/api/upi-check', { upi: 'zerodha.brk@validhdfc' })).json();
    assert.equal(r.verdict, 'validated-format');
  });
});

test('decoy uses offline script without AI, and AI reply when available', async () => {
  await withServer(fakeGemini(), async (base) => {
    const r = await (await post(base, '/api/decoy', { text: 'Send OTP now', lang: 'ta', turn: 2 })).json();
    assert.equal(r.engine, 'offline script');
    assert.match(r.reply, /குக்கர்/);
  });
  await withServer(fakeGemini({ enabled: true, decoyReply: async () => 'Aiyo, which bank kanna?' }), async (base) => {
    const r = await (await post(base, '/api/decoy', { text: 'Send OTP now' })).json();
    assert.equal(r.reply, 'Aiyo, which bank kanna?');
  });
});

test('static files are served with security headers; traversal is blocked', async () => {
  await withServer(fakeGemini(), async (base) => {
    const res = await fetch(`${base}/`);
    assert.equal(res.status, 200);
    assert.match(res.headers.get('content-type'), /text\/html/);
    assert.match(res.headers.get('content-security-policy'), /default-src 'self'/);
    assert.equal(res.headers.get('x-frame-options'), 'DENY');
    assert.equal(res.headers.get('x-content-type-options'), 'nosniff');
    assert.equal((await fetch(`${base}/app.js`)).status, 200);
    assert.equal((await fetch(`${base}/..%2fpackage.json`)).status, 404);
    assert.equal((await fetch(`${base}/../server.js`)).status, 404);
    assert.equal((await fetch(`${base}/missing.css`)).status, 404);
    assert.equal((await fetch(`${base}/api/nope`)).status, 404);
    assert.equal((await fetch(`${base}/`, { method: 'DELETE' })).status, 405);
  });
});

test('rate limiter blocks after the limit and resets after the window', () => {
  let now = 0;
  const allow = createRateLimiter({ windowMs: 1000, max: 2 }, () => now);
  assert.equal(allow('ip'), true);
  assert.equal(allow('ip'), true);
  assert.equal(allow('ip'), false);
  assert.equal(allow('other'), true);
  now = 1000;
  assert.equal(allow('ip'), true);
});

test('LRU cache evicts the least recently used entry', () => {
  const lru = createLru(2);
  lru.set('a', 1);
  lru.set('b', 2);
  lru.get('a');
  lru.set('c', 3);
  assert.equal(lru.get('b'), undefined);
  assert.equal(lru.get('a'), 1);
  assert.equal(lru.size, 2);
});
