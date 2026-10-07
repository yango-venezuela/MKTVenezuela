import test from 'node:test';
import assert from 'node:assert/strict';
import { chartSeries, chartDates, chartWeeks, focusStatus, focusCell, weekStart, formatDate, weeklyMetrics, kpisFor, activeProfile, shiftDate } from '../public/model.js';
import { parseTracker } from '../lib/sheets.mjs';

function sample() {
  return {
    days: Array.from({ length: 7 }, (_, index) => ({
      date: `2026-10-${String(index + 5).padStart(2, '0')}`,
      tripsAct: index < 2 ? 150 : null, tripsBdg: 100,
      gmvAct: index < 2 ? 300 : null, gmvBdg: 200,
      newAct: index < 2 ? 4 : null, newBdg: 5,
      installsAct: index < 2 ? 7 : null, installsBdg: 10,
      activePlanAllocation: 50,
    })),
    active: [
      ...[20, 40, 55, 70, 80, 90, 100].map((count, index) => ({ date: shiftDate('2026-09-28', index), weekStart: '2026-09-28', weekEnd: '2026-10-04', dailyUnique: 20, cumulativeUnique: count, weeklyUnique: 100 })),
      { date: '2026-10-05', weekStart: '2026-10-05', weekEnd: '2026-10-11', cumulativeUnique: 40, dailyUnique: 40, weeklyUnique: 100 },
      { date: '2026-10-06', weekStart: '2026-10-05', weekEnd: '2026-10-11', cumulativeUnique: 70, dailyUnique: 50, weeklyUnique: 100 },
    ],
    monthlyTargets: { '2026-10': { trips: 1000, gmv: 2000, new: 50, installs: 100 } },
    weeklyPlans: { '2026-10-05': { active: 100, frequency: 2.4 } },
    weeklyActuals: [{ weekStart: '2026-10-05', weekEnd: '2026-10-11', activeUnique: 100, trips: 300, status: 'closed' }],
    meta: { cutoff: '2026-10-06', month: '2026-10' },
  };
}

