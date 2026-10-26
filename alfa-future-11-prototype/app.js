// Прототип команды № 11: один клиент глазами бухгалтера, финдиректора и менеджера
(function () {
  const D = window.DATA;
  const E = window.Engine;

  // ---------- иконки (контуры в стиле Lucide) ----------
  const ICON = {
    home: '<path d="M3 10.5 12 3l9 7.5V21h-6v-6H9v6H3z"/>',
    pay: '<rect x="3" y="6" width="18" height="13" rx="2"/><path d="M3 10h18M7 15h4"/>',
    doc: '<path d="M7 3h7l5 5v13H7z"/><path d="M14 3v5h5M10 13h6M10 17h6"/>',
    chart: '<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>',
    more: '<circle cx="5" cy="12" r="1.6"/><circle cx="12" cy="12" r="1.6"/><circle cx="19" cy="12" r="1.6"/>',
    users: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c.8-3.5 3.4-5.5 6.5-5.5s5.7 2 6.5 5.5M16 4.5a3.5 3.5 0 0 1 0 7M18 14.8c1.8.8 3 2.6 3.5 5.2"/>',
    globe: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c2.5 3 2.5 15 0 18M12 3c-2.5 3-2.5 15 0 18"/>',
    bank: '<path d="M3 9 12 4l9 5M5 10v8M9.5 10v8M14.5 10v8M19 10v8M3 20h18"/>',
    sign: '<path d="M3 17c3-1 4-6 6-6s1 5 3 5 3-3 4-3 2 2 5 2M4 21h16"/>',
    send: '<path d="M21 3 10 14M21 3l-7 18-4-7-7-4z"/>',
    clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
    check: '<path d="m5 12.5 4.5 4.5L19 7.5"/>',
    info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7.5v.5"/>',
    left: '<path d="m15 5-7 7 7 7"/>',
    right: '<path d="m9 5 7 7-7 7"/>',
    phone: '<path d="M5 3h4l2 5-2.5 1.5a11 11 0 0 0 6 6L16 13l5 2v4a2 2 0 0 1-2 2A17 17 0 0 1 3 5a2 2 0 0 1 2-2z"/>',
    bell: '<path d="M6 16V11a6 6 0 0 1 12 0v5l2 2H4zM10 21h4"/><path d="M3 3l18 18"/>',
    bulb: '<path d="M9 18h6M10 21h4M12 3a6 6 0 0 0-3.5 10.9c.6.5 1 1.2 1 2.1h5c0-.9.4-1.6 1-2.1A6 6 0 0 0 12 3z"/>',
    sliders: '<path d="M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12M20 18h0"/><circle cx="16" cy="6" r="2"/><circle cx="10" cy="12" r="2"/><circle cx="18" cy="18" r="2"/>',
    cpu: '<rect x="6" y="6" width="12" height="12" rx="2"/><path d="M9 2v4M15 2v4M9 18v4M15 18v4M2 9h4M2 15h4M18 9h4M18 15h4"/>',
    reset: '<path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5"/>',
    x: '<path d="M6 6l12 12M18 6 6 18"/>',
    plus5: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
    pause: '<path d="M9 5v14M15 5v14"/>',
    note: '<path d="M5 4h14v12l-4 4H5z"/><path d="M15 20v-4h4M9 9h6M9 13h4"/>',
    briefcase: '<rect x="3" y="7" width="18" height="13" rx="2"/><path d="M9 7V4h6v3M3 13h18"/>'
  };
  function icon(name) {
    return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + ICON[name] + '</svg>';
  }
  function esc(s) {
    return String(s === null || s === undefined ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  }

  // ---------- справочники ----------
  const COMPANY_NAMES = {
    P1: 'ООО «Агроснаб-Демо»', P2: 'ООО «Зерновой двор-Демо»', P3: 'ООО «СтройМонтаж-Демо»', P4: 'ООО «Север Холдинг-Демо»',
    P5: 'ООО «ГрадСтрой-Демо»', P6: 'ООО «БетонТорг-Демо»', P7: 'ООО «ИмпортЛайн-Демо»', P8: 'ООО «Сфера-Демо»',
    P9: 'ООО «СтройРесурс-Демо»', P10: 'ООО «ОтделкаПро-Демо»'
  };
  const SEASON = {
    agro: 'Растениеводство, АПК', agro_trade: 'Поставщик аграриев', food: 'Пищевая промышленность',
    construction: 'Строительство', construction_trade: 'Поставщик стройки', flat: 'Без сезонности'
  };
  const BEHAVIOR = {
    base: { label: 'Как в профиле' },
    J7: { label: 'Дошёл до заявки без пауз', s: { submitted: 1 } },
    J4: { label: 'Ошибался в полях заявки', s: { n_field_errors: 2 } },
    J1: { label: 'Пауза и правки суммы', s: { max_pause_sec: 52, n_calc_changes: 3 } },
    J2: { label: 'Возвращался назад', s: { n_back: 3 } },
    J3: { label: 'Сравнивал разделы витрины', s: { n_product_sections: 4 } },
    J5: { label: 'Сохранил черновик и пропал', s: { draft_saved: 1 } },
    J6: { label: 'Быстро вышел', s: { duration_sec: 35, n_steps: 3 } }
  };
  const EMPTY_SESSION = { session_id: 'demo', user_id: '', app: 'Интернет-банк (веб)', product: 'Оборотный кредит', started_at: '', duration_sec: 180, n_back: 0, max_pause_sec: 0, n_calc_changes: 0, n_product_sections: 0, n_field_errors: 0, draft_saved: 0, submitted: 0, n_steps: 8 };
  const TPL = {};
  for (const t of D.templates) TPL[t.template_id] = t;
  const AS_OF = '2026-10-26';

  // ---------- состояние ----------
  const BASE = {};
  for (const p of D.profiles) BASE[p.profile_id] = p;

  function newFlow() {
    return { note: 'new', card: 'none', cardDirect: false, phone: 'home', amount: null, edits: 0, j1: false,
      manager: false, managerState: 'new', hidden: [], firstShownAt: null, signedAt: null, log: [], lastInputAt: 0, carIdx: 0 };
  }
  function freshState() {
    return { profileId: 'P1', ov: {}, mode: 'asis', viewer: 'accountant', desk: 'accountant', drawer: false, whatif: false, flow: newFlow(), sig: null, prevKey: null, changes: [] };
  }
  let state = freshState();
  const t0 = Date.now();

  function clock() {
    const sec = Math.floor((Date.now() - t0) / 1000);
    const m = 40 + Math.floor(sec / 60);
    return '11:' + String(Math.min(m, 59)).padStart(2, '0');
  }
  function log(text) {
    state.flow.log.push({ t: clock(), text: text });
  }

  // ---------- профиль с переключателями «что если» ----------
  function addDays(iso, n) {
    const d = new Date(iso + 'T12:00:00Z');
    d.setUTCDate(d.getUTCDate() + n);
    return d.toISOString().slice(0, 10);
  }
  function fdUsers(p) {
    return p.users.filter(u => u.role_crm === 'Финансовый директор' || (!u.role_crm && u.role_model_pred === 'Финансовый директор'));
  }
  function currentProfile() {
    const p = JSON.parse(JSON.stringify(BASE[state.profileId]));
    delete p.expected_output;
    const o = state.ov;
    if (o.season) p.company.season_type = o.season;
    if (o.weeks !== undefined && p.forecast.gap_date) {
      p.forecast.weeks_to_gap = o.weeks;
      p.forecast.gap_date = addDays(AS_OF, Math.round(o.weeks * 7));
    }
    if (o.conf !== undefined && p.forecast.gap_date) p.forecast.confidence = o.conf;
    if (o.cash !== undefined) p.structure.group_free_cash_mln = o.cash;
    if (o.holding === true) { p.structure.holding_flag = 1; p.structure.group_size = Math.max(5, p.structure.group_size); }
    if (o.holding === false) p.structure.holding_flag = 0;
    if (o.fdBoss === false) for (const u of fdUsers(p)) u.has_alfa_boss = 0;
    if (o.fdCrmEmpty === true) for (const u of fdUsers(p)) u.role_crm = null;
    if (o.noConsents === true) for (const u of p.users) { u.consent_ads_email = 0; u.consent_ads_push = 0; u.consent_ads_sms = 0; u.consent_ads_call = 0; }
    if (o.optout === true) for (const u of p.users) u.optout_all = 1;
    if (o.behavior && o.behavior !== 'base') {
      const s = Object.assign({}, EMPTY_SESSION, BEHAVIOR[o.behavior].s);
      p.journey_last_session = s;
    }
    return p;
  }

  // ---------- решение ----------
  function decide() {
    const p = currentProfile();
    const r = E.engine(p, D.params, D.hooks);
    const asis = Object.keys(p.asis_scores).map(k => [k, p.asis_scores[k]]).sort((a, b) => b[1] - a[1]);
    return { p: p, r: r, asis: asis, tobe: state.mode === 'tobe' };
  }

  // ---------- форматирование ----------
  function ru(x, digits) { return x.toFixed(digits).replace('.', ','); }
  function mln(x) { return E.num(x) + ' млн ₽'; }
  function cleanCh(s) { return s.replace(/\s*\((F|FS)_[^)]*\)/g, ''); }
  function ruNums(s) { return s.replace(/(\d)\.(\d)/g, '$1,$2'); }
  function cap(s) { return s ? s[0].toUpperCase() + s.slice(1) : s; }
  function userLabel(u) {
    if (!u) return 'не определён';
    if (u.role_resolved && u.role_resolved !== 'Неизвестно') return u.role_resolved;
    if (u.sign_rights === 'Создание платежей') return 'Сотрудник с правом создания платежей';
    return u.role_crm || 'Сотрудник';
  }
  function guideLabel(u) {
    if (!u) return 'Бухгалтерия';
    if (u.sign_rights === 'Создание платежей') return 'Сотрудник с правом создания платежей';
    return userLabel(u);
  }
  const pauseUntil = E.fmtDate(addDays(AS_OF, 30));

  // ---------- что показывать клиентам ----------
  function view(dec) {
    const r = dec.r, p = dec.p, f = state.flow;
    const v = { note: null, card: null, banner: null, service: null, brief: null, push: false };
    if (!dec.tobe) return v;
    if (r.action === 'Только сервисное уведомление о прогнозе') {
      if (p.forecast.gap_date) v.service = { title: TPL.T11.title, body: TPL.T11.body.replace('{gap_date}', E.fmtDate(p.forecast.gap_date)), btn: TPL.T11.buttons, why: TPL.T11.why_you_see_this };
      return v;
    }
    if (r.action !== 'Показать предложение') return v;
    const ch = r.channels || [];
    const jr = r.journey_adaptation || {};
    const g1 = (r.path || '').startsWith('Г1');
    const offer = offerCard(dec);
    if (g1 && r.texts['Бухгалтеру'] && !f.hidden.includes('note') && f.note !== 'later') {
      v.note = { title: TPL.T01.title, body: r.texts['Бухгалтеру'], why: r.texts['Почему вы это видите'] };
    }
    const cardChannel = ch.some(c => c.startsWith('Карточка ЛПР'));
    let cardVisible = false;
    if (cardChannel) {
      if (g1 && r.texts['Бухгалтеру']) cardVisible = f.note === 'forwarded' || f.cardDirect;
      else cardVisible = true;
    }
    if (jr.rule_id === 'J6') cardVisible = false;
    if (f.hidden.includes('card')) cardVisible = false;
    if (cardVisible) v.card = offer;
    if (ch.includes('Баннер в интернет-банке') || ch.includes('Интернет-банк')) {
      if (!f.hidden.includes('banner') && jr.rule_id !== 'J6') v.banner = offer;
    }
    v.push = ch.includes('Push') && cardVisible;
    const lpr = r._meta.lpr;
    if (ch.some(c => c.includes('Бриф менеджеру'))) v.brief = { text: r.texts['Бриф менеджеру'], reason: 'ЛПР работает через менеджера' };
    else if (ch.includes('Менеджер (холдинг)')) v.brief = { text: t12(dec), reason: 'Холдинг: менеджер ведёт группу' };
    else if (f.manager) v.brief = { text: t12(dec), reason: 'Финдиректор нажал «Обсудить с менеджером»' };
    if (v.brief) v.brief.call = r.manager_contact === 'Звонок с предложением' || (!r.manager_contact && lpr && lpr.consent_ads_call);
    return v;
  }

  function t12(dec) {
    const r = dec.r, p = dec.p, lpr = r._meta.lpr;
    const role = lpr ? userLabel(lpr) : 'не определён';
    const args = { 'Финансовый директор': 'сумма, срок и разрыв', 'Собственник': 'рост без изъятия денег из оборота' };
    const arg = args[role] || 'сумма и срок';
    const head = r._meta.confident ? 'Разрыв ' + mln(p.forecast.gap_amount_mln) + ' к ' + E.fmtDate(p.forecast.gap_date) + ', уверенность ' + ru(p.forecast.confidence, 2) + '. ' : '';
    return head + 'ЛПР — ' + role.toLowerCase() + '; аргумент: ' + arg + '.';
  }

  function offerCard(dec) {
    const r = dec.r, top = r.offer, m = r._meta;
    const lprText = r.texts['ЛПР'] || '';
    const isCredit = top === 'Оборотный кредит' || top === 'Льготный кредит АПК';
    const card = { product: top, why: r.texts['Почему вы это видите'], legal: true };
    if (isCredit && m.in_window) {
      const t = top === 'Льготный кредит АПК' ? TPL.T05 : TPL.T02;
      card.tpl = t.template_id; card.title = t.title;
      card.body = cap(lprText.replace(/^Предварительное предложение:\s*/, ''));
      card.buttons = t.buttons.split(' | ');
      card.legal = t.template_id !== 'T02';
    } else if (isCredit && m.confident) {
      card.tpl = 'T04'; card.title = TPL.T04.title; card.body = lprText; card.buttons = TPL.T04.buttons.split(' | ');
    } else if (isCredit) {
      card.tpl = '—'; card.title = 'Оборотный кредит'; card.body = lprText; card.buttons = ['Рассчитать'];
    } else {
      const map = { 'Кэш-пулинг': 'T06', 'Факторинг': 'T07', 'Лизинг': 'T08', 'Депозит': 'T09', 'ВЭД': 'T10' };
      const t = TPL[map[top]];
      card.tpl = t.template_id; card.title = t.title; card.body = lprText; card.buttons = t.buttons.split(' | ');
      card.legal = top !== 'ВЭД' && top !== 'Депозит';
    }
    return card;
  }

  function asisBanner(product) {
    const map = { 'ВЭД': ['T10'], 'Депозит': ['T09', 'Остаток без движения можно разместить онлайн.'], 'Факторинг': ['T07', 'Покупатели платят по-прежнему с отсрочкой.'],
      'Лизинг': ['T08', 'Лизинг без разового платежа.'], 'Кэш-пулинг': ['T06', 'Кэш-пулинг — без кредита и процентов.'] };
    if (product === 'Оборотный кредит') return { title: 'Оборотный кредит', body: 'Оборотный кредит для бизнеса: лимит под обороты компании, решение онлайн.', btn: 'Подробнее' };
    const m = map[product];
    const t = TPL[m[0]];
    return { title: t.title, body: m[1] || t.body, btn: t.buttons.split(' | ')[0] };
  }

  // ---------- отрисовка ----------
  function render(skipWhatif) {
    const dec = decide();
    trackChanges(dec);
    const sig = [dec.r.action, dec.r.offer, dec.r.path, dec.r.addressee_lpr].join('|');
    if (state.sig && state.sig !== sig) { state.flow = newFlow(); }
    state.sig = sig;
    const v = view(dec);
    if (dec.tobe && !state.flow.firstShownAt && (v.note || v.card || v.banner)) state.flow.firstShownAt = Date.now();
    document.getElementById('bar').innerHTML = renderBar(dec, v);
    const g = guideStep(dec, v);
    document.getElementById('guide').innerHTML = renderGuide(g);
    state.guideTarget = g.target || null;
    const wi = document.getElementById('whatif');
    wi.hidden = !state.whatif;
    if (state.whatif && !skipWhatif) wi.innerHTML = renderWhatif(dec);
    if (state.whatif) { const c = document.getElementById('changes'); if (c) c.innerHTML = renderChanges(); }
    document.getElementById('stage').innerHTML = renderStage(dec, v);
    document.getElementById('drawer').innerHTML = renderDrawer(dec, v);
    document.getElementById('drawer').classList.toggle('open', state.drawer);
    document.getElementById('scrim').classList.toggle('open', state.drawer);
    if (state.guideTarget && !state.drawer) {
      const t = document.querySelector(state.guideTarget);
      if (t) t.classList.add('pulse');
    }
  }

  function trackChanges(dec) {
    const r = dec.r;
    const key = {
      'Продукт': r.offer || r.action, 'Путь': r.path || '—', 'Каналы': (r.channels || []).map(cleanCh).join(', ') || '—',
      'Текст для ЛПР': (r.texts || {})['ЛПР'] || '—', 'Частота': r.frequency || '—', 'Менеджер': r.manager_contact || '—',
      'Адаптация пути': (r.journey_adaptation || {}).rule_id || '—', 'Источник роли': (r._meta && r._meta.lpr) ? r._meta.lpr.role_source : '—'
    };
    if (state.prevKey) {
      const ch = [];
      for (const k of Object.keys(key)) if (key[k] !== state.prevKey[k]) ch.push(k);
      state.changes = ch;
    }
    state.prevKey = key;
  }

  function renderBar(dec, v) {
    const s = state, f = s.flow, r = dec.r;
    const opts = D.profiles.map(p => '<option value="' + p.profile_id + '"' + (p.profile_id === s.profileId ? ' selected' : '') + '>' + p.profile_id + ' ' + esc(COMPANY_NAMES[p.profile_id].replace('ООО ', '')) + '</option>').join('');
    let ctx = '';
    if (dec.tobe && (r.path || '').startsWith('Г1') && v.note && f.note === 'new' && !f.cardDirect) {
      ctx += '<button class="tool violet" data-action="plus5" title="Записку не переслали за 5 дней">' + icon('plus5') + '+5 дней</button>';
    }
    if (dec.tobe && f.phone === 'calc' && !f.j1) {
      ctx += '<button class="tool violet" data-action="pause">' + icon('pause') + 'Имитировать паузу</button>';
    }
    return '' +
      '<div class="brand"><img src="assets/logo_af.png" alt="Альфа-Будущее"><div class="brand-text"><b>Команда № 11</b><span>Демо-прототип, данные синтетические, не сервис банка</span></div></div>' +
      '<div class="bar-main">' +
        '<div class="seg mode" role="group" aria-label="Режим">' +
          '<button data-action="mode" data-mode="asis" aria-pressed="' + (s.mode === 'asis') + '">AS IS</button>' +
          '<button data-action="mode" data-mode="tobe" aria-pressed="' + (s.mode === 'tobe') + '">TO BE</button>' +
        '</div>' +
        '<div class="seg" role="group" aria-label="Зритель">' +
          ['accountant', 'cfo', 'manager'].map(x => '<button data-action="viewer" data-viewer="' + x + '" aria-pressed="' + (s.viewer === x) + '">' + { accountant: 'Бухгалтер', cfo: 'Финдиректор', manager: 'Менеджер' }[x] + '</button>').join('') +
        '</div>' +
      '</div>' +
      '<div class="bar-tools">' + ctx +
        '<select class="select" id="profileSel" aria-label="Профиль клиента">' + opts + '</select>' +
        '<button class="tool" data-action="whatif" aria-pressed="' + s.whatif + '">' + icon('sliders') + 'Что если</button>' +
        '<button class="tool" data-action="drawer" aria-pressed="' + s.drawer + '">' + icon('cpu') + 'Под капотом</button>' +
        '<button class="tool" data-action="reset">' + icon('reset') + 'Сбросить</button>' +
      '</div>';
  }

  // ---------- «Что если» ----------
  function renderWhatif(dec) {
    const p = dec.p, base = BASE[state.profileId], o = state.ov;
    const hasGap = Boolean(base.forecast.gap_date);
    const fds = fdUsers(p);
    const fdBoss = fds.length ? fds.every(u => u.has_alfa_boss) : false;
    const fdCrm = fds.length ? fds.every(u => u.role_crm) : false;
    const consents = p.users.some(u => u.consent_ads_email || u.consent_ads_push || u.consent_ads_call);
    const optout = p.users.every(u => u.optout_all);
    const sw = (key, on, label, hint, disabled) =>
      '<div class="wi"><span class="wi-label">' + label + '</span><div class="switch"><button data-action="sw" data-key="' + key + '" aria-pressed="' + on + '"' + (disabled ? ' disabled' : '') + ' aria-label="' + esc(label) + '"></button>' + (on ? 'Да' : 'Нет') + '</div><small>' + hint + '</small></div>';
    const seasonOpts = Object.keys(SEASON).map(k => '<option value="' + k + '"' + (p.company.season_type === k ? ' selected' : '') + '>' + SEASON[k] + '</option>').join('');
    const behOpts = Object.keys(BEHAVIOR).map(k => '<option value="' + k + '"' + ((o.behavior || 'base') === k ? ' selected' : '') + '>' + (k === 'base' ? '' : k + ' ') + BEHAVIOR[k].label + '</option>').join('');
    const weeks = p.forecast.weeks_to_gap, conf = p.forecast.confidence;
    return '<div class="whatif-inner">' +
      '<div class="whatif-head"><h2>Что если</h2><p>Меняем поля профиля ' + state.profileId + ', решение пересчитывается, экраны и панель обновляются сразу</p></div>' +
      '<div class="wi-grid">' +
        '<div class="wi"><label for="wiSeason">Отрасль и сезонность</label><select id="wiSeason" class="select">' + seasonOpts + '</select><small>Отраслевой продукт и фраза в тексте; для АПК льготный кредит</small></div>' +
        '<div class="wi"><label for="wiWeeks">Недель до разрыва</label><div class="wi-val"><span id="wiWeeksV">' + (hasGap ? ru(weeks, 1) : 'разрыва нет') + '</span><span>окно 2–6</span></div><input type="range" id="wiWeeks" min="1" max="20" step="0.1" value="' + (hasGap ? weeks : 6) + '"' + (hasGap ? '' : ' disabled') + '><small>В окне записка и ×1,6, вне окна кредит не чаще раза в месяц</small></div>' +
        '<div class="wi"><label for="wiConf">Уверенность прогноза</label><div class="wi-val"><span id="wiConfV">' + (hasGap ? ru(conf, 2) : '—') + '</span><span>порог 0,7</span></div><input type="range" id="wiConf" min="0.4" max="0.99" step="0.01" value="' + (hasGap ? conf : 0.8) + '"' + (hasGap ? '' : ' disabled') + '><small>Ниже 0,7 текущий процесс, без цифр разрыва</small></div>' +
        '<div class="wi"><label for="wiCash">Свободные деньги группы</label><div class="wi-val"><span id="wiCashV">' + mln(p.structure.group_free_cash_mln) + '</span><span>разрыв ' + (hasGap ? mln(p.forecast.gap_amount_mln) : '—') + '</span></div><input type="range" id="wiCash" min="0" max="' + Math.max(100, Math.ceil((base.forecast.gap_amount_mln || 0) * 1.5)) + '" step="0.1" value="' + p.structure.group_free_cash_mln + '"><small>От суммы разрыва кэш-пулинг вместо кредита</small></div>' +
        sw('holding', p.structure.holding_flag === 1, 'Холдинг, от 5 юрлиц', 'Добавляется менеджер, один лимит на группу') +
        sw('fdBoss', fdBoss, 'Финдиректор в «Альфа-Боссе»', fds.length ? 'Нет — вместо записки и карточки бриф менеджеру' : 'В этом профиле нет финдиректора', !fds.length) +
        sw('fdCrm', fdCrm, 'Роль финдиректора в CRM заполнена', fds.length ? 'Нет — ЛПР выбирает модель, источник роли виден в панели' : 'В этом профиле нет финдиректора', !fds.length) +
        sw('consents', consents, 'Согласия на рекламу', 'Нет — email и push пропадают, звонок только по обслуживанию') +
        sw('optout', optout, 'Полный отказ от рекламы', 'Да — только сервисное уведомление T11') +
        '<div class="wi"><label for="wiBeh">Поведение в прошлой сессии</label><select id="wiBeh" class="select">' + behOpts + '</select><small>Адаптация пути J1–J7 на карточке и в калькуляторе</small></div>' +
      '</div>' +
      '<div class="changes" id="changes"></div>' +
    '</div>';
  }
  function renderChanges() {
    if (!Object.keys(state.ov).length) return '<span class="chip">Профиль ' + state.profileId + ' без изменений</span>';
    return '<b>Изменилось:</b>' + (state.changes.length ? state.changes.map(c => '<span class="chip lime">' + c + '</span>').join('') : '<span class="chip">на экранах ничего, см. «Под капотом»</span>') +
      '<button class="chip" data-action="clearov">Вернуть профиль</button>';
  }

  // ---------- сцена ----------
  function renderStage(dec, v) {
    const desk = state.viewer === 'manager' ? 'manager' : (state.viewer === 'accountant' ? 'accountant' : state.desk);
    if (state.viewer !== 'cfo') state.desk = desk;
    const showLeft = state.viewer !== 'cfo';
    const left = desk === 'manager'
      ? '<div class="pane-head' + (state.viewer === 'manager' ? ' active' : '') + '"><b>Клиентский менеджер</b><span class="app">CRM</span></div><div class="win"><div class="win-top"><i></i><i></i><i></i><span class="tab">CRM, карточка клиента</span></div>' + renderCRM(dec, v) + '</div>'
      : '<div class="pane-head' + (state.viewer === 'accountant' ? ' active' : '') + '"><b>Бухгалтерия</b><span class="app">Альфа-Бизнес Онлайн</span></div><div class="win"><div class="win-top"><i></i><i></i><i></i><span class="tab">Альфа-Бизнес Онлайн</span></div>' + renderIB(dec, v) + '</div>';
    const right = '<div class="pane-head' + (state.viewer === 'cfo' ? ' active' : '') + '"><b>Финансовый директор</b><span class="app">Альфа-Босс</span></div>' +
      '<div class="phone' + (state.viewer === 'cfo' ? ' focus' : '') + '"><div class="screen">' + renderBoss(dec, v) + '</div></div>';
    return '<div class="pane' + (showLeft ? ' show' : '') + '">' + left + '</div><div class="pane' + (state.viewer === 'cfo' ? ' show' : '') + '">' + right + '</div>';
  }

  // ---------- интернет-банк ----------
  function renderIB(dec, v) {
    const p = dec.p, f = state.flow;
    const nav = [['home', 'Главная', true], ['pay', 'Платежи'], ['doc', 'Выписки'], ['bank', 'Кредиты'], ['globe', 'ВЭД'], ['users', 'Зарплата'], ['chart', 'Аналитика'], ['more', 'Сервисы']];
    const rev = p.company.revenue_company_mln;
    const balance = Math.round(rev * 1e6 / 12 * 0.31 / 10) * 10 + 0.4;
    const feed = [
      ['26.10', 'Поступление от покупателя по договору поставки', '+ 4 812 300,00 ₽', true],
      ['26.10', 'Оплата поставщику за товар', '− 3 145 900,00 ₽'],
      ['25.10', 'Налоги и сборы', '− 612 480,00 ₽'],
      ['24.10', 'Поступление от покупателя', '+ 2 096 750,00 ₽', true],
      ['24.10', 'Зарплата по реестру', '− 1 873 200,00 ₽']
    ];
    let slot = '';
    if (!dec.tobe) {
      let items = dec.asis.filter(x => x[1] >= 0.2);
      if (!items.length) items = dec.asis.slice(0, 3);
      const i = f.carIdx % items.length;
      const b = asisBanner(items[i][0]);
      slot = '<div><div class="slot-title">Предложения банка</div><div class="carousel"><div><h3>' + esc(b.title) + '<span class="score-tag">скор ' + ru(items[i][1], 3) + '</span></h3><p>' + esc(b.body) + '</p><button class="cta ghost">' + esc(b.btn) + '</button></div>' +
        '<div class="car-nav"><button data-action="car" data-d="-1" aria-label="Назад">' + icon('left') + '</button>' + (i + 1) + ' из ' + items.length + '<button data-action="car" data-d="1" aria-label="Вперёд">' + icon('right') + '</button></div></div></div>';
    } else if (v.note) {
      slot = renderNote(dec, v);
    } else if (f.note === 'later') {
      slot = '';
    } else if (v.banner) {
      slot = '<div>' + renderOffer(v.banner, 'banner', dec, false) + '</div>';
    } else if (v.service) {
      slot = renderService(v.service);
    }
    return '<div class="ib"><nav class="ib-side"><div class="ib-logo"><img src="assets/logo_a.png" alt=""><span>Альфа-Бизнес</span></div>' +
      nav.map(n => '<div class="ib-nav' + (n[2] ? ' on' : '') + '">' + icon(n[0]) + '<span>' + n[1] + '</span></div>').join('') + '</nav>' +
      '<div class="ib-main">' +
        '<div class="ib-head"><div class="ib-co"><b>' + esc(COMPANY_NAMES[state.profileId]) + '</b><span>' + esc(p.company.industry) + ', ' + esc(p.company.region) + '</span></div><div class="sp"></div>' +
        '<div class="ib-user"><span>26 октября 2026</span><div class="avatar">' + icon('users') + '</div></div></div>' +
        '<h1>Главная</h1>' +
        '<div class="accounts"><div class="acc"><span>Расчётный счёт, ₽</span><b>' + balance.toLocaleString('ru-RU', { minimumFractionDigits: 2 }) + ' ₽</b></div><div class="acc"><span>Платежи на сегодня</span><b>4 из 6 подписаны</b></div><div class="acc"><span>Поступления за октябрь</span><b>' + E.num(rev / 12 * 0.94) + ' млн ₽</b></div></div>' +
        '<div class="quick"><button>' + icon('pay') + 'Новый платёж</button><button>' + icon('doc') + 'Выписка</button><button>' + icon('users') + 'Реестр</button></div>' +
        '<div class="ib-slot">' + slot + '</div>' +
        '<div><div class="slot-title">Лента операций</div><div class="feed">' + feed.map(x => '<div class="feed-row"><span class="d">' + x[0] + '</span><span class="t">' + x[1] + '</span><span class="a' + (x[3] ? ' in' : '') + '">' + x[2] + '</span></div>').join('') + '</div></div>' +
      '</div></div>';
  }

  function renderNote(dec, v) {
    const f = state.flow;
    let status = '';
    if (f.card === 'approved' || f.card === 'signed') status = '<div class="status">' + icon('check') + (f.card === 'signed' ? 'Руководитель подписал заявку' : 'Руководитель одобрил подачу') + '</div>';
    else if (f.card === 'manager') status = '<div class="status neutral">' + icon('users') + 'Передано менеджеру</div>';
    else if (f.card === 'later') status = '<div class="status wait">' + icon('clock') + 'Отложено до ' + pauseUntil + '</div>';
    else if (f.note === 'forwarded') status = '<div class="status neutral">' + icon('send') + 'Переслано руководителю в «Альфа-Босс»</div>';
    else if (f.cardDirect) status = '<div class="status wait">' + icon('clock') + 'Записку не переслали за 5 дней, банк отправил карточку руководителю напрямую</div>';
    const buttons = f.note === 'new' && !f.cardDirect
      ? '<div class="btns"><button class="cta" data-action="forward">' + icon('send').replace('<svg', '<svg style="width:16px;height:16px;vertical-align:-3px;margin-right:6px"') + 'Переслать руководителю</button><button class="cta ghost" data-action="noteLater">Не сейчас</button></div>'
      : status;
    return '<div class="msg"><div class="msg-eyebrow">' + icon('note') + 'Для руководителя</div><h3>' + esc(v.note.title) + '</h3><p class="body">' + esc(v.note.body) + '</p>' + buttons +
      '<div class="msg-foot"><span>Почему вы это видите: <b>' + esc(v.note.why) + '</b></span><button class="link" data-action="hide" data-what="note">Не показывать</button></div></div>';
  }

  function renderService(s) {
    return '<div class="msg soft"><div class="msg-eyebrow" style="color:var(--bank-text-2)">' + icon('info') + 'Сервисное уведомление</div><h3>' + esc(s.title) + '</h3><p class="body">' + esc(s.body) + '</p><div class="btns"><button class="cta ghost">' + esc(s.btn) + '</button></div>' +
      '<div class="msg-foot"><span>Почему вы это видите: <b>' + esc(s.why) + '</b></span><button class="link" data-action="hide" data-what="service">Не показывать</button></div></div>';
  }

  // карточка предложения (телефон или баннер в ИБ)
  function renderOffer(c, where, dec, inPhone) {
    const f = state.flow, r = dec.r, jr = r.journey_adaptation || {};
    let btns = '';
    let status = '';
    if (where === 'card' && f.card === 'later') status = '<div class="status wait">' + icon('clock') + 'Отложено до ' + pauseUntil + ', банк напомнит не раньше</div>';
    else if (where === 'card' && f.card === 'manager') status = '<div class="status neutral">' + icon('users') + 'Менеджер свяжется с вами</div>';
    else if (where === 'card' && (f.card === 'approved' || f.card === 'signed')) status = '<div class="status">' + icon('check') + (f.card === 'signed' ? 'Заявка подписана и подана' : 'Вы одобрили подачу') + '</div>';
    if (!status) {
      const list = c.buttons.slice();
      const out = [];
      if (jr.rule_id === 'J7' && list.some(b => b.startsWith('Одобрить'))) out.push('<span class="adapt">J7 прошлый раз дошли до заявки без пауз</span><button class="cta" data-action="approve">Подать заявку</button>');
      list.forEach((b, i) => {
        let act = 'noop';
        if (b.startsWith('Одобрить') || b === 'Рассчитать' || b === 'Открыть депозит') act = 'approve';
        else if (b.startsWith('Обсудить')) act = 'discuss';
        else if (b === 'Не сейчас') act = 'cardLater';
        const cls = (i === 0 && !out.length) ? 'cta' : 'cta ghost';
        out.push('<button class="' + cls + '" data-action="' + act + '" data-btn="' + esc(b) + '">' + esc(b) + '</button>');
      });
      if (jr.rule_id === 'J5') out.unshift('<span class="adapt">J5 черновик заявки сохранён</span><button class="cta dark" data-action="approve">Продолжить черновик</button>');
      btns = '<div class="btns">' + out.join('') + '</div>';
    }
    let compare = '';
    if (jr.rule_id === 'J3' && where === 'card' && !status) {
      const pa = dec.p.preapproved;
      const rows = ['Оборотный кредит', 'Факторинг', 'Лизинг'].filter(k => pa[k]).map(k => '<div><span>' + k + '</span><b>до ' + E.num(pa[k].limit_mln) + ' млн</b><span>от ' + ru(pa[k].rate_from, 1) + ' %</span></div>').join('');
      if (rows) compare = '<span class="adapt">J3 сравнение под задачу</span><div class="compare">' + rows + '</div>';
    }
    const eyebrow = where === 'card' ? 'Предложение для вас' : 'Для руководителя';
    return '<div class="msg' + (inPhone ? ' soft' : '') + '"><div class="msg-eyebrow">' + icon('briefcase') + eyebrow + '</div><h3>' + esc(c.title) + '</h3><p class="body">' + esc(c.body) + '</p>' +
      (c.legal ? '<p class="legal">Предварительное предложение, не оферта. Решение банк примет после заявки</p>' : '') +
      compare + (status || btns) +
      '<div class="msg-foot"><span>Почему вы это видите: <b>' + esc(c.why) + '</b></span><button class="link" data-action="hide" data-what="' + (where === 'card' ? 'card' : 'banner') + '">Не показывать</button></div></div>';
  }

  // ---------- «Альфа-Босс» ----------
  function renderBoss(dec, v) {
    const f = state.flow, p = dec.p;
    let head = '', body = '';
    const sb = '<div class="sbar"><span>' + clock() + '</span><span class="notch"></span><span>5G</span></div>';
    const tab = '<div class="tabbar"><div class="on">' + icon('home') + 'Главная</div><div>' + icon('sign') + 'Подпись</div><div>' + icon('chart') + 'Аналитика</div><div>' + icon('more') + 'Ещё</div></div>';
    if (f.phone === 'calc' || f.phone === 'sign' || f.phone === 'signing' || f.phone === 'done') {
      head = '<div class="app-head"><button class="back" data-action="phoneHome" aria-label="Назад">' + icon('left') + '</button><div class="t"><b>' + (f.phone === 'calc' ? 'Кредитная линия' : 'Подпись заявки') + '</b><span>' + esc(COMPANY_NAMES[state.profileId]) + '</span></div></div>';
      body = f.phone === 'calc' ? renderCalc(dec) : renderSign(dec);
      return sb + head + '<div class="app-body">' + body + '</div>' + tab;
    }
    head = '<div class="app-head"><img src="assets/logo_a.png" alt=""><div class="t"><b>Альфа-Босс</b><span>Группа из ' + p.structure.group_size + ' ' + plural(p.structure.group_size, 'компании', 'компаний', 'компаний') + '</span></div></div>';
    const rev = p.structure.revenue_group_mln || p.company.revenue_company_mln;
    let offer = '';
    if (v.card) offer = renderOffer(v.card, 'card', dec, true);
    const toast = v.push ? '<div class="toast"><b>Альфа-Босс</b>' + esc(v.card.title) + '</div>' : '';
    const asisCalc = !dec.tobe ? '<div class="list"><div class="list-row"><button data-action="openCalc"><span>Кредиты и гарантии</span><b>›</b></button></div></div>' : '';
    body = offer +
      '<div class="tile"><div class="k">Деньги группы на счетах</div><div class="v">' + E.num(rev / 12 * 0.28) + ' млн ₽</div></div>' +
      '<div class="tiles2"><div class="tile"><div class="k">На подпись</div><div class="v">3 платежа</div></div><div class="tile"><div class="k">Поступления сегодня</div><div class="v">' + E.num(rev / 260) + ' млн ₽</div></div></div>' +
      asisCalc +
      '<div class="list">' + groupRows(p) + '</div>';
    return sb + toast + head + '<div class="app-body">' + body + '</div>' + tab;
  }
  function plural(n, a, b, c) { const m = n % 10, h = n % 100; if (m === 1 && h !== 11) return a; if (m >= 2 && m <= 4 && (h < 10 || h >= 20)) return b; return c; }
  function groupRows(p) {
    const n = Math.min(p.structure.group_size, 4);
    const rows = [];
    for (let i = 0; i < n; i++) {
      const name = i === 0 ? COMPANY_NAMES[state.profileId] : 'Компания группы ' + (i + 1);
      const amt = i === 0 ? p.company.revenue_company_mln / 12 * 0.24 : (p.structure.group_free_cash_mln / Math.max(1, n - 1));
      rows.push('<div class="list-row"><span>' + esc(name) + '</span><b>' + E.num(amt) + ' млн ₽</b></div>');
    }
    return rows.join('');
  }

  function creditTerms(dec) {
    const p = dec.p, r = dec.r;
    const pre = p.preapproved['Оборотный кредит'] || p.preapproved['Факторинг'] || null;
    const amount = p.forecast.gap_amount_mln || (pre ? pre.limit_mln / 2 : 10);
    return { amount: amount, limit: pre ? pre.limit_mln : null, rate: pre ? pre.rate_from : null, apk: r.offer === 'Льготный кредит АПК', date: E.fmtDate(p.forecast.gap_date) };
  }

  function renderCalc(dec) {
    const f = state.flow, r = dec.r, jr = r.journey_adaptation || {};
    if (!dec.tobe) {
      return '<p style="font-size:13px;color:var(--bank-text-2)">Заполните параметры, банк рассчитает условия</p>' +
        '<div class="calc-amount"><span class="k">Сумма кредита, ₽</span><div class="amount-row"><input class="empty" placeholder="Введите сумму" aria-label="Сумма"></div></div>' +
        '<div class="field"><span>Срок</span><i>Выберите срок</i></div><div class="field"><span>Цель кредита</span><i>Выберите цель</i></div><div class="field"><span>Обеспечение</span><i>Не выбрано</i></div><div class="field"><span>Выручка за год</span><i>Введите выручку</i></div>' +
        '<button class="cta block">Рассчитать</button>';
    }
    const t = creditTerms(dec);
    if (f.amount === null) f.amount = t.amount;
    const max = t.limit || Math.max(t.amount * 1.5, 10);
    const hint = f.j1 || jr.rule_id === 'J1';
    let faq = '';
    if (jr.rule_id === 'J2') faq = '<div class="hint" style="background:#E3EDFF;color:#0D3A93">' + icon('info') + '<div><span class="adapt" style="background:#fff">J2</span><br><b>Чем линия отличается от кредита</b><br>По линии деньги берутся частями в пределах лимита, проценты начисляются только на выбранную сумму</div></div>';
    const j1 = hint ? '<div class="hint">' + icon('bulb') + '<div><span class="adapt" style="background:#fff">J1</span><br><b>Сумма посчитана по вашим оборотам</b><br>Вернули расчётную сумму ' + mln(t.amount) + '</div></div>' : '';
    const j4 = jr.rule_id === 'J4' ? '<div class="hint" style="background:#FFF3DD;color:#6B4000">' + icon('doc') + '<div><span class="adapt" style="background:#fff">J4</span><br><b>Черновик сохранён.</b> Сложные поля может заполнить менеджер</div></div>' : '';
    return faq + j1 + j4 +
      '<div class="calc-amount"><span class="k">Сумма, ₽</span><div class="amount-row"><button data-action="amt" data-d="-1" aria-label="Меньше">−</button><input id="amtInput" inputmode="decimal" value="' + E.num(f.amount) + ' млн" aria-label="Сумма"><button data-action="amt" data-d="1" aria-label="Больше">+</button></div>' +
      '<input type="range" id="amtRange" min="1" max="' + max + '" step="0.1" value="' + f.amount + '" aria-label="Сумма ползунком"></div>' +
      '<div class="list">' +
        '<div class="kv"><span>Лимит</span><b>' + (t.limit ? 'до ' + mln(t.limit) : 'по расчёту банка') + '</b></div>' +
        '<div class="kv"><span>Ставка</span><b>' + (t.apk ? 'льготная, в пределах лимита субсидий' : (t.rate ? 'от ' + ru(t.rate, 1) + ' %' : 'по расчёту')) + '</b></div>' +
        (t.date ? '<div class="kv"><span>Деньги нужны</span><b>до ' + t.date + '</b></div>' : '') +
        (dec.p.structure.group_size >= 2 ? '<div class="kv"><span>Поручительство</span><b>компании группы</b></div>' : '') +
        '<div class="kv"><span>Заявка</span><b>заполнена по данным банка</b></div>' +
      '</div>' +
      '<button class="cta block" data-action="toSign">Перейти к подписи</button>' +
      (hint || jr.rule_id === 'J4' ? '<button class="cta ghost block" data-action="discuss">' + (jr.rule_id === 'J4' && !hint ? 'Заполнит менеджер' : 'Обсудить с менеджером') + '</button>' : '');
  }

  function renderSign(dec) {
    const f = state.flow;
    const t = creditTerms(dec);
    if (f.phone === 'signing') return '<div class="signing"><div class="spinner"></div>Подписываем электронной подписью</div>';
    if (f.phone === 'done') {
      const sec = f.firstShownAt && f.signedAt ? Math.round((f.signedAt - f.firstShownAt) / 1000) : null;
      return '<div class="done"><div class="ok">' + icon('check') + '</div><h3>Заявка подана</h3><p>Решение банк примет после рассмотрения</p>' +
        (sec !== null ? '<div class="timer">От первого показа записки до подписи: ' + (sec >= 60 ? Math.floor(sec / 60) + ' мин ' : '') + (sec % 60) + ' с</div>' : '') +
        '<button class="cta ghost" data-action="phoneHome">На главную</button></div>';
    }
    return '<div class="list">' +
      '<div class="kv"><span>Продукт</span><b>' + (t.apk ? 'Льготный кредит АПК' : 'Кредитная линия') + '</b></div>' +
      '<div class="kv"><span>Сумма</span><b>' + mln(f.amount || t.amount) + '</b></div>' +
      (t.date ? '<div class="kv"><span>Первый транш</span><b>до ' + t.date + '</b></div>' : '') +
      '<div class="kv"><span>Ставка</span><b>' + (t.apk ? 'льготная' : (t.rate ? 'от ' + ru(t.rate, 1) + ' %' : 'по расчёту')) + '</b></div>' +
      '<div class="kv"><span>Подпись</span><b>первая подпись, ' + esc(userLabel(dec.r._meta && dec.r._meta.lpr).toLowerCase()) + '</b></div>' +
      '</div><p class="legal">Подпись условная: это демо, ключ ЭП не запрашивается</p>' +
      '<button class="cta block" data-action="sign">Подписать ЭП</button>';
  }

  // ---------- CRM менеджера ----------
  function renderCRM(dec, v) {
    const p = dec.p, f = state.flow, r = dec.r;
    const head = '<div class="crm-head"><h2>' + esc(COMPANY_NAMES[state.profileId]) + '</h2><div class="crm-meta"><span>' + esc(p.company.size_segment) + ' бизнес</span><span>' + esc(p.company.industry) + '</span><span>' + esc(p.company.region) + '</span><span>Группа из ' + p.structure.group_size + '</span></div></div>';
    if (!dec.tobe) {
      const top = dec.asis[0];
      return '<div class="crm">' + head + '<div class="crm-grid"><div class="crm-card"><h3>Рекомендация оптимизатора</h3><div class="crm-score">' + esc(top[0]) + ' ' + ru(top[1], 2) + '</div></div><div class="crm-card"><h3>История</h3><div class="tl"><div><span>—</span>Событий по клиенту нет</div></div></div></div></div>';
    }
    const tl = f.log.length ? f.log.map(x => '<div><span>' + x.t + '</span>' + esc(x.text) + '</div>').join('') : '<div><span>—</span>Пока ничего не произошло</div>';
    let main;
    if (v.brief) {
      const ms = f.managerState;
      const callBtn = v.brief.call ? 'Позвонить' : 'Сервисный звонок';
      main = '<div class="crm-card" style="box-shadow:0 0 0 1.5px var(--bank-text) inset"><div class="msg-eyebrow">' + icon('phone') + esc(TPL.T12.title) + '</div><h3 style="font-size:17px">' + esc(r.offer) + '</h3><p style="font-size:14.5px;line-height:1.45">' + esc(ruNums(v.brief.text)) + '</p>' +
        '<div class="crm-meta"><span>' + esc(v.brief.reason) + '</span><span>' + (v.brief.call ? 'Звонок с предложением: есть согласие' : 'Нет согласия на рекламный звонок: только обслуживание') + '</span></div>' +
        (ms === 'new' ? '<div class="btns" style="display:flex;gap:8px;flex-wrap:wrap"><button class="cta" data-action="call">' + callBtn + '</button><button class="cta ghost" data-action="mgrLater">Отложить</button></div>'
          : '<div class="status' + (ms === 'later' ? ' wait' : '') + '">' + icon(ms === 'later' ? 'clock' : 'check') + (ms === 'later' ? 'Отложено' : 'Звонок в работе') + '</div>') +
        '<p class="legal">' + esc(TPL.T12.why_you_see_this) + '</p></div>';
    } else {
      const why = r.action !== 'Показать предложение' ? 'Маркетинг по клиенту выключен' : 'Клиент ведёт заявку сам в цифровых каналах, менеджер подключится, если нажмут «Обсудить с менеджером»';
      main = '<div class="crm-card"><h3>Повода для звонка нет</h3><p style="font-size:13.5px">' + why + '</p></div>';
    }
    return '<div class="crm">' + head + '<div class="crm-grid">' + main + '<div class="crm-card"><h3>Что уже произошло</h3><div class="tl">' + tl + '</div></div></div></div>';
  }

  // ---------- «Под капотом» ----------
  function renderDrawer(dec, v) {
    const p = dec.p, r = dec.r, m = r._meta || {};
    const src = (k) => '<span class="src s-' + k + '">' + { org: 'данные организаторов', syn: 'синтетика', crm: 'CRM', model: 'модель ЛПР' }[k] + '</span>';
    const lpr = m.lpr, acc = m.acc;
    const fd = p.users.find(u => u.has_alfa_boss && (m.roles || []).find(x => x.user_id === u.user_id && x.role_resolved === 'Финансовый директор'));
    const roleSrc = lpr ? (lpr.role_source === 'CRM' ? 'crm' : (lpr.role_source.startsWith('модель') ? 'model' : 'org')) : 'crm';
    let html = '<div class="drawer-head"><h2>Под капотом</h2><span class="chip ' + (dec.tobe ? 'red' : '') + '">' + (dec.tobe ? 'TO BE' : 'AS IS') + '</span><button data-action="drawer" aria-label="Закрыть">' + icon('x') + '</button></div><div class="drawer-body">';

    // профиль по 4 осям
    const fc = p.forecast;
    html += '<section class="hsec"><h3>Профиль ' + state.profileId + ' по 4 осям</h3>' +
      '<div class="axis"><b>Отрасль</b><div class="vals"><div class="row">' + esc(p.company.industry) + ', ОКВЭД ' + esc(p.company.okved) + ' ' + src('org') + '</div><div class="row">' + SEASON[p.company.season_type] + ', ' + Math.round(p.company.seasonal_payer_share * 100) + ' % поступлений от сезонных отраслей ' + src('org') + '</div></div></div>' +
      '<div class="axis"><b>Роль ЛПР</b><div class="vals"><div class="row">' + (lpr ? esc(lpr.role_resolved) + ' ' + src(roleSrc) : 'не определён') + '</div><div class="row">' + (lpr ? 'первая подпись, «Альфа-Босс» ' + (lpr.has_alfa_boss ? 'есть' : 'нет') + ', ' + esc(lpr.role_source) : '') + '</div></div></div>' +
      '<div class="axis"><b>Структура</b><div class="vals"><div class="row">Группа из ' + p.structure.group_size + ' юрлиц' + (p.structure.is_head_company ? ', компания головная' : '') + (p.structure.holding_flag ? ', холдинг' : '') + ' ' + src('org') + '</div><div class="row">Свободных денег у группы ' + mln(p.structure.group_free_cash_mln) + ' ' + src('syn') + '</div></div></div>' +
      '<div class="axis"><b>Цифровая активность</b><div class="vals"><div class="row">' + (lpr ? 'ЛПР: «Альфа-Босс» ' + lpr.boss_active_days_30d + ' дн. из 30, ' + esc(lpr.digital_type.toLowerCase()) + ', уведомления ' + (lpr.push_enabled ? 'включены' : 'выключены') : '') + ' ' + src('syn') + '</div><div class="row">' + (acc ? 'Проводник: интернет-банк ' + acc.ib_active_days_30d + ' дн. из 30' : 'Проводника нет') + ' ' + src('syn') + '</div></div></div>' +
      '<div class="axis"><b>Прогноз</b><div class="vals"><div class="row">' + (fc.gap_date ? E.fmtDate(fc.gap_date) + ' не хватит ' + mln(fc.gap_amount_mln) + ', через ' + ru(fc.weeks_to_gap, 1) + ' нед., уверенность ' + ru(fc.confidence, 2) : 'Разрыва нет') + ' ' + src('syn') + '</div></div></div>' +
      '</section>';

    // люди
    html += '<section class="hsec"><h3>Люди в кабинете</h3><div class="people">' + (m.roles || p.users.map(u => Object.assign({}, u, { role_resolved: '', role_source: '' }))).map(u => {
      const isL = lpr && u.user_id === lpr.user_id, isA = acc && u.user_id === acc.user_id;
      const tag = isL ? '<span class="tag">ЛПР</span>' : (isA ? '<span class="tag" style="background:#EFE7FF;color:#4A16C9">получает записку</span>' : '');
      const where = [u.has_alfa_business ? 'ИБ ' + u.ib_active_days_30d + ' дн.' : '', u.has_alfa_boss ? '«Альфа-Босс» ' + u.boss_active_days_30d + ' дн.' : ''].filter(Boolean).join(', ') || 'не заходит';
      return '<div class="person"><b>' + esc(userLabel(u)) + '</b>' + tag + '<span class="meta">' + esc(u.sign_rights) + ', ' + where + (u.role_source ? ', роль: ' + esc(u.role_source) : '') + (u.optout_all ? ', отказ от рекламы' : '') + '</span></div>';
    }).join('') + '</div></section>';

    // скоры
    const before = r.ranking_before || p.asis_scores;
    const after = dec.tobe ? (r.ranking_after || {}) : {};
    const names = Object.keys(dec.tobe && Object.keys(after).length ? after : before);
    for (const k of Object.keys(before)) if (!names.includes(k)) names.push(k);
    const maxv = Math.max(0.7, ...Object.values(before), ...Object.values(after));
    const winner = dec.tobe ? r.offer : dec.asis[0][0];
    html += '<section class="hsec"><h3>Скоры: было и стало</h3><div class="bars">' + names.map(k => {
      const b = before[k], a = after[k];
      return '<div class="bar-row' + (k === winner ? ' win' : '') + '"><span class="nm">' + esc(k) + '</span><div class="track">' +
        (b !== undefined ? '<div class="b" style="width:' + (b / maxv * 78) + '%"><em>' + ru(b, 3) + '</em></div>' : '<div style="height:9px"></div>') +
        (dec.tobe ? (a !== undefined ? '<div class="a" style="width:' + (a / maxv * 78) + '%"><em>' + ru(a, 3) + '</em></div>' : '<div style="height:9px;font-size:11px;line-height:9px">отсеян</div>') : '') +
        '</div></div>';
    }).join('') + '</div><div class="legend"><span><i style="background:#C9CCD3"></i>текущий оптимизатор</span>' + (dec.tobe ? '<span><i style="background:var(--ink)"></i>с новыми правилами</span>' : '') + '</div></section>';

    // трасса
    if (dec.tobe) {
      const all = ['Допуск', 'Окно', 'Отрасль', 'Структура', 'Роль', 'Частота'];
      const lines = (r.rule_trace || []).map(t => {
        const mm = t.match(/^(\d) ([^:]+?)(?: \(([^)]*)\))?: (.*)$/);
        if (!mm) return '<div><span class="rule">Порог</span><span>' + esc(ruNums(t)) + '</span></div>';
        let txt = ruNums(mm[4]);
        for (const k of Object.keys(SEASON)) txt = txt.split('«' + k + '»').join('«' + SEASON[k].toLowerCase() + '»');
        return '<div><span class="rule">' + mm[1] + ' ' + esc(mm[2]) + '</span><span>' + (mm[3] ? esc(mm[3]) + ': ' : '') + esc(txt) + '</span></div>';
      });
      const fired = (r.rule_trace || []).map(t => (t.match(/^\d ([^:( ]+)/) || [])[1]);
      const off = all.filter(a => !fired.includes(a)).map(a => '<div><span class="rule off">' + a + '</span><span style="color:var(--ink-2)">не сработало</span></div>');
      html += '<section class="hsec"><h3>Трасса правил</h3><div class="trace">' + lines.join('') + off.join('') + '</div></section>';
    } else {
      html += '<section class="hsec"><h3>Трасса правил</h3><p style="font-size:13px">Новые правила выключены. Оптимизатор показывает продукты по своим скорам, ВЭД первым, общие тексты без суммы и даты.</p></section>';
    }

    // адресат и частота
    if (dec.tobe) {
      const jr = r.journey_adaptation || {};
      const lp = lpr;
      const pushNote = lp ? (lp.consent_ads_push && lp.push_enabled ? 'можно, но не с 21:00 до 9:00' : (lp.push_enabled ? 'нет согласия на рекламу' : 'не отправляем, уведомления выключены')) : '—';
      const shown = [v.note, v.card, v.banner].filter(Boolean).length;
      html += '<section class="hsec"><h3>Кому, где и как часто</h3>' +
        '<div class="kv2"><span>Действие</span><div>' + esc(r.action) + (r.offer ? ': ' + esc(r.offer) : '') + '</div></div>' +
        (r.path ? '<div class="kv2"><span>Путь</span><div>' + esc(r.path) + '</div></div>' : '') +
        '<div class="kv2"><span>Адресат</span><div>' + (lp ? esc(lp.role_resolved) : '—') + '</div></div>' +
        '<div class="kv2"><span>Проводник</span><div>' + ((r.path || '').startsWith('Г1') && acc ? esc(guideLabel(acc)) + ', самый активный в ИБ' : '—') + '</div></div>' +
        '<div class="kv2"><span>Каналы</span><div>' + ((r.channels || []).map(cleanCh).map(esc).join('<br>') || 'только сервисное уведомление') + '</div></div>' +
        '<div class="kv2"><span>Частота</span><div>' + esc(r.frequency || 'только сервисные уведомления') + '</div></div>' +
        '<div class="kv2"><span>Push</span><div>' + pushNote + '</div></div>' +
        '<div class="kv2"><span>Менеджер</span><div>' + esc(r.manager_contact || 'не подключается') + '</div></div>' +
        '<div class="kv2"><span>Адаптация пути</span><div>' + (jr.rule_id ? '<b>' + jr.rule_id + '</b> ' + esc(jr.signal) + ': ' + esc(jr.adaptation) : esc(jr.adaptation || '—')) + '</div></div>' +
        '<div class="kv2"><span>Если нет ответа</span><div>' + esc(r.fallback || '—') + '</div></div>' +
        '<div class="kv2"><span>Лимиты</span><div>Сообщений клиенту сейчас: ' + shown + ' из 3 за окно. Одно предложение по продукту в канале за 7 дней. После «Не сейчас» пауза 30 дней, после скрытия 14 дней</div></div>' +
      '</section>';
      const refusals = state.flow.hidden.map(h => ({ note: 'Записка скрыта, пауза 14 дней', card: 'Карточка скрыта, пауза 14 дней', banner: 'Баннер скрыт, пауза 14 дней', service: 'Сервисное уведомление скрыто' }[h]));
      if (state.flow.note === 'later') refusals.push('Бухгалтер: «Не сейчас», записка скрыта до ' + pauseUntil + ', карточка ЛПР не отправлена');
      if (state.flow.card === 'later') refusals.push('Финдиректор: «Не сейчас», пауза по продукту до ' + pauseUntil);
      html += '<section class="hsec"><h3>Отказы</h3><p style="font-size:13px">' + (refusals.length ? refusals.map(esc).join('<br>') : 'Отказов нет. В каждом сообщении есть «Не показывать», отказ от рекламы оставляет только сервисные уведомления') + '</p></section>';
    }

    // сверка с эталоном
    let ok = 0;
    for (const bp of D.profiles) {
      const inp = JSON.parse(JSON.stringify(bp)); delete inp.expected_output;
      const got = E.engine(inp, D.params, D.hooks); delete got._meta;
      if (deepEq(got, bp.expected_output)) ok += 1;
    }
    html += '<section class="hsec"><h3>Сверка с эталоном</h3><div class="check"><span class="big">' + ok + ' из ' + D.profiles.length + '</span><span>профилей совпадают с expected_output организаторов</span></div></section>';

    // пилот
    html += '<section class="hsec"><h3>Цели пилота</h3><ul class="pilot">' +
      '<li>Главное: больше компаний подают заявку до даты разрыва, при этом сообщений на компанию меньше</li>' +
      '<li>UX-метрики: доля дошедших до заявки, время до заявки, возвраты на сессию, брошенные заявки, скрытия и отписки</li>' +
      '<li>Дизайн: записка через бухгалтера (Г1) рандомизируется по группам компаний, окно разрыва (Г2) по компаниям, 10 % без коммуникаций</li>' +
      '<li>Результатов здесь нет намеренно: синтетический эффект ничего бы не доказал</li></ul></section>';
    return html + '</div>';
  }
  function deepEq(a, b) {
    if (a === b) return true;
    if (typeof a !== 'object' || typeof b !== 'object' || !a || !b) return false;
    const ka = Object.keys(a), kb = Object.keys(b);
    if (ka.length !== kb.length) return false;
    for (const k of ka) if (!deepEq(a[k], b[k])) return false;
    return true;
  }


  // ---------- гид по сценарию ----------
  function guideStep(dec, v) {
    const r = dec.r, p = dec.p, f = state.flow;
    const amt = p.forecast.gap_date ? mln(p.forecast.gap_amount_mln) : '';
    const gd = p.forecast.gap_date ? E.fmtDate(p.forecast.gap_date) : '';
    if (!dec.tobe) {
      return { n: 1, color: 'ink', title: 'Сейчас банк показывает всем одно и то же',
        text: 'Оптимизатор крутит баннеры по скорам: первым ' + dec.asis[0][0] + ' ' + ru(dec.asis[0][1], 3) + '. В текстах нет ни суммы, ни даты, а финдиректор в «Альфа-Боссе» не видит ничего.',
        next: 'Включить TO BE', target: '[data-mode="tobe"]' };
    }
    const g1 = (r.path || '').startsWith('Г1') && r.texts && r.texts['Бухгалтеру'];
    if (r.action !== 'Показать предложение') {
      return { n: null, color: 'ink', title: r.action === 'Ничего не делать' ? 'Банк промолчит' : 'Только сервисное уведомление',
        text: r.action === 'Ничего не делать' ? 'Ни одно предложение не набрало порог 0,20, поэтому реклама не уходит.' : 'Компания отказалась от рекламы. Банк присылает только прогноз движения денег, без предложений.' };
    }
    if (!g1) {
      const ch = (r.channels || []).map(cleanCh).join(', ');
      return { n: null, color: 'violet', title: 'Для этого клиента: ' + r.offer.toLowerCase(),
        text: 'Канал: ' + ch + '. Частота: ' + r.frequency.toLowerCase() + '. Подробности в «Под капотом».',
        next: state.drawer ? null : 'Открыть «Под капотом»', target: '.bar [data-action="drawer"]' };
    }
    if (f.note === 'later') return { n: 2, color: 'ink', title: 'Бухгалтерия отложила записку', text: 'Записка скрыта до ' + pauseUntil + ', карточка руководителю не уходит. Повторно банк напишет не раньше этой даты.', next: 'Начать заново', target: '[data-action="reset"]' };
    if (f.note === 'new' && !f.cardDirect) {
      return { n: 2, color: 'red', title: gd ? cap(gd) + ' компании не хватит ' + amt : 'Записка для руководителя',
        text: 'Банк увидел разрыв по оборотам. Записку получает самый активный в интернет-банке сотрудник: заявка уже заполнена, ему остаётся переслать её руководителю.',
        next: 'Переслать руководителю', target: '[data-action="forward"]', viewer: 'accountant' };
    }
    if (f.card === 'manager') return { n: 3, color: 'blue', title: 'Финдиректор выбрал разговор с менеджером', text: 'Менеджер получает готовый бриф: сумма, срок, кто решает и какой аргумент. Бухгалтерия видит статус «Передано менеджеру».', next: state.viewer === 'manager' ? null : 'Открыть CRM менеджера', target: '[data-viewer="manager"]' };
    if (f.card === 'later') return { n: 3, color: 'ink', title: 'Финдиректор нажал «Не сейчас»', text: 'Пауза по продукту 30 дней, до ' + pauseUntil + '. Бухгалтерия видит «Отложено», банк больше не пишет.', next: 'Начать заново', target: '[data-action="reset"]' };
    if (f.phone === 'calc' && !f.j1 && (r.journey_adaptation || {}).rule_id !== 'J1') {
      return { n: 4, color: 'blue', title: 'Калькулятор уже заполнен', text: 'Сумма ' + amt + ' из прогноза, лимит и ставка из предодобрения. Если клиент засомневается, интерфейс подскажет: попробуйте трижды поменять сумму или нажмите «Имитировать паузу».',
        next: 'Имитировать паузу 40 секунд', target: '[data-action="pause"]', viewer: 'cfo' };
    }
    if (f.phone === 'calc') return { n: 5, color: 'violet', title: 'Клиент засомневался, интерфейс помог', text: 'Пауза или правки суммы — сигнал сомнения (J1). Возвращаем расчётную сумму, объясняем, откуда она, и предлагаем менеджера.', next: 'Перейти к подписи', target: '[data-action="toSign"]', viewer: 'cfo' };
    if (f.phone === 'sign' || f.phone === 'signing') return { n: 6, color: 'red', title: 'Подпись в одно касание', text: 'Заявка собрана по данным банка, финдиректор подписывает первой подписью.', next: 'Подписать', target: '[data-action="sign"]', viewer: 'cfo' };
    if (f.phone === 'done' || f.card === 'signed') {
      const sec = f.firstShownAt && f.signedAt ? Math.round((f.signedAt - f.firstShownAt) / 1000) : null;
      if (!state.seenDrawer) return { n: 7, color: 'ink', title: 'Заявка подана' + (sec !== null ? ' через ' + (sec >= 60 ? Math.floor(sec / 60) + ' мин ' : '') + (sec % 60) + ' с после записки' : ''), text: 'Одна записка, одна карточка, ни одного лишнего сообщения. Посмотрим, почему банк выбрал именно это.', next: 'Открыть «Под капотом»', target: '.bar [data-action="drawer"]' };
      if (!state.whatif) return { n: 8, color: 'violet', title: 'Каждое решение объяснимо', text: 'Профиль по 4 осям, скоры «было и стало», трасса правил и лимиты частоты. Теперь поменяем клиента.', next: 'Открыть «Что если»', target: '[data-action="whatif"]' };
      return { n: 9, color: 'blue', title: 'Меняем профиль, меняется всё', text: 'Попробуйте «Растениеводство, АПК» или выключите «Финдиректор в Альфа-Боссе» и посмотрите на экраны.', next: null, target: '#wiSeason' };
    }
    if (v.card) return { n: 3, color: 'violet', title: 'Финдиректор видит карточку в «Альфа-Боссе»', text: 'Push не отправляем: уведомления у него выключены. ' + ((r.journey_adaptation || {}).rule_id === 'J7' ? 'Прошлый раз он дошёл до заявки без пауз, поэтому кнопка «Подать заявку» стоит первой (J7).' : 'Одобрение ведёт сразу в заполненный калькулятор.'),
      next: v.card.buttons.includes('Одобрить подачу') ? 'Одобрить подачу' : v.card.buttons[0], target: v.card.buttons.includes('Одобрить подачу') ? '.phone [data-btn="Одобрить подачу"]' : '.phone .msg .btns .cta', viewer: 'cfo' };
    return { n: 3, color: 'ink', title: 'Ждём ответа', text: 'Карточка скрыта пользователем.', next: null };
  }
  function renderGuide(g) {
    const prog = g.n ? '<div class="g-prog">' + [1, 2, 3, 4, 5, 6, 7, 8, 9].map(i => '<i' + (i <= g.n ? ' class="on"' : '') + '></i>').join('') + '</div>' : '';
    return '<div class="guide-in c-' + g.color + '">' +
      '<div class="g-num">' + (g.n ? String(g.n).padStart(2, '0') : state.profileId) + '</div>' +
      '<div class="g-text"><span class="g-step">' + (g.n ? 'Сценарий, шаг ' + g.n + ' из 9' : 'Профиль ' + state.profileId) + '</span><h2>' + esc(g.title) + '</h2><p>' + esc(g.text) + '</p></div>' +
      '<div class="g-act">' + (g.next ? '<button class="g-next" data-action="gnext">' + esc(g.next) + icon('right') + '</button>' : '') +
      ((g.n || 0) > 1 || state.mode === 'tobe' ? '<button class="g-back" data-action="reset">Начать сначала</button>' : '') + '</div>' + prog + '</div>';
  }
  function runGuide() {
    const dec = decide(), v = view(dec), g = guideStep(dec, v);
    if (g.viewer) state.viewer = g.viewer;
    if (!g.target) return;
    render();
    const el = document.querySelector(g.target);
    if (!el) return;
    if (el.tagName === 'SELECT') { el.focus(); return; }
    el.click();
    setTimeout(() => {
      const t = document.querySelector('.pulse') || document.querySelector('.phone .msg, .ib-slot .msg');
      if (t && window.innerWidth <= 900) t.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 80);
  }

  // ---------- действия ----------
  function act(name, el) {
    const f = state.flow;
    const dec = decide();
    const lprRole = dec.r._meta && dec.r._meta.lpr ? dec.r._meta.lpr.role_resolved.toLowerCase() : 'руководитель';
    if (name === 'mode') { state.mode = el.dataset.mode; }
    else if (name === 'viewer') { state.viewer = el.dataset.viewer; }
    else if (name === 'drawer') { state.drawer = !state.drawer; if (state.drawer) state.seenDrawer = true; }
    else if (name === 'gnext') { runGuide(); return; }
    else if (name === 'whatif') { state.whatif = !state.whatif; }
    else if (name === 'reset') { state = freshState(); }
    else if (name === 'clearov') { state.ov = {}; state.changes = []; }
    else if (name === 'car') { f.carIdx = (f.carIdx + Number(el.dataset.d) + 50) % 50; }
    else if (name === 'forward') { f.note = 'forwarded'; if (state.viewer === 'accountant') state.viewer = 'cfo'; log('Бухгалтерия переслала записку руководителю'); log('Карточка в «Альфа-Боссе» у руководителя, push не отправлен'); }
    else if (name === 'noteLater') { f.note = 'later'; log('Бухгалтерия отложила записку до ' + pauseUntil); }
    else if (name === 'plus5') { f.cardDirect = true; if (state.viewer === 'accountant') state.viewer = 'cfo'; log('Записку не переслали за 5 дней, карточка ушла руководителю напрямую'); }
    else if (name === 'approve') { f.card = 'approved'; f.phone = 'calc'; f.amount = null; f.edits = 0; f.j1 = false; f.lastInputAt = Date.now(); log(cap(lprRole) + ' одобрил подачу заявки'); }
    else if (name === 'discuss') { f.card = 'manager'; f.manager = true; f.phone = 'home'; if (window.innerWidth <= 900) state.viewer = 'manager'; log(cap(lprRole) + ' попросил обсудить с менеджером'); }
    else if (name === 'cardLater') { f.card = 'later'; log(cap(lprRole) + ' отложил предложение до ' + pauseUntil); }
    else if (name === 'hide') { f.hidden.push(el.dataset.what); log('Пользователь нажал «Не показывать»'); }
    else if (name === 'openCalc') { f.phone = 'calc'; }
    else if (name === 'phoneHome') { f.phone = 'home'; }
    else if (name === 'pause') { triggerJ1(dec); }
    else if (name === 'amt') { changeAmount(dec, f.amount + Number(el.dataset.d) * 2.5); }
    else if (name === 'toSign') { f.phone = 'sign'; }
    else if (name === 'sign') {
      f.phone = 'signing'; render();
      setTimeout(() => { f.phone = 'done'; f.card = 'signed'; f.signedAt = Date.now(); log('Заявка подписана ЭП и подана'); render(); }, 1300);
      return;
    }
    else if (name === 'call') { f.managerState = 'called'; log('Менеджер звонит клиенту'); }
    else if (name === 'mgrLater') { f.managerState = 'later'; log('Менеджер отложил звонок'); }
    else if (name === 'sw') {
      const key = el.dataset.key, on = el.getAttribute('aria-pressed') === 'true';
      if (key === 'holding') state.ov.holding = !on;
      if (key === 'fdBoss') state.ov.fdBoss = on ? false : undefined;
      if (key === 'fdCrm') state.ov.fdCrmEmpty = on ? true : undefined;
      if (key === 'consents') state.ov.noConsents = on ? true : undefined;
      if (key === 'optout') state.ov.optout = on ? undefined : true;
      cleanOv();
    }
    render();
  }
  function cleanOv() { for (const k of Object.keys(state.ov)) if (state.ov[k] === undefined) delete state.ov[k]; }

  function triggerJ1(dec) {
    const f = state.flow;
    f.j1 = true;
    f.amount = creditTerms(dec).amount;
    log('В калькуляторе сомнение (J1): подсказка и возврат к расчётной сумме');
  }
  function changeAmount(dec, val) {
    const f = state.flow, t = creditTerms(dec);
    const max = t.limit || Math.max(t.amount * 1.5, 10);
    f.amount = Math.round(Math.min(max, Math.max(1, val)) * 10) / 10;
    f.edits += 1; f.lastInputAt = Date.now();
    if (f.edits >= 3 && !f.j1) triggerJ1(dec);
  }

  // ---------- события ----------
  document.addEventListener('click', e => {
    const el = e.target.closest('[data-action]');
    if (!el || el.disabled) return;
    act(el.dataset.action, el);
  });
  document.addEventListener('change', e => {
    const id = e.target.id;
    if (id === 'profileSel') { state.profileId = e.target.value; state.ov = {}; state.changes = []; state.prevKey = null; state.flow = newFlow(); render(); }
    if (id === 'wiSeason') { state.ov.season = e.target.value; render(); }
    if (id === 'wiBeh') { state.ov.behavior = e.target.value; if (state.ov.behavior === 'base') delete state.ov.behavior; render(); }
    if (id === 'amtInput') { const n = parseFloat(e.target.value.replace(',', '.')); if (!isNaN(n)) changeAmount(decide(), n); render(); }
    if (id === 'amtRange') { changeAmount(decide(), parseFloat(e.target.value)); render(); }
    if (id === 'wiWeeks' || id === 'wiConf' || id === 'wiCash') render(false);
  });
  document.addEventListener('input', e => {
    const id = e.target.id, val = parseFloat(e.target.value);
    if (id === 'wiWeeks') { state.ov.weeks = val; document.getElementById('wiWeeksV').textContent = ru(val, 1); render(true); }
    if (id === 'wiConf') { state.ov.conf = val; document.getElementById('wiConfV').textContent = ru(val, 2); render(true); }
    if (id === 'wiCash') { state.ov.cash = val; document.getElementById('wiCashV').textContent = mln(val); render(true); }
  });

  // J1 вживую: 40 секунд без действий в калькуляторе
  setInterval(() => {
    const f = state.flow;
    if (state.mode === 'tobe' && f.phone === 'calc' && !f.j1 && f.lastInputAt && Date.now() - f.lastInputAt >= 40000) { triggerJ1(decide()); render(true); }
  }, 1000);

  // ---------- старт ----------
  const hash = (location.hash || '').replace('#', '');
  if (hash === 'boss') {
    state.mode = 'tobe'; state.viewer = 'cfo';
    const dec = decide();
    if ((dec.r.path || '').startsWith('Г1')) { state.flow.note = 'forwarded'; log('Бухгалтерия переслала записку руководителю'); }
  } else if (hash === 'manager' || hash === 'accountant' || hash === 'cfo') {
    state.viewer = hash;
  } else if (hash === 'tobe') {
    state.mode = 'tobe';
  }
  render();
  window.__state = () => state;
})();
