'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { createDb, DbError, hashPassword, verifyPassword, daysBetween } = require('../src/db');
const { createServer } = require('../src/app');

const offlineGemini = { enabled: false, model: 'm' };
const quiet = { error() {} };

test('passwords are salted, hashed and never stored in the clear', () => {
  const a = hashPassword('correct horse battery');
  const b = hashPassword('correct horse battery');
  assert.notEqual(a.salt, b.salt, 'each password gets its own salt');
  assert.notEqual(a.hash, b.hash, 'same password hashes differently');
  assert.equal(a.hash.length, 64);
  assert.ok(verifyPassword('correct horse battery', a.salt, a.hash));
  assert.ok(!verifyPassword('wrong password here', a.salt, a.hash));
});

test('signup validates its input', () => {
  const db = createDb();
  const bad = [
    [{ email: 'nope', password: 'longenough1', name: 'A' }, /valid email/],
    [{ email: 'a@b.co', password: 'short', name: 'A' }, /8 characters/],
    [{ email: 'a@b.co', password: 'longenough1', name: '  ' }, /your name/],
  ];
  for (const [input, re] of bad) assert.throws(() => db.signup(input), re);
  db.close();
});

test('signup normalises the email and refuses duplicates', () => {
  const db = createDb();
  const { user } = db.signup({ email: '  Jaya@Example.COM ', password: 'longenough1', name: ' Jaya ' });
  assert.equal(user.email, 'jaya@example.com');
  assert.equal(user.name, 'Jaya');
  assert.throws(() => db.signup({ email: 'JAYA@example.com', password: 'longenough1', name: 'Other' }), { status: 409 });
  db.close();
});

test('the public user object never leaks the salt or hash', () => {
  const db = createDb();
  const { user } = db.signup({ email: 'a@b.co', password: 'longenough1', name: 'A' });
  const keys = Object.keys(user);
  assert.ok(!keys.includes('salt') && !keys.includes('hash'), keys.join(','));
  assert.ok(!JSON.stringify(user).includes('longenough1'));
  db.close();
});

test('login succeeds, fails safely and locks out after repeated failures', () => {
  const db = createDb();
  db.signup({ email: 'a@b.co', password: 'longenough1', name: 'A' });
  assert.equal(db.login({ email: 'A@B.CO', password: 'longenough1' }).user.name, 'A');

  // Unknown account and wrong password give the same message.
  const unknown = (() => { try { db.login({ email: 'zz@b.co', password: 'x' }); } catch (e) { return e; } })();
  const wrong = (() => { try { db.login({ email: 'a@b.co', password: 'nope' }); } catch (e) { return e; } })();
  assert.equal(unknown.message, wrong.message);
  assert.equal(unknown.status, 401);

  for (let i = 0; i < 10; i++) {
    try { db.login({ email: 'a@b.co', password: 'nope' }); } catch { /* expected */ }
  }
  assert.throws(() => db.login({ email: 'a@b.co', password: 'longenough1' }), { status: 429 });
  db.close();
});

test('sessions resolve to a user and expire', () => {
  let clock = Date.parse('2026-01-01T00:00:00Z');
  const db = createDb({ now: () => clock });
  const { session } = db.signup({ email: 'a@b.co', password: 'longenough1', name: 'A' });
  assert.equal(db.userForToken(session.token).email, 'a@b.co');
  assert.equal(db.userForToken('made-up-token'), null);
  assert.equal(db.userForToken(''), null);
  clock += 31 * 86_400_000;
  assert.equal(db.userForToken(session.token), null, 'expired after 30 days');
  db.close();
});

test('logout drops the session', () => {
  const db = createDb();
  const { session } = db.signup({ email: 'a@b.co', password: 'longenough1', name: 'A' });
  db.logout(session.token);
  assert.equal(db.userForToken(session.token), null);
  db.close();
});

test('daily check-in builds a streak, holds it the same day and resets after a gap', () => {
  let clock = Date.parse('2026-03-01T09:00:00Z');
  const db = createDb({ now: () => clock });
  const { user } = db.signup({ email: 'a@b.co', password: 'longenough1', name: 'A' });

  assert.equal(db.checkIn(user.id).streak, 1);
  assert.equal(db.checkIn(user.id).streak, 1, 'twice in one day still counts once');

  clock += 86_400_000;
  assert.equal(db.checkIn(user.id).streak, 2);
  clock += 86_400_000;
  const third = db.checkIn(user.id, { learned: ['investment', 'courier'], scanned: true });
  assert.equal(third.streak, 3);
  assert.equal(third.best, 3);
  assert.deepEqual(third.learned.sort(), ['courier', 'investment']);
  assert.equal(third.scans, 1);

  clock += 3 * 86_400_000; // missed two days
  const after = db.checkIn(user.id);
  assert.equal(after.streak, 1, 'streak restarts');
  assert.equal(after.best, 3, 'best is remembered');
  assert.deepEqual(after.learned.sort(), ['courier', 'investment'], 'progress is not lost');
  db.close();
});

