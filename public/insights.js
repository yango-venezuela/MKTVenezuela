import { numeric, change, focusStatus, kpisFor, weeksForMonth, formatDate, monthLabel } from './model.js';

const percent = value => `${value >= 0 ? '+' : ''}${(value * 100).toFixed(1)}%`;
const compare = kpi => change(kpi.actual, kpi.expected);

export function periodInsight(data, state) {
  const view = kpisFor(data, state);
  const metrics = Object.fromEntries(view.kpis.map(kpi => [kpi.id, kpi]));
  const trips = compare(metrics.trips), gmv = compare(metrics.gmv);
  const installs = compare(metrics.installs), newbies = compare(metrics.new);
  const observed = metrics.trips.observedDates.filter(date => metrics.gmv.observedDates.includes(date));
  const rangeLabel = observed.length ? `${formatDate(observed[0])}–${formatDate(observed.at(-1))}` : 'Actuals pending';
  const title = state.period === 'month' ? 'Month overview' : 'Week focus';
  const windowLabel = state.period === 'month' ? monthLabel(state.month) : view.weekly.label;
  const result = { title, windowLabel, rangeLabel, status: 'unknown', headline: 'Not enough comparable data for this window.', detail: '', action: '' };
  if (!numeric(trips) || !numeric(gmv)) return result;
  const primaryStates = [metrics.trips, metrics.gmv].map(kpi => focusStatus(kpi.actual, kpi.expected));
  result.status = primaryStates.includes('bad') ? 'bad' : primaryStates.includes('warn') ? 'warn' : 'ok';
  result.headline = `Trips ${percent(trips)} and GMV ${percent(gmv)} vs. plan to date.`;
  if (numeric(installs) && numeric(newbies)) result.detail = `Installs ${percent(installs)}; new users ${percent(newbies)} vs. plan.`;
  else if (numeric(installs)) result.detail = `Installs ${percent(installs)} vs. plan; new-user comparison is unavailable.`;
  else if (numeric(newbies)) result.detail = `New users ${percent(newbies)} vs. plan; install comparison is unavailable.`;

  if (gmv < 0 && numeric(metrics.ticket.actual) && numeric(metrics.ticket.expected)) {
    const volumeEffect = (metrics.trips.actual - metrics.trips.expected) * metrics.ticket.expected;
    const fareEffect = metrics.trips.actual * (metrics.ticket.actual - metrics.ticket.expected);
    result.action = fareEffect < volumeEffect ? 'Average fare contributes more than volume to the GMV gap. Review fare and trip mix.' : 'Trip volume contributes more to the GMV gap. Review active users and frequency when comparable data is available.';
  } else if (trips < 0) result.action = 'GMV is holding up while trips are below plan. Review whether average fare is compensating for lower volume.';
  else if (numeric(installs) && installs < 0) result.action = numeric(newbies) && newbies >= 0 ? 'New-user volume is holding up despite lower installs. Review acquisition continuity.' : 'Review acquisition continuity and first-trip activation.';
  else if (numeric(newbies) && newbies < 0) result.action = 'New users are below plan. Review first-trip activation without assuming installs and new users belong to the same cohort.';
  else result.action = 'Both primary results are on plan. Watch the acquisition and usage trends for sustained deviations.';
  return result;
}

export function weeklyInsights(data, month) {
  return weeksForMonth(month).filter(week => data.meta.cutoff && week.key <= data.meta.cutoff && data.days.some(day => day.date >= week.key && day.date <= week.end && day.date.startsWith(month) && day.date <= data.meta.cutoff && numeric(day.tripsAct) && numeric(day.gmvAct)))
    .map(week => ({ key: week.key, ...periodInsight(data, { period: 'week', month, week: week.key }) }));
}
