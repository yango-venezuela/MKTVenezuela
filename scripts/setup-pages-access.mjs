import fs from 'node:fs/promises';
import path from 'node:path';
import { randomBytes } from 'node:crypto';
import { gateConfig } from './build-pages.mjs';

const username = 'measurement';
const password = randomBytes(18).toString('base64url');
const credentials = path.resolve(process.argv[2] || '../measurement-pages-access.txt');
const verifier = path.resolve(process.argv[3] || '../measurement-pages-gate.json');
const root = path.resolve('.');
for (const file of [credentials, verifier]) {
  if (file === root || file.startsWith(root + path.sep)) throw new Error('Guarda el acceso fuera del repositorio.');
  try { await fs.access(file); throw new Error('El archivo de acceso ya existe; no se sobrescribe.'); }
  catch (error) { if (error.code !== 'ENOENT') throw error; }
}
await fs.writeFile(verifier, JSON.stringify(gateConfig(username, password)), { flag: 'wx', mode: 0o600 });
await fs.writeFile(credentials, `Acceso visual exclusivo para GitHub Pages\n\nUsuario: ${username}\nClave: ${password}\n\nEsta clave no se usa en la version con servidor.\nLos datos de Pages son publicos; el login no los protege.\n`, { flag: 'wx', mode: 0o600 });
console.log('Acceso de Pages preparado fuera del repositorio. No reutiliza la clave del servidor.');
