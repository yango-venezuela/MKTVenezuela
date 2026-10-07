import test from 'node:test';
import assert from 'node:assert/strict';
import { weeklySeparators } from '../public/chart-weeks.js';
import { chartDates } from '../public/model.js';

test('weekly separator plugin draws five week bars and four boundaries', () => {
  const rectangles = [], labels = [];
  const dates = chartDates({ period: 'month', month: '2026-10' });
  const context = { save() {}, restore() {}, fillRect(...rectangle) { rectangles.push({ color: this.fillStyle, rectangle }); }, fillText(label) { labels.push(label); } };
  weeklySeparators(dates, '2026-10-06').beforeDraw({ ctx: context, chartArea: { left: 0, right: 660, top: 40, height: 200 }, scales: { x: { getPixelForValue: index => index * 20 } } });
  assert.equal(rectangles.filter(item => item.rectangle[3] === 20).length, 5);
  assert.equal(rectangles.filter(item => item.rectangle[2] === 1).length, 4);
  assert.equal(rectangles.filter(item => item.color === '#f7f7f8').length, 1);
  assert.equal(labels[0], 'Sep 28–Oct 4');
  assert.equal(labels[1], 'Oct 5–Oct 11');
});
