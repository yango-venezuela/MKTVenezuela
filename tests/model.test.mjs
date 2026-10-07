import test from 'node:test';
import assert from 'node:assert/strict';
import { chartSeries, focusStatus, focusCell, weekStart, formatDate, weeklyMetrics, kpisFor, activeProfile, shiftDate } from '../public/model.js';
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
    meta: { cutoff: '2026-10-06', month: '2026-10' },
  };
}

test('calendar dates do not move back one day in Caracas', () => {
  assert.equal(formatDate('2026-10-01'), 'Oct 1');
  assert.equal(weekStart('2026-10-06'), '2026-10-05');
});
test('weekly frequency uses matching trips and deduplicated users at the cutoff', () => {
  const values = weeklyMetrics(sample(), '2026-10-05');
  assert.equal(values.active.actual, 70);
  assert.equal(values.active.fullTarget, 350);
  assert.equal(values.active.expected, 350 * activeProfile(sample()).cumulative[1]);
  assert.equal(values.frequency.actual, 300 / 70);
  assert.equal(values.frequency.expected, 200 / (350 * activeProfile(sample()).cumulative[1]));
});
test('a missing trip day prevents a frequency for an incomplete numerator', () => {
  const data = sample(); data.days[0].tripsAct = null;
  assert.equal(weeklyMetrics(data, '2026-10-05').frequency.actual, null);
});
test('a missing active count does not become zero or an inferred unique count', () => {
  const data = sample(); data.active = [];
  const values = weeklyMetrics(data, '2026-10-05');
  assert.equal(values.active.actual, null);
  assert.equal(values.frequency.actual, null);
});
test('historical curve is derived only from complete deduplicated weeks', () => {
  assert.deepEqual(activeProfile(sample()).cumulative, [.2, .4, .55, .7, .8, .9, 1]);
  const data = sample(); data.active = data.active.slice(7);
  assert.equal(activeProfile(data), null);
  assert.equal(weeklyMetrics(data, '2026-10-05').active.expected, null);
});
test('week charts change their date window and leave future actuals blank', () => {
  const result = chartSeries(sample(), { period: 'week', week: '2026-10-05' }, 'trips', 'cum');
  assert.equal(result.dates.length, 7);
  assert.deepEqual(result.actual, [150, 300, null, null, null, null, null]);
  assert.deepEqual(result.plan, [100, 200, 300, 400, 500, 600, 700]);
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
