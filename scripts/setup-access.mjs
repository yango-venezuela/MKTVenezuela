import fs from 'node:fs/promises';
import path from 'node:path';
import { randomBytes } from 'node:crypto';
import { hashPassword } from '../lib/auth.mjs';

const username = 'measurement';
const password = randomBytes(18).toString('base64url');
const hash = await hashPassword(password);
const secret = randomBytes(48).toString('base64url');
const destination = path.resolve(process.argv[2] || '../measurement-access.txt');
const env = [
  'PORT=4173', `APP_USERNAME=${username}`, `APP_PASSWORD_HASH=${hash}`,
  `SESSION_SECRET=${secret}`, 'PUBLIC_BASE_URL=',
  `SHEET_ID=${process.env.SHEET_ID || ''}`,
  'DAILY_TRACKER_TAB=4. Daily Tracker', 'GOOGLE_SERVICE_ACCOUNT_JSON=',
  'ACTIVE_USERS_TAB=', 'SNAPSHOT_FILE=data/snapshot.json', '',
].join('\n');
await fs.writeFile('.env', env, { flag: 'wx', mode: 0o600 });
await fs.writeFile(destination, `Acceso al dashboard Measurement Venezuela\n\nUsuario: ${username}\nClave: ${password}\n\nVista local: http://localhost:4173\nLa URL publica se incorporara despues del despliegue.\nEstas credenciales no se incluyen en GitHub.\n`, { flag: 'wx', mode: 0o600 });
console.log(`Credenciales guardadas en ${destination}`);
