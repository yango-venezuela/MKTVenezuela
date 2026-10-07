import { numeric, change, monthDates, rangeDates, shiftDate, chartDates } from './model.js';

export const performanceNames = { spend: 'Spend', cpi: 'CPI', paidShare: 'Paid Share', paidCac: 'Paid CAC' };
const valid = value => numeric(value) && value >= 0;
const ratio = (numerator, denominator) => valid(numerator) && denominator > 0 ? numerator / denominator : null;
const total = (rows, field) => rows.length && rows.every(row => valid(row?.[field])) ? rows.reduce((sum, row) => sum + row[field], 0) : null;
const windowDates = state => state.period === 'week' ? rangeDates(state.week, shiftDate(state.week, 6)) : monthDates(state.month);

export function performanceStatus(id, actual, expected) {
  if (!numeric(actual)) return { key: 'unknown', label: 'No data' };
  if (!numeric(expected)) return { key: 'unknown', label: 'Target pending' };
  if (id === 'spend') {
    if (actual === expected) return { key: 'ok', label: 'On pace' };
    const pace = change(actual, expected);
    return pace === null ? { key: 'bad', label: 'Above pace' } : Math.abs(pace) <= .05 ? { key: 'ok', label: 'On pace' } : { key: pace > 0 ? 'bad' : 'warn', label: pace > 0 ? 'Above pace' : 'Below pace' };
  }
  // Paid share is a mix indicator, not a lower-is-better acquisition cost.
  if (id === 'paidShare') return { key: 'unknown', label: actual === expected ? 'On target' : actual > expected ? 'Above target' : 'Below target' };
  return { key: actual <= expected ? 'ok' : 'bad', label: actual <= expected ? 'Within target' : 'Above target' };
}

export function performanceFor(data, state) {
  const dates = windowDates(state);
  const cutoff = data.meta.performanceCutoff || null;
  const sourceDates = data.days.map(row => row.date).sort();
  const elapsed = cutoff ? dates.filter(date => date <= cutoff && date >= sourceDates[0] && date <= sourceDates.at(-1)) : [];
  const rows = elapsed.map(date => data.days.find(row => row.date === date));
  const fullRows = dates.map(date => data.days.find(row => row.date === date));
  const targets = data.performanceTargets?.[state.month] || {};
  const spend = total(rows, 'spendAct'), spendPlan = total(rows, 'spendBdg');
  const installs = total(rows, 'installsAct'), installsPlan = total(rows, 'installsBdg');
  const newUsers = total(rows, 'newAct'), paidUsers = total(rows, 'paidUsersAct');
  const fullPlan = state.period === 'month' && valid(targets.spend) ? targets.spend : total(fullRows, 'spendBdg');
  const pace = numeric(change(spend, spendPlan)) ? spend / spendPlan : null;
  const actual = { spend, cpi: ratio(spend, installs), paidShare: ratio(paidUsers, newUsers), paidCac: ratio(spend, paidUsers) };
  const expected = { spend: spendPlan, cpi: valid(targets.cpi) ? targets.cpi : ratio(spendPlan, installsPlan), paidShare: numeric(targets.paidShare) && targets.paidShare >= 0 && targets.paidShare <= 1 ? targets.paidShare : null, paidCac: valid(targets.paidCac) ? targets.paidCac : null };
  return {
    dates, elapsed, cutoff, pace, fullPlan,
    forecast: state.period === 'month' && valid(fullPlan) && numeric(pace) ? fullPlan * pace : null,
    kpis: Object.keys(performanceNames).map(id => ({ id, title: performanceNames[id], actual: actual[id], expected: expected[id], unit: id === 'paidShare' ? 'pct' : id === 'spend' ? 'usd' : 'cost', status: performanceStatus(id, actual[id], expected[id]) })),
  };
}

export function performanceSeries(data, state, metric) {
  const dates = chartDates(state);
  const actualField = metric === 'spend' ? 'spendAct' : 'paidCacAct';
  const planField = metric === 'spend' ? 'spendBdg' : 'paidCacBdg';
  return {
    dates,
    actual: dates.map(date => {
      const row = data.days.find(day => day.date === date);
      return data.meta.performanceCutoff && date <= data.meta.performanceCutoff && valid(row?.[actualField]) ? row[actualField] : null;
    }),
    plan: dates.map(date => {
      const row = data.days.find(day => day.date === date);
      if (valid(row?.[planField])) return row[planField];
      const target = data.performanceTargets?.[date.slice(0, 7)]?.paidCac;
      return metric === 'paidCac' && row && valid(target) ? target : null;
    }),
  };
}
