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
export const names = { trips: 'Completed trips', gmv: 'GMV', new: 'New users', installs: 'Installs', ticket: 'Average fare', active: 'Active Users', frequency: 'Trips per Active User' };
export const numeric = value => typeof value === 'number' && Number.isFinite(value);
export const dateObject = date => new Date(`${date}T00:00:00Z`);
export function shiftDate(date, offset) { const day = dateObject(date); day.setUTCDate(day.getUTCDate() + offset); return day.toISOString().slice(0, 10); }
export function weekStart(date) { const day = dateObject(date).getUTCDay(); return shiftDate(date, -((day + 6) % 7)); }
export const dayIndex = date => (dateObject(date).getUTCDay() + 6) % 7;
export const formatDate = date => new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' }).format(dateObject(date));
export const monthLabel = month => new Intl.DateTimeFormat('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(dateObject(`${month}-01`));
export const rangeDates = (start, end) => { const dates = []; for (let date = start; date <= end; date = shiftDate(date, 1)) dates.push(date); return dates; };
export function monthDates(month) { const first = `${month}-01`; const next = dateObject(first); next.setUTCMonth(next.getUTCMonth() + 1); return rangeDates(first, shiftDate(next.toISOString().slice(0, 10), -1)); }
export function chartDates(state) { if (state.period === 'week') return rangeDates(state.week, shiftDate(state.week, 6)); const month = monthDates(state.month); return rangeDates(weekStart(month[0]), month.at(-1)); }

export function chartWeeks(dates) {
  const groups = [];
  dates.forEach((date, index) => {
    const key = weekStart(date);
    if (groups.at(-1)?.key !== key) groups.push({ key, startIndex: index, endIndex: index });
    else groups.at(-1).endIndex = index;
  });
  return groups;
}

export function weeksForMonth(month) {
  return [...new Set(monthDates(month).map(weekStart))].map(start => ({ key: start, end: shiftDate(start, 6), label: `${formatDate(start)}–${formatDate(shiftDate(start, 6))}` }));
}

const sum = (records, field) => records.reduce((total, day) => total + day[field], 0);
export function weeklyTarget(data, key) {
  const target = data.weeklyPlans?.[key]?.active;
  return numeric(target) && target >= 0 ? target : null;
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
  const closed = !!data.meta.cutoff && end <= data.meta.cutoff;
  const upcoming = !data.meta.cutoff || key > data.meta.cutoff;
  const target = weeklyTarget(data, key);
  const record = closed ? data.weeklyActuals?.find(row => row.weekStart === key && row.weekEnd === end && row.status === 'closed') : null;
  const users = numeric(record?.activeUnique) && record.activeUnique >= 0 ? record.activeUnique : null;
  const frequencyTarget = data.weeklyPlans?.[key]?.frequency;
  return {
    key, end, closed, upcoming, label: `${formatDate(key)}–${formatDate(end)}`,
    active: { actual: users, expected: target, fullTarget: target, closed, upcoming },
    frequency: {
      actual: users > 0 && numeric(record?.trips) && record.trips >= 0 ? record.trips / users : null,
      expected: numeric(frequencyTarget) && frequencyTarget >= 0 ? frequencyTarget : null,
      closed, upcoming,
    },
  };
}

export function kpisFor(data, state) {
  const dates = state.period === 'week' ? rangeDates(state.week, shiftDate(state.week, 6)) : monthDates(state.month);
  const aggs = Object.fromEntries(Object.keys(fields).map(metric => [metric, aggregate(data, dates, metric)]));
  const targets = data.monthlyTargets?.[state.month] || {};
  const monthWeeks = weeksForMonth(state.month), current = weekStart(data.meta.cutoff || `${state.month}-01`);
  const latestClosed = monthWeeks.filter(week => {
    const values = weeklyMetrics(data, week.key);
    return values.closed && numeric(values.active.actual) && numeric(values.frequency.actual);
  }).at(-1);
  const equityKey = latestClosed?.key || monthWeeks.find(week => week.key === current)?.key || monthWeeks.filter(week => week.key <= data.meta.cutoff).at(-1)?.key || monthWeeks[0].key;
  const equity = weeklyMetrics(data, equityKey);
  const weekly = state.period === 'week' ? weeklyMetrics(data, state.week) : equity;
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
  primaryAndLevers.push({ id: 'active', title: names.active, group: 'weekly', unit: 'number', ...equity.active, forecast: null, rangeLabel: equity.label });
  primaryAndLevers.push({ id: 'frequency', title: names.frequency, group: 'weekly', unit: 'ratio', ...equity.frequency, forecast: null, rangeLabel: equity.label });
  return { kpis: primaryAndLevers, dates, weekly, equity, coverage: aggs.trips.coverage };
}

export function chartSeries(data, state, metric, mode) {
  const dates = chartDates(state);
  const [actualField, planField] = fields[metric];
  const rows = dates.map(date => data.days.find(day => day.date === date));
  const actual = rows.map(day => day && day.date <= data.meta.cutoff && numeric(day[actualField]) ? day[actualField] : null);
  const plan = rows.map(day => day && numeric(day[planField]) ? day[planField] : null);
  if (mode === 'daily') return { dates, actual, plan };
  // A gap prevents a cumulative count from being presented as a complete sum.
  const accumulate = values => { let total = 0, complete = true; return values.map((value, index) => { if (state.period === 'month' && !dates[index].startsWith(state.month)) return null; if (!numeric(value)) { complete = false; return null; } if (!complete) return null; total += value; return total; }); };
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
