import { names, fields, numeric, status, change, focusStatus, kpisFor, chartSeries, focusCell, weeklyMetrics, weeksForMonth, weekStart, formatDate, monthLabel, shiftDate } from './model.js';
import { loadDashboard, signOut } from './runtime.js';
import { weeklySeparators } from './chart-weeks.js';
import { performanceFor, performanceSeries } from './performance.js';
import { periodInsight, weeklyInsights } from './insights.js';

let data;
let state = { period: 'month', month: '', week: '', selected: 'trips', metric: 'trips', chartMode: 'daily', performanceMetric: 'spend' };
let chart;
let activeChart;
let performanceChart;
const get = id => document.getElementById(id);
const fmt = (value, unit = 'number') => !numeric(value) ? 'No data' : unit === 'pct' ? `${(value * 100).toFixed(1)}%` : unit === 'cost' ? '$' + value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : unit === 'usd' ? '$' + value.toLocaleString('en-US', { maximumFractionDigits: value < 10 ? 2 : 0 }) : unit === 'ratio' ? value.toLocaleString('en-US', { maximumFractionDigits: 2 }) : value.toLocaleString('en-US', { maximumFractionDigits: 0 });
const unit = id => ['gmv', 'ticket'].includes(id) ? 'usd' : id === 'frequency' ? 'ratio' : 'number';
const percent = value => numeric(value) ? `${value >= 0 ? '+' : ''}${(value * 100).toFixed(1)}%` : 'No comparison';
const delta = (actual, expected) => numeric(actual) && numeric(expected) && expected === 0 ? 'Zero plan' : `${percent(change(actual, expected))}${numeric(change(actual, expected)) ? ' vs. plan' : ''}`;
const kpiStatus = kpi => kpi.group === 'weekly' && !kpi.closed ? { key: 'unknown', label: kpi.upcoming ? 'Upcoming week' : 'Week in progress' } : status(kpi.actual, kpi.expected);

function renderMeta() {
  const notes = [];
  notes.push(`Data through ${data.meta.cutoff ? formatDate(data.meta.cutoff) : 'No data'}`);
  if (!data.meta.live) notes.push(data.meta.source === 'github-pages' ? 'Published data read' : 'Saved data read');
  if (data.meta.stale) notes.push('Live connection unavailable');
  const time = new Date(data.meta.retrievedAt);
  if (!Number.isNaN(time.getTime())) notes.push(`Updated ${new Intl.DateTimeFormat('en-US', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'America/Caracas' }).format(time)}`);
  get('dataMeta').replaceChildren(...notes.map(text => { const span = document.createElement('span'); span.textContent = text; return span; }));
  if (data.meta.warnings?.length) {
    const span = document.createElement('span');
    span.className = 'data-warning';
    span.textContent = `Daily and monthly plans differ: ${data.meta.warnings.map(warning => names[warning.metric]).join(', ')}.`;
    get('dataMeta').append(span);
  }
}

function renderWindows() {
  const select = get('windowSelect');
  select.innerHTML = '';
  if (state.period === 'month') {
    const months = [...new Set(data.days.map(day => day.date.slice(0, 7)))].sort();
    for (const month of months) select.add(new Option(monthLabel(month), month, false, month === state.month));
    select.disabled = months.length === 1;
  } else {
    for (const week of weeksForMonth(state.month)) {
      const current = data.meta.cutoff && week.key === weekStart(data.meta.cutoff);
      const future = !data.meta.cutoff || week.key > data.meta.cutoff;
      select.add(new Option(`${week.label}${current ? ' (current)' : future ? ' (upcoming)' : ''}`, week.key, false, week.key === state.week));
    }
    select.disabled = false;
  }
  for (const button of get('periodToggle').querySelectorAll('button')) {
    button.classList.toggle('active', button.dataset.period === state.period);
    button.setAttribute('aria-pressed', String(button.dataset.period === state.period));
  }
}

