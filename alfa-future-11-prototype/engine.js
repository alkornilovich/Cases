// Движок правил: построчный перенос resolve_role / engine / journey_rule из scripts/profiles.py
// Работает и в браузере (window.Engine), и в node (module.exports)

(function () {
  const LPR_ROLES = ['Финансовый директор', 'Собственник', 'Генеральный директор'];
  const IND_PRODUCT = { agro: 'Льготный кредит АПК', agro_trade: 'Факторинг', food: 'Факторинг', construction: 'Лизинг', construction_trade: 'Факторинг' };
  const MON = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];

  // Как Python печатает float в f-строке: 2.0 → "2.0", 5.6 → "5.6"
  function pyFloat(x) {
    if (x === null || x === undefined) return 'None';
    return Number.isInteger(x) ? x.toFixed(1) : String(x);
  }

  // Python: f"{x:,.1f}".replace(',', ' ').replace('.', ',').replace(',0', '')
  function num(x) {
    let parts = x.toFixed(1).split('.');
    let whole = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
    return (whole + ',' + parts[1]).split(',0').join('');
  }

  function fmtDate(d) {
    if (!d) return '';
    return parseInt(d.slice(8, 10), 10) + ' ' + MON[parseInt(d.slice(5, 7), 10) - 1];
  }

  function round3(v) {
    return Number(v.toFixed(3));
  }

  function resolveRole(u, params) {
    if (typeof u.role_crm === 'string' && u.role_crm) {
      if (u.role_model_pred !== u.role_crm && u.role_model_confidence >= 0.9) {
        return [u.role_model_pred, 'модель (CRM противоречит, нужна проверка менеджером)'];
      }
      return [u.role_crm, 'CRM'];
    }
    if (u.role_model_confidence >= params.role_model_confidence_min) return [u.role_model_pred, 'модель ЛПР (CRM пуста)'];
    if (u.is_egrul_head_or_founder) return ['Собственник', 'ЕГРЮЛ (CRM пуста, модель не уверена)'];
    return ['Неизвестно', 'нет данных'];
  }

  function journeyRule(j) {
    if (!j) return { rule_id: null, signal: 'Нет данных о сессиях', adaptation: 'Стандартный путь' };
    if (j.submitted) return { rule_id: 'J7', signal: 'Нет сложностей', adaptation: 'Кнопка «Подать заявку» прямо на карточке' };
    if (j.n_field_errors >= 2) return { rule_id: 'J4', signal: 'Сложная форма', adaptation: '«Заполнит менеджер», сохранить черновик, подсказки к полям' };
    if (j.max_pause_sec >= 40 || j.n_calc_changes >= 3) return { rule_id: 'J1', signal: 'Сомнение', adaptation: 'Подсказка «сумма посчитана по вашим оборотам», предзаполнить калькулятор, кнопка «обсудить с менеджером»' };
    if (j.n_back >= 2) return { rule_id: 'J2', signal: 'Не нашёл информацию', adaptation: 'Блок FAQ над калькулятором' };
    if (j.n_product_sections >= 3) return { rule_id: 'J3', signal: 'Сравнение', adaptation: 'Блок сравнения продуктов под задачу (разрыв)' };
    if (j.draft_saved) return { rule_id: 'J5', signal: 'Отложил', adaptation: '«Догоняшка» через 3 дня с заполненным черновиком' };
    if (j.duration_sec < 60 && j.n_steps <= 4) return { rule_id: 'J6', signal: 'Неинтерес', adaptation: 'Не показывать предложение 14 дней' };
    return { rule_id: null, signal: 'Нет', adaptation: 'Стандартный путь' };
  }

  function engine(p, params, hooks) {
    const trace = [];
    const c = p.company, s = p.structure, fc = p.forecast, users = p.users;
    const scores = Object.assign({}, p.asis_scores);
    const before = Object.assign({}, p.asis_scores);

    // 1 Допуск
    if (!c.ved_allowed && 'ВЭД' in scores) {
      delete scores['ВЭД'];
      trace.push('1 Допуск: нет ВЭД-признаков (ФТС) — ВЭД отсеян');
    }
    if (users.every(u => u.optout_all)) {
      return { action: 'Только сервисное уведомление о прогнозе', offer: null, rule_trace: trace.concat(['1 Допуск: отказ от рекламы — маркетинг не показываем']), ranking_before: before, ranking_after: {} };
    }

    // 2 Окно
    const inWindow = Boolean(fc.gap_date && fc.confidence >= params.forecast_confidence_min && params.window_weeks[0] <= fc.weeks_to_gap && fc.weeks_to_gap <= params.window_weeks[1]);
    if (fc.gap_date && fc.confidence < params.forecast_confidence_min) {
      trace.push('2 Окно: уверенность прогноза ' + pyFloat(fc.confidence) + ' < 0,7 — работает текущий процесс');
    } else if (inWindow) {
      scores['Оборотный кредит'] *= params.window_multiplier;
      trace.push('2 Окно: разрыв через ' + pyFloat(fc.weeks_to_gap) + ' нед. — оборотный ×1,6');
    } else if (fc.gap_date) {
      trace.push('2 Окно: разрыв через ' + pyFloat(fc.weeks_to_gap) + ' нед., вне окна — кредит не чаще раза в месяц');
    }

    // 3 Отрасль
    const st = c.season_type;
    if (st !== 'flat') {
      scores['Оборотный кредит'] *= params.industry_multiplier;
      const ip = IND_PRODUCT[st];
      if (ip in scores) scores[ip] *= params.industry_multiplier;
      trace.push('3 Отрасль: сезонность «' + st + '» — оборотный и ' + ip.toLowerCase() + ' ×1,4');
    }
    if (st === 'agro') {
      const v = scores['Оборотный кредит'];
      delete scores['Оборотный кредит'];
      scores['Льготный кредит АПК'] = v;
      trace.push('3 Отрасль: АПК — оборотный заменён льготным (в пределах лимитов субсидий)');
    }

    // 5 Структура
    const creditKey = st === 'agro' ? 'Льготный кредит АПК' : 'Оборотный кредит';
    if (s.group_size >= 2 && fc.gap_date && s.group_free_cash_mln >= fc.gap_amount_mln) {
      scores['Кэш-пулинг'] = Math.max(scores['Кэш-пулинг'] || 0, scores[creditKey]) * 1.05;
      trace.push('5 Структура: свободных денег группы ' + pyFloat(s.group_free_cash_mln) + ' млн ≥ разрыва ' + pyFloat(fc.gap_amount_mln) + ' млн — кэш-пулинг выше кредита');
    } else if (s.group_size >= 2) {
      trace.push('5 Структура: свободных денег группы ' + pyFloat(s.group_free_cash_mln) + ' млн мало — кредит, поручители — юрлица группы');
    }

    const pairs = Object.keys(scores).map(k => [k, round3(scores[k])]);
    pairs.sort((a, b) => b[1] - a[1]);
    const ranking = {};
    for (const pr of pairs) ranking[pr[0]] = pr[1];
    const top = pairs[0][0], topScore = pairs[0][1];
    if (topScore < params.do_nothing_threshold) {
      return { action: 'Ничего не делать', offer: null, rule_trace: trace.concat(['Порог 0,20: ни одно предложение не прошло']), ranking_before: before, ranking_after: ranking };
    }

    // 4 Роль
    const res = users.map(u => {
      const r = resolveRole(u, params);
      return Object.assign({}, u, { role_resolved: r[0], role_source: r[1] });
    });
    const lprs = res.filter(u => LPR_ROLES.includes(u.role_resolved) && u.sign_rights === 'Первая подпись' && !u.optout_all);
    lprs.sort((a, b) => {
      const ka = a.role_resolved !== 'Финансовый директор' ? 1 : 0, kb = b.role_resolved !== 'Финансовый директор' ? 1 : 0;
      if (ka !== kb) return ka - kb;
      return b.boss_active_days_30d - a.boss_active_days_30d;
    });
    const lpr = lprs.length ? lprs[0] : null;
    const ops = res.filter(u => !lprs.includes(u) && u.has_alfa_business && !u.optout_all);
    let acc = null;
    for (const u of ops) if (!acc || u.ib_active_days_30d > acc.ib_active_days_30d) acc = u;
    if (lpr) trace.push('4 Роль: ЛПР — ' + lpr.role_resolved + ' (' + lpr.role_source + ')');

    // 6 Частота и канал
    const holding = s.holding_flag === 1;
    let channels = [], freq = '', path = '';
    const inappOk = u => Boolean(u && !u.inapp_offers_hidden && !u.optout_all);
    const emailOk = u => Boolean(u && u.consent_ads_email && u.has_email_contact && !u.optout_all);
    const pushOk = u => Boolean(u && u.consent_ads_push && u.push_enabled && !u.optout_all);
    if (lpr) {
      trace.push('1 Допуск (каналы ЛПР): в приложении — ' + (inappOk(lpr) ? 'да' : 'нет') + ', email — ' + (emailOk(lpr) ? 'да' : 'нет согласия') + ', push — ' + (pushOk(lpr) ? 'да' : 'нет согласия') + ', звонок — ' + (lpr.consent_ads_call ? 'да' : 'только сервисный контакт'));
    }
    const creditLike = ['Оборотный кредит', 'Льготный кредит АПК', 'Кэш-пулинг', 'Факторинг', 'Лизинг'].includes(top);
    if (lpr && lpr.has_alfa_boss && inappOk(lpr) && creditLike && acc && inappOk(acc) && inWindow) {
      channels = ['Записка бухгалтеру в «Альфа-Бизнесе» (' + acc.user_id + ')', 'Карточка ЛПР в «Альфа-Боссе» (' + lpr.user_id + ')'];
      freq = 'Одна записка на цикл потребности; карточка ЛПР не чаще раза в 2 недели и повторно только после ответа';
      path = 'Г1, группа C: записка через бухгалтера';
    } else if (lpr && lpr.has_alfa_boss && inappOk(lpr)) {
      channels = ['Карточка ЛПР в «Альфа-Боссе» (' + lpr.user_id + ')'];
      freq = 'Не чаще раза в 2 недели';
      path = 'Напрямую ЛПР';
    } else {
      let dt = lpr ? lpr.digital_type : 'Через менеджера';
      if (dt === 'Цифровой') channels = (inappOk(lpr) ? ['Баннер в интернет-банке'] : []).concat(pushOk(lpr) ? ['Push'] : []);
      else if (dt === 'Смешанный') channels = (inappOk(lpr) ? ['Интернет-банк'] : []).concat(emailOk(lpr) ? ['Email'] : []);
      else channels = [];
      if (!channels.length) dt = 'Через менеджера';
      if (dt === 'Через менеджера') channels = ['Бриф менеджеру с готовым расчётом'];
      freq = params.digital_type[dt];
      path = 'Тип активности ЛПР: ' + dt;
      if (dt === 'Смешанный' && !channels.includes('Email')) freq = 'Интернет-банк раз в неделю, затем бриф менеджеру (email — нет согласия)';
      if (dt === 'Цифровой' && !channels.includes('Push')) freq = 'Баннер в ИБ, до 2 предложений в неделю (push — нет согласия)';
    }
    if (holding && !channels.some(ch => ch.includes('енеджер'))) {
      channels = channels.concat(['Менеджер (холдинг)']);
      freq += '; холдинг — один лимит сообщений на группу';
    }
    if (fc.gap_date && fc.confidence >= params.forecast_confidence_min && !inWindow && (top === 'Оборотный кредит' || top === 'Льготный кредит АПК')) {
      freq = 'Вне окна — не чаще раза в месяц';
    }
    trace.push('6 Частота: ' + freq);

    // Тексты
    const amt = num(fc.gap_amount_mln), gd = fmtDate(fc.gap_date);
    const confident = Boolean(fc.gap_date) && fc.confidence >= params.forecast_confidence_min;
    const hook = hooks[st] || '';
    const isCredit = top === 'Оборотный кредит' || top === 'Льготный кредит АПК';
    const texts = {};
    if (isCredit && inWindow) {
      texts['Бухгалтеру'] = gd[0].toUpperCase() + gd.slice(1) + ' у компании может не хватить ' + amt + ' млн ₽ на платежи поставщикам. Заявка на кредитную линию заполнена — нужна подпись руководителя.';
      texts['ЛПР'] = 'Предварительное предложение: ' + (st === 'agro' ? 'льготный кредит' : 'кредитная линия') + ' ' + amt + ' млн ₽ до ' + gd + (hook ? ' — ' + hook : '') + (s.group_size >= 2 ? ', поручительство группы' : '') + '. Решение банк примет после заявки.';
    } else if (isCredit && confident) {
      texts['ЛПР'] = 'По оборотам прошлого года к ' + gd + ' компании понадобится около ' + amt + ' млн ₽' + (hook ? ' — ' + hook : '') + '. Линию можно открыть заранее и не платить, пока не используете.';
    } else if (isCredit) {
      texts['ЛПР'] = 'Оборотный кредит для бизнеса: лимит под обороты компании, решение онлайн.';
    } else if (top === 'Кэш-пулинг') {
      texts['ЛПР'] = 'В группе свободно ' + num(s.group_free_cash_mln) + ' млн ₽, а этой компании к ' + gd + ' не хватит ' + amt + ' млн ₽. Кэш-пулинг закроет разрыв деньгами группы — без кредита и процентов.';
    } else if (top === 'Факторинг') {
      const f = (p.preapproved['Факторинг'] || {}).limit_mln;
      texts['ЛПР'] = 'Оплата от покупателей сразу после отгрузки' + (hook ? ' — ' + hook : '') + ': факторинг до ' + (f === undefined ? '—' : pyFloat(f)) + ' млн ₽.';
    } else if (top === 'Лизинг') {
      const l = (p.preapproved['Лизинг'] || {}).limit_mln;
      texts['ЛПР'] = 'Техника к сезону без разового платежа: лизинг до ' + (l === undefined ? '—' : pyFloat(l)) + ' млн ₽.';
    } else if (top === 'Депозит') {
      texts['ЛПР'] = 'Свободные деньги без движения — разместите их на депозит онлайн.';
    } else if (top === 'ВЭД') {
      texts['ЛПР'] = 'Валютные платежи и валютный контроль в одном окне.';
    }
    texts['Почему вы это видите'] = confident && ['Оборотный кредит', 'Льготный кредит АПК', 'Кэш-пулинг'].includes(top) ? 'Прогноз по оборотам на ваших счетах в Альфа-Банке' : 'Подобрано по профилю компании';
    if (!path.startsWith('Г1')) delete texts['Бухгалтеру'];
    if (channels.some(ch => ch.includes('Бриф менеджеру'))) {
      const args = { 'Финансовый директор': 'сумма, срок и разрыв', 'Собственник': 'рост без изъятия денег из оборота' };
      const arg = args[lpr ? lpr.role_resolved : ''] || 'сумма и срок';
      texts['Бриф менеджеру'] = top + (confident ? ': разрыв ' + amt + ' млн ₽ к ' + gd + ', уверенность ' + pyFloat(fc.confidence) : '') + '. ЛПР — ' + (lpr ? lpr.role_resolved : 'не определён') + '; аргумент: ' + arg + '. Повод для звонка: «' + (texts['ЛПР'] || '') + '»';
    }
    let managerContact = null;
    if (channels.some(ch => ch.includes('енеджер'))) {
      managerContact = lpr && lpr.consent_ads_call ? 'Звонок с предложением' : 'Только сервисный контакт (встреча/звонок по обслуживанию, без рекламы)';
    }
    return {
      action: 'Показать предложение', offer: top, path: path,
      addressee_lpr: lpr ? lpr.user_id : null, addressee_lpr_role: lpr ? lpr.role_resolved : null, note_to: acc ? acc.user_id : null,
      channels: channels, frequency: freq, texts: texts, ranking_before: before, ranking_after: ranking, rule_trace: trace,
      manager_contact: managerContact,
      journey_adaptation: journeyRule(p.journey_last_session),
      fallback: 'Записку не переслали за 5 дней — карточка ЛПР напрямую; «Не сейчас» — пауза 30 дней',
      // служебное для экранов (не входит в эталон)
      _meta: { in_window: inWindow, confident: confident, lpr: lpr, acc: acc, roles: res }
    };
  }

  const Engine = { engine, journeyRule, resolveRole, num, fmtDate, pyFloat };
  if (typeof module !== 'undefined' && module.exports) module.exports = Engine;
  if (typeof window !== 'undefined') window.Engine = Engine;
})();
