import { names, fields, numeric, status, change, focusStatus, kpisFor, chartSeries, focusCell, weeksForMonth, weekStart, formatDate, monthLabel, shiftDate, activeProfile } from './model.js';
import { loadDashboard, signOut } from './runtime.js';
import { weeklySeparators } from './chart-weeks.js';

let data;
let state = { period: 'month', month: '', week: '', selected: 'trips', metric: 'trips', chartMode: 'daily' };
let chart;
let activeChart;
const get = id => document.getElementById(id);
const fmt = (value, unit = 'number') => !numeric(value) ? 'No data' : unit === 'usd' ? '$' + value.toLocaleString('en-US', { maximumFractionDigits: value < 10 ? 2 : 0 }) : unit === 'ratio' ? value.toLocaleString('en-US', { maximumFractionDigits: 2 }) : value.toLocaleString('en-US', { maximumFractionDigits: 0 });
const unit = id => ['gmv', 'ticket'].includes(id) ? 'usd' : id === 'frequency' ? 'ratio' : 'number';
const percent = value => numeric(value) ? `${value >= 0 ? '+' : ''}${(value * 100).toFixed(1)}%` : 'No comparison';
const delta = (actual, expected) => numeric(actual) && numeric(expected) && expected === 0 ? 'Zero plan' : `${percent(change(actual, expected))}${numeric(change(actual, expected)) ? ' vs. plan' : ''}`;

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
    const st = status(kpi.actual, kpi.expected);
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `kpi ${kpi.group === 'primary' ? 'primary' : ''} ${state.selected === kpi.id ? 'active' : ''}`;
    button.setAttribute('aria-pressed', String(state.selected === kpi.id));
    button.dataset.kpi = kpi.id;
    button.innerHTML = `<div class="kpi-head"><div class="kpi-title">${kpi.title}</div><span class="status ${st.key}"><i class="dot"></i>${st.label}</span></div><div><div class="value">${fmt(kpi.actual, kpi.unit)}</div><div class="delta ${st.key}">${delta(kpi.actual, kpi.expected)}</div></div><div class="expected">${kpi.group === 'weekly' ? 'Plan to weekly cutoff' : 'Plan to date'}: ${fmt(kpi.expected, kpi.unit)}</div>`;
    button.addEventListener('click', () => { state.selected = kpi.id; renderKpis(); renderDetail(); remember(); });
    get(kpi.group === 'primary' ? 'primaryKpis' : kpi.group === 'weekly' ? 'weeklyKpis' : 'leverKpis').append(button);
  }
  return result;
}