function renderKpis() {
  const result = kpisFor(data, state);
  for (const id of ['primaryKpis', 'leverKpis', 'weeklyKpis']) get(id).innerHTML = '';
  get('weeklyCaption').textContent = `Weekly · ${result.weekly.label}`;
  for (const kpi of result.kpis) {
    const st = kpiStatus(kpi);
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `kpi ${kpi.group === 'primary' ? 'primary' : ''} ${state.selected === kpi.id ? 'active' : ''}`;
    button.setAttribute('aria-pressed', String(state.selected === kpi.id));
    button.dataset.kpi = kpi.id;
    button.innerHTML = `<div class="kpi-head"><div class="kpi-title">${kpi.title}</div><span class="status ${st.key}"><i class="dot"></i>${st.label}</span></div><div><div class="value">${fmt(kpi.actual, kpi.unit)}</div><div class="delta ${st.key}">${kpi.group === 'weekly' && !kpi.closed ? 'Pending close' : delta(kpi.actual, kpi.expected)}</div></div><div class="expected">${kpi.group === 'weekly' ? 'Weekly plan' : 'Plan to date'}: ${fmt(kpi.expected, kpi.unit)}</div>`;
    button.addEventListener('click', () => { state.selected = kpi.id; renderKpis(); renderDetail(); remember(); });
    get(kpi.group === 'primary' ? 'primaryKpis' : kpi.group === 'weekly' ? 'weeklyKpis' : 'leverKpis').append(button);
  }
  return result;
}

function renderDetail() {
  activeChart?.destroy();
  activeChart = null;
  const kpi = kpisFor(data, state).kpis.find(item => item.id === state.selected);
  const st = kpiStatus(kpi);
  const forecast = numeric(kpi.forecast);
  const headline = forecast ? kpi.forecast : kpi.actual;
  const weekly = kpi.group === 'weekly';
  const comparison = weekly && !kpi.closed ? 'Pending weekly close' : forecast ? delta(kpi.forecast, kpi.forecastTarget).replace('vs. plan', 'vs. month plan') : delta(kpi.actual, kpi.expected);
  get('detail').innerHTML = `<div class="detail-title"><h2>${kpi.title}</h2><span class="status ${st.key}"><i class="dot"></i>${st.label}</span></div><div class="forecast-hero"><div class="fh-label">${forecast ? 'Projected month close' : weekly ? 'Weekly actual' : 'Actual to date'}</div><div class="fh-value">${fmt(headline, kpi.unit)}</div><div class="fh-sub ${forecast ? status(kpi.forecast, kpi.forecastTarget).key : st.key}">${comparison}${forecast ? ` · ${fmt(kpi.forecastTarget, kpi.unit)}` : ''}</div></div><div class="stat-row"><div class="stat"><span class="stat-label">${weekly ? 'Weekly actual' : 'Actual to date'}</span><span class="stat-val">${fmt(kpi.actual, kpi.unit)}</span></div><div class="stat"><span class="stat-label">${weekly ? 'Weekly plan' : 'Plan to date'}</span><span class="stat-val">${fmt(kpi.expected, kpi.unit)}</span></div></div>${kpi.rangeLabel ? `<p class="source-period">${kpi.rangeLabel} · ${kpi.id === 'active' ? 'unique users for the full week' : 'trips per unique user for the full week'}</p>` : ''}${forecast ? '<p class="source-period">Close projected at the current actual-to-plan pace.</p>' : ''}`;
  if (weekly) {
    const weeks = weeksForMonth(state.month);
    const values = weeks.map(week => weeklyMetrics(data, week.key)[kpi.id]);
    const real = values.map(value => value.actual), planned = values.map(value => value.expected);
    const legend = document.createElement('div');
    legend.className = 'chart-legend';
    legend.setAttribute('aria-label', 'Weekly equity chart legend');
    legend.innerHTML = '<span><i class="legend-line plan"></i>Plan</span><span><i class="legend-line"></i>Actual</span>';
    get('detail').append(legend);
    const block = document.createElement('div');
    block.className = 'chart-wrap';
    block.style.marginTop = '16px';
    block.innerHTML = '<canvas id="equityWeeklyChart" role="img" aria-label="Weekly actual versus weekly plan"></canvas>';
    get('detail').append(block);
    activeChart = new Chart(get('equityWeeklyChart'), chartConfig(weeks.map(week => formatDate(week.key)), real, planned, kpi.unit, true));
  }
}