test('calendar dates do not move back one day in Caracas', () => {
  assert.equal(formatDate('2026-10-01'), 'Oct 1');
  assert.equal(weekStart('2026-10-06'), '2026-10-05');
});
test('weekly frequency uses the closed weekly numerator and its explicit weekly plan', () => {
  const data = sample(); data.meta.cutoff = '2026-10-11';
  const values = weeklyMetrics(data, '2026-10-05');
  assert.equal(values.active.actual, 100);
  assert.equal(values.active.fullTarget, 100);
  assert.equal(values.active.expected, 100);
  assert.equal(values.frequency.actual, 3);
  assert.equal(values.frequency.expected, 2.4);
});
test('closed weekly data does not depend on summing daily trips or users', () => {
  const data = sample(); data.meta.cutoff = '2026-10-11'; data.days[0].tripsAct = null;
  assert.equal(weeklyMetrics(data, '2026-10-05').frequency.actual, 3);
});
test('a missing active count does not become zero or an inferred unique count', () => {
  const data = sample(); data.meta.cutoff = '2026-10-11'; data.weeklyActuals = [];
  const values = weeklyMetrics(data, '2026-10-05');
  assert.equal(values.active.actual, null);
  assert.equal(values.frequency.actual, null);
});
test('historical curve is derived only from complete deduplicated weeks', () => {
  assert.deepEqual(activeProfile(sample()).cumulative, [.2, .4, .55, .7, .8, .9, 1]);
  const data = sample(); data.active = data.active.slice(7);
  assert.equal(activeProfile(data), null);
  assert.equal(weeklyMetrics(data, '2026-10-05').active.expected, 100);
});
test('week charts change their date window and leave future actuals blank', () => {
  const result = chartSeries(sample(), { period: 'week', week: '2026-10-05' }, 'trips', 'cum');
  assert.equal(result.dates.length, 7);
  assert.deepEqual(result.actual, [150, 300, null, null, null, null, null]);
  assert.deepEqual(result.plan, [100, 200, 300, 400, 500, 600, 700]);
});
test('monthly chart starts on the Monday of its first week without changing monthly KPIs', () => {
  const dates = chartDates({ period: 'month', month: '2026-10' });
  assert.equal(dates[0], '2026-09-28');
  assert.equal(dates.at(-1), '2026-10-31');
  assert.equal(dates.length, 34);
  const weeks = chartWeeks(dates);
  assert.deepEqual(weeks.map(week => [week.startIndex, week.endIndex]), [[0, 6], [7, 13], [14, 20], [21, 27], [28, 33]]);
  const data = sample(); data.days.unshift({ date: '2026-09-28', tripsAct: 9999, tripsBdg: 9999 });
  assert.equal(kpisFor(data, { period: 'month', month: '2026-10' }).kpis.find(kpi => kpi.id === 'trips').actual, 300);
});
test('missing September context does not blank the October cumulative chart', () => {
  const data = { days: [{ date: '2026-10-01', tripsAct: 10, tripsBdg: 12 }, { date: '2026-10-02', tripsAct: 20, tripsBdg: 24 }], meta: { cutoff: '2026-10-02' } };
  const result = chartSeries(data, { period: 'month', month: '2026-10' }, 'trips', 'cumulative');
  assert.deepEqual(result.actual.slice(0, 6), [null, null, null, 10, 30, null]);
  assert.deepEqual(result.plan.slice(0, 6), [null, null, null, 12, 36, null]);
});
test('September values provide daily context but do not enter October cumulative totals', () => {
  const data = { days: [{ date: '2026-09-30', tripsAct: 1000, tripsBdg: 2000 }, { date: '2026-10-01', tripsAct: 10, tripsBdg: 12 }], meta: { cutoff: '2026-10-01' } };
  const state = { period: 'month', month: '2026-10' };
  assert.equal(chartSeries(data, state, 'trips', 'daily').actual[2], 1000);
  assert.deepEqual(chartSeries(data, state, 'trips', 'cumulative').actual.slice(0, 4), [null, null, null, 10]);
});
test('focus map labels partial calendar weeks instead of claiming a full weekly total', () => {
  const data = sample(); data.days = data.days.slice(1);
  const result = focusCell(data, { key: '2026-10-05', end: '2026-10-11' }, 'trips');
  assert.equal(result.partialLabel, 'Oct 6–Oct 11 only');
  assert.equal(result.actual, 150);
  assert.equal(result.expected, 100);
});
test('small negative differences use the warning band, including under 0.1%', () => {
  assert.equal(focusStatus(99.99, 100), 'warn');
  assert.equal(focusStatus(95, 100), 'warn');
  assert.equal(focusStatus(94, 100), 'bad');
});
test('projection uses the approved monthly budget independently of daily-plan sum', () => {
  const result = kpisFor(sample(), { period: 'month', month: '2026-10' });
  const trips = result.kpis.find(kpi => kpi.id === 'trips');
  assert.equal(trips.actual, 300);
  assert.equal(trips.expected, 200);
  assert.equal(trips.forecast, 1500);
});
test('tracker parser retains true zeros, missing data and warns on conflicting plans', () => {
  const daily = [[], [], [46300], [], ['Date', 'Bdg', 'Act', 'Bdg', 'Act', 'Act', 'Bdg', 'Act', 'Bdg', 'Act in Yango'], [46300, 100, 0, 200, 0, null, 10, 0, 5, 0, 0, 50], [46301, 100, null, 200, null, null, 10, null, 5, null, null, 50]];
  const data = parseTracker(daily, [['Trips', 500], ['GMV', 1000], ['Installs', 100], ['NewRiders', 50]]);
  assert.equal(data.days[0].tripsAct, 0);
  assert.equal(data.days[1].tripsAct, null);
  assert.equal(data.meta.cutoff, '2026-10-05');
  assert.equal(data.meta.warnings.length, 4);
});
