import test from 'node:test';
import assert from 'node:assert/strict';
import { periodInsight, weeklyInsights } from '../public/insights.js';

function sample() {
  return {
    days: Array.from({ length: 14 }, (_, index) => ({
      date: `2026-10-${String(index + 1).padStart(2, '0')}`,
      tripsBdg: 100, tripsAct: index < 4 ? 120 : index < 6 ? 99 : null,
      gmvBdg: 200, gmvAct: index < 4 ? 260 : index < 6 ? 186 : null,
      installsBdg: 10, installsAct: index < 6 ? 7 : null,
      newBdg: 10, newAct: index < 6 ? 12 : null,
    })),
    active: [], meta: { month: '2026-10', cutoff: '2026-10-06' },
  };
}
const month = { period: 'month', month: '2026-10' };

test('monthly overview stays positive when this week is below plan', () => {
  const data = sample();
  const monthly = periodInsight(data, month);
  const weekly = periodInsight(data, { ...month, period: 'week', week: '2026-10-05' });
  assert.equal(monthly.title, 'Month overview');
  assert.equal(monthly.status, 'ok');
  assert.match(monthly.headline, /Trips \+13\.0% and GMV \+17\.7%/);
  assert.match(monthly.detail, /Installs -30\.0%; new users \+20\.0%/);
  assert.match(monthly.action, /holding up despite lower installs/);
  assert.equal(weekly.title, 'Week focus');
  assert.equal(weekly.status, 'bad');
  assert.match(weekly.headline, /Trips -1\.0% and GMV -7\.0%/);
  assert.match(weekly.action, /Average fare contributes more/);
});
test('weekly comments show only observed weeks and label the partial first week', () => {
  const comments = weeklyInsights(sample(), '2026-10');
  assert.deepEqual(comments.map(row => row.key), ['2026-09-28', '2026-10-05']);
  assert.equal(comments[0].windowLabel, 'Sep 28–Oct 4');
  assert.equal(comments[0].rangeLabel, 'Oct 1–Oct 4');
  assert.equal(comments[1].rangeLabel, 'Oct 5–Oct 6');
});
test('week focus follows a selected past week, not always the current week', () => {
  const insight = periodInsight(sample(), { ...month, period: 'week', week: '2026-09-28' });
  assert.equal(insight.status, 'ok');
  assert.match(insight.headline, /Trips \+20\.0% and GMV \+30\.0%/);
});
test('missing comparisons and upcoming weeks never produce a positive overview', () => {
  const data = sample(); data.days.forEach(day => { day.gmvBdg = null; });
  assert.equal(periodInsight(data, month).status, 'unknown');
  const upcoming = periodInsight(sample(), { ...month, period: 'week', week: '2026-10-12' });
  assert.equal(upcoming.status, 'unknown');
  assert.equal(upcoming.rangeLabel, 'Actuals pending');
  assert.equal(upcoming.detail, '');
});
test('a different month never inherits the latest observed weekly comments', () => {
  assert.deepEqual(weeklyInsights(sample(), '2026-11'), []);
  assert.equal(periodInsight(sample(), { ...month, month: '2026-11' }).status, 'unknown');
});
test('absent acquisition comparisons do not become a claim that new users are on plan', () => {
  const data = sample(); data.days.forEach(day => { day.newBdg = null; });
  const insight = periodInsight(data, month);
  assert.match(insight.detail, /new-user comparison is unavailable/);
  assert.doesNotMatch(insight.action, /holding up despite/);
});