function chartConfig(labels, real, expected, metricUnit, small = false, dates = null) {
  return {
    type: 'line',
    plugins: dates ? [weeklySeparators(dates, data.meta.cutoff)] : [],
    data: { labels, datasets: [
      { label: 'Plan', data: expected, borderColor: '#8a8f98', borderDash: [5, 4], pointRadius: 0, tension: .2 },
      { label: 'Actual', data: real, borderColor: '#ff1a1a', backgroundColor: 'rgba(255,26,26,.10)', fill: true, pointRadius: 3, tension: .2, spanGaps: false },
    ] },
    options: {
      responsive: true, maintainAspectRatio: false,
      layout: { padding: { top: dates ? 30 : 0 } },
      animation: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? false : { duration: 200 },
      interaction: { mode: 'index', intersect: false },
      plugins: { legend: { display: false }, tooltip: { callbacks: {
        label: context => `${context.dataset.label}: ${fmt(context.parsed.y, metricUnit)}`,
        afterBody: items => { const index = items[0].dataIndex; if (!numeric(real[index]) || !numeric(expected[index])) return 'Difference: no data'; return `Difference: ${fmt(real[index] - expected[index], metricUnit)} (${percent(change(real[index], expected[index]))})`; },
      } } },
      scales: { x: { grid: { display: false }, ticks: { autoSkip: !dates || window.matchMedia('(max-width:760px)').matches, maxTicksLimit: dates ? 34 : small ? 4 : 8, maxRotation: 0, font: { family: 'Arial', size: 11 }, callback: value => dates ? Number(dates[value].slice(-2)) : labels[value] } }, y: { beginAtZero: true, ticks: { maxTicksLimit: small ? 4 : 6, font: { family: 'Arial', size: 11 }, callback: value => fmt(value, metricUnit) } } },
    },
  };
}

function renderChart() {
  chart?.destroy();
  const series = chartSeries(data, state, state.metric, state.chartMode);
  chart = new Chart(get('mainChart'), chartConfig(series.dates.map(formatDate), series.actual, series.plan, unit(state.metric), false, series.dates));
  const window = state.period === 'week' ? `${formatDate(state.week)}–${formatDate(shiftDate(state.week, 6))}` : monthLabel(state.month);
  const missing = series.dates.some(date => !data.days.some(day => day.date === date));
  get('chartNote').textContent = `${names[state.metric]} · ${state.chartMode === 'daily' ? 'daily' : state.period === 'month' ? `cumulative from ${formatDate(`${state.month}-01`)}` : 'cumulative'} · ${window} · ${formatDate(series.dates[0])}–${formatDate(series.dates.at(-1))}. Actuals through ${data.meta.cutoff ? formatDate(data.meta.cutoff) : 'No data'}.${missing ? ' Incomplete window: some dates are unavailable.' : ''}`;
  for (const button of get('metricSeg').querySelectorAll('button')) { button.classList.toggle('active', button.dataset.m === state.metric); button.setAttribute('aria-pressed', String(button.dataset.m === state.metric)); }
  for (const button of get('modeSeg').querySelectorAll('button')) { const selected = button.dataset.mode === (state.chartMode === 'daily' ? 'daily' : 'cum'); button.classList.toggle('active', selected); button.setAttribute('aria-pressed', String(selected)); }
}

function renderPerformance() {
  const summary = performanceFor(data, state);
  get('performanceKpis').replaceChildren();
  get('performancePeriod').textContent = summary.elapsed.length ? `${formatDate(summary.elapsed[0])}–${formatDate(summary.elapsed.at(-1))}` : 'No actuals in this window';
  for (const kpi of summary.kpis) {
    const card = document.createElement('article');
    card.className = 'kpi performance-kpi';
    const comparison = kpi.id === 'paidShare' && numeric(kpi.actual) && numeric(kpi.expected) ? `${((kpi.actual - kpi.expected) * 100).toFixed(1)} pp vs. target` : delta(kpi.actual, kpi.expected).replace('vs. plan', 'vs. target');
    const pace = numeric(summary.pace) ? `Pace: ${(summary.pace * 100).toFixed(1)}%` : 'Pace pending';
    const footer = kpi.id === 'spend' ? `Plan to date: ${fmt(kpi.expected, kpi.unit)}${numeric(summary.forecast) ? `<br>Projected close: ${fmt(summary.forecast, 'usd')} / ${fmt(summary.fullPlan, 'usd')}` : ''}` : `Target: ${numeric(kpi.expected) ? fmt(kpi.expected, kpi.unit) : 'Pending'}`;
    card.innerHTML = `<div class="kpi-head"><h3 class="kpi-title">${kpi.title}</h3><span class="status ${kpi.status.key}"><i class="dot"></i>${kpi.status.label}</span></div><div><div class="value">${fmt(kpi.actual, kpi.unit)}</div><div class="delta ${kpi.status.key}">${kpi.id === 'spend' ? pace : comparison}</div></div><div class="expected">${footer}</div>`;
    get('performanceKpis').append(card);
  }
  renderPerformanceChart();
}

