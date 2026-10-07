import { sessionKey, validSession, verifyGatePassword } from './gate.js';

export const entryUrl = './index.html';
let configuration;
async function config() {
  if (!configuration) {
    const response = await fetch('./gate-config.json', { cache: 'no-store' });
    if (!response.ok) throw new Error('No pudimos cargar el acceso.');
    configuration = await response.json();
  }
  return configuration;
}

export async function signIn(username, password) {
  const gate = await config();
  if (username !== gate.username || !await verifyGatePassword(password, gate)) throw new Error('Usuario o clave incorrectos.');
  localStorage.setItem(sessionKey, JSON.stringify({ username, version: gate.verifier, expires: Date.now() + 8 * 60 * 60 * 1000 }));
}

export async function loadDashboard() {
  const gate = await config();
  let session;
  try { session = JSON.parse(localStorage.getItem(sessionKey)); } catch {}
  // This check is a visual gate only; the published JSON is intentionally public.
  if (!validSession(session, gate)) {
    window.location.replace('./login.html');
    throw new Error('Inicia sesion para continuar.');
  }
  const response = await fetch(`./data.json?refresh=${Date.now()}`, { cache: 'no-store' });
  if (!response.ok) throw new Error('No pudimos cargar los datos publicados.');
  return response.json();
}

export async function signOut() {
  localStorage.removeItem(sessionKey);
  window.location.replace('./login.html');
}
