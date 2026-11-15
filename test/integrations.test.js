'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const vm = require('node:vm');
const { createIntegrations, verifyMetaSignature, formatReply, safeEqual } = require('../src/integrations');
const { detectLanguage } = require('../src/languages');
const { createEngine } = require('../src/engine');
const { buildCore, MODULES } = require('../tools/build-core');
const { createServer } = require('../src/app');

const ENV = {
  TELEGRAM_BOT_TOKEN: 'tg-token',
  TELEGRAM_WEBHOOK_SECRET: 'tg-secret',
  TELEGRAM_BOT_USERNAME: 'ChatSafeBot',
  META_APP_SECRET: 'meta-secret',
  META_VERIFY_TOKEN: 'verify-me',
  WHATSAPP_TOKEN: 'wa-token',
  WHATSAPP_PHONE_NUMBER_ID: '12345',
  WHATSAPP_DISPLAY_NUMBER: '+91 90000 00000',
  INSTAGRAM_TOKEN: 'ig-token',
  MESSENGER_PAGE_TOKEN: 'fb-token',
};

const sign = (raw, secret = ENV.META_APP_SECRET) => `sha256=${crypto.createHmac('sha256', secret).update(raw).digest('hex')}`;

function recorder() {
  const calls = [];
  const fetchImpl = async (url, init) => {
    calls.push({ url, body: JSON.parse(init.body), auth: init.headers.Authorization });
    return { ok: true, status: 200 };
  };
  return { calls, fetchImpl };
}

const engine = createEngine({ logger: { error() {} } });
const runAgent = (text) => engine.agent({ text, lang: 'auto' });

test('detectLanguage picks the script, defaulting to English', () => {
  assert.equal(detectLanguage('உங்கள் கணக்கு முடக்கப்படும்'), 'ta');
  assert.equal(detectLanguage('आपका खाता बंद होगा'), 'hi');
  assert.equal(detectLanguage('మీ ఖాతా'), 'te');
  assert.equal(detectLanguage('আপনার অ্যাকাউন্ট'), 'bn');
  assert.equal(detectLanguage('آپ کا اکاؤنٹ'), 'ur');
  assert.equal(detectLanguage('unga account block aagum'), 'en');
  assert.equal(detectLanguage(null), 'en');
});

test('engine "auto" language replies in the detected language', async () => {
  const r = await engine.agent({ text: 'CBI கைது வாரண்ட், யாரிடமும் சொல்லாதே, உடனே பணம் அனுப்பு', lang: 'auto' });
  assert.equal(r.lang, 'ta');
  assert.equal(r.mode, 'scan');
});

test('safeEqual and Meta signature verification', () => {
  assert.equal(safeEqual('abc', 'abc'), true);
  assert.equal(safeEqual('abc', 'abd'), false);
  assert.equal(safeEqual('abc', 'abcd'), false);
  const raw = Buffer.from('{"a":1}');
  assert.equal(verifyMetaSignature(raw, sign(raw), ENV.META_APP_SECRET), true);
  assert.equal(verifyMetaSignature(raw, sign(raw, 'wrong'), ENV.META_APP_SECRET), false);
  assert.equal(verifyMetaSignature(raw, 'md5=xx', ENV.META_APP_SECRET), false);
  assert.equal(verifyMetaSignature(raw, sign(raw), ''), false);
});

test('formatReply builds a scan card and respects channel limits', async () => {
  const r = await runAgent('Guaranteed returns 10% daily! Deposit ₹10000 to rajesh@ybl immediately, VIP group');
  const text = formatReply(r, 'whatsapp');
  assert.match(text, /Chat_Safe risk: \d+\/100/);
  assert.match(text, /rajesh@ybl/);
  assert.match(text, /1930/);
  assert.ok(formatReply({ mode: 'chat', reply: 'x'.repeat(5000) }, 'instagram').length <= 950);
});

