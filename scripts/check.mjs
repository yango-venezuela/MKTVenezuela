import { execFileSync } from 'node:child_process';
for (const file of ['server.mjs', 'lib/auth.mjs', 'lib/sheets.mjs', 'public/model.js', 'public/app.js', 'public/login.js']) {
  execFileSync(process.execPath, ['--check', file], { stdio: 'inherit' });
}
console.log('Syntax checks passed.');
