'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { LANGUAGES, safeLang, languageName } = require('../src/languages');
const { localized, VERDICT, agentFallback, decoyFallback } = require('../src/content');
const { createGeminiClient } = require('../src/gemini');
const { createServer } = require('../src/app');

test('supports English plus all 22 scheduled Indian languages', () => {
  assert.equal(LANGUAGES.length, 23);
  const codes = LANGUAGES.map((l) => l.code);
  assert.equal(new Set(codes).size, 23);
  for (const c of ['as', 'bn', 'brx', 'doi', 'gu', 'hi', 'kn', 'ks', 'kok', 'mai', 'ml', 'mni', 'mr', 'ne', 'or', 'pa', 'sa', 'sat', 'sd', 'ta', 'te', 'ur']) {
    assert.ok(codes.includes(c), c);
  }
  for (const l of LANGUAGES) assert.match(l.speech, /^[a-z]{2,3}-[A-Z]{2}$/);
  assert.deepEqual(LANGUAGES.filter((l) => l.rtl).map((l) => l.code).sort(), ['ks', 'sd', 'ur']);
});

test('safeLang and languageName', () => {
  assert.equal(safeLang('bn'), 'bn');
  assert.equal(safeLang('xx'), 'en');
  assert.equal(safeLang(7), 'en');
  assert.equal(languageName('mni'), 'Manipuri');
  assert.equal(languageName('zz'), 'English');
});

test('offline text falls back to English for languages without hand-written copy', () => {
  assert.equal(localized(VERDICT, 'te'), VERDICT.en);
  assert.equal(localized(VERDICT, 'ta'), VERDICT.ta);
  assert.equal(decoyFallback('bn', 0), decoyFallback('en', 0));
  assert.match(agentFallback('hi', 0), /कवच/);
  assert.equal(agentFallback('ml', 5), agentFallback('en', 1));
});

test('offline agent answers the common questions in the right language', () => {
  assert.match(agentFallback('en', 0, 'What is a digital arrest?'), /video call/);
  assert.match(agentFallback('ta', 0, 'டிஜிட்டல் கைது என்றால் என்ன?'), /மோசடி/);
  assert.match(agentFallback('hi', 0, 'मैंने ठग को पैसे भेज दिए'), /1930/);
  assert.match(agentFallback('en', 0, 'Is this caller really from my bank?'), /OTP/);
  assert.match(agentFallback('bn', 0, 'is my bank calling?'), /OTP/);
});

test('agentReply asks for the right language and strips markdown', async () => {
  let sent;
  const fetchImpl = async (_url, init) => {
    sent = JSON.parse(init.body);
    return { ok: true, json: async () => ({ candidates: [{ content: { parts: [{ text: '**Never** share your `OTP`.' }] } }] }) };
  };
  const c = createGeminiClient({ apiKey: 'k', fetchImpl });
  assert.equal(await c.agentReply('what is OTP?', 'te'), 'Never share your OTP.');
  assert.match(sent.contents[0].parts[0].text, /Telugu/);
  assert.match(sent.contents[0].parts[0].text, /<user>\nwhat is OTP\?\n<\/user>/);
  assert.equal(await createGeminiClient({}).agentReply('x', 'en'), null);
});

async function withServer(gemini, fn) {
  const server = createServer({ gemini, logger: { error() {} } });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    await fn(base);
  } finally {
    await new Promise((r) => server.close(r));
  }
}
const post = (base, body) =>
  fetch(`${base}/api/agent`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
const offline = { enabled: false, model: 'm', analyze: async () => null, decoyReply: async () => null, agentReply: async () => null };

test('GET /api/languages lists all languages', async () => {
  await withServer(offline, async (base) => {
    const r = await (await fetch(`${base}/api/languages`)).json();
    assert.equal(r.languages.length, 23);
  });
});

test('agent scans scam-like speech and replies with a verdict', async () => {
  await withServer(offline, async (base) => {
    const r = await (await post(base, { text: 'CBI officer here, digital arrest warrant, do not tell anyone, transfer money immediately', lang: 'ta' })).json();
    assert.equal(r.mode, 'scan');
    assert.equal(r.mood, 'critical');
    assert.match(r.reply, /ஆபத்து/);
    assert.ok(r.analysis.score >= 80);
  });
});

test('agent answers general questions offline, and with AI when enabled', async () => {
  await withServer(offline, async (base) => {
    const r = await (await post(base, { text: 'Hello, who are you?', lang: 'en', turn: 0 })).json();
    assert.equal(r.mode, 'chat');
    assert.equal(r.engine, 'offline script');
    assert.match(r.reply, /Kavach/);
  });
  const ai = { ...offline, enabled: true, agentReply: async () => 'Namaskara! Never share OTP.' };
  await withServer(ai, async (base) => {
    const r = await (await post(base, { text: 'how to stay safe?', lang: 'kn' })).json();
    assert.equal(r.reply, 'Namaskara! Never share OTP.');
    assert.equal(r.engine, 'm');
  });
  const broken = { ...offline, enabled: true, agentReply: async () => { throw new Error('down'); } };
  await withServer(broken, async (base) => {
    const r = await (await post(base, { text: 'hi', lang: 'en' })).json();
    assert.equal(r.engine, 'offline script');
  });
});

test('agent validates input', async () => {
  await withServer(offline, async (base) => {
    assert.equal((await post(base, { text: '' })).status, 400);
  });
});
