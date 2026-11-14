'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { analyzeRules, combineScores, levelFor } = require('../src/rules');

test('digital arrest script scores critical', () => {
  const r = analyzeRules(
    'This is Inspector Sharma from CBI. Arrest warrant issued for money laundering. ' +
      'Stay on video call and do not tell anyone. Transfer ₹1,50,000 immediately or you go to jail.',
  );
  assert.equal(r.level, 'critical');
  assert.ok(r.score >= 80);
  assert.equal(r.categories[0].id, 'digital_arrest');
  const tactics = r.tactics.map((x) => x.id);
  for (const id of ['secrecy', 'urgency', 'payment_ask', 'fear']) assert.ok(tactics.includes(id), id);
});

test('stock-tip group is detected as investment scam', () => {
  const r = analyzeRules('Join our VIP group, guaranteed returns 10% daily! Deposit ₹10000 today only.');
  assert.ok(r.categories.some((c) => c.id === 'investment'));
  assert.ok(r.score >= 60, `score ${r.score}`);
});

test('task job scam in English', () => {
  const r = analyzeRules('Part time job from home. Like YouTube videos and earn ₹3000 daily. First do prepaid task of ₹500 to start.');
  assert.ok(r.categories.some((c) => c.id === 'task_job'));
  assert.ok(r.tactics.some((c) => c.id === 'greed'));
  assert.ok(r.tactics.some((c) => c.id === 'payment_ask'));
  assert.ok(r.score >= 60, `score ${r.score}`);
});

test('Hindi digital arrest text is recognised', () => {
  const r = analyzeRules('आपके नाम पर वारंट है, आपको गिरफ्तार किया जाएगा। किसी को मत बताना, तुरंत पैसे भेजो।');
  assert.ok(r.categories.some((c) => c.id === 'digital_arrest'));
  assert.ok(r.tactics.some((c) => c.id === 'secrecy'));
  assert.ok(r.score >= 60);
});

test('Tamil KYC/OTP scam is recognised', () => {
  const r = analyzeRules('உங்கள் கணக்கு முடக்கப்படும். உடனே ஓடிபி சொல்லுங்கள்.');
  assert.ok(r.categories.some((c) => c.id === 'kyc_otp'));
  assert.ok(r.tactics.some((c) => c.id === 'urgency'));
});

test('Tanglish urgency is recognised', () => {
  const r = analyzeRules('Sir unga account block aagum, udane OTP sollunga');
  assert.ok(r.tactics.some((c) => c.id === 'urgency'));
  assert.ok(r.tactics.some((c) => c.id === 'credential_ask'));
});

test('ordinary family message stays safe', () => {
  const r = analyzeRules('Hi Amma, reached Chennai safely. Will call after dinner.');
  assert.equal(r.level, 'safe');
  assert.equal(r.score, 0);
  assert.equal(r.scamType, 'No known scam pattern');
});

test('a news-style mention without pressure tactics is damped', () => {
  const withTactic = analyzeRules('Digital arrest: transfer money immediately');
  const newsOnly = analyzeRules('Police warn citizens about digital arrest frauds this year.');
  assert.ok(newsOnly.score < withTactic.score);
  assert.ok(newsOnly.score < 30);
});

test('handles empty and non-string input safely', () => {
  for (const input of ['', undefined, null, 42, {}]) {
    const r = analyzeRules(/** @type {any} */ (input));
    assert.equal(r.score, 0);
    assert.equal(r.level, 'safe');
  }
});

test('score is capped at 100', () => {
  const r = analyzeRules(
    'CBI digital arrest warrant money laundering. Guaranteed return double your money. Share OTP, install anydesk. ' +
      'FedEx parcel drugs seized. Do not tell anyone. Immediately transfer ₹50000. Jail. Free bonus.',
    { suspiciousIndicators: 10 },
  );
  assert.equal(r.score, 100);
});

test('suspicious indicators raise the score but are capped', () => {
  const base = analyzeRules('Pay now immediately');
  const more = analyzeRules('Pay now immediately', { suspiciousIndicators: 2 });
  const capped = analyzeRules('Pay now immediately', { suspiciousIndicators: 99 });
  assert.ok(more.score > base.score);
  assert.ok(capped.score - base.score <= 24);
});

test('levelFor boundaries', () => {
  assert.equal(levelFor(0), 'safe');
  assert.equal(levelFor(29), 'safe');
  assert.equal(levelFor(30), 'suspicious');
  assert.equal(levelFor(59), 'suspicious');
  assert.equal(levelFor(60), 'high');
  assert.equal(levelFor(79), 'high');
  assert.equal(levelFor(80), 'critical');
  assert.equal(levelFor(100), 'critical');
});

test('combineScores blends, but trusts a confident engine', () => {
  assert.equal(combineScores(40, null), 40);
  assert.equal(combineScores(40, undefined), 40);
  assert.equal(combineScores(40, Number.NaN), 40);
  assert.equal(combineScores(50, 50), 50);
  assert.equal(combineScores(20, 70), 50);
  assert.equal(combineScores(10, 95), 95);
  assert.equal(combineScores(85, 10), 85);
  assert.equal(combineScores(0, 500), 100);
  assert.equal(combineScores(0, -5), 0);
});
