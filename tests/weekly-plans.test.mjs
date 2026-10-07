import test from 'node:test';
import assert from 'node:assert/strict';
import { parseWeeklyPlans, parseClosedWeekly, trackerRanges } from '../lib/sheets.mjs';
import { weeklyMetrics, weeklyTarget, kpisFor, focusCell } from '../public/model.js';
import { publicSnapshot } from '../scripts/build-pages.mjs';

const active = [['ActiveRiders/Weekly', null, null, null, null, null, 'Date'], ...Array.from({ length: 7 }, (_, i) => [100, 2.4, null, null, null, null, 46300 + i])];

function weeklyRow(date, type = 'Total', users = 100, trips = 240) {
  const row = Array(36).fill(null); row[0] = 'Caracas'; row[4] = date; row[6] = type; row[13] = users; row[35] = trips;
  return row;
}
function sample() {
  return { days: [{ date: '2026-10-05', tripsBdg: 100, tripsAct: 100, activePlanAllocation: 999 }], active: [], meta: { cutoff: '2026-10-06', month: '2026-10' }, weeklyPlans: parseWeeklyPlans(active), weeklyActuals: [{ weekStart: '2026-10-05', weekEnd: '2026-10-11', activeUnique: 100, trips: 240, status: 'closed' }] };
}

