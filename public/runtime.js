export const entryUrl = '/';

export async function signIn(username, password) {
  const response = await fetch('/api/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username, password }) });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || 'No pudimos iniciar sesion.');
}

export async function loadDashboard(refresh = false) {
  const response = await fetch(`/api/dashboard${refresh ? '?refresh=1' : ''}`);
  if (response.status === 401) window.location.replace('/login');
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || 'Data unavailable.');
  return data;
}

export async function signOut() {
  await fetch('/api/logout', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
  window.location.replace('/login');
}
