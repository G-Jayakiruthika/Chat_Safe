'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { CATEGORIES } = require('../src/rules');
const { createEngine } = require('../src/engine');

/**
 * Load the browser-side gallery definition in a sandbox.
 * The round-trip through JSON brings the data back into this realm, so deep
 * comparisons are not tripped up by the sandbox's separate Array prototype.
 */
function loadTypes() {
  const sandbox = { window: {} };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '..', 'public', 'scamtypes.js'), 'utf8'), sandbox);
  return JSON.parse(JSON.stringify(sandbox.window.SCAM_TYPES));
}

test('the gallery covers exactly the eight categories the engine detects', () => {
  const types = loadTypes();
  assert.equal(types.length, 8);
  const ids = types.map((t) => t.id).sort();
  assert.deepEqual(ids, CATEGORIES.map((c) => c.id).sort());
});

test('every card has an icon, a plain-language line and a rule', () => {
  for (const t of loadTypes()) {
    assert.ok(t.icon && [...t.icon].length <= 3, t.id);
    assert.ok(t.name.length > 2 && t.name.length < 28, t.id);
    assert.ok(t.says.length > 20, t.id);
    assert.ok(t.rule.length > 20, t.id);
    assert.ok(t.sample.length > 40, t.id);
  }
});

test('each sample really triggers its own category and scores as risky', async () => {
  const engine = createEngine({ logger: { error() {} } });
  for (const t of loadTypes()) {
    const r = await engine.analyze({ text: t.sample, lang: 'en' });
    assert.ok(r.score >= 30, `${t.id} scored only ${r.score}`);
    assert.ok(r.categoryIds.includes(t.id), `${t.id} not detected — got ${r.categoryIds.join(',')}`);
  }
});

test('no sample is mistaken for a safe message', async () => {
  const engine = createEngine({ logger: { error() {} } });
  for (const t of loadTypes()) {
    const r = await engine.analyze({ text: t.sample, lang: 'en' });
    assert.notEqual(r.level, 'safe', t.id);
  }
});
