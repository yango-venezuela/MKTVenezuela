import fs from 'node:fs/promises';
import path from 'node:path';
import { pbkdf2Sync, randomBytes } from 'node:crypto';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { build } from 'esbuild';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const date = value => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : null;
const number = value => typeof value === 'number' && Number.isFinite(value) ? value : null;

export function gateConfig(username, password, salt = randomBytes(16).toString('hex')) {
  if (!username || typeof password !== 'string' || password.length < 8 || password.length > 256) throw new Error('El acceso visual de Pages requiere usuario y una clave de entre 8 y 256 caracteres.');
  const iterations = 150000;
  return { username, salt, iterations, verifier: pbkdf2Sync(password, Buffer.from(salt, 'hex'), iterations, 32, 'sha256').toString('hex') };
}

export function publicSnapshot(snapshot) {
  const fields = ['tripsBdg', 'tripsAct', 'gmvBdg', 'gmvAct', 'newBdg', 'newAct', 'newWithoutBipBip', 'installsBdg', 'installsAct', 'activePlanAllocation', 'spendBdg', 'spendAct', 'cpiAct', 'paidShareAct', 'paidCacAct', 'paidUsersAct', 'paidCacBdg'];
  const days = (snapshot.days || []).map(row => ({ date: date(row.date), ...Object.fromEntries(fields.map(field => [field, number(row[field])])) })).filter(row => row.date);
  if (!days.length) throw new Error('No hay datos agregados validos para publicar.');
  const active = (snapshot.active || []).map(row => ({
    date: date(row.date), weekStart: date(row.weekStart), weekEnd: date(row.weekEnd),
    dailyUnique: number(row.dailyUnique), cumulativeUnique: number(row.cumulativeUnique), weeklyUnique: number(row.weeklyUnique),
    weeklyTarget: number(row.weeklyTarget), status: row.status === 'completo' ? 'completo' : null,
  })).filter(row => row.date && row.weekStart && row.weekEnd);
  const monthlyTargets = Object.fromEntries(Object.entries(snapshot.monthlyTargets || {}).filter(([month]) => /^\d{4}-\d{2}$/.test(month))
    .map(([month, targets]) => [month, Object.fromEntries(['trips', 'gmv', 'new', 'installs'].map(key => [key, number(targets[key])]))]));
  const warnings = (snapshot.meta?.warnings || []).filter(item => ['trips', 'gmv', 'new', 'installs'].includes(item.metric)).map(item => ({
    metric: item.metric, kind: 'plan-mismatch', monthlyBudget: number(item.monthlyBudget), dailyPlanTotal: number(item.dailyPlanTotal),
  }));
  const performanceTargets = Object.fromEntries(Object.entries(snapshot.performanceTargets || {}).filter(([month]) => /^\d{4}-\d{2}$/.test(month))
    .map(([month, targets]) => [month, Object.fromEntries(['spend', 'cpi', 'paidShare', 'paidCac'].map(key => [key, number(targets[key])]))]));
  return { days, active, monthlyTargets, performanceTargets, meta: {
    cutoff: date(snapshot.meta?.cutoff), month: days.at(-1).date.slice(0, 7),
    performanceCutoff: date(snapshot.meta?.performanceCutoff),
    retrievedAt: snapshot.meta?.retrievedAt, publishedAt: new Date().toISOString(), warnings, source: 'github-pages', live: false,
  } };
}

export async function buildPages({ snapshot, gate, output = path.join(root, 'dist-pages'), allowPublicData = false }) {
  if (!allowPublicData) throw new Error('La publicacion exige confirmar que los datos seran publicos.');
  const users = Array.isArray(gate?.users) ? gate.users : [gate];
  if (!users.length || users.some(user => !user?.username || !/^[a-f0-9]{32}$/.test(user.salt) || !/^[a-f0-9]{64}$/.test(user.verifier) || !Number.isInteger(user.iterations) || user.iterations < 100000)
    || new Set(users.map(user => user.username)).size !== users.length) throw new Error('Configuracion de acceso invalida.');
  const safeUsers = users.map(({ username, salt, iterations, verifier }) => ({ username, salt, iterations, verifier }));
  const safeGate = Array.isArray(gate.users) ? { users: safeUsers } : safeUsers[0];
  await fs.mkdir(output, { recursive: true });
  for (const directory of ['assets', 'vendor']) await fs.mkdir(path.join(output, directory), { recursive: true });
  for (const file of ['index.html', 'login.html', 'styles.css', 'login.css', 'app.js', 'login.js', 'model.js', 'chart-weeks.js', 'performance.js', 'insights.js']) {
    let content = await fs.readFile(path.join(root, 'public', file), 'utf8');
    if (file.endsWith('.html')) content = content.replace(/\b(href|src)="\//g, '$1="./');
    await fs.writeFile(path.join(output, file), content);
  }
  for (const file of ['runtime.js', 'gate.js']) await fs.copyFile(path.join(root, 'pages', file), path.join(output, file));
  await fs.copyFile(path.join(root, 'public/assets/yango.png'), path.join(output, 'assets/yango.png'));
  await fs.copyFile(path.join(root, 'node_modules/chart.js/dist/chart.umd.js'), path.join(output, 'vendor/chart.js'));
  await fs.copyFile(path.join(root, 'node_modules/chart.js/LICENSE.md'), path.join(output, 'vendor/chart-LICENSE.txt'));
  await fs.copyFile(path.join(root, 'node_modules/lucide/LICENSE'), path.join(output, 'vendor/lucide-LICENSE.txt'));
  await build({ stdin: { contents: "import { createIcons, Eye, EyeOff, RefreshCw, LogOut, X } from 'lucide'; window.lucide = { createIcons: () => createIcons({ icons: { Eye, EyeOff, RefreshCw, LogOut, X } }) };", resolveDir: root }, bundle: true, minify: true, outfile: path.join(output, 'vendor/lucide.js'), platform: 'browser', format: 'iife', target: 'es2022', legalComments: 'inline' });
  await fs.writeFile(path.join(output, 'gate-config.json'), JSON.stringify(safeGate));
  await fs.writeFile(path.join(output, 'data.json'), JSON.stringify(publicSnapshot(snapshot)));
  await fs.writeFile(path.join(output, '.nojekyll'), '');
  return output;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const gate = JSON.parse(await fs.readFile(process.env.PAGES_GATE_FILE || '../measurement-pages-gate.json', 'utf8'));
  const snapshot = JSON.parse(await fs.readFile(process.env.SNAPSHOT_FILE || 'data/snapshot.json', 'utf8'));
  const output = await buildPages({ snapshot, gate, output: process.env.PAGES_OUTPUT || path.join(root, 'dist-pages'), allowPublicData: process.env.ALLOW_PUBLIC_DATA === 'yes' });
  console.log(`Pages preparado: ${output}. Corte de datos: ${snapshot.meta.cutoff}. Los datos publicados son publicos.`);
}
