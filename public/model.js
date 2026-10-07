export function activeProfile(data) {
  const weeks = [...new Set((data.active || []).map(row => row.weekStart))];
  const complete = weeks.map(key => rangeDates(key, shiftDate(key, 6)).map(date => data.active.find(row => row.date === date && row.weekStart === key)))
    .filter(rows => rows.every(row => row && row.date <= data.meta.cutoff && numeric(row.dailyUnique) && numeric(row.cumulativeUnique) && row.weeklyUnique > 0)
      && rows.every((row, index) => row.weeklyUnique === rows[0].weeklyUnique && row.dailyUnique <= row.weeklyUnique && row.cumulativeUnique <= row.weeklyUnique && (!index || row.cumulativeUnique >= rows[index - 1].cumulativeUnique))
      && rows[6].cumulativeUnique === rows[0].weeklyUnique);
  if (!complete.length) return null;
  return Object.fromEntries([['daily', 'dailyUnique'], ['cumulative', 'cumulativeUnique']].map(([key, field]) => [key,
    Array.from({ length: 7 }, (_, index) => complete.reduce((total, rows) => total + rows[index][field] / rows[index].weeklyUnique, 0) / complete.length),
  ]));
}
export const fields = { trips: ['tripsAct', 'tripsBdg'], gmv: ['gmvAct', 'gmvBdg'], new: ['newAct', 'newBdg'], installs: ['installsAct', 'installsBdg'] };
export const names = { trips: 'Completed trips', gmv: 'GMV', new: 'New users', installs: 'Installs', ticket: 'Average fare', active: 'Active Users · weekly', frequency: 'Trips per Active User · weekly' };
export const numeric = value => typeof value === 'number' && Number.isFinite(value);
export const dateObject = date => new Date(`${date}T00:00:00Z`);
export function shiftDate(date, offset) { const day = dateObject(date); day.setUTCDate(day.getUTCDate() + offset); return day.toISOString().slice(0, 10); }
export function weekStart(date) { const day = dateObject(date).getUTCDay(); return shiftDate(date, -((day + 6) % 7)); }
export const dayIndex = date => (dateObject(date).getUTCDay() + 6) % 7;
export const formatDate = date => new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' }).format(dateObject(date));
export const monthLabel = month => new Intl.DateTimeFormat('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(dateObject(`${month}-01`));
export const rangeDates = (start, end) => { const dates = []; for (let date = start; date <= end; date = shiftDate(date, 1)) dates.push(date); return dates; };
export function monthDates(month) { const first = `${month}-01`; const next = dateObject(first); next.setUTCMonth(next.getUTCMonth() + 1); return rangeDates(first, shiftDate(next.toISOString().slice(0, 10), -1)); }

export function weeksForMonth(month) {
  return [...new Set(monthDates(month).map(weekStart))].map(start => ({ key: start, end: shiftDate(start, 6), label: `${formatDate(start)}–${formatDate(shiftDate(start, 6))}` }));
}

const sum = (records, field) => records.reduce((total, day) => total + day[field], 0);
export function weeklyTarget(data, key) {
  const explicit = data.active?.find(row => row.weekStart === key && numeric(row.weeklyTarget));
  if (explicit) return explicit.weeklyTarget;
  const rows = rangeDates(key, shiftDate(key, 6)).map(date => data.days.find(day => day.date === date));
  if (rows.every(day => day && numeric(day.activePlanAllocation))) return sum(rows, 'activePlanAllocation');
  const saved = data.weeklyTargets?.[key];
  return numeric(saved) ? saved : null;
}

export function status(actual, expected) {
  if (!numeric(actual)) return { key: 'unknown', label: 'No data' };
  if (!numeric(expected)) return { key: 'unknown', label: 'Plan pending' };
  return actual >= expected ? { key: 'ok', label: 'On plan' } : { key: 'bad', label: 'Below plan' };
}
export function change(actual, expected) { return numeric(actual) && numeric(expected) && expected > 0 ? actual / expected - 1 : null; }
export function focusStatus(actual, expected) { const delta = change(actual, expected); return delta === null ? 'unavailable' : actual >= expected ? 'ok' : actual >= expected * .95 ? 'warn' : 'bad'; }

export function aggregate(data, dates, metric) {
  const [actualField, planField] = fields[metric];
  const selected = dates.map(date => data.days.find(day => day.date === date)).filter(Boolean);
  const observed = selected.filter(day => day.date <= data.meta.cutoff && numeric(day[actualField]));
  const matching = observed.filter(day => numeric(day[planField]));
  const allPlan = selected.filter(day => numeric(day[planField]));
  return {
    actual: observed.length ? sum(observed, actualField) : null,
    expected: observed.length && matching.length === observed.length ? sum(matching, planField) : null,
    fullPlan: allPlan.length === dates.length ? sum(allPlan, planField) : null,
    observedDates: observed.map(day => day.date),
    coverage: selected.length,
  };
}

export function weeklyMetrics(data, key) {
  const end = shiftDate(key, 6);
  const cutoff = data.meta.cutoff && data.meta.cutoff < end ? data.meta.cutoff : end;
  const target = weeklyTarget(data, key);
  const curve = activeProfile(data);
  const elapsed = cutoff && cutoff >= key ? dayIndex(cutoff) : null;
  const actualRow = elapsed !== null ? data.active?.find(row => row.date === cutoff && row.weekStart === key) : null;
  const users = numeric(actualRow?.cumulativeUnique) ? actualRow.cumulativeUnique : null;
  const expectedUsers = numeric(target) && elapsed !== null && curve ? target * curve.cumulative[elapsed] : null;
  const dates = cutoff && cutoff >= key ? rangeDates(key, cutoff) : [];
  const trips = dates.length ? aggregate(data, dates, 'trips') : null;
  const allObserved = trips && trips.observedDates.length === dates.length;
  const completePlans = trips && trips.coverage === dates.length && numeric(trips.expected);
  return {
    key, end, cutoff, label: `${formatDate(key)}–${formatDate(end)}`,
    active: { actual: users, expected: expectedUsers, fullTarget: target },
    frequency: {
      actual: allObserved && users > 0 ? trips.actual / users : null,
      expected: completePlans && expectedUsers > 0 ? trips.expected / expectedUsers : null,
    },
  };
}

export function kpisFor(data, state) {
  const dates = state.period === 'week' ? rangeDates(state.week, shiftDate(state.week, 6)) : monthDates(state.month);
  const aggs = Object.fromEntries(Object.keys(fields).map(metric => [metric, aggregate(data, dates, metric)]));
  const targets = data.monthlyTargets?.[state.month] || {};
  const closed = [...new Set((data.active || []).filter(row => row.date === row.weekEnd && row.weekEnd <= data.meta.cutoff).map(row => row.weekStart))].sort();
  const weeklyKey = state.period === 'week' ? state.week : closed.at(-1) || weekStart(data.meta.cutoff || `${state.month}-01`);
  const weekly = weeklyMetrics(data, weeklyKey);
  const primaryAndLevers = Object.keys(fields).map(id => {
    const agg = aggs[id];
    const target = numeric(targets[id]) ? targets[id] : agg.fullPlan;
    return { id, title: names[id], group: ['trips', 'gmv'].includes(id) ? 'primary' : 'lever', unit: id === 'gmv' ? 'usd' : 'number', ...agg,
      forecast: state.period === 'month' && numeric(target) && agg.expected > 0 && numeric(agg.actual) ? target * agg.actual / agg.expected : null,
      forecastTarget: target,
    };
  });
  const sameObservedDates = aggs.trips.observedDates.join(',') === aggs.gmv.observedDates.join(',');
  primaryAndLevers.push({ id: 'ticket', title: names.ticket, group: 'lever', unit: 'usd',
    actual: sameObservedDates && aggs.trips.actual > 0 && numeric(aggs.gmv.actual) ? aggs.gmv.actual / aggs.trips.actual : null,
    expected: sameObservedDates && aggs.trips.expected > 0 && numeric(aggs.gmv.expected) ? aggs.gmv.expected / aggs.trips.expected : null,
    forecast: null, forecastTarget: null,
  });
  primaryAndLevers.push({ id: 'active', title: names.active, group: 'weekly', unit: 'number', ...weekly.active, forecast: null, rangeLabel: weekly.label });
  primaryAndLevers.push({ id: 'frequency', title: names.frequency, group: 'weekly', unit: 'ratio', ...weekly.frequency, forecast: null, rangeLabel: weekly.label });
  return { kpis: primaryAndLevers, dates, weekly, coverage: aggs.trips.coverage };
}

export function chartSeries(data, state, metric, mode) {
  const dates = state.period === 'week' ? rangeDates(state.week, shiftDate(state.week, 6)) : monthDates(state.month);
  const [actualField, planField] = fields[metric];
  const rows = dates.map(date => data.days.find(day => day.date === date));
  const actual = rows.map(day => day && day.date <= data.meta.cutoff && numeric(day[actualField]) ? day[actualField] : null);
  const plan = rows.map(day => day && numeric(day[planField]) ? day[planField] : null);
  if (mode === 'daily') return { dates, actual, plan };
  // A gap prevents a cumulative count from being presented as a complete sum.
  const accumulate = values => { let total = 0, complete = true; return values.map(value => { if (!numeric(value)) { complete = false; return null; } if (!complete) return null; total += value; return total; }); };
  return { dates, actual: accumulate(actual), plan: accumulate(plan) };
}

export function focusCell(data, week, id) {
  if (id === 'active' || id === 'frequency') return weeklyMetrics(data, week.key)[id];
  const dates = rangeDates(week.key, week.end);
  const available = dates.filter(date => data.days.some(day => day.date === date));
  const partialLabel = available.length && available.length < dates.length ? `${formatDate(available[0])}–${formatDate(available.at(-1))} only` : null;
  const upcoming = !data.meta.cutoff || week.key > data.meta.cutoff;
  if (id === 'ticket') {
    const trips = aggregate(data, dates, 'trips'), gmv = aggregate(data, dates, 'gmv');
    const aligned = trips.observedDates.join(',') === gmv.observedDates.join(',');
    return { partialLabel, actual: aligned && trips.actual > 0 && numeric(gmv.actual) ? gmv.actual / trips.actual : null,
      expected: upcoming ? (trips.fullPlan > 0 && numeric(gmv.fullPlan) ? gmv.fullPlan / trips.fullPlan : null) : (trips.expected > 0 && numeric(gmv.expected) ? gmv.expected / trips.expected : null) };
  }
  const agg = aggregate(data, dates, id);
  return { actual: agg.actual, expected: upcoming ? agg.fullPlan : agg.expected, partialLabel };
}
