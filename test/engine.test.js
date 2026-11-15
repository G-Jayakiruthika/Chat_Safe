'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { createEngine } = require('../src/engine');

test('autopilot scans a pile, ranks the worst and writes the actions', async () => {
  const engine = createEngine();
  const out = await engine.autopilot({
    messages: [
      'Amma, I will be home by 8.',
      'Dear customer, your SBI KYC expired. Account blocked today. Update at http://sbi-kyc-verify.in and share the OTP.',
      'Your Amazon order has been delivered.',
    ],
    lang: 'en',
    connected: ['telegram'],
    autoActions: ['reply', 'warn'],
  });

  assert.equal(out.scanned, 3);
  assert.ok(out.worst.score >= 30, 'the KYC message should rank worst');
  const ids = out.plan.steps.map((s) => s.id);
  assert.deepStrictEqual(ids.slice(0, 2), ['stop', 'reply']);
  assert.ok(ids.includes('complaint'), 'a scam gets a complaint draft');

  // Only the steps the user switched on, and that a connected app can carry out, run alone.
  const auto = out.plan.steps.filter((s) => s.auto).map((s) => s.id);
  assert.deepStrictEqual(auto.sort(), ['reply', 'warn']);
  assert.ok(out.plan.steps.find((s) => s.id === 'reply').text.length > 20);
});

test('autopilot on a harmless pile offers no complaint and nothing automatic', async () => {
  const engine = createEngine();
  const out = await engine.autopilot({ messages: ['Shall I bring curd rice?'], lang: 'en', autoActions: ['reply'] });
  assert.deepStrictEqual(out.plan.steps.map((s) => s.id), ['watch']);
  assert.equal(out.plan.autoCount, 0);
});

test('autopilot rejects an empty pile', async () => {
  const engine = createEngine();
  await assert.rejects(() => engine.autopilot({ messages: ['   ', ''] }), /messages/);
});
