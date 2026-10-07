export const sessionKey = 'measurement-pages-session';

export function gateUser(config, username) {
  return (Array.isArray(config.users) ? config.users : [config]).find(user => user.username === username);
}

export function validSession(session, config, now = Date.now()) {
  const user = session && gateUser(config, session.username);
  return !!user && session.version === user.verifier
    && Number.isFinite(session.expires) && session.expires > now;
}

export async function verifyGatePassword(password, config) {
  if (typeof password !== 'string' || password.length > 256) return false;
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits']);
  const salt = Uint8Array.from(config.salt.match(/.{2}/g), value => parseInt(value, 16));
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', salt, iterations: config.iterations, hash: 'SHA-256' }, key, 256);
  return Array.from(new Uint8Array(bits), value => value.toString(16).padStart(2, '0')).join('') === config.verifier;
}