test('status reports configured channels and public links only', () => {
  const s = createIntegrations({ env: ENV, runAgent }).status();
  assert.deepEqual(s.telegram, { enabled: true, link: 'https://t.me/ChatSafeBot' });
  assert.equal(s.whatsapp.link, 'https://wa.me/919000000000');
  assert.equal(s.instagram.enabled, true);
  assert.ok(!JSON.stringify(s).includes('token'));
  const none = createIntegrations({ env: {}, runAgent }).status();
  assert.equal(none.telegram.enabled, false);
  assert.equal(none.whatsapp.enabled, false);
});

test('Telegram: rejects bad secret, replies to messages, handles /start and de-duplicates', async () => {
  const { calls, fetchImpl } = recorder();
  const ig = createIntegrations({ env: ENV, runAgent, fetchImpl, logger: { error() {} } });
  assert.equal(ig.handleTelegram({ 'x-telegram-bot-api-secret-token': 'nope' }, {}).status, 401);
  assert.equal(createIntegrations({ env: {}, runAgent }).handleTelegram({}, {}).status, 404);

  const headers = { 'x-telegram-bot-api-secret-token': 'tg-secret' };
  const update = { update_id: 7, message: { chat: { id: 99 }, text: 'Share OTP immediately or account blocked' } };
  const out = ig.handleTelegram(headers, update);
  assert.equal(out.status, 200);
  assert.equal(await out.task, 'sent');
  assert.equal(calls[0].url, 'https://api.telegram.org/bottg-token/sendMessage');
  assert.equal(calls[0].body.chat_id, 99);
  assert.match(calls[0].body.text, /risk/);

  assert.equal(await ig.handleTelegram(headers, update).task, 'duplicate');
  await ig.handleTelegram(headers, { update_id: 8, message: { chat: { id: 99 }, text: '/start' } }).task;
  assert.match(calls[1].body.text, /Kavach/);
  assert.equal(await ig.handleTelegram(headers, { update_id: 9 }).task, 'ignored');
});

test('Meta verify handshake', () => {
  const ig = createIntegrations({ env: ENV, runAgent });
  const q = (o) => new URLSearchParams(o);
  assert.deepEqual(ig.handleMetaVerify(q({ 'hub.mode': 'subscribe', 'hub.verify_token': 'verify-me', 'hub.challenge': '42' })), {
    status: 200,
    text: '42',
  });
  assert.equal(ig.handleMetaVerify(q({ 'hub.mode': 'subscribe', 'hub.verify_token': 'bad' })).status, 403);
  assert.equal(createIntegrations({ env: {}, runAgent }).handleMetaVerify(q({ 'hub.mode': 'subscribe' })).status, 403);
});

test('Meta: WhatsApp Business message is answered through the Cloud API', async () => {
  const { calls, fetchImpl } = recorder();
  const ig = createIntegrations({ env: ENV, runAgent, fetchImpl });
  const raw = Buffer.from(
    JSON.stringify({
      object: 'whatsapp_business_account',
      entry: [{ changes: [{ value: { messages: [{ id: 'wamid.1', from: '919876543210', type: 'text', text: { body: 'आपका खाता बंद होगा, तुरंत OTP बताओ' } }] } }] }],
    }),
  );
  assert.equal(ig.handleMetaEvent({ 'x-hub-signature-256': 'sha256=bad' }, raw).status, 401);
  const out = ig.handleMetaEvent({ 'x-hub-signature-256': sign(raw) }, raw);
  assert.equal(out.status, 200);
  await out.task;
  assert.equal(calls[0].url, 'https://graph.facebook.com/v21.0/12345/messages');
  assert.equal(calls[0].auth, 'Bearer wa-token');
  assert.equal(calls[0].body.to, '919876543210');
  assert.match(calls[0].body.text.body, /खतरा|धोखाधड़ी/);
});