function renderPerformanceChart() {
  performanceChart?.destroy();
  const metric = state.performanceMetric;
  const series = performanceSeries(data, state, metric);
  const title = metric === 'spend' ? 'Daily spend' : 'Daily Paid CAC';
  get('performanceChartTitle').textContent = title;
  get('performanceChart').setAttribute('aria-label', `${title} actual versus plan`);
  const config = chartConfig(series.dates.map(formatDate), series.actual, series.plan, metric === 'spend' ? 'usd' : 'cost', false, series.dates);
  performanceChart = new Chart(get('performanceChart'), config);
  get('performancePlanLegend').hidden = !series.plan.some(numeric);
  get('performanceChartNote').textContent = `${formatDate(series.dates[0])}–${formatDate(series.dates.at(-1))} · ${data.meta.performanceCutoff ? `Actuals through ${formatDate(data.meta.performanceCutoff)}` : 'Actuals pending'}${metric === 'paidCac' && !series.plan.some(numeric) ? ' · Target pending' : ''}`;
  for (const button of get('performanceMetricSeg').querySelectorAll('button')) { const selected = button.dataset.performance === metric; button.classList.toggle('active', selected); button.setAttribute('aria-pressed', String(selected)); }
}

const focusOrder = ['trips', 'gmv', 'active', 'new', 'installs', 'frequency', 'ticket'];
function renderFocusMap() {
  const weeks = weeksForMonth(state.month);
  const table = document.createElement('table');
  table.className = 'focus-map';
  const head = document.createElement('thead');
  head.innerHTML = `<tr><th scope="col"></th>${weeks.map(week => `<th scope="col">${week.label}${data.meta.cutoff && week.key === weekStart(data.meta.cutoff) ? ' · current' : ''}</th>`).join('')}</tr>`;
  table.append(head);
  const body = document.createElement('tbody');
  for (const id of focusOrder) {
    const row = document.createElement('tr');
    row.innerHTML = `<th scope="row" class="row-label">${names[id]}</th>`;
    for (const week of weeks) {
      const values = focusCell(data, week, id);
      const key = focusStatus(values.actual, values.expected);
      const future = !data.meta.cutoff || week.key > data.meta.cutoff;
      const button = document.createElement('button');
      button.type = 'button';
      button.className = `cell ${future ? 'pending' : key}`;
      button.setAttribute('aria-label', `${names[id]}, ${week.label}`);
      button.innerHTML = `<span class="c-val">${numeric(values.actual) ? fmt(values.actual, unit(id)) : '—'}</span><span class="c-lbl">Plan: ${numeric(values.expected) ? fmt(values.expected, unit(id)) : '—'}${numeric(change(values.actual, values.expected)) ? ` · ${percent(change(values.actual, values.expected))}` : ''}</span>${values.partialLabel ? `<span class="c-lbl">${values.partialLabel}</span>` : ''}`;
      button.addEventListener('click', () => investigate(id, week, values, key));
      const cell = document.createElement('td'); cell.append(button); row.append(cell);
    }
    body.append(row);
  }
  table.append(body); get('focusMapWrap').replaceChildren(table);
}

const hypotheses = {
  trips: ['The gap may relate to active users, frequency or their combination.', 'Compare weekly active users and trips per active user for the same dates.'],
  gmv: ['Trip volume, average fare or both may explain the gap.', 'Compare the contributions of trips and average fare to the GMV difference.'],
  new: ['The difference may relate to first-trip activation or the timing of acquisition.', 'Compare the install and first-trip trends, with aligned cohort definitions.'],
  installs: ['Acquisition volume may have changed before its effect appears in first trips.', 'Review the weekly install trend and the lag to first completed trip.'],
  ticket: ['Trip distance, service mix or fare changes may explain the difference.', 'Compare average fare by day and service using the same GMV definition.'],
  active: ['Recurring users, reactivation or new users may explain the difference.', 'Compare unique new, recurring and reactivated users within this week.'],
  frequency: ['Usage frequency or a change in user composition may explain the difference.', 'Compare trips per user by tenure, using trips and users from the same window.'],
};
function investigate(id, week, values, key) {
  const dialog = get('investigation');
  const message = (!numeric(values.actual) ? 'Actual data is unavailable for this window.' : !numeric(values.expected) ? 'The actual is available, but its comparable plan is missing.' : `Actual: ${fmt(values.actual, unit(id))}. Plan: ${fmt(values.expected, unit(id))}. Difference: ${percent(change(values.actual, values.expected))}.`) + (values.partialLabel ? ` Partial window: ${values.partialLabel}.` : '');
  dialog.innerHTML = `<button class="close-btn" aria-label="Close investigation" title="Close"><i data-lucide="x"></i></button><h3 id="investigationTitle">${names[id]}</h3><div class="drawer-sub">${week.label}</div><section><h4>What we see</h4><p>${message}</p></section><section><h4>What could explain it</h4><p>${['bad', 'warn'].includes(key) ? hypotheses[id][0] : 'No evaluated shortfall in this window, or data is missing to evaluate it.'}</p></section><section><h4>What to check next</h4><p>${hypotheses[id][1]}</p></section>`;
  dialog.querySelector('button').addEventListener('click', () => dialog.close());
  window.lucide?.createIcons();
  dialog.showModal();
}

