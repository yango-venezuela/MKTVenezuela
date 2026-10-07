import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { buildPages, gateConfig, publicSnapshot } from '../scripts/build-pages.mjs';
import { validSession, verifyGatePassword } from '../pages/gate.js';

const password = 'example-password-for-tests';
const gate = gateConfig('example', password, '00000000000000000000000000000000');
const snapshot = { days: [{ date: '2026-10-01', tripsAct: 100, tripsBdg: 110, userIds: ['must-not-publish'] }], active: [], monthlyTargets: { '2026-10': { trips: 1000 } }, meta: { cutoff: '2026-10-01', retrievedAt: '2026-10-02T00:00:00Z', GOOGLE_SERVICE_ACCOUNT_JSON: 'must-not-publish' }, SESSION_SECRET: 'must-not-publish' };

test('visual gate verifies the password without embedding its cleartext', async () => {
  assert.equal(await verifyGatePassword(password, gate), true);
  assert.equal(await verifyGatePassword('wrong', gate), false);
  assert.equal(JSON.stringify(gate).includes(password), false);
});
test('visual sessions expire and reset when the gate configuration changes', () => {
  assert.equal(validSession({ username: 'example', version: gate.verifier, expires: 101 }, gate, 100), true);
  assert.equal(validSession({ username: 'example', version: gate.verifier, expires: 100 }, gate, 100), false);
  assert.equal(validSession({ username: 'example', version: 'old', expires: 101 }, gate, 100), false);
});
test('publishable snapshot includes aggregates only, never credentials or identifiers', () => {
  const result = publicSnapshot(snapshot);
  assert.equal(result.days[0].tripsAct, 100);
  assert.equal(result.meta.source, 'github-pages');
  assert.equal(result.meta.live, false);
  assert.equal(JSON.stringify(result).includes('must-not-publish'), false);
});
test('Pages export requires explicit public-data approval', async () => {
  await assert.rejects(buildPages({ snapshot, gate }), /confirmar/);
});
test('static export works under a project subpath and excludes backend credentials', async () => {
  const output = await fs.mkdtemp(path.join(os.tmpdir(), 'measurement-pages-'));
  try {
    await buildPages({ snapshot, gate: { ...gate, password, SESSION_SECRET: 'must-not-publish' }, output, allowPublicData: true });
    const html = await fs.readFile(path.join(output, 'index.html'), 'utf8');
    assert.match(html, /src="\.\/app.js"/);
    assert.match(html, /src="\.\/assets\/yango.png"/);
    assert.match(html, /class="business-section"/);
    assert.doesNotMatch(html, /(?:src|href)="\//);
    const files = await fs.readdir(output);
    assert.ok(files.includes('data.json'));
    assert.ok(!files.includes('.env'));
    assert.ok(!files.includes('server.mjs'));
    assert.ok((await fs.stat(path.join(output, 'vendor/lucide.js'))).size < 30000);
    assert.ok((await fs.stat(path.join(output, 'assets/yango.png'))).size > 0);
    assert.ok(files.includes('chart-weeks.js'));
    assert.ok(files.includes('performance.js'));
    const publishedGate = await fs.readFile(path.join(output, 'gate-config.json'), 'utf8');
    assert.ok(!publishedGate.includes(password));
    assert.ok(!publishedGate.includes('must-not-publish'));
  } finally { await fs.rm(output, { recursive: true }); }
});
