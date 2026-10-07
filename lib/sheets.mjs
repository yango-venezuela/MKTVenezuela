import fs from 'node:fs/promises';
import path from 'node:path';
import { GoogleAuth } from 'google-auth-library';
import { weekStart, shiftDate } from '../public/model.js';

const finite = value => typeof value === 'number' && Number.isFinite(value) ? value : null;
const isoDate = value => {
  if (typeof value === 'number') return new Date(Date.UTC(1899, 11, 30) + value * 86400000).toISOString().slice(0, 10);
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  return null;
};
const quote = name => `'${name.replaceAll("'", "''")}'`;

const columnName = index => {
  let name = '';
  for (index++; index > 0; index = Math.floor((index - 1) / 26)) name = String.fromCharCode(65 + (index - 1) % 26) + name;
  return name;
};

export function trackerRanges(headers) {
  const date = headers[2]?.indexOf('Date') ?? -1, budget = headers[0]?.indexOf('Budget') ?? -1;
  if (date < 0 || budget <= date + 19) throw new Error('No encontramos los encabezados del Daily Tracker.');
  return { daily: `${columnName(date)}1:${columnName(date + 19)}37`, summary: `${columnName(budget - 1)}3:${columnName(budget + 6)}8`, weekly: `E5:${columnName(date)}37` };
}

export function parseWeeklyPlans(activeRows) {
  const dateColumn = activeRows[0]?.indexOf('Date') ?? -1;
  if (activeRows[0]?.[0] !== 'ActiveRiders/Weekly' || dateColumn < 2) throw new Error('El formato de los planes semanales ha cambiado.');
  const plans = {};
  for (const row of activeRows.slice(1)) {
    const date = isoDate(row[dateColumn]);
    if (!date) continue;
    const key = weekStart(date);
    for (const [field, value] of [['active', row[0]], ['frequency', row[1]]]) {
      const target = finite(value);
      if (target === null || target < 0) continue;
      if (!plans[key]) plans[key] = { active: null, frequency: null };
      if (plans[key][field] !== null && Math.abs(plans[key][field] - target) > 1e-6) throw new Error(`Hay distintos planes de ${field} dentro de la semana ${key}.`);
      if (plans[key][field] === null) plans[key][field] = target;
    }
  }
  return plans;
}

export function parseClosedWeekly(rows, cutoff) {
  const records = [];
  for (const row of rows) {
    if (row[0] !== 'Caracas' || row[6] !== 'Total') continue;
    const start = isoDate(row[4]);
    if (!start || start !== weekStart(start)) continue;
    const end = shiftDate(start, 6), activeUnique = finite(row[13]), trips = finite(row[35]);
    if (!cutoff || end > cutoff || activeUnique === null || activeUnique < 0 || trips === null || trips < 0) continue;
    if (records.some(record => record.weekStart === start)) throw new Error(`Hay registros Total duplicados en la semana ${start}.`);
    records.push({ weekStart: start, weekEnd: end, activeUnique, trips, status: 'closed' });
  }
  return records.sort((a, b) => a.weekStart.localeCompare(b.weekStart));
}

export function parseTracker(daily, summary, activeRows = []) {
  const headers = daily[4] || [];
  if (headers[0] !== 'Date' || headers[1] !== 'Bdg' || headers[2] !== 'Act' || headers[9] !== 'Act in Yango') throw new Error('El formato del Daily Tracker ha cambiado.');
  const days = daily.slice(5).map(row => {
    const date = isoDate(row[0]);
    if (!date) return null;
    return {
      date,
      tripsBdg: finite(row[1]), tripsAct: finite(row[2]),
      gmvBdg: finite(row[3]), gmvAct: finite(row[4]),
      newBdg: finite(row[8]), newAct: finite(row[9]),
      newWithoutBipBip: finite(row[10]),
      installsBdg: finite(row[6]), installsAct: finite(row[7]),
      activePlanAllocation: finite(row[11]),
      spendBdg: finite(row[15]), spendAct: finite(row[16]),
      cpiAct: finite(row[17]), paidShareAct: finite(row[18]), paidCacAct: finite(row[19]),
      paidUsersAct: finite(row[18]) !== null && row[18] >= 0 && row[18] <= 1 && finite(row[9]) !== null && row[9] >= 0 ? row[18] * row[9] : null,
    };
  }).filter(Boolean).sort((a, b) => a.date.localeCompare(b.date));
  if (!days.length || new Set(days.map(day => day.date)).size !== days.length) throw new Error('Fechas ausentes o duplicadas en el tracker.');
  const month = isoDate(daily[2]?.[0])?.slice(0, 7) || days[0].date.slice(0, 7);
  const budgets = {};
  const mapping = { Trips: 'trips', GMV: 'gmv', NewRiders: 'new', Installs: 'installs' };
  for (const row of summary) if (mapping[row[0]]) budgets[mapping[row[0]]] = finite(row[1]);
  const complete = days.filter(day => ['tripsAct', 'gmvAct', 'newAct', 'installsAct'].every(field => day[field] !== null));
  const cutoff = complete.at(-1)?.date || null;
  const active = activeRows.slice(1).map(row => ({
    date: isoDate(row[0]), weekStart: isoDate(row[1]), weekEnd: isoDate(row[2]),
    dailyUnique: finite(row[4]), cumulativeUnique: finite(row[5]),
    weeklyUnique: finite(row[6]), weeklyTarget: finite(row[7]), status: row[8],
  })).filter(row => row.date && row.weekStart && row.weekEnd && row.status === 'completo');
  const warnings = [];
  for (const [metric, field] of Object.entries({ trips: 'tripsBdg', gmv: 'gmvBdg', new: 'newBdg', installs: 'installsBdg' })) {
    const values = days.filter(day => day.date.startsWith(month) && day[field] !== null);
    const total = values.reduce((sum, day) => sum + day[field], 0);
    const budget = budgets[metric];
    if (budget !== null && budget !== undefined && Math.abs(total - budget) > Math.max(1, budget * .005)) {
      warnings.push({ metric, kind: 'plan-mismatch', monthlyBudget: budget, dailyPlanTotal: total });
    }
  }
  const performanceCutoff = days.filter(day => ['spendAct', 'installsAct', 'paidUsersAct', 'newAct'].every(field => day[field] !== null)).at(-1)?.date || null;
  const performanceTargets = { [month]: { spend: finite(daily[3]?.[15]), cpi: finite(daily[1]?.[15]), paidShare: null, paidCac: null } };
  return { days, active, monthlyTargets: { [month]: budgets }, performanceTargets, meta: { month, cutoff, performanceCutoff, warnings, retrievedAt: new Date().toISOString(), source: 'google-sheets', live: true } };
}

