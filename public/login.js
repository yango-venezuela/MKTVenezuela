const form = document.getElementById('loginForm');
const error = document.getElementById('loginError');
const submit = document.getElementById('loginSubmit');
const password = document.getElementById('password');
document.getElementById('revealPassword').addEventListener('click', event => {
  const show = password.type === 'password';
  password.type = show ? 'text' : 'password';
  const button = event.currentTarget;
  button.setAttribute('aria-label', show ? 'Ocultar clave' : 'Mostrar clave');
  button.title = show ? 'Ocultar clave' : 'Mostrar clave';
  button.innerHTML = `<i data-lucide="${show ? 'eye-off' : 'eye'}"></i>`;
  window.lucide?.createIcons();
});
form.addEventListener('submit', async event => {
  event.preventDefault();
  error.hidden = true;
  submit.disabled = true;
  try {
    await signIn(form.username.value.trim(), password.value);
    password.value = '';
    window.location.replace(entryUrl);
  } catch (failure) { error.textContent = failure.message; error.hidden = false; }
  finally { submit.disabled = false; }
});
window.lucide?.createIcons();
import { signIn, entryUrl } from './runtime.js?access=2';
