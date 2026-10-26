// Интерактивный дашборд: KPI, фильтры с поиском, переключатели, 4 графика Plotly.
// Все графики и KPI строятся из одной таблицы, которую прислал бот.
// Формулы вычисляются тем же алгоритмом, что и в Python: дерево {op, a, b}, без eval.

const MEASURE_KEYS = ['plan', 'fact', 'qty', 'discount', 'deals'];
const COLORS = { plan: '#1E2B6F', fact: '#3D5AFE', planSoft: '#D9E0FF', ly: '#9AA6CF', good: '#1FA36B', bad: '#EC4A5A', accent: '#3D5AFE', ink: '#141B34', soft: '#5B6488', grid: '#EDEFF3' };
function shiftYear(key) {
  if (/^\d{4}-\d{2}$/.test(key)) return monthAdd(key, -12);
  return String(+key.slice(0, 4) - 1) + key.slice(4);
}
function signed(v, unit) { return (v > 0 ? '+' : v < 0 ? '−' : '') + fmtNum(Math.abs(v), unit); }
const PALETTE = ['#3D5AFE', '#FF8A3D', '#12A150', '#9B5DE5', '#00B4D8', '#F15BB5', '#FFC300', '#6C757D', '#2EC4B6'];
const MONTHS = ['янв', 'фев', 'мар', 'апр', 'май', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'];

function decodeTable(table) {
  const cols = {};
  for (const name of table.order) {
    const col = table.cols[name];
    cols[name] = Array.isArray(col) ? col : col.codes.map(i => col.dict[i]);
  }
  return { n: table.n, cols, order: table.order };
}

function monthAdd(ym, n) {
  const y = +ym.slice(0, 4), m = +ym.slice(5, 7);
  const t = y * 12 + (m - 1) + n;
  return `${Math.floor(t / 12)}-${String(t % 12 + 1).padStart(2, '0')}`;
}

function periodKey(ym, grain) {
  if (grain === 'year') return ym.slice(0, 4);
  if (grain === 'quarter') return `${ym.slice(0, 4)} Q${Math.floor((+ym.slice(5, 7) - 1) / 3) + 1}`;
  return ym;
}

function periodLabel(key) {
  if (/^\d{4}-\d{2}$/.test(key)) return `${MONTHS[+key.slice(5, 7) - 1]} ${key.slice(2, 4)}`;
  return key;
}

function fmtNum(v, unit) {
  if (v === null || v === undefined || !isFinite(v)) return '—';
  const a = Math.abs(v);
  if (unit === '%') return v.toFixed(1).replace('.', ',') + '%';
  if (unit === '₽' || unit === undefined) {
    if (a >= 1e9) return (v / 1e9).toFixed(2).replace('.', ',') + ' млрд ₽';
    if (a >= 1e6) return (v / 1e6).toFixed(1).replace('.', ',') + ' млн ₽';
    if (a >= 1e3) return Math.round(v / 1e3).toLocaleString('ru-RU') + ' тыс. ₽';
    return Math.round(v).toLocaleString('ru-RU') + ' ₽';
  }
  return Math.round(v).toLocaleString('ru-RU') + (unit ? ' ' + unit : '');
}

function rubScale(values) {
  const max = Math.max(0, ...values.filter(v => isFinite(v)).map(Math.abs));
  if (max >= 1e9) return [1e9, 'млрд ₽'];
  if (max >= 1e6) return [1e6, 'млн ₽'];
  if (max >= 1e3) return [1e3, 'тыс. ₽'];
  return [1, '₽'];
}

function evalExpr(node, sums) {
  if ('num' in node) return node.num;
  if ('col' in node) return sums[node.col] ?? NaN;
  const a = evalExpr(node.a, sums), b = evalExpr(node.b, sums);
  if (node.op === '+') return a + b;
  if (node.op === '-') return a - b;
  if (node.op === '*') return a * b;
  if (node.op === '/') return b === 0 ? NaN : a / b;
  return NaN;
}

function renderDashboard(el, payload, api) {
  const st = JSON.parse(JSON.stringify(payload.state));
  const ui = st.ui;
  const data = decodeTable(payload.table);
  const metrics = payload.metrics;
  const metricById = Object.fromEntries(metrics.map(m => [m.id, m]));
  const dimTitle = payload.dims;
  const charts = st.charts;
  const hasPlan = data.order.includes('plan');
  const plots = [];

  el.innerHTML = '';
  el.className = 'dash';

  // ---------- агрегирование ----------
  function rowsIdx(range, ignoreDim) {
    const out = [];
    const per = data.cols.period;
    for (let i = 0; i < data.n; i++) {
      if (per[i] < range.start || per[i] > range.end) continue;
      let ok = true;
      for (const [dim, vals] of Object.entries(ui.filters || {})) {
        if (!vals || !vals.length || dim === ignoreDim || !data.cols[dim]) continue;
        if (!vals.includes(data.cols[dim][i])) { ok = false; break; }
      }
      if (ok) out.push(i);
    }
    return out;
  }

  function group(idx, keyFn) {
    const map = new Map();
    for (const i of idx) {
      const k = keyFn(i);
      let s = map.get(k);
      if (!s) { s = {}; for (const m of MEASURE_KEYS) s[m] = 0; map.set(k, s); }
      for (const m of MEASURE_KEYS) if (data.cols[m]) s[m] += data.cols[m][i] || 0;
    }
    return map;
  }

  function plainValue(sums, id) {
    const m = metricById[id];
    if (!m || m.kind === 'measure') return sums[id];
    if (m.kind === 'formula') return evalExpr(m.expr, sums);
    return sums[m.metric || 'fact'];
  }

  // значения метрики для упорядоченных ключей (оконные функции считаются по ряду)
  function seriesValues(keys, map, id, isPeriod, prevMap) {
    const m = metricById[id];
    const base = keys.map(k => plainValue(map.get(k), id));
    if (!m || m.kind === 'measure' || m.kind === 'formula') return base;
    if (m.kind === 'share') {
      const total = keys.reduce((s, k) => s + (map.get(k)[m.metric] || 0), 0);
      return keys.map(k => total ? map.get(k)[m.metric] / total * 100 : NaN);
    }
    if (m.kind === 'rank') {
      const vals = keys.map(k => map.get(k)[m.metric]);
      return vals.map(v => 1 + vals.filter(x => x > v).length);
    }
    if (!isPeriod) return keys.map(() => NaN);
    if (m.kind === 'cumsum') {
      let acc = 0;
      return keys.map(k => (acc += map.get(k)[m.metric] || 0));
    }
    if (m.kind === 'pct_change') {
      const lagMonths = m.lag || 1;
      const steps = lagMonths === 12 ? { month: 12, quarter: 4, year: 1 }[ui.grain] : 1;
      const all = prevMap || map;
      const allKeys = [...all.keys()].sort();
      return keys.map(k => {
        const pos = allKeys.indexOf(k);
        const prevKey = allKeys[pos - steps];
        if (pos < 0 || !prevKey) return NaN;
        const prev = all.get(prevKey)[m.metric], cur = all.get(k)[m.metric];
        return prev ? (cur / prev - 1) * 100 : NaN;
      });
    }
    return base;
  }

  function unitOf(id) { return (metricById[id] && metricById[id].unit) || ''; }
  function titleOf(id) { return (metricById[id] && metricById[id].title) || id; }
  function resolve(v, fallback) { return v === '@metric' ? ui.metric : v === '@dim' ? ui.dim : (v || fallback); }

  // ---------- шапка ----------
  const head = document.createElement('div');
  head.className = 'dash-head';
  const r = ui.range;
  head.innerHTML = `<div><div class="dash-title"></div><div class="dash-sub"></div></div>`;
  head.querySelector('.dash-title').textContent = st.name;
  if (!/\d{4}/.test(st.name)) head.querySelector('.dash-sub').textContent = `${periodLabel(r.start)} – ${periodLabel(r.end)}`;
  if ((st.history || []).length) {
    const h = document.createElement('details');
    h.className = 'dash-hist';
    h.innerHTML = `<summary>История изменений: ${st.history.length}</summary><ol>${st.history.map(x => `<li></li>`).join('')}</ol>`;
    h.querySelectorAll('li').forEach((li, i) => (li.textContent = st.history[i]));
    head.appendChild(h);
  }
  el.appendChild(head);

  const kpiBox = document.createElement('div');
  kpiBox.className = 'kpis';
  el.appendChild(kpiBox);
  const insight = document.createElement('div');
  insight.className = 'insight';
  el.appendChild(insight);

  // ---------- фильтры и переключатели ----------
  const controls = document.createElement('div');
  controls.className = 'controls';
  el.appendChild(controls);

  const allRange = { start: '0000-00', end: '9999-99' };
  function options(dim) {
    // каскад: варианты зависят от остальных фильтров (регион -> точки)
    const idx = rowsIdx(ui.range, dim);
    const set = new Set();
    for (const i of idx) set.add(data.cols[dim][i]);
    return [...set].sort((a, b) => a.localeCompare(b, 'ru'));
  }

  function multiSelect(dim) {
    const wrap = document.createElement('div');
    wrap.className = 'ms ctl';
    const cap = document.createElement('span');
    cap.className = 'ctl-label';
    cap.textContent = dimTitle[dim];
    wrap.appendChild(cap);
    const btn = document.createElement('button');
    btn.className = 'ms-btn';
    const sel = () => ui.filters[dim] || [];
    const label = () => {
      const s = sel();
      btn.classList.toggle('active', s.length > 0);
      btn.textContent = s.length === 0 ? 'Все' : s.length === 1 ? s[0] : `Выбрано ${s.length}`;
    };
    label();
    wrap.appendChild(btn);
    btn.onclick = (e) => {
      e.stopPropagation();
      document.querySelectorAll('.ms-pop').forEach(p => p.remove());
      const pop = document.createElement('div');
      pop.className = 'ms-pop';
      pop.onclick = ev => ev.stopPropagation();
      const input = document.createElement('input');
      input.className = 'ms-search';
      input.placeholder = 'Поиск: начни вводить название';
      const list = document.createElement('div');
      list.className = 'ms-list';
      const opts = options(dim);
      const note = document.createElement('div');
      note.className = 'ms-note';
      if (dim === 'outlet' && (ui.filters.region || []).length) note.textContent = `Каскад: только точки региона ${ui.filters.region.join(', ')}`;
      function draw() {
        const q = input.value.toLowerCase().replace(/ё/g, 'е');
        const shown = opts.filter(o => o.toLowerCase().replace(/ё/g, 'е').includes(q)).slice(0, 300);
        list.innerHTML = '';
        for (const o of shown) {
          const lab = document.createElement('label');
          const cb = document.createElement('input');
          cb.type = 'checkbox';
          cb.checked = sel().includes(o);
          cb.onchange = () => {
            const cur = new Set(sel());
            cb.checked ? cur.add(o) : cur.delete(o);
            ui.filters[dim] = [...cur];
            label(); update();
          };
          lab.appendChild(cb);
          lab.appendChild(document.createTextNode(o));
          list.appendChild(lab);
        }
        if (!shown.length) list.innerHTML = '<div class="ms-note">Ничего не найдено</div>';
      }
      input.oninput = draw;
      const foot = document.createElement('div');
      foot.className = 'ms-foot';
      foot.innerHTML = `<span class="ms-note">${opts.length} значений</span><button>Сбросить</button>`;
      foot.querySelector('button').onclick = () => { ui.filters[dim] = []; label(); draw(); update(); };
      pop.append(input, note, list, foot);
      wrap.appendChild(pop);
      draw();
      input.focus();
    };
    return { wrap, label };
  }
  document.addEventListener('click', () => document.querySelectorAll('.ms-pop').forEach(p => p.remove()));

  const selects = [];
  for (const dim of st.filter_dims) {
    if (!data.cols[dim]) continue;
    const ms = multiSelect(dim);
    selects.push(ms);
    controls.appendChild(ms.wrap);
  }

  function seg(label, values, key) {
    const box = document.createElement('div');
    box.className = 'ctl';
    box.innerHTML = `<span class="ctl-label">${label}</span>`;
    const s = document.createElement('div');
    s.className = 'seg';
    for (const [val, text] of values) {
      const b = document.createElement('button');
      b.textContent = text;
      b.className = ui[key] === val ? 'on' : '';
      b.onclick = () => { ui[key] = val; s.querySelectorAll('button').forEach(x => x.classList.remove('on')); b.classList.add('on'); update(); };
      s.appendChild(b);
    }
    box.appendChild(s);
    return box;
  }
  controls.appendChild(seg('Разрез', st.dim_options.filter(d => data.cols[d]).map(d => [d, dimTitle[d]]), 'dim'));
  const metricBox = document.createElement('div');
  metricBox.className = 'ctl';
  metricBox.innerHTML = '<span class="ctl-label">Метрика</span>';
  const msel = document.createElement('select');
  msel.className = 'metric';
  for (const m of metrics) {
    if (!hasPlan && (m.id === 'plan' || m.id === 'exec_pct' || m.id === 'dev')) continue;
    const o = document.createElement('option');
    o.value = m.id; o.textContent = m.title;
    if (m.id === ui.metric) o.selected = true;
    msel.appendChild(o);
  }
  msel.onchange = () => { ui.metric = msel.value; update(); };
  metricBox.appendChild(msel);
  controls.appendChild(metricBox);
  controls.appendChild(seg('Период', [['month', 'Месяц'], ['quarter', 'Квартал'], ['year', 'Год']], 'grain'));
  controls.appendChild(seg('Вид', hasPlan ? [['abs', 'Значения'], ['pct', '% к плану'], ['dyn', 'Динамика']] : [['abs', 'Значения'], ['dyn', 'Динамика']], 'view'));

  // ---------- графики ----------
  const grid = document.createElement('div');
  grid.className = 'charts' + (charts.length === 1 ? ' one' : charts.length >= 4 ? ' four' : '');
  el.appendChild(grid);
  const chartEls = charts.map((c, i) => {
    const box = document.createElement('div');
    box.className = 'chart' + (charts.length >= 4 && i === 0 ? ' wide' : '');
    box.innerHTML = `<div class="chart-title"><span class="t"></span></div><div class="chart-plot"></div>`;
    grid.appendChild(box);
    return box;
  });
  const tableBox = document.createElement('div');
  tableBox.className = 'chart dtable';
  el.appendChild(tableBox);

  const baseLayout = () => ({
    margin: { l: 48, r: 12, t: 8, b: 36 }, paper_bgcolor: 'rgba(0,0,0,0)', plot_bgcolor: 'rgba(0,0,0,0)',
    font: { family: 'Inter, sans-serif', size: 12, color: COLORS.ink }, separators: ', ',
    legend: { orientation: 'h', y: 1.1, x: 0, font: { size: 12 } }, hoverlabel: { bgcolor: '#fff', bordercolor: '#DDE1E8', font: { color: COLORS.ink, size: 12.5 } },
    xaxis: { showgrid: false, zeroline: false, automargin: true, linecolor: '#DDE1E8', ticks: '' }, yaxis: { gridcolor: COLORS.grid, zeroline: false, automargin: true, ticks: '' },
  });
  const cfg = { displaylogo: false, responsive: true, displayModeBar: false };

  function draw(plotEl, traces, layout, emptyText) {
    if (!traces.length || traces.every(t => !(t.x || t.values || []).length)) {
      Plotly.purge(plotEl);
      plotEl.innerHTML = `<div class="empty">${emptyText || 'Нет данных для выбранных фильтров'}</div>`;
      return;
    }
    if (plotEl.querySelector('.empty')) plotEl.innerHTML = '';
    Plotly.react(plotEl, traces, layout, cfg);
  }

  function periodSeries(idx, metricIds) {
    const map = group(idx, i => periodKey(data.cols.period[i], ui.grain));
    const keys = [...map.keys()].sort();
    // ряд с прошлым годом нужен для динамики первых периодов
    const extRange = { start: monthAdd(ui.range.start, -12), end: ui.range.end };
    const extMap = group(rowsIdx(extRange), i => periodKey(data.cols.period[i], ui.grain));
    const out = {};
    for (const id of metricIds) out[id] = seriesValues(keys, map, id, true, extMap);
    return { keys, out, map, extMap };
  }

  function dynOf(keys, extMap, id) {
    const all = [...extMap.keys()].sort();
    return keys.map(k => {
      const p = all[all.indexOf(k) - 1];
      if (!p) return NaN;
      const a = plainValue(extMap.get(k), id), b = plainValue(extMap.get(p), id);
      return b ? (a / b - 1) * 100 : NaN;
    });
  }

  function renderChart(c, box, idx) {
    const plotEl = box.querySelector('.chart-plot');
    const tEl = box.querySelector('.t');
    const L = baseLayout();
    const metric = resolve(c.metric, 'fact');
    const dim = resolve(c.dim, ui.dim);

    if (c.type === 'period_bars') {
      let ids = c.metrics || ['fact'];
      if (!['plan', 'fact'].includes(ui.metric) && ids.join() === 'plan,fact') ids = [ui.metric];
      const { keys, out, extMap } = periodSeries(idx, ids);
      const x = keys.map(periodLabel);
      let traces;
      if (ui.view === 'pct' && hasPlan) {
        const v = periodSeries(idx, ['exec_pct']).out.exec_pct;
        traces = [{ type: 'bar', x, y: v, name: 'Факт к плану, %', marker: { color: v.map(y => y >= 100 ? COLORS.good : COLORS.bad) }, hovertemplate: '%{x}<br>%{y:.1f}%<extra></extra>' }];
        L.shapes = [{ type: 'line', xref: 'paper', x0: 0, x1: 1, y0: 100, y1: 100, line: { color: COLORS.ink, dash: 'dot', width: 1 } }];
        tEl.textContent = 'Выполнение плана по периодам, %';
      } else if (ui.view === 'dyn') {
        traces = ids.map((id, j) => ({ type: 'bar', x, y: dynOf(keys, extMap, id), name: titleOf(id), marker: { color: id === 'plan' ? COLORS.plan : PALETTE[j] }, hovertemplate: '%{x}<br>%{y:.1f}%<extra>' + titleOf(id) + '</extra>' }));
        tEl.textContent = 'Изменение к предыдущему периоду, %';
      } else {
        const allRub = ids.every(id => unitOf(id) === '₽');
        const [div, lab] = allRub ? rubScale(ids.flatMap(id => out[id])) : [1, ''];
        if (ids.join() === 'plan,fact') {
          const plan = out.plan, fact = out.fact;
          const ex = keys.map((k, j) => plan[j] ? fact[j] / plan[j] * 100 : NaN);
          traces = [
            { type: 'bar', x, y: fact.map(v => v / div), name: 'Факт', width: 0.62, marker: { color: fact.map((v, j) => v >= plan[j] ? COLORS.fact : COLORS.fact), cornerradius: 4 },
              text: ex.map(v => isFinite(v) ? v.toFixed(0) + '%' : ''), textposition: 'inside', insidetextanchor: 'end', textfont: { color: '#fff', size: 11 },
              customdata: fact.map((v, j) => [fmtNum(v, '₽'), fmtNum(plan[j], '₽'), signed(v - plan[j], '₽'), fmtNum(ex[j], '%')]),
              hovertemplate: '<b>%{x}</b><br>Факт %{customdata[0]}<br>План %{customdata[1]}<br>Отклонение %{customdata[2]}<br>Выполнение %{customdata[3]}<extra></extra>' },
            { type: 'scatter', mode: 'lines+markers', x, y: plan.map(v => v / div), name: 'План', line: { color: COLORS.plan, width: 2 }, marker: { size: 6, color: COLORS.plan }, hoverinfo: 'skip' },
          ];
          L.legend = { orientation: 'h', y: 1.1, x: 0 };
          L.yaxis.title = { text: lab, font: { size: 11.5 } };
          L.bargap = 0.3;
          tEl.textContent = `Факт и план по периодам`;
          L.xaxis.type = 'category';
          draw(plotEl, traces, L);
          return;
        }
        if (allRub) L.yaxis.title = { text: lab, font: { size: 11 } };
        if (ids.length === 1 && metricById[ids[0]] && metricById[ids[0]].kind === 'measure') {
          const id0 = ids[0];
          const ly = keys.map(k => { const s0 = extMap.get(shiftYear(k)); return s0 ? s0[id0] : NaN; });
          L.legend = { orientation: 'h', y: 1.1, x: 0 };
          L.xaxis.type = 'category';
          draw(plotEl, [
            { type: 'bar', x, y: out[id0].map(v => v / div), name: titleOf(id0).split(',')[0], width: 0.6, marker: { color: COLORS.fact, cornerradius: 4 },
              customdata: out[id0].map(v => fmtNum(v, unitOf(id0))), hovertemplate: '%{x}<br>%{customdata}<extra></extra>' },
            { type: 'scatter', mode: 'lines', x, y: ly.map(v => v / div), name: 'Прошлый год', line: { color: COLORS.ly, width: 2, dash: 'dot' },
              customdata: ly.map(v => fmtNum(v, unitOf(id0))), hovertemplate: '%{x}<br>Прошлый год %{customdata}<extra></extra>' }], L);
          tEl.textContent = c.title;
          return;
        }
        traces = ids.map((id, j) => ({ type: 'bar', x, y: out[id].map(v => v / div), name: titleOf(id).split(',')[0], marker: { color: id === 'plan' ? COLORS.plan : id === 'fact' ? COLORS.fact : PALETTE[(j + 1) % PALETTE.length] },
          customdata: out[id].map(v => fmtNum(v, unitOf(id))), hovertemplate: '%{x}<br>%{customdata}<extra>' + titleOf(id) + '</extra>' }));
        tEl.textContent = c.title;
      }
      L.barmode = 'group';
      L.xaxis.type = 'category';
      draw(plotEl, traces, L);
      return;
    }

    if (c.type === 'exec_line') {
      const id = metricById[metric] ? metric : 'exec_pct';
      const { keys, out } = periodSeries(idx, [id]);
      const y = out[id];
      const unit = unitOf(id);
      const isExec = id === 'exec_pct' || /выполн/i.test(titleOf(id));
      const ref = isExec ? 100 : (unit === '%' && metricById[id].kind === 'pct_change' ? 0 : null);
      const xs = keys.map(periodLabel);
      const lastI = y.length - 1;
      if (lastI >= 0 && isFinite(y[lastI])) L.annotations = [{ x: xs[lastI], y: y[lastI], text: fmtNum(y[lastI], unit), showarrow: false, yshift: 16, font: { size: 12, color: COLORS.ink } }];
      const traces = [{ type: 'scatter', mode: 'lines+markers', x: xs, y, name: titleOf(id), line: { color: COLORS.accent, width: 2.5 }, fill: ref !== null ? 'none' : 'tozeroy', fillcolor: 'rgba(61,90,254,.08)',
        marker: { size: 7, color: y.map(v => ref === null ? COLORS.fact : v >= ref ? COLORS.good : COLORS.bad) },
        customdata: y.map(v => fmtNum(v, unit)), hovertemplate: '%{x}<br>%{customdata}<extra></extra>' }];
      if (ref !== null) {
        L.shapes = [{ type: 'line', xref: 'paper', x0: 0, x1: 1, y0: ref, y1: ref, line: { color: COLORS.plan, dash: 'dash', width: 1.2 } }];
        const vals = y.filter(isFinite);
        if (vals.length) {
          const lo = Math.min(...vals, ref), hi = Math.max(...vals, ref), pad = (hi - lo) * .15 + 1;
          L.yaxis.range = [lo - pad, hi + pad];
        }
      }
      L.xaxis.type = 'category';
      L.xaxis.tickangle = 0;
      L.xaxis.nticks = 6;
      L.showlegend = false;
      tEl.textContent = c.title.startsWith('Динамика выполнения') || c.title.startsWith('Выполнение') ? (isExec ? c.title : 'Динамика: ' + titleOf(id)) : c.title;
      draw(plotEl, traces, L);
      return;
    }

    if (c.type === 'structure_pie') {
      let pidx = idx;
      if (c.last_period) {
        const lastKey = periodKey(ui.range.end, ui.grain);
        pidx = idx.filter(i => periodKey(data.cols.period[i], ui.grain) === lastKey);
      }
      const pdim = dim === ui.dim && c.dim === '@dim' ? ui.dim : (c.dim === 'category' && ui.dim === 'category' ? 'region' : dim);
      const pm = ['plan', 'fact', 'qty', 'discount', 'deals'].includes(metric) ? metric : 'fact';
      const map = group(pidx, i => data.cols[pdim][i]);
      let items = [...map.entries()].map(([k, s0]) => [k, s0[pm]]).filter(([k, v]) => v > 0 && !(c.exclude || []).includes(k)).sort((a, b) => b[1] - a[1]);
      if (items.length > 8) {
        const rest = items.slice(7).reduce((t, x0) => t + x0[1], 0);
        items = items.slice(0, 7).concat([['Другие', rest]]);
      }
      const total = items.reduce((t, x0) => t + x0[1], 0) || 1;
      const rev = items.slice().reverse();
      const names = rev.map(x0 => x0[0].length > 30 ? x0[0].slice(0, 28) + '…' : x0[0]);
      const h = Math.max(280, items.length * 32 + 40);
      plotEl.style.height = h + 'px';
      L.height = h;
      const traces = [{ type: 'bar', orientation: 'h', y: names, x: rev.map(x0 => x0[1] / total * 100),
        marker: { color: COLORS.fact, cornerradius: 3 },
        text: rev.map(x0 => (x0[1] / total * 100).toFixed(1).replace('.', ',') + '%'), textposition: 'outside', cliponaxis: false,
        customdata: rev.map(x0 => fmtNum(x0[1], unitOf(pm))), hovertemplate: '%{y}<br>%{customdata}, %{text}<extra></extra>' }];
      L.showlegend = false;
      L.margin = { l: 10, r: 60, t: 6, b: 20 };
      L.xaxis.visible = false;
      L.yaxis.automargin = true;
      L.yaxis.tickfont = { size: 11.5 };
      L.yaxis.ticklabelstandoff = 8;
      const lastLabel = c.last_period ? `, ${periodLabel(periodKey(ui.range.end, ui.grain))}` : '';
      tEl.textContent = `Доли по разрезу «${dimTitle[pdim].toLowerCase()}», ${titleOf(pm).split(',')[0].toLowerCase()}${lastLabel}`;
      draw(plotEl, traces, L);
      return;
    }

    if (c.type === 'top_hbar' || c.type === 'dim_planfact') {
      const map = group(idx, i => data.cols[dim][i]);
      const keys = [...map.keys()];
      const showId = c.type === 'dim_planfact' ? 'fact' : (metricById[metric] ? metric : 'fact');
      const sortId = resolve(c.sort_by, showId) === '@metric' ? ui.metric : resolve(c.sort_by, showId);
      const sortVals = seriesValues(keys, map, metricById[sortId] ? sortId : showId, false);
      let order = keys.map((k, j) => [k, sortVals[j]]).filter(x => isFinite(x[1]));
      order.sort((a, b) => c.ascending ? a[1] - b[1] : b[1] - a[1]);
      order = order.slice(0, c.top || 10);
      const ks = order.map(x => x[0]);
      const short = ks.map(k => { const s2 = k.split(', ').slice(0, 2).join(', '); return s2.length > 40 ? s2.slice(0, 38) + '…' : s2; });
      const h = Math.max(300, ks.length * (c.type === 'dim_planfact' ? 30 : 21) + 70);
      plotEl.style.height = h + 'px';
      L.height = h;
      let traces;
      if (c.type === 'dim_planfact' && hasPlan) {
        const plan = ks.map(k => map.get(k).plan), fact = ks.map(k => map.get(k).fact);
        const ex = ks.map(k => map.get(k).plan ? map.get(k).fact / map.get(k).plan * 100 : NaN);
        const [div, lab] = rubScale(plan.concat(fact));
        traces = [
          { type: 'bar', orientation: 'h', y: short.slice().reverse(), x: plan.slice().reverse().map(v => v / div), name: 'План', width: 0.78, marker: { color: COLORS.planSoft }, customdata: plan.slice().reverse().map(v => fmtNum(v, '₽')), hovertemplate: '%{y}<br>План %{customdata}<extra></extra>' },
          { type: 'bar', orientation: 'h', y: short.slice().reverse(), x: fact.slice().reverse().map(v => v / div), name: 'Факт', width: 0.42, marker: { color: COLORS.fact },
            textfont: { color: ex.slice().reverse().map(v => v >= 100 ? COLORS.good : COLORS.bad), size: 10.5 },
            text: ex.slice().reverse().map(v => isFinite(v) ? v.toFixed(0) + '%' : ''), textposition: 'outside', cliponaxis: false,
            customdata: fact.slice().reverse().map(v => fmtNum(v, '₽')), hovertemplate: '%{y}<br>Факт %{customdata}, выполнение %{text}<extra></extra>' },
        ];
        L.barmode = 'overlay';
        L.legend = { orientation: 'h', y: 1.06, x: 0 };
        L.xaxis.title = { text: lab, font: { size: 11 } };
        tEl.textContent = `План-факт по разрезу «${dimTitle[dim].toLowerCase()}»` + (c.ascending ? ', сначала отстающие' : '');
      } else if (hasPlan && c.sort_by === 'dev' && ['fact', 'dev'].includes(showId)) {
        const dev = ks.map(k => map.get(k).fact - map.get(k).plan);
        const pct = ks.map(k => map.get(k).plan ? (map.get(k).fact / map.get(k).plan - 1) * 100 : NaN);
        const [div, lab] = rubScale(dev);
        traces = [{ type: 'bar', orientation: 'h', y: short.slice().reverse(), x: dev.slice().reverse().map(v => v / div),
          marker: { color: dev.slice().reverse().map(v => v >= 0 ? COLORS.good : COLORS.bad) },
          text: pct.slice().reverse().map(p => isFinite(p) ? (p >= 0 ? '+' : '−') + Math.abs(p).toFixed(1).replace('.', ',') + '%' : ''),
          customdata: dev.slice().reverse().map(v => signed(v, '₽')),
          textposition: 'outside', textfont: { size: 11 }, cliponaxis: false, hovertemplate: '%{y}<br>%{customdata}, %{text}<extra></extra>' }];
        L.showlegend = false;
        L.xaxis.title = { text: lab, font: { size: 11 } };
        L.xaxis.zeroline = true;
        L.xaxis.zerolinecolor = '#B9C0D0';
        const m = Math.max(...dev.map(v => Math.abs(v) / div), 0.1);
        L.xaxis.range = [-m * 2.1, m * 1.5];
        tEl.textContent = `Отклонение от плана по разрезу «${dimTitle[dim].toLowerCase()}»`;
      } else {
        const vals = seriesValues(ks, map, showId, false);
        const thr = c.threshold;
        const rub = unitOf(showId) === '₽';
        const [div, lab] = rub ? rubScale(vals) : [1, ''];
        if (rub) L.xaxis.title = { text: lab, font: { size: 11 } };
        traces = [{ type: 'bar', orientation: 'h', y: short.slice().reverse(), x: vals.slice().reverse().map(v => v / div),
          marker: { color: vals.slice().reverse().map(v => thr !== undefined ? (v < thr ? COLORS.bad : COLORS.good) : (v < 0 ? COLORS.bad : COLORS.fact)) },
          text: vals.slice().reverse().map(v => fmtNum(v, unitOf(showId))), textposition: 'outside', cliponaxis: false,
          hovertemplate: '%{y}<br>%{text}<extra></extra>' }];
        if (thr !== undefined) L.shapes = [{ type: 'line', yref: 'paper', y0: 0, y1: 1, x0: thr, x1: thr, line: { color: COLORS.ink, dash: 'dot', width: 1 } }];
        L.showlegend = false;
        const by = sortId !== showId ? `, сортировка по «${titleOf(sortId).split(',')[0].toLowerCase()}»` : '';
        tEl.textContent = `ТОП-${c.top || 10}: ${titleOf(showId).split(',')[0].toLowerCase()} по разрезу «${dimTitle[dim].toLowerCase()}»${by}`;
      }
      L.margin.l = 10;
      L.margin.r = 80;
      L.xaxis.automargin = true;
      L.yaxis.automargin = true;
      L.yaxis.tickfont = { size: 11.5 };
      L.yaxis.ticklabelstandoff = 8;
      L.yaxis.tickmode = 'array';
      L.yaxis.tickvals = short.slice().reverse();
      draw(plotEl, traces, L);
      return;
    }
  }

  // ---------- KPI ----------
  function monthly(idx) {
    const map = group(idx, i => data.cols.period[i]);
    const keys = [...map.keys()].sort();
    return { keys, map };
  }

  function chip(textValue, cls) { return `<span class="chip ${cls || ''}"></span>`.replace('></span>', '>' + textValue + '</span>'); }

  function kpis(idx) {
    const sum = group(idx, () => 'all').get('all') || Object.fromEntries(MEASURE_KEYS.map(m => [m, 0]));
    const prevRange = { start: monthAdd(ui.range.start, -12), end: monthAdd(ui.range.end, -12) };
    const prev = group(rowsIdx(prevRange), () => 'all').get('all');
    const yoy = (cur, p) => p ? (cur / p - 1) * 100 : NaN;
    const pctTxt = v => isFinite(v) ? (v > 0 ? '+' : v < 0 ? '−' : '') + Math.abs(v).toFixed(1).replace('.', ',') + '%' : '—';
    const { keys, map } = monthly(idx);
    const ser = id => keys.map(k => plainValue(map.get(k), id));
    const cards = [];
    if (st.kpi === 'discounts') {
      const share = sum.fact ? sum.discount / sum.fact * 100 : NaN;
      const d = prev ? yoy(sum.discount, prev.discount) : NaN;
      let withDisc = 0;
      for (const i of idx) if (data.cols.reason && data.cols.reason[i] !== 'Без скидки') withDisc += data.cols.deals[i];
      const m2 = group(idx.filter(i => data.cols.reason[i] !== 'Без скидки'), i => data.cols.reason[i]);
      const top = [...m2.entries()].sort((a, b) => b[1].discount - a[1].discount)[0];
      cards.push({ label: 'Скидки', value: fmtNum(sum.discount, '₽'), chips: [[pctTxt(d) + ' к прошлому году', d > 0 ? 'bad' : 'good']] });
      cards.push({ label: 'Скидки к продажам', value: fmtNum(share, '%'), chips: [['продажи ' + fmtNum(sum.fact, '₽'), '']] });
      cards.push({ label: 'Сделок со скидкой', value: fmtNum(withDisc, 'шт'), chips: [['из ' + fmtNum(sum.deals, '') + ' сделок', '']] });
      cards.push({ label: 'Главная причина', value: top ? top[0] : '—', small: true, chips: top ? [[(top[1].discount / sum.discount * 100).toFixed(0) + '% всех скидок', '']] : [] });
    } else {
      const ex = sum.plan ? sum.fact / sum.plan * 100 : NaN;
      const dev = sum.fact - sum.plan;
      const d = prev ? yoy(sum.fact, prev.fact) : NaN;
      const dim = data.cols[ui.dim] && ui.dim !== 'period' ? ui.dim : 'region';
      const g = [...group(idx, i => data.cols[dim][i]).entries()].filter(([k, s0]) => s0.plan > 0).map(([k, s0]) => [k, s0.fact / s0.plan * 100]);
      g.sort((a, b) => a[1] - b[1]);
      const under = g.filter(x0 => x0[1] < 100).length;
      cards.push({ label: 'Факт', value: fmtNum(sum.fact, '₽'), chips: [[pctTxt(d) + ' к прошлому году', d >= 0 ? 'good' : 'bad']] });
      cards.push({ label: 'Выполнение плана', value: fmtNum(ex, '%'), tone: ex >= 100 ? 'good' : 'bad', chips: [['план ' + fmtNum(sum.plan, '₽'), '']] });
      cards.push({ label: 'Отклонение от плана', value: signed(dev, '₽'), tone: dev >= 0 ? 'good' : 'bad', chips: [[pctTxt(dev / sum.plan * 100) + ' от плана', dev >= 0 ? 'good' : 'bad']] });
      cards.push({ label: `Ниже плана, разрез «${dimTitle[dim].toLowerCase()}»`, value: `${under} из ${g.length}`, tone: under ? 'bad' : 'good', small: false,
        chips: g.length ? [['слабее всех ' + (g[0][0].split(', ').slice(0, 2).join(', ')) + ', ' + g[0][1].toFixed(0) + '%', 'bad']] : [] });
    }
    kpiBox.innerHTML = '';
    for (const c0 of cards) {
      const k = document.createElement('div');
      k.className = 'kpi ' + (c0.tone || '');
      k.innerHTML = '<div class="k-label"></div><div class="k-val"></div><div class="k-deltas"></div>';
      k.querySelector('.k-label').textContent = c0.label;
      const v = k.querySelector('.k-val');
      v.textContent = c0.value;
      if (c0.small) v.classList.add('small');
      const box = k.querySelector('.k-deltas');
      for (const [t, cls] of c0.chips) { const sp = document.createElement('div'); sp.className = 'delta ' + cls; sp.textContent = t; box.appendChild(sp); }
      kpiBox.appendChild(k);
    }
    return sum;
  }

  // ---------- резюме: цифры считает код, текст — шаблон ----------
  function summarize(idx, sum) {
    if (!idx.length) { insight.textContent = 'С текущими фильтрами данных нет.'; return; }
    const dim = data.cols[ui.dim] && ui.dim !== 'period' ? ui.dim : (data.cols.region ? 'region' : st.filter_dims[0]);
    const map = group(idx, i => data.cols[dim][i]);
    const dt = dimTitle[dim].toLowerCase();
    if (st.kpi === 'discounts') {
      const m2 = group(idx.filter(i => data.cols.reason[i] !== 'Без скидки'), i => data.cols.reason[i]);
      const top = [...m2.entries()].sort((a, b) => b[1].discount - a[1].discount)[0];
      insight.innerHTML = `<b>Главное</b> Скидки ${fmtNum(sum.discount, '₽')}, это ${fmtNum(sum.discount / sum.fact * 100, '%')} продаж.` +
        (top ? ` Главная причина «${top[0]}», ${fmtNum(top[1].discount / sum.discount * 100, '%')} всех скидок.` : '');
      return;
    }
    const rows = [...map.entries()].filter(([k, s]) => s.plan > 0).map(([k, s]) => [k, s.fact / s.plan * 100, s.fact - s.plan]);
    rows.sort((a, b) => b[1] - a[1]);
    const ex = sum.fact / sum.plan * 100;
    const under = rows.filter(r => r[1] < 100);
    let t = `<b>Главное</b> План выполнен на ${fmtNum(ex, '%')}, `;
    t += sum.fact >= sum.plan ? `перевыполнение ${fmtNum(sum.fact - sum.plan, '₽')}. ` : `отставание ${fmtNum(sum.plan - sum.fact, '₽')}. `;
    if (rows.length > 1) {
      t += `Лидер по разрезу «${dt}»: ${rows[0][0]} (${fmtNum(rows[0][1], '%')}), `;
      t += `сильнее всего отстает ${rows[rows.length - 1][0]} (${fmtNum(rows[rows.length - 1][1], '%')}). `;
      t += `Ниже плана ${under.length} из ${rows.length}.`;
    }
    insight.innerHTML = t;
  }

  // ---------- таблица по главному разрезу ----------
  function renderTable(idx) {
    const dim = data.cols[ui.dim] && ui.dim !== 'period' ? ui.dim : (data.cols.region ? 'region' : st.filter_dims[0]);
    const map = group(idx, i => data.cols[dim][i]);
    const disc = st.kpi === 'discounts';
    let rows = [...map.entries()];
    rows.sort((a, b) => disc ? b[1].discount - a[1].discount : b[1].fact - a[1].fact);
    const total = rows.length;
    rows = rows.slice(0, 12);
    const short = k => { const s2 = k.split(', ').slice(0, 2).join(', '); return s2.length > 44 ? s2.slice(0, 42) + '…' : s2; };
    let head, body;
    if (hasPlan && !disc) {
      const maxEx = Math.max(110, ...rows.map(([k, s0]) => s0.plan ? s0.fact / s0.plan * 100 : 0));
      head = '<tr><th></th><th>План</th><th>Факт</th><th>Отклонение</th><th class="bar-col">Выполнение плана</th></tr>';
      body = rows.map(([k, s0]) => {
        const ex = s0.plan ? s0.fact / s0.plan * 100 : NaN, dev = s0.fact - s0.plan;
        const cls = dev >= 0 ? 'good' : 'bad';
        return `<tr><td>${esc(short(k))}</td><td>${fmtNum(s0.plan, '₽')}</td><td>${fmtNum(s0.fact, '₽')}</td><td class="${cls}">${signed(dev, '₽')}</td>` +
          `<td class="bar-col"><div class="tcell"><div class="tbar"><div class="tbar-fill ${cls}" style="width:${Math.min(100, ex / maxEx * 100)}%"></div><div class="tbar-ref" style="left:${100 / maxEx * 100}%"></div></div><span class="${cls}">${fmtNum(ex, '%')}</span></div></td></tr>`;
      }).join('');
    } else {
      const maxD = Math.max(...rows.map(([k, s0]) => s0.fact ? s0.discount / s0.fact * 100 : 0), 1);
      head = '<tr><th></th><th>Продажи</th><th>Скидки</th><th class="bar-col">Скидки к продажам</th></tr>';
      body = rows.map(([k, s0]) => {
        const sh = s0.fact ? s0.discount / s0.fact * 100 : NaN;
        return `<tr><td>${esc(short(k))}</td><td>${fmtNum(s0.fact, '₽')}</td><td>${fmtNum(s0.discount, '₽')}</td>` +
          `<td class="bar-col"><div class="tcell"><div class="tbar"><div class="tbar-fill" style="width:${sh / maxD * 100}%"></div></div><span>${fmtNum(sh, '%')}</span></div></td></tr>`;
      }).join('');
    }
    const more = total > rows.length ? `, первые ${rows.length} из ${total}` : '';
    tableBox.innerHTML = `<div class="chart-title"><span class="t"></span></div><div class="tscroll"><table class="dt"><thead>${head}</thead><tbody>${body}</tbody></table></div>`;
    tableBox.querySelector('.t').textContent = `Разрез «${dimTitle[dim].toLowerCase()}»${more}`;
  }
  function esc(t) { return String(t).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }

  function update() {
    const idx = rowsIdx(ui.range);
    const sum = kpis(idx);
    charts.forEach((c, i) => renderChart(c, chartEls[i], idx));
    summarize(idx, sum);
    if (idx.length && (data.cols.fact)) renderTable(idx); else tableBox.innerHTML = '';
    selects.forEach(s => s.label());
    if (api && api.onChange) api.onChange({ filters: ui.filters, dim: ui.dim, metric: ui.metric, grain: ui.grain, view: ui.view });
  }

  update();

  // синхронный зум графиков по периодам
  const periodPlots = charts.map((c, i) => (c.type === 'period_bars' || c.type === 'exec_line') ? chartEls[i].querySelector('.chart-plot') : null).filter(Boolean);
  let syncing = false;
  for (const p of periodPlots) {
    if (!p.on) continue;
    p.on('plotly_relayout', ev => {
      if (syncing) return;
      const upd = {};
      if ('xaxis.range[0]' in ev) { upd['xaxis.range'] = [ev['xaxis.range[0]'], ev['xaxis.range[1]']]; }
      else if (ev['xaxis.autorange']) { upd['xaxis.autorange'] = true; }
      else return;
      syncing = true;
      Promise.all(periodPlots.filter(q => q !== p).map(q => Plotly.relayout(q, upd))).finally(() => (syncing = false));
    });
  }
  return { ui };
}