test('seven repetitions of a weekly active target remain one target, not seven times the target', () => {
  const plans = parseWeeklyPlans(active);
  assert.deepEqual(plans, { '2026-10-05': { active: 100, frequency: 2.4 } });
  assert.equal(weeklyTarget(sample(), '2026-10-05'), 100);
});
test('partial first and last calendar weeks still get their full explicit weekly target', () => {
  const partial = [active[0], [100, 2.1, null, null, null, null, 46296]];
  assert.deepEqual(parseWeeklyPlans(partial)['2026-09-28'], { active: 100, frequency: 2.1 });
});
test('inconsistent repeated weekly plans are rejected instead of silently averaged or summed', () => {
  const rows = active.map(row => [...row]); rows[2][0] = 101;
  assert.throws(() => parseWeeklyPlans(rows), /distintos planes/);
});
test('repeated weekly frequency is not summed and conflicting frequency targets are rejected', () => {
  const rows = active.map(row => [...row]); rows[2][1] = 2.1;
  assert.throws(() => parseWeeklyPlans(rows), /distintos planes/);
});
test('inserting the frequency column shifts the daily block but keeps header-aligned parsing correct', () => {
  const before = [Array(44).fill(null), [], Array(44).fill(null)]; before[0][36] = 'Budget'; before[2][10] = 'Date';
  assert.deepEqual(trackerRanges(before), { daily: 'K1:AD37', summary: 'AJ3:AQ8', weekly: 'E5:K37' });
  const after = before.map(row => [...row]); after[0].splice(5, 0, null); after[2].splice(5, 0, null);
  assert.deepEqual(trackerRanges(after), { daily: 'L1:AE37', summary: 'AK3:AR8', weekly: 'E5:L37' });
  assert.throws(() => trackerRanges([[], [], []]), /encabezados/);
  const shifted = active.map(row => { const next = [...row]; next.splice(2, 0, null); return next; });
  assert.equal(parseWeeklyPlans(shifted)['2026-10-05'].frequency, 2.4);
});
test('weekly actual parser selects only closed Caracas Total records', () => {
  const rows = [weeklyRow(46293), weeklyRow(46293, 'Car'), weeklyRow(46300)];
  const records = parseClosedWeekly(rows, '2026-10-06');
  assert.equal(records.length, 1);
  assert.deepEqual(records[0], { weekStart: '2026-09-28', weekEnd: '2026-10-04', activeUnique: 100, trips: 240, status: 'closed' });
  assert.throws(() => parseClosedWeekly([rows[0], rows[0]], '2026-10-06'), /duplicados/);
});
test('current and upcoming weeks show plans but no premature actual-to-full-week comparison', () => {
  const data = sample();
  const current = weeklyMetrics(data, '2026-10-05');
  assert.equal(current.active.expected, 100);
  assert.equal(current.active.actual, null);
  assert.equal(current.frequency.actual, null);
  assert.equal(current.frequency.expected, 2.4);
  assert.equal(current.closed, false);
  assert.equal(weeklyMetrics(data, '2026-10-12').upcoming, true);
  assert.equal(kpisFor(data, { period: 'month', month: '2026-10' }).weekly.key, '2026-10-05');
});
test('closed frequency divides weekly trips by same-window unique users and avoids zero denominators', () => {
  const data = sample(); data.meta.cutoff = '2026-10-11';
  assert.equal(weeklyMetrics(data, '2026-10-05').frequency.actual, 2.4);
  data.weeklyActuals[0].activeUnique = 0;
  assert.equal(weeklyMetrics(data, '2026-10-05').frequency.actual, null);
});
test('top equity cards keep the last closed week in both Month and Week while business dates follow selection', () => {
  const data = sample();
  data.weeklyPlans['2026-09-28'] = { active: 100, frequency: 2.1 };
  data.weeklyActuals.push({ weekStart: '2026-09-28', weekEnd: '2026-10-04', activeUnique: 110, trips: 250, status: 'closed' });
  const monthly = kpisFor(data, { period: 'month', month: '2026-10' });
  assert.equal(monthly.weekly.key, '2026-09-28');
  assert.equal(monthly.kpis.find(kpi => kpi.id === 'active').actual, 110);
  assert.equal(monthly.kpis.find(kpi => kpi.id === 'active').expected, 100);
  assert.equal(monthly.kpis.find(kpi => kpi.id === 'frequency').actual, 250 / 110);
  assert.equal(monthly.kpis.find(kpi => kpi.id === 'frequency').expected, 2.1);
  const weekly = kpisFor(data, { period: 'week', month: '2026-10', week: '2026-10-05' });
  assert.equal(weekly.weekly.key, '2026-10-05');
  assert.equal(weekly.weekly.active.actual, null);
  assert.equal(weekly.equity.key, '2026-09-28');
  assert.equal(weekly.kpis.find(kpi => kpi.id === 'active').actual, 110);
  assert.equal(weekly.kpis.find(kpi => kpi.id === 'active').expected, 100);
  assert.equal(weekly.kpis.find(kpi => kpi.id === 'frequency').actual, 250 / 110);
  assert.equal(weekly.kpis.find(kpi => kpi.id === 'frequency').expected, 2.1);
  const mapActive = focusCell(data, { key: '2026-10-05', end: '2026-10-11' }, 'active');
  assert.equal(mapActive.expected, 100);
  assert.equal(mapActive.actual, null);
  assert.equal(focusCell(data, { key: '2026-10-05', end: '2026-10-11' }, 'frequency').expected, 2.4);
});
test('a month without a matching closed week does not inherit a different months real values', () => {
  const data = sample();
  data.weeklyActuals.push({ weekStart: '2026-09-21', weekEnd: '2026-09-27', activeUnique: 110, trips: 250, status: 'closed' });
  assert.equal(kpisFor(data, { period: 'month', month: '2026-10' }).weekly.key, '2026-10-05');
});
test('daily allocations and historical DAU curves never substitute for missing weekly plans', () => {
  const data = sample(); data.weeklyPlans = {};
  assert.equal(weeklyTarget(data, '2026-10-05'), null);
  assert.equal(weeklyMetrics(data, '2026-10-05').frequency.expected, null);
});
test('public export preserves weekly aggregates only and drops added identifiers', () => {
  const data = sample(); data.weeklyActuals[0].userIds = ['must-not-publish']; data.weeklyPlans['2026-10-05'].credential = 'must-not-publish';
  const published = publicSnapshot(data);
  assert.equal(published.weeklyPlans['2026-10-05'].frequency, 2.4);
  assert.equal(published.weeklyActuals[0].activeUnique, 100);
  assert.ok(!JSON.stringify(published).includes('must-not-publish'));
});