test('daysBetween', () => {
  assert.equal(daysBetween('2026-03-01', '2026-03-02'), 1);
  assert.equal(daysBetween('2026-02-28', '2026-03-01'), 1);
  assert.equal(daysBetween('2026-03-01', '2026-03-01'), 0);
});

/* ---------- over HTTP ---------- */
async function withServer(fn, { db = createDb() } = {}) {
  const server = createServer({ gemini: offlineGemini, env: {}, logger: quiet, db });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  try {
    await fn(`http://127.0.0.1:${server.address().port}`, db);
  } finally {
    await new Promise((r) => server.close(r));
    db?.close();
  }
}
const post = (base, path, body, cookie) =>
  fetch(base + path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(cookie ? { Cookie: cookie } : {}) },
    body: JSON.stringify(body),
  });

test('signup sets an HttpOnly session cookie and /api/me reads it back', async () => {
  await withServer(async (base) => {
    const res = await post(base, '/api/signup', { email: 'a@b.co', password: 'longenough1', name: 'Jaya' });
    assert.equal(res.status, 200);
    const cookie = res.headers.get('set-cookie');
    assert.match(cookie, /cs_session=/);
    assert.match(cookie, /HttpOnly/);
    assert.match(cookie, /SameSite=Lax/);
    assert.ok(!/Secure/.test(cookie), 'no Secure flag over plain http');
    assert.equal((await res.json()).user.name, 'Jaya');

    const me = await (await fetch(`${base}/api/me`, { headers: { Cookie: cookie.split(';')[0] } })).json();
    assert.equal(me.user.email, 'a@b.co');
    assert.equal(me.accounts, true);

    const anon = await (await fetch(`${base}/api/me`)).json();
    assert.equal(anon.user, null);
  });
});

test('the cookie is marked Secure behind an HTTPS proxy', async () => {
  await withServer(async (base) => {
    const res = await fetch(`${base}/api/signup`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Forwarded-Proto': 'https' },
      body: JSON.stringify({ email: 'a@b.co', password: 'longenough1', name: 'A' }),
    });
    assert.match(res.headers.get('set-cookie'), /Secure/);
  });
});

test('login, progress and logout over HTTP', async () => {
  await withServer(async (base) => {
    await post(base, '/api/signup', { email: 'a@b.co', password: 'longenough1', name: 'A' });
    const res = await post(base, '/api/login', { email: 'a@b.co', password: 'longenough1' });
    const cookie = res.headers.get('set-cookie').split(';')[0];

    assert.equal((await post(base, '/api/progress', { scanned: true, learned: ['courier'] })).status, 401);
    const prog = await (await post(base, '/api/progress', { scanned: true, learned: ['courier'] }, cookie)).json();
    assert.equal(prog.user.streak, 1);
    assert.deepEqual(prog.user.learned, ['courier']);

    const out = await post(base, '/api/logout', {}, cookie);
    assert.match(out.headers.get('set-cookie'), /cs_session=;/);
    const me = await (await fetch(`${base}/api/me`, { headers: { Cookie: cookie } })).json();
    assert.equal(me.user, null);
  });
});

test('bad credentials and duplicate signups return their own status codes', async () => {
  await withServer(async (base) => {
    await post(base, '/api/signup', { email: 'a@b.co', password: 'longenough1', name: 'A' });
    assert.equal((await post(base, '/api/signup', { email: 'a@b.co', password: 'longenough1', name: 'A' })).status, 409);
    assert.equal((await post(base, '/api/login', { email: 'a@b.co', password: 'wrongpass123' })).status, 401);
    assert.equal((await post(base, '/api/signup', { email: 'bad', password: 'longenough1', name: 'A' })).status, 400);
  });
});

test('without a database the account endpoints say so instead of crashing', async () => {
  const server = createServer({ gemini: offlineGemini, env: {}, logger: quiet, db: null });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    assert.equal((await post(base, '/api/signup', { email: 'a@b.co', password: 'longenough1', name: 'A' })).status, 503);
    const me = await (await fetch(`${base}/api/me`)).json();
    assert.deepEqual(me, { user: null, accounts: false });
  } finally {
    await new Promise((r) => server.close(r));
  }
});