function renderComments() {
  const insight = periodInsight(data, state);
  get('overviewComment').dataset.status = insight.status;
  get('overviewTitle').textContent = insight.title;
  get('overviewRange').textContent = `${insight.windowLabel} · ${insight.rangeLabel}`;
  get('overviewHeadline').textContent = insight.headline;
  get('overviewDetail').textContent = insight.detail;
  get('overviewAction').textContent = insight.action;
  get('overviewDetail').hidden = !insight.detail;
  get('overviewAction').hidden = !insight.action;
  get('weeklyCommentsSection').hidden = state.period === 'week';
  get('weeklyCommentsMonth').textContent = monthLabel(state.month);
  const comments = weeklyInsights(data, state.month);
  get('weeklyComments').replaceChildren(...comments.map(comment => {
    const row = document.createElement('article');
    row.className = 'weekly-comment';
    row.dataset.status = comment.status;
    row.innerHTML = '<div><strong></strong><span class="source-period"></span></div><div><p class="weekly-headline"></p><p class="weekly-detail"></p><p class="weekly-action"></p></div>';
    row.querySelector('strong').textContent = comment.windowLabel;
    row.querySelector('.source-period').textContent = `${comment.rangeLabel} actuals`;
    row.querySelector('.weekly-headline').textContent = comment.headline;
    row.querySelector('.weekly-detail').textContent = comment.detail;
    row.querySelector('.weekly-action').textContent = comment.action;
    return row;
  }));
  if (!comments.length) { const note = document.createElement('p'); note.className = 'empty-state'; note.textContent = 'Weekly actuals pending.'; get('weeklyComments').append(note); }
}

function remember() { try { localStorage.setItem('measurement-view', JSON.stringify(state)); } catch {} }
function renderAll() { renderWindows(); renderMeta(); renderKpis(); renderDetail(); renderChart(); renderFocusMap(); renderComments(); renderPerformance(); window.lucide?.createIcons(); }
async function load(refresh = false) {
  get('refreshData').disabled = true;
  get('connectionError').hidden = true;
  try {
    data = await loadDashboard(refresh);
    const months = [...new Set(data.days.map(day => day.date.slice(0, 7)))].sort();
    if (!months.includes(state.month)) state.month = data.meta.month || months.at(-1);
    const weeks = weeksForMonth(state.month);
    if (!weeks.some(week => week.key === state.week)) state.week = weekStart(data.meta.cutoff || `${state.month}-01`);
    if (!names[state.selected]) state.selected = 'trips';
    if (!fields[state.metric]) state.metric = 'trips';
    if (!['spend', 'paidCac'].includes(state.performanceMetric)) state.performanceMetric = 'spend';
    renderAll();
  } catch (error) { get('connectionError').textContent = error.message; get('connectionError').hidden = false; }
  finally { get('refreshData').disabled = false; }
}

get('periodToggle').addEventListener('click', event => { const button = event.target.closest('button[data-period]'); if (!button || !data) return; state.period = button.dataset.period; if (state.period === 'week') state.week = weekStart(data.meta.cutoff || `${state.month}-01`); renderAll(); remember(); });
get('windowSelect').addEventListener('change', event => { if (state.period === 'month') { state.month = event.target.value; state.week = weeksForMonth(state.month)[0].key; } else state.week = event.target.value; renderAll(); remember(); });
get('metricSeg').addEventListener('click', event => { const button = event.target.closest('button[data-m]'); if (!button || !data) return; state.metric = button.dataset.m; renderChart(); remember(); });
get('modeSeg').addEventListener('click', event => { const button = event.target.closest('button[data-mode]'); if (!button || !data) return; state.chartMode = button.dataset.mode === 'daily' ? 'daily' : 'cum'; renderChart(); remember(); });
get('performanceMetricSeg').addEventListener('click', event => { const button = event.target.closest('button[data-performance]'); if (!button || !data) return; state.performanceMetric = button.dataset.performance; renderPerformanceChart(); remember(); });
get('refreshData').addEventListener('click', () => load(true));
get('logout').addEventListener('click', () => signOut());
try { const saved = JSON.parse(localStorage.getItem('measurement-view')); if (saved && ['month', 'week'].includes(saved.period)) state = { ...state, ...saved }; } catch {}
window.lucide?.createIcons();
load();
