// Интерактивный дашборд: KPI, фильтры с поиском, переключатели, 4 графика Plotly.
// Все графики и KPI строятся из одной таблицы, которую прислал бот.
// Формулы вычисляются тем же алгоритмом, что и в Python: дерево {op, a, b}, без eval.

const MEASURE_KEYS = ['plan', 'fact', 'qty', 'discount', 'deals'];
const COLORS = { plan: '#B7C3FF', fact: '#3D5AFE', good: '#12A150', bad: '#E5383B', accent: '#FF8A3D', ink: '#141B34', grid: '#EEF1F7' };
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
  head.querySelector('.dash-sub').textContent = `Запрос: «${st.query}» · период ${periodLabel(r.start)} – ${periodLabel(r.end)}`.replace(' · ', ', ');
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
    wrap.className = 'ms';
    const btn = document.createElement('button');
    btn.className = 'ms-btn';
    const sel = () => ui.filters[dim] || [];
    const label = () => {
      const s = sel();
      btn.classList.toggle('active', s.length > 0);
      btn.textContent = `${dimTitle[dim]}: ` + (s.length === 0 ? 'все' : s.length === 1 ? s[0] : `выбрано ${s.length}`) + ' ▾';
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
  grid.className = 'charts' + (charts.length === 1 ? ' one' : '');
  el.appendChild(grid);
  const chartEls = charts.map((c, i) => {
    const box = document.createElement('div');
    box.className = 'chart';
    box.innerHTML = `<div class="chart-title"><span class="chart-num">${i + 1}</span><span class="t"></span></div><div class="chart-plot"></div>`;
    grid.appendChild(box);
    return box;
  });
  const insight = document.createElement('div');
  insight.className = 'insight';
  el.appendChild(insight);

  const baseLayout = () => ({
    margin: { l: 56, r: 16, t: 10, b: 48 }, paper_bgcolor: 'rgba(0,0,0,0)', plot_bgcolor: 'rgba(0,0,0,0)',
    font: { family: 'Inter, sans-serif', size: 11.5, color: COLORS.ink }, separators: ', ',
    legend: { orientation: 'h', y: 1.12, x: 0 }, hoverlabel: { bgcolor: '#fff', bordercolor: '#E3E7F1', font: { color: COLORS.ink } },
    xaxis: { gridcolor: COLORS.grid, zeroline: false, automargin: true }, yaxis: { gridcolor: COLORS.grid, zeroline: false, automargin: true },
  });
  const cfg = { displaylogo: false, responsive: true, modeBarButtonsToRemove: ['lasso2d', 'select2d'] };

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
        if (allRub) L.yaxis.title = { text: lab, font: { size: 11 } };
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
      const traces = [{ type: 'scatter', mode: 'lines+markers', x: keys.map(periodLabel), y, name: titleOf(id), line: { color: COLORS.fact, width: 3 },
        marker: { size: 7, color: y.map(v => ref === null ? COLORS.fact : v >= ref ? COLORS.good : COLORS.bad) },
        customdata: y.map(v => fmtNum(v, unit)), hovertemplate: '%{x}<br>%{customdata}<extra></extra>' }];
      if (ref !== null) {
        L.shapes = [{ type: 'line', xref: 'paper', x0: 0, x1: 1, y0: ref, y1: ref, line: { color: COLORS.ink, dash: 'dot', width: 1.2 } }];
        const vals = y.filter(isFinite);
        if (vals.length) {
          const lo = Math.min(...vals, ref), hi = Math.max(...vals, ref), pad = (hi - lo) * .15 + 1;
          L.yaxis.range = [lo - pad, hi + pad];
          L.shapes.push({ type: 'rect', xref: 'paper', x0: 0, x1: 1, y0: ref, y1: hi + pad, fillcolor: COLORS.good, opacity: .06, line: { width: 0 } });
          L.shapes.push({ type: 'rect', xref: 'paper', x0: 0, x1: 1, y0: lo - pad, y1: ref, fillcolor: COLORS.bad, opacity: .06, line: { width: 0 } });
        }
      }
      L.xaxis.type = 'category';
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
      let items = [...map.entries()].map(([k, s]) => [k, s[pm]]).filter(([k, v]) => v > 0 && !(c.exclude || []).includes(k)).sort((a, b) => b[1] - a[1]);
      if (items.length > 8) {
        const rest = items.slice(7).reduce((s, x) => s + x[1], 0);
        items = items.slice(0, 7).concat([['Другие', rest]]);
      }
      const traces = [{ type: 'pie', hole: .55, labels: items.map(x => x[0]), values: items.map(x => x[1]), sort: false,
        marker: { colors: PALETTE }, textinfo: 'percent', textposition: 'inside', insidetextorientation: 'horizontal',
        customdata: items.map(x => fmtNum(x[1], unitOf(pm))), hovertemplate: '%{label}<br>%{customdata}, %{percent}<extra></extra>' }];
      L.legend = { orientation: 'v', x: 1, y: .5, font: { size: 11 } };
      L.margin = { l: 10, r: 10, t: 10, b: 10 };
      const lastLabel = c.last_period ? `, ${periodLabel(periodKey(ui.range.end, ui.grain))}` : '';
      tEl.textContent = `Структура: ${titleOf(pm).split(',')[0].toLowerCase()} по разрезу «${dimTitle[pdim].toLowerCase()}»${lastLabel}`;
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
          { type: 'bar', orientation: 'h', y: short.slice().reverse(), x: plan.slice().reverse().map(v => v / div), name: 'План', marker: { color: COLORS.plan }, customdata: plan.slice().reverse().map(v => fmtNum(v, '₽')), hovertemplate: '%{y}<br>План %{customdata}<extra></extra>' },
          { type: 'bar', orientation: 'h', y: short.slice().reverse(), x: fact.slice().reverse().map(v => v / div), name: 'Факт', marker: { color: ex.slice().reverse().map(v => v >= 100 ? COLORS.fact : COLORS.bad) },
            text: ex.slice().reverse().map(v => isFinite(v) ? v.toFixed(0) + '%' : ''), textposition: 'outside', cliponaxis: false,
            customdata: fact.slice().reverse().map(v => fmtNum(v, '₽')), hovertemplate: '%{y}<br>Факт %{customdata}, выполнение %{text}<extra></extra>' },
        ];
        L.barmode = 'group';
        L.xaxis.title = { text: lab, font: { size: 11 } };
        tEl.textContent = `План-факт по разрезу «${dimTitle[dim].toLowerCase()}»` + (c.ascending ? ', сначала отстающие' : '');
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
      L.yaxis.tickfont = { size: 10.5 };
      L.yaxis.tickmode = 'array';
      L.yaxis.tickvals = short.slice().reverse();
      draw(plotEl, traces, L);
      return;
    }
  }

  // ---------- KPI ----------
  function kpis(idx) {
    const sum = group(idx, () => 'all').get('all') || Object.fromEntries(MEASURE_KEYS.map(m => [m, 0]));
    const prevRange = { start: monthAdd(ui.range.start, -12), end: monthAdd(ui.range.end, -12) };
    const prev = group(rowsIdx(prevRange), () => 'all').get('all');
    const cards = [];
    const yoy = (cur, p) => p ? (cur / p - 1) * 100 : NaN;
    if (st.kpi === 'discounts') {
      const share = sum.fact ? sum.discount / sum.fact * 100 : NaN;
      let withDisc = 0;
      const clients = new Set();
      for (const i of idx) {
        if (data.cols.reason && data.cols.reason[i] !== 'Без скидки') withDisc += data.cols.deals[i];
        if (data.cols.client) clients.add(data.cols.client[i]);
      }
      const d = prev ? yoy(sum.discount, prev.discount) : NaN;
      cards.push(['Скидки', fmtNum(sum.discount, '₽'), '', '']);
      cards.push(['Продажи', fmtNum(sum.fact, '₽'), '', '']);
      cards.push(['Скидки к продажам', fmtNum(share, '%'), '', share > 3 ? 'bad' : 'good']);
      cards.push(['Сделок со скидкой', fmtNum(withDisc, 'шт'), `из ${fmtNum(sum.deals, '')}`, '']);
      cards.push(['Клиентов', fmtNum(clients.size, ''), '', '']);
      cards.push(['Скидки к прошлому году', isFinite(d) ? (d > 0 ? '+' : '') + fmtNum(d, '%') : '—', '', isFinite(d) ? (d > 0 ? 'bad' : 'good') : '']);
    } else {
      const ex = sum.plan ? sum.fact / sum.plan * 100 : NaN;
      const dev = sum.fact - sum.plan;
      const outlets = new Set();
      for (const i of idx) if (data.cols.fact[i] > 0 && data.cols.outlet) outlets.add(data.cols.outlet[i]);
      const d = prev ? yoy(sum.fact, prev.fact) : NaN;
      cards.push(['План', fmtNum(sum.plan, '₽'), '', '']);
      cards.push(['Факт', fmtNum(sum.fact, '₽'), '', '']);
      cards.push(['Выполнение плана', fmtNum(ex, '%'), '', ex >= 100 ? 'good' : 'bad']);
      cards.push(['Отклонение', (dev > 0 ? '+' : '') + fmtNum(dev, '₽'), sum.plan ? ((dev > 0 ? '+' : '') + (dev / sum.plan * 100).toFixed(1).replace('.', ',') + '%') : '', dev >= 0 ? 'good' : 'bad']);
      cards.push(['Активных точек', fmtNum(outlets.size, ''), `продуктовых сделок ${fmtNum(sum.deals, '')}`, '']);
      cards.push(['Динамика к прошлому году', isFinite(d) ? (d > 0 ? '+' : '') + fmtNum(d, '%') : '—', '', isFinite(d) ? (d >= 0 ? 'good' : 'bad') : '']);
    }
    kpiBox.innerHTML = '';
    for (const [label, val, sub, cls] of cards) {
      const k = document.createElement('div');
      k.className = 'kpi ' + cls;
      k.innerHTML = '<div class="k-label"></div><div class="k-val"></div><div class="k-sub"></div>';
      k.querySelector('.k-label').textContent = label;
      k.querySelector('.k-val').textContent = val;
      k.querySelector('.k-sub').textContent = sub;
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
      insight.innerHTML = `<b>Резюме.</b> Скидки ${fmtNum(sum.discount, '₽')}, это ${fmtNum(sum.discount / sum.fact * 100, '%')} продаж.` +
        (top ? ` Главная причина «${top[0]}», ${fmtNum(top[1].discount / sum.discount * 100, '%')} всех скидок.` : '');
      return;
    }
    const rows = [...map.entries()].filter(([k, s]) => s.plan > 0).map(([k, s]) => [k, s.fact / s.plan * 100, s.fact - s.plan]);
    rows.sort((a, b) => b[1] - a[1]);
    const ex = sum.fact / sum.plan * 100;
    const under = rows.filter(r => r[1] < 100);
    let t = `<b>Резюме.</b> План выполнен на ${fmtNum(ex, '%')}, `;
    t += sum.fact >= sum.plan ? `перевыполнение ${fmtNum(sum.fact - sum.plan, '₽')}. ` : `отставание ${fmtNum(sum.plan - sum.fact, '₽')}. `;
    if (rows.length > 1) {
      t += `Лидер по разрезу «${dt}»: ${rows[0][0]} (${fmtNum(rows[0][1], '%')}), `;
      t += `сильнее всего отстает ${rows[rows.length - 1][0]} (${fmtNum(rows[rows.length - 1][1], '%')}). `;
      t += `Ниже плана ${under.length} из ${rows.length}.`;
    }
    insight.innerHTML = t;
  }

  function update() {
    const idx = rowsIdx(ui.range);
    const sum = kpis(idx);
    charts.forEach((c, i) => renderChart(c, chartEls[i], idx));
    summarize(idx, sum);
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