export class DataProvider {
  constructor(config = process.env) {
    this.config = config;
    this.cached = null;
    this.loadedAt = 0;
    this.inflight = null;
  }

  async load(refresh = false) {
    if (!refresh && this.cached && Date.now() - this.loadedAt < 300000) return this.cached;
    if (this.inflight) return this.inflight;
    this.inflight = this.read().then(data => {
      this.cached = data;
      this.loadedAt = Date.now();
      return data;
    }).finally(() => { this.inflight = null; });
    return this.inflight;
  }

  async read() {
    const snapshotPath = path.resolve(this.config.SNAPSHOT_FILE || 'data/snapshot.json');
    let snapshot = null;
    try { snapshot = JSON.parse(await fs.readFile(snapshotPath, 'utf8')); } catch (error) { if (error.code !== 'ENOENT') throw error; }
    if (!this.config.GOOGLE_SERVICE_ACCOUNT_JSON) {
      if (!snapshot) throw new Error('La conexion de datos todavia no esta configurada.');
      return { ...snapshot, meta: { ...snapshot.meta, source: 'saved-read', live: false } };
    }
    try {
      const credentials = JSON.parse(this.config.GOOGLE_SERVICE_ACCOUNT_JSON);
      const auth = new GoogleAuth({ credentials, scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'] });
      const client = await auth.getClient();
      const root = `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(this.config.SHEET_ID)}`;
      const tab = this.config.DAILY_TRACKER_TAB || '4. Daily Tracker';
      const headerRead = await client.request({ url: `${root}/values:batchGet`, params: { ranges: [`${quote(tab)}!A3:AS5`], valueRenderOption: 'UNFORMATTED_VALUE' }, timeout: 15000 });
      const layout = trackerRanges(headerRead.data.valueRanges?.[0]?.values || []);
      const ranges = [layout.daily, layout.summary, layout.weekly].map(range => `${quote(tab)}!${range}`);
      ranges.push("'6. DB Weekly'!A2:AJ300");
      if (this.config.ACTIVE_USERS_TAB) {
        const metadata = await client.request({ url: root, params: { fields: 'sheets.properties' }, timeout: 15000 });
        const sheet = metadata.data.sheets.find(item => item.properties.title === this.config.ACTIVE_USERS_TAB);
        if (!sheet) throw new Error('No encontramos la tabla configurada de usuarios activos.');
        ranges.push(`${quote(this.config.ACTIVE_USERS_TAB)}!A1:I${Math.min(sheet.properties.gridProperties.rowCount, 5000)}`);
      }
      const response = await client.request({ url: `${root}/values:batchGet`, params: { ranges, valueRenderOption: 'UNFORMATTED_VALUE', dateTimeRenderOption: 'SERIAL_NUMBER' }, timeout: 20000 });
      const values = response.data.valueRanges;
      const data = parseTracker(values[0]?.values || [], values[1]?.values || [], values[4]?.values || []);
      data.weeklyPlans = parseWeeklyPlans(values[2]?.values || []);
      data.weeklyActuals = parseClosedWeekly(values[3]?.values || [], data.meta.cutoff);
      if (!data.active.length && snapshot?.active) data.active = snapshot.active;
      return data;
    } catch (error) {
      if (!snapshot && !this.cached) throw new Error('No pudimos leer Google Sheets. Revisa la conexion del servidor.');
      const saved = this.cached || snapshot;
      return { ...saved, meta: { ...saved.meta, live: false, source: 'saved-read', stale: true } };
    }
  }
}
