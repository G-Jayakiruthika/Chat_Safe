'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { extractIndicators } = require('../src/extract');
const { checkUpi } = require('../src/upiCheck');

test('extracts UPI, phone, account, IFSC, amount and links', () => {
  const r = extractIndicators(
    'Pay ₹25,000 to Rajesh.Trader@ybl or call +91 98765 43210. A/c 501002345678 IFSC HDFC0001234. ' +
      'Join https://t.me/vipclub and see bit.ly/abc123.',
  );
  assert.deepEqual(r.upiIds, ['rajesh.trader@ybl']);
  assert.deepEqual(r.phones, ['9876543210']);
  assert.deepEqual(r.accounts, ['501002345678']);
  assert.deepEqual(r.ifsc, ['HDFC0001234']);
  assert.deepEqual(r.amounts, ['₹25,000']);
  assert.ok(r.urls.includes('https://t.me/vipclub'));
  assert.ok(r.urls.includes('bit.ly/abc123'));
  const reasons = r.flags.map((f) => f.reason).join(' ');
  assert.match(reasons, /Shortened link/);
  assert.match(reasons, /Telegram\/WhatsApp group/);
});

test('e-mail addresses are not mistaken for UPI IDs', () => {
  const r = extractIndicators('Write to help@example.com for support');
  assert.deepEqual(r.upiIds, []);
});

test('a phone number is not double-counted as a bank account', () => {
  const r = extractIndicators('Call 9876543210 now');
  assert.deepEqual(r.phones, ['9876543210']);
  assert.deepEqual(r.accounts, []);
});

test('flags .apk download links', () => {
  const r = extractIndicators('Install https://example.in/sbi-kyc.apk to update KYC');
  assert.ok(r.flags.some((f) => /\.apk/.test(f.reason)));
});

test('duplicates are removed and lists are capped', () => {
  const many = Array.from({ length: 30 }, (_, i) => `user${i}@ybl`).join(' ');
  const r = extractIndicators(`${many} user1@ybl user1@ybl`);
  assert.equal(r.upiIds.length, 10);
  assert.equal(new Set(r.upiIds).size, r.upiIds.length);
});

test('non-string input returns empty lists', () => {
  const r = extractIndicators(/** @type {any} */ (undefined));
  assert.deepEqual(r, { upiIds: [], phones: [], urls: [], accounts: [], ifsc: [], amounts: [], flags: [] });
});

test('SEBI validated broker handle passes format check', () => {
  const r = checkUpi('ABC.brk@validhdfc');
  assert.equal(r.verdict, 'validated-format');
  assert.equal(r.category, 'Stock broker');
  assert.equal(r.bank, 'HDFC');
  assert.match(r.sebiCheckUrl, /^https:\/\/siportal\.sebi\.gov\.in\//);
});

test('mutual fund @valid handle passes', () => {
  assert.equal(checkUpi('xyzfund.mf@validicici').category, 'Mutual fund');
});

test('personal UPI ID is flagged as not validated', () => {
  const r = checkUpi('rajesh.trader@ybl');
  assert.equal(r.verdict, 'not-validated');
  assert.match(r.message, /PERSONAL/);
});

test('fake look-alike "@valid" with unknown category is rejected', () => {
  assert.equal(checkUpi('abc.xyz@validhdfc').verdict, 'not-validated');
  assert.equal(checkUpi('abc.brk@valid-hdfc').verdict, 'invalid');
});

test('garbage input is invalid', () => {
  for (const v of ['', 'hello', '@ybl', 'a@', null, undefined]) {
    assert.equal(checkUpi(/** @type {any} */ (v)).verdict, 'invalid');
  }
});