function renderDetail() {
  activeChart?.destroy();
  activeChart = null;
  const kpi = kpisFor(data, state).kpis.find(item => item.id === state.selected);
  const st = status(kpi.actual, kpi.expected);
  const forecast = numeric(kpi.forecast);
  const headline = forecast ? kpi.forecast : kpi.actual;
  const comparison = forecast ? delta(kpi.forecast, kpi.forecastTarget).replace('vs. plan', 'vs. month plan') : delta(kpi.actual, kpi.expected);
  get('detail').innerHTML = `<div class="detail-title"><h2>${kpi.title}</h2><span class="status ${st.key}"><i class="dot"></i>${st.label}</span></div><div class="forecast-hero"><div class="fh-label">${forecast ? 'Projected month close' : 'Actual to date'}</div><div class="fh-value">${fmt(headline, kpi.unit)}</div><div class="fh-sub ${forecast ? status(kpi.forecast, kpi.forecastTarget).key : st.key}">${comparison}${forecast ? ` · ${fmt(kpi.forecastTarget, kpi.unit)}` : ''}</div></div><div class="stat-row"><div class="stat"><span class="stat-label">Actual to date</span><span class="stat-val">${fmt(kpi.actual, kpi.unit)}</span></div><div class="stat"><span class="stat-label">Plan to date</span><span class="stat-val">${fmt(kpi.expected, kpi.unit)}</span></div></div>${kpi.rangeLabel ? `<p class="source-period">${kpi.rangeLabel} · unique users in this window</p>` : ''}${forecast ? '<p class="source-period">Close projected at the current actual-to-plan pace.</p>' : ''}`;
  if (kpi.id === 'active') {
    const weekly = kpisFor(data, state).weekly;
    const dates = Array.from({ length: 7 }, (_, index) => shiftDate(weekly.key, index));
    const real = dates.map(date => data.active?.find(row => row.weekStart === weekly.key && row.date === date)?.cumulativeUnique ?? null);
    const curve = activeProfile(data);
    const planned = numeric(weekly.active.fullTarget) && curve ? curve.cumulative.map(factor => weekly.active.fullTarget * factor) : dates.map(() => null);
    const block = document.createElement('div');
    block.className = 'chart-wrap';
    block.style.marginTop = '16px';
    block.innerHTML = '<canvas id="activeWeeklyChart" role="img" aria-label="Weekly cumulative unique users versus expected"></canvas>';
    get('detail').append(block);
    activeChart = new Chart(get('activeWeeklyChart'), chartConfig(dates.map(formatDate), real, planned, 'number', true));
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

function renderWeekFocus() {
  const key = state.period === 'week' ? state.week : weekStart(data.meta.cutoff || `${state.month}-01`);
  const view = kpisFor(data, { ...state, period: 'week', week: key });
  const metrics = Object.fromEntries(view.kpis.map(kpi => [kpi.id, kpi]));
  const trips = metrics.trips, gmv = metrics.gmv, ticket = metrics.ticket;
  let text = 'Not enough comparable data to define a focus for this window.';
  if (numeric(trips.actual) && numeric(trips.expected) && numeric(gmv.actual) && numeric(gmv.expected)) {
    if (gmv.actual < gmv.expected && numeric(ticket.expected) && numeric(ticket.actual)) {
      const volumeEffect = (trips.actual - trips.expected) * ticket.expected;
      const fareEffect = trips.actual * (ticket.actual - ticket.expected);
      text = fareEffect < volumeEffect ? `GMV is ${percent(change(gmv.actual, gmv.expected))} vs. plan. The average-fare difference contributes more than volume to this gap. Review fare and trip mix.` : `GMV is ${percent(change(gmv.actual, gmv.expected))} vs. plan. Trip volume contributes more to this gap. Review users and frequency when comparable counts are available.`;
    } else if (trips.actual < trips.expected) text = 'GMV is holding up while trips are below plan. Review whether average fare is compensating for weaker volume.';
    else if (numeric(metrics.installs.actual) && numeric(metrics.installs.expected) && metrics.installs.actual < metrics.installs.expected) text = 'Trips and GMV are on plan, but installs are below. Watch acquisition continuity without assuming installs and first trips belong to the same cohort.';
    else text = 'Both primary results are on plan in this window. Watch the weekly levers for sustained deviations.';
  }
  get('weekFocus').textContent = text;
}

function remember() { try { localStorage.setItem('measurement-view', JSON.stringify(state)); } catch {} }
function renderAll() { renderWindows(); renderMeta(); renderKpis(); renderDetail(); renderChart(); renderFocusMap(); renderWeekFocus(); window.lucide?.createIcons(); }
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
    renderAll();
  } catch (error) { get('connectionError').textContent = error.message; get('connectionError').hidden = false; }
  finally { get('refreshData').disabled = false; }
}

get('periodToggle').addEventListener('click', event => { const button = event.target.closest('button[data-period]'); if (!button || !data) return; state.period = button.dataset.period; if (state.period === 'week') state.week = weekStart(data.meta.cutoff || `${state.month}-01`); renderAll(); remember(); });
get('windowSelect').addEventListener('change', event => { if (state.period === 'month') { state.month = event.target.value; state.week = weeksForMonth(state.month)[0].key; } else state.week = event.target.value; renderAll(); remember(); });
get('metricSeg').addEventListener('click', event => { const button = event.target.closest('button[data-m]'); if (!button || !data) return; state.metric = button.dataset.m; renderChart(); remember(); });
get('modeSeg').addEventListener('click', event => { const button = event.target.closest('button[data-mode]'); if (!button || !data) return; state.chartMode = button.dataset.mode === 'daily' ? 'daily' : 'cum'; renderChart(); remember(); });
get('refreshData').addEventListener('click', () => load(true));
get('logout').addEventListener('click', () => signOut());
try { const saved = JSON.parse(localStorage.getItem('measurement-view')); if (saved && ['month', 'week'].includes(saved.period)) state = { ...state, ...saved }; } catch {}
window.lucide?.createIcons();
load();
