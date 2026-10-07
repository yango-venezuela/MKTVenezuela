import { execFileSync } from 'node:child_process';
for (const file of ['server.mjs', 'lib/auth.mjs', 'lib/sheets.mjs', 'public/model.js', 'public/app.js', 'public/login.js', 'public/runtime.js', 'public/chart-weeks.js', 'public/performance.js', 'public/insights.js', 'pages/gate.js', 'pages/runtime.js', 'scripts/build-pages.mjs', 'scripts/setup-pages-access.mjs', 'scripts/preview-pages.mjs']) {
  execFileSync(process.execPath, ['--check', file], { stdio: 'inherit' });
}
console.log('Syntax checks passed.');
