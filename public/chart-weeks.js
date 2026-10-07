import { chartWeeks, formatDate, weekStart } from './model.js';

export function weeklySeparators(dates, cutoff) {
  const weeks = chartWeeks(dates);
  const current = cutoff ? weekStart(cutoff) : null;
  return {
    id: 'measurement-weeks',
    beforeDraw(chart) {
      const { ctx, chartArea: area, scales: { x } } = chart;
      if (!area || !x) return;
      const edge = index => index === 0 ? area.left : index === dates.length ? area.right : (x.getPixelForValue(index - 1) + x.getPixelForValue(index)) / 2;
      ctx.save();
      for (const week of weeks) {
        const left = edge(week.startIndex), right = edge(week.endIndex + 1);
        const width = right - left;
        if (week.key === current) {
          ctx.fillStyle = '#f7f7f8';
          ctx.fillRect(left, area.top, width, area.height);
        }
        ctx.fillStyle = week.key === current ? '#e4e6e9' : '#f0f1f3';
        ctx.fillRect(left + 2, area.top - 28, Math.max(0, width - 4), 20);
        ctx.fillStyle = '#666b73';
        ctx.font = '10px Arial';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        const start = dates[week.startIndex], end = dates[week.endIndex];
        const label = width >= 90 ? `${formatDate(start)}–${formatDate(end)}` : `${Number(start.slice(-2))}–${Number(end.slice(-2))}`;
        if (width >= 32) ctx.fillText(label, (left + right) / 2, area.top - 18, width - 8);
        if (week.startIndex > 0) {
          ctx.fillStyle = '#dfe2e6';
          ctx.fillRect(left - .5, area.top, 1, area.height);
        }
      }
      ctx.restore();
    },
  };
}
