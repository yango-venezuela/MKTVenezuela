import test from 'node:test';
import assert from 'node:assert/strict';
import { performanceFor, performanceSeries, performanceStatus } from '../public/performance.js';
import { parseTracker } from '../lib/sheets.mjs';
import { publicSnapshot } from '../scripts/build-pages.mjs';

const month = { period: 'month', month: '2026-10' };
function sample() {
  return {
    days: Array.from({ length: 31 }, (_, i) => ({
      date: `2026-10-${String(i + 1).padStart(2, '0')}`,
      spendBdg: 80, installsBdg: 100,
      spendAct: i === 0 ? 100 : i === 1 ? 300 : null,
      installsAct: i === 0 ? 100 : i === 1 ? 600 : null,
      newAct: i === 0 ? 20 : i === 1 ? 100 : null,
      paidUsersAct: i === 0 ? 10 : i === 1 ? 90 : null,
      paidShareAct: i === 0 ? .5 : i === 1 ? .9 : null,
      paidCacAct: i === 0 ? 10 : i === 1 ? 300 / 90 : null,
    })),
    performanceTargets: { '2026-10': { spend: 3000, cpi: .8, paidShare: null, paidCac: null } },
    meta: { performanceCutoff: '2026-10-02', cutoff: '2026-10-06' },
  };
}

test('performance ratios divide aligned totals instead of averaging daily ratios', () => {
  const view = performanceFor(sample(), month);
  const kpis = Object.fromEntries(view.kpis.map(kpi => [kpi.id, kpi]));
  assert.equal(kpis.spend.actual, 400);
  assert.equal(kpis.cpi.actual, 400 / 700);
  assert.equal(kpis.paidShare.actual, 100 / 120);
  assert.equal(kpis.paidCac.actual, 4);
  assert.equal(kpis.spend.expected, 160);
  assert.equal(view.pace, 2.5);
  assert.equal(view.forecast, 7500);
  assert.equal(kpis.paidCac.expected, null);
  assert.equal(kpis.paidShare.status.key, 'unknown');
});
test('costs below target are green while overspend is red and share remains neutral', () => {
  assert.equal(performanceStatus('cpi', .7, .9).key, 'ok');
  assert.equal(performanceStatus('paidCac', 5, 4).key, 'bad');
  assert.equal(performanceStatus('spend', 110, 100).key, 'bad');
  assert.equal(performanceStatus('spend', 90, 100).key, 'warn');
  assert.equal(performanceStatus('spend', 104, 100).key, 'ok');
  assert.equal(performanceStatus('spend', 0, 0).key, 'ok');
  assert.equal(performanceStatus('paidShare', .8, .7).key, 'unknown');
});
test('zero denominators, missing days and future windows never create fabricated ratios', () => {
  const data = sample(); data.days[1].installsAct = null;
  assert.equal(performanceFor(data, month).kpis.find(kpi => kpi.id === 'cpi').actual, null);
  data.days[0].paidUsersAct = 0; data.days[1].paidUsersAct = 0;
  assert.equal(performanceFor(data, month).kpis.find(kpi => kpi.id === 'paidCac').actual, null);
  const future = performanceFor(data, { ...month, period: 'week', week: '2026-10-05' });
  assert.ok(future.kpis.every(kpi => kpi.actual === null));
  assert.equal(future.forecast, null);
});
test('weekly performance uses its own cutoff and does not include other weeks', () => {
  const data = sample();
  data.days[4] = { ...data.days[4], spendAct: 25, installsAct: 10, newAct: 5, paidUsersAct: 2, paidCacAct: 12.5 };
  data.meta.performanceCutoff = '2026-10-05';
  const view = performanceFor(data, { ...month, period: 'week', week: '2026-10-05' });
  assert.equal(view.kpis.find(kpi => kpi.id === 'spend').actual, 25);
  assert.equal(view.kpis.find(kpi => kpi.id === 'paidCac').actual, 12.5);
  assert.equal(view.forecast, null);
});
test('the first partial week reports available October dates without requiring September data', () => {
  const view = performanceFor(sample(), { ...month, period: 'week', week: '2026-09-28' });
  assert.deepEqual(view.elapsed, ['2026-10-01', '2026-10-02']);
  assert.equal(view.kpis.find(kpi => kpi.id === 'spend').actual, 400);
  assert.equal(view.forecast, null);
});
test('daily performance chart preserves first-week context and leaves missing targets blank', () => {
  const data = sample();
  const spend = performanceSeries(data, month, 'spend');
  assert.equal(spend.dates[0], '2026-09-28');
  assert.deepEqual(spend.actual.slice(0, 6), [null, null, null, 100, 300, null]);
  const cac = performanceSeries(data, month, 'paidCac');
  assert.ok(cac.plan.every(value => value === null));
  data.performanceTargets['2026-10'].paidCac = 4;
  assert.equal(performanceSeries(data, month, 'paidCac').plan[3], 4);
  assert.equal(performanceSeries(data, month, 'paidCac').plan[2], null);
});
test('tracker performance parsing preserves source plans, zero costs and attribution population', () => {
  const row = [46296, 100, 100, 200, 200, 2, 10, 10, 5, 8, 6, 50, 100, .28, .6, 9, 5, .5, .75, 5 / 6];
  const daily = [[], Array.from({ length: 16 }, (_, i) => i === 15 ? .9 : null), [46296], Array.from({ length: 16 }, (_, i) => i === 15 ? 90 : null), ['Date', 'Bdg', 'Act', 'Bdg', 'Act', 'Act', 'Bdg', 'Act', 'Bdg', 'Act in Yango'], row];
  const data = parseTracker(daily, []);
  assert.equal(data.days[0].paidUsersAct, 6);
  assert.equal(data.days[0].spendAct, 5);
  assert.equal(data.performanceTargets['2026-10'].cpi, .9);
  assert.equal(data.performanceTargets['2026-10'].spend, 90);
  assert.equal(data.meta.performanceCutoff, '2026-10-01');
  row[16] = 0;
  assert.equal(parseTracker(daily, []).days[0].spendAct, 0);
});
test('static performance export keeps only allowed aggregate fields and targets', () => {
  const data = sample(); data.performanceTargets['2026-10'].secret = 'must-not-publish';
  data.days[0].campaignUserIds = ['must-not-publish'];
  const result = publicSnapshot(data);
  assert.equal(result.days[0].spendAct, 100);
  assert.equal(result.performanceTargets['2026-10'].cpi, .8);
  assert.equal(result.meta.performanceCutoff, '2026-10-02');
  assert.ok(!JSON.stringify(result).includes('must-not-publish'));
});
