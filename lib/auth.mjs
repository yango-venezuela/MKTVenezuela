import { randomBytes, scrypt, timingSafeEqual, createHmac } from 'node:crypto';
import { promisify } from 'node:util';

const derive = promisify(scrypt);
const settings = { N: 32768, r: 8, p: 1, maxmem: 64 * 1024 * 1024 };
export const COOKIE = 'measurement_session';
export const SESSION_SECONDS = 8 * 60 * 60;

export async function hashPassword(password) {
  const salt = randomBytes(16).toString('hex');
  const key = await derive(password, salt, 64, settings);
  return `scrypt:${salt}:${key.toString('hex')}`;
}

export async function verifyPassword(password, stored) {
  if (typeof password !== 'string' || password.length > 256) return false;
  const parts = String(stored || '').split(':');
  if (parts.length !== 3 || parts[0] !== 'scrypt' || !/^[a-f0-9]{32}$/.test(parts[1]) || !/^[a-f0-9]{128}$/.test(parts[2])) return false;
  const key = await derive(password, parts[1], 64, settings);
  return timingSafeEqual(key, Buffer.from(parts[2], 'hex'));
}

export function issueSession(username, secret, now = Date.now()) {
  const payload = Buffer.from(JSON.stringify({ user: username, exp: Math.floor(now / 1000) + SESSION_SECONDS, nonce: randomBytes(16).toString('hex') })).toString('base64url');
  const signature = createHmac('sha256', secret).update(payload).digest('base64url');
  return `${payload}.${signature}`;
}

export function readSession(token, username, secret, now = Date.now()) {
  if (typeof token !== 'string' || token.length > 1500) return null;
  const [payload, signature, extra] = token.split('.');
  if (!payload || !signature || extra) return null;
  const expected = createHmac('sha256', secret).update(payload).digest();
  const actual = Buffer.from(signature, 'base64url');
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) return null;
  try {
    const session = JSON.parse(Buffer.from(payload, 'base64url').toString());
    if (session.user !== username || !Number.isInteger(session.exp) || session.exp <= now / 1000 || session.exp > now / 1000 + SESSION_SECONDS + 60) return null;
    return session;
  } catch { return null; }
}

export function cookieValue(header = '') {
  for (const pair of header.split(';')) {
    const offset = pair.indexOf('=');
    if (offset < 0 || pair.slice(0, offset).trim() !== COOKIE) continue;
    try { return decodeURIComponent(pair.slice(offset + 1)); } catch { return null; }
  }
  return null;
}
