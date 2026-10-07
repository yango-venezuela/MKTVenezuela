import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { hashPassword, verifyPassword, issueSession, readSession, COOKIE, SESSION_SECONDS } from '../lib/auth.mjs';
import { createApp } from '../server.mjs';

test('password hash accepts the correct password and rejects invalid inputs', async () => {
  const hash = await hashPassword('test-only-password');
  assert.ok(!hash.includes('test-only-password'));
  assert.equal(await verifyPassword('test-only-password', hash), true);
  assert.equal(await verifyPassword('wrong', hash), false);
  assert.equal(await verifyPassword({}, hash), false);
});
test('sessions reject tampering, another username and expiry', () => {
  const now = 1700000000000;
  const secret = 'test-only-secret-that-is-more-than-thirty-two-characters';
  const token = issueSession('test-user', secret, now);
  assert.equal(readSession(token, 'test-user', secret, now).user, 'test-user');
  assert.equal(readSession(token.slice(0, -3) + 'abc', 'test-user', secret, now), null);
  assert.equal(readSession(token, 'different', secret, now), null);
  assert.equal(readSession(token, 'test-user', secret, now + SESSION_SECONDS * 1000), null);
});
test('HTTP authentication protects data, checks origin and uses HttpOnly sessions', async context => {
  const config = { APP_USERNAME: 'test-user', APP_PASSWORD_HASH: await hashPassword('test-only-password'), SESSION_SECRET: 'test-only-secret-that-is-more-than-thirty-two-characters' };
  const app = createApp(config, { load: async () => ({ test: 'protected-data' }) });
  const server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  context.after(() => new Promise(resolve => server.close(resolve)));
  const origin = `http://127.0.0.1:${server.address().port}`;
  assert.equal((await fetch(`${origin}/api/dashboard`)).status, 401);
  assert.equal((await fetch(`${origin}/data/snapshot.json`)).status, 404);
  const login = (body, suppliedOrigin = origin) => fetch(`${origin}/api/login`, { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: suppliedOrigin }, body: JSON.stringify(body) });
  assert.equal((await login({ username: 'test-user', password: 'test-only-password' }, 'https://another-origin.example')).status, 403);
  assert.equal((await login({ username: 'test-user', password: 'wrong' })).status, 401);
  const response = await login({ username: 'test-user', password: 'test-only-password' });
  assert.equal(response.status, 200);
  const cookie = response.headers.get('set-cookie');
  assert.ok(cookie.includes('HttpOnly'));
  assert.ok(cookie.includes('SameSite=Strict'));
  assert.ok(cookie.startsWith(COOKIE + '='));
  const authenticated = await fetch(`${origin}/api/dashboard`, { headers: { Cookie: cookie.split(';')[0] } });
  assert.deepEqual(await authenticated.json(), { test: 'protected-data' });
  assert.equal(authenticated.headers.get('cache-control'), 'no-store');
  const logout = await fetch(`${origin}/api/logout`, { method: 'POST', headers: { Origin: origin, Cookie: cookie.split(';')[0] } });
  assert.equal(logout.status, 200);
  assert.ok(logout.headers.get('set-cookie').includes('Expires=Thu, 01 Jan 1970'));
});