test('Meta: Instagram and Messenger DMs are answered, echoes ignored, non-text gets a hint', async () => {
  const { calls, fetchImpl } = recorder();
  const ig = createIntegrations({ env: ENV, runAgent, fetchImpl });
  const send = async (payload) => {
    const raw = Buffer.from(JSON.stringify(payload));
    await ig.handleMetaEvent({ 'x-hub-signature-256': sign(raw) }, raw).task;
  };
  await send({ object: 'instagram', entry: [{ messaging: [{ sender: { id: 'u1' }, message: { mid: 'm1', text: 'hi' } }, { sender: { id: 'me' }, message: { mid: 'm2', text: 'echo', is_echo: true } }] }] });
  await send({ object: 'page', entry: [{ messaging: [{ sender: { id: 'u2' }, message: { mid: 'm3', text: 'What is a digital arrest?' } }] }] });
  await send({ object: 'whatsapp_business_account', entry: [{ changes: [{ value: { messages: [{ id: 'w2', from: '91', type: 'image' }] } }] }] });
  assert.equal(calls.length, 3);
  assert.equal(calls[0].url, 'https://graph.instagram.com/v21.0/me/messages');
  assert.equal(calls[0].body.recipient.id, 'u1');
  assert.equal(calls[1].url, 'https://graph.facebook.com/v21.0/me/messages');
  assert.match(calls[1].body.message.text, /video call/);
  assert.match(calls[2].body.text.body, /as text/);
  const raw = Buffer.from('not json');
  assert.equal(ig.handleMetaEvent({ 'x-hub-signature-256': sign(raw) }, raw).status, 400);
});

test('send failures are logged, never thrown', async () => {
  const errors = [];
  const ig = createIntegrations({
    env: ENV,
    runAgent,
    fetchImpl: async () => ({ ok: false, status: 500 }),
    logger: { error: (...a) => errors.push(a.join(' ')) },
  });
  await ig.handleTelegram({ 'x-telegram-bot-api-secret-token': 'tg-secret' }, { update_id: 1, message: { chat: { id: 1 }, text: 'hi' } }).task;
  assert.match(errors[0], /HTTP 500/);
});

test('browser core bundle runs the same engine without Node APIs', async () => {
  const code = buildCore();
  for (const m of MODULES) assert.ok(code.includes(`defs["${m}"]`));
  const sandbox = { window: {}, console };
  vm.runInNewContext(code, sandbox);
  const core = sandbox.window.ChatSafeCore;
  const e = core.createEngine({ logger: { error() {} } });
  const r = await e.analyze({ text: 'CBI digital arrest, do not tell anyone, transfer money immediately', lang: 'en' });
  assert.equal(r.level, 'critical');
  assert.equal((await e.upiCheck({ upi: 'a.brk@validhdfc' })).verdict, 'validated-format');
});

test('server: webhook routes, integrations status and core.js', async () => {
  const { calls, fetchImpl } = recorder();
  const server = createServer({ gemini: { enabled: false, model: 'm' }, env: ENV, fetchImpl, logger: { error() {} } });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    const status = await (await fetch(`${base}/api/integrations`)).json();
    assert.equal(status.telegram.enabled, true);
    const core = await fetch(`${base}/core.js`);
    assert.equal(core.status, 200);
    assert.match(await core.text(), /ChatSafeCore/);

    const verify = await fetch(`${base}/webhooks/meta?hub.mode=subscribe&hub.verify_token=verify-me&hub.challenge=abc`);
    assert.equal(await verify.text(), 'abc');

    const raw = JSON.stringify({ object: 'page', entry: [{ messaging: [{ sender: { id: 's' }, message: { mid: 'x1', text: 'hello' } }] }] });
    const bad = await fetch(`${base}/webhooks/meta`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: raw });
    assert.equal(bad.status, 401);
    const good = await fetch(`${base}/webhooks/meta`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Hub-Signature-256': sign(Buffer.from(raw)) },
      body: raw,
    });
    assert.equal(good.status, 200);

    const tg = await fetch(`${base}/webhooks/telegram`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Telegram-Bot-Api-Secret-Token': 'tg-secret' },
      body: JSON.stringify({ update_id: 5, message: { chat: { id: 1 }, text: 'hi' } }),
    });
    assert.equal(tg.status, 200);
    assert.equal((await fetch(`${base}/webhooks/telegram`)).status, 405);
    await new Promise((r) => setTimeout(r, 50));
    assert.equal(calls.length, 2);
  } finally {
    await new Promise((r) => server.close(r));
  }
});
