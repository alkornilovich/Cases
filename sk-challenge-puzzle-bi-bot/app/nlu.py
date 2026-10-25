"""Разбор запроса на русском в команду бота.

Работает без LLM: словари каталога и правила. Если подключена LLM (llm.py),
она получает тот же каталог и должна вернуть команду в этом же формате;
ответ модели проверяется, а при ошибке бот возвращается к правилам.
"""
import re

from .catalog import DIM_WORDS, MEASURE_WORDS, REGION_ALIASES, CATEGORY_ALIASES, OUTLET_TYPE_ALIASES, SEGMENT_ALIASES
from .compute import parse_word_formula

ORDINALS = {'перв': 1, 'втор': 2, 'трет': 3, 'четв': 4, '1-': 1, '2-': 2, '3-': 3, '4-': 4}
MONTHS_RU = {'январ': 1, 'феврал': 2, 'март': 3, 'апрел': 4, 'ма': 5, 'июн': 6, 'июл': 7, 'август': 8,
             'сентябр': 9, 'октябр': 10, 'ноябр': 11, 'декабр': 12}


def norm(text):
    return ' ' + text.lower().replace('ё', 'е').replace('—', '-').replace('–', '-') + ' '


def has(t, *words):
    return any(w in t for w in words)


def quoted(text):
    m = re.search(r'[«"“„\']([^»"”\']+)[»"”\']', text)
    if m:
        return m.group(1).strip()
    m = re.search(r'(?:под названием|как|в)\s+([A-Za-zА-Яа-я0-9 _\-]+)$', text.strip())
    return m.group(1).strip() if m else None


def month_add(ym, n):
    y, m = int(ym[:4]), int(ym[5:7])
    total = y * 12 + (m - 1) + n
    return '%04d-%02d' % (total // 12, total % 12 + 1)


def parse_period(t, data_end, data_start):
    """Возвращает (start, end, подпись) или None, если период в запросе не назван."""
    y_end = int(data_end[:4])
    m = re.search(r'последни[ей]\s+(\d+)\s+(год|года|лет)', t)
    if m:
        n = int(m.group(1))
        return month_add(data_end, -12 * n + 1), data_end, f'последние {n} ' + ('года' if n < 5 else 'лет')
    m = re.search(r'последни[ей]\s+(\d+)\s+месяц', t)
    if m:
        n = int(m.group(1))
        return month_add(data_end, -n + 1), data_end, f'последние {n} мес.'
    m = re.search(r'(\d)\s*(?:-?й)?\s*квартал\s*(20\d\d)?|q([1-4])\s*(20\d\d)?', t)
    word_q = re.search(r'(перв|втор|трет|четверт)\w*\s+квартал\s*(20\d\d)?', t)
    if m or word_q:
        if word_q:
            q = {'перв': 1, 'втор': 2, 'трет': 3, 'четверт': 4}[word_q.group(1)]
            year = int(word_q.group(2)) if word_q.group(2) else None
        else:
            q = int(m.group(1) or m.group(3))
            year = m.group(2) or m.group(4)
            year = int(year) if year else None
        if year is None:
            year = y_end if '%04d-%02d' % (y_end, q * 3 - 2) <= data_end else y_end - 1
        start = '%04d-%02d' % (year, q * 3 - 2)
        return start, month_add(start, 2), f'{q} квартал {year}'
    if has(t, 'последний квартал', 'прошлый квартал', 'за квартал', 'последнего квартала'):
        q_end_month = (int(data_end[5:7]) - 1) // 3 * 3 + 3
        end = '%s-%02d' % (data_end[:4], q_end_month)
        if end > data_end:
            end = month_add(end, -3)
        return month_add(end, -2), end, 'последний квартал'
    if has(t, 'последний месяц', 'прошлый месяц', 'за месяц', 'последнего месяца'):
        return data_end, data_end, 'последний месяц'
    m = re.search(r'(20\d\d)\s*(год|г\.|г )?', t)
    if m and not has(t, 'последн'):
        year = m.group(1)
        return year + '-01', min(year + '-12', data_end), f'{year} год'
    if has(t, 'последний год', 'за год', 'прошлый год', 'последние 12', 'последнего года', 'за последний год'):
        return month_add(data_end, -11), data_end, 'последний год'
    if has(t, 'все время', 'весь период', 'за все', 'за всё'):
        return data_start, data_end, 'весь период'
    return None


def find_dims(t):
    """Разрезы в порядке упоминания: первый названный становится главным."""
    found = []
    for dim, words in DIM_WORDS:
        positions = [t.find(w) for w in words if w in t]
        if positions:
            found.append((min(positions), dim))
    found.sort()
    return [d for _, d in found]


def find_measures(t):
    found = []
    for m, words in MEASURE_WORDS:
        if has(t, *words):
            found.append(m)
    return found


def find_filters(t, lookups):
    filters = {}
    clients = []
    for name in lookups.get('client', []):
        core = re.sub(r'^(ООО|АО|ПАО|ЗАО|ИП)\s*', '', name).strip('«» ').lower().replace('ё', 'е')
        if len(core) > 4 and re.search(r'(?<![а-яa-z])' + re.escape(core) + r'(?![а-яa-z])', t):
            clients.append(name)
            t = t.replace(core, ' ')
    if clients:
        filters['client'] = clients
    for value, words in REGION_ALIASES.items():
        if has(t, *words):
            filters.setdefault('region', []).append(value)
    for value, words in CATEGORY_ALIASES.items():
        if has(t, *words):
            filters.setdefault('category', []).append(value)
    for value, words in OUTLET_TYPE_ALIASES.items():
        if has(t, *words):
            filters.setdefault('outlet_type', []).append(value)
    for value, words in SEGMENT_ALIASES.items():
        if has(t, *words):
            filters.setdefault('segment', []).append(value)
    return filters


def find_metric_ref(t, computations):
    """На какую метрику ссылается пользователь: «по проценту выполнения», «с учетом динамики»."""
    for c in reversed(computations):
        title = c['title'].lower()
        key = title.split(',')[0]
        if key in t or (('динамик' in t) and 'динамик' in title) or (('нараст' in t or 'накопит' in t) and 'накопит' in title) \
                or ('дол' in t and 'доля' in title) or ('отклонен' in t and 'отклонение' in title and '%' in title and '%' in t):
            return c['id']
    if has(t, 'выполнен'):
        return 'exec_pct'
    if has(t, 'отклонен'):
        return 'dev'
    if has(t, 'скидк'):
        return 'discount'
    if has(t, 'количеств', 'штук'):
        return 'qty'
    if has(t, 'сделк'):
        return 'deals'
    if has(t, 'план') and not has(t, 'факт'):
        return 'plan'
    if has(t, 'факт', 'объем', 'продаж', 'выручк'):
        return 'fact'
    if has(t, 'новой колонк', 'новую колонк', 'новых вычислен', 'новой метрик', 'с учетом нов') and computations:
        return computations[-1]['id']
    return None


def parse_computation(t, raw, computations, n):
    """Что посчитать: возвращает описание вычисляемой колонки."""
    cid = f'c{n}'
    metric = 'fact'
    if has(t, 'скидк') and not has(t, 'факт'):
        metric = 'discount'
    if has(t, 'количеств', 'штук'):
        metric = 'qty'
    if has(t, 'доля скидк', 'долю скидок', 'доли скидок', 'скидки в продаж', 'скидок в продаж', 'скидки к продаж'):
        return {'id': cid, 'kind': 'formula', 'title': 'Скидки к продажам, %', 'unit': '%',
                'expr': {'op': '*', 'a': {'op': '/', 'a': {'col': 'discount'}, 'b': {'col': 'fact'}}, 'b': {'num': 100}}}
    if has(t, 'накопительн', 'нарастающ'):
        return {'id': cid, 'kind': 'cumsum', 'metric': metric, 'title': 'Накопительный итог, ' + ('₽' if metric != 'qty' else 'шт'), 'unit': '₽' if metric != 'qty' else 'шт'}
    if has(t, 'динамик', 'к предыдущ', 'к прошл', 'год к году', 'месяц к месяцу', 'изменени'):
        lag = 12 if has(t, 'год к году', 'к прошлому году', 'к предыдущему году', 'yoy') else 1
        label = 'к прошлому году' if lag == 12 else 'к прошлому периоду'
        return {'id': cid, 'kind': 'pct_change', 'metric': metric, 'lag': lag, 'title': f'Динамика {label}, %', 'unit': '%'}
    if has(t, 'дол'):
        return {'id': cid, 'kind': 'share', 'metric': metric, 'title': 'Доля в общем объеме, %', 'unit': '%'}
    if has(t, 'ранг', 'место', 'ранжир'):
        return {'id': cid, 'kind': 'rank', 'metric': metric, 'title': 'Место в рейтинге', 'unit': ''}
    if has(t, 'средний чек', 'среднего чека'):
        return {'id': cid, 'kind': 'formula', 'expr': {'op': '/', 'a': {'col': 'fact'}, 'b': {'col': 'deals'}}, 'title': 'Средний чек, ₽', 'unit': '₽'}
    if has(t, 'процент выполнения', '% выполнения', 'выполнение плана', 'процент плана', 'выполнения плана'):
        return {'id': cid, 'kind': 'formula', 'expr': {'op': '*', 'a': {'op': '/', 'a': {'col': 'fact'}, 'b': {'col': 'plan'}}, 'b': {'num': 100}},
                'title': 'Процент выполнения плана, %', 'unit': '%'}
    if has(t, 'отклонен') and not has(t, 'минус', 'делить'):
        if has(t, 'процент', '%'):
            return {'id': cid, 'kind': 'formula', 'title': 'Отклонение от плана, %', 'unit': '%',
                    'expr': {'op': '*', 'a': {'op': '/', 'a': {'op': '-', 'a': {'col': 'fact'}, 'b': {'col': 'plan'}}, 'b': {'col': 'plan'}}, 'b': {'num': 100}}}
        return {'id': cid, 'kind': 'formula', 'title': 'Отклонение факта от плана, ₽', 'unit': '₽',
                'expr': {'op': '-', 'a': {'col': 'fact'}, 'b': {'col': 'plan'}}}
    expr = parse_word_formula(raw, computations)
    if expr:
        return {'id': cid, 'kind': 'formula', 'expr': expr, 'title': 'Формула ' + str(n), 'unit': '%' if has(t, '100', 'процент') else ''}
    return None


def parse(text, ctx):
    """ctx: {'has_dashboard', 'computations', 'data_end', 'data_start', 'lookups', 'charts'}"""
    t = norm(text)
    raw = text
    has_dash = ctx.get('has_dashboard')
    comps = ctx.get('computations', [])

    # 1. Сохранение и работа со списком дашбордов
    if has(t, 'покажи мои дашборд', 'мои дашборд', 'список дашборд', 'все дашборд', 'покажи дашборды', 'сохраненные дашборд'):
        return {'intent': 'list'}
    if has(t, 'найди дашборд', 'найди отчет', 'поищи дашборд'):
        m = re.search(r'(?:про|по|о)\s+(.+)$', text.strip(), re.I)
        return {'intent': 'find', 'text': (m.group(1) if m else text).strip(' «»"')}
    if has(t, 'переименуй'):
        names = re.findall(r'[«"“]([^»"”]+)[»"”]', text)
        return {'intent': 'rename', 'name': names[-1] if names else quoted(text)}
    if has(t, 'удали дашборд', 'удали отчет', 'удалить дашборд') or (has(t, 'удали ') and has(t, '«', '"')):
        return {'intent': 'delete', 'name': quoted(text)}
    if has(t, 'открой', 'загрузи дашборд', 'верни дашборд'):
        return {'intent': 'open', 'name': quoted(text) or re.sub(r'(?i).*открой\s+(дашборд)?', '', text).strip()}
    if re.search(r'\bкопи[юяи]\b|дубликат|дублируй', t):
        return {'intent': 'copy', 'name': quoted(text)}
    if has(t, 'сохрани', 'запомни'):
        return {'intent': 'save', 'name': quoted(text) if has(t, 'как', 'назван', '«', '"') else None,
                'as_new': has(t, 'как нов', 'новый', 'как копи')}
    if has(t, 'отмени', 'откати', 'верни как было', 'undo', 'удали колонк', 'убери колонк', 'удали последн'):
        return {'intent': 'undo'}
    if has(t, 'скача', 'выгрузи в', 'экспорт', 'в html', 'в excel', 'в эксель', 'csv'):
        fmt = 'xlsx' if has(t, 'excel', 'эксель', 'xlsx', 'таблиц', 'csv') else 'html'
        return {'intent': 'export', 'format': fmt}
    if has(t, 'помощь', 'что ты умеешь', 'help', 'как пользоваться'):
        return {'intent': 'help'}

    # 2. Вычисления
    calc_words = ('добавь колонк', 'добавь вычислен', 'посчитай', 'рассчитай', 'вычисли', 'добавь динамик', 'добавь накопит',
                  'добавь отклонен', 'добавь дол', 'добавь процент', 'добавь средний', 'измени формул', 'формула', 'добавь столбец')
    if has(t, *calc_words) and not has(t, 'фильтр', 'переключат'):
        if has(t, 'средн', 'медиан', 'минимальн', 'максимальн', 'min', 'max') and has(t, ' по ') and not has(t, 'средний чек'):
            return stats_command(t)
        comp = parse_computation(t, raw, comps, len(comps) + 1)
        if comp:
            cmd = {'intent': 'add_column', 'computation': comp}
            if has(t, 'покажи топ', 'топ-', 'топ '):
                cmd['then_top'] = top_n(t)
            return cmd
    if has_dash and has(t, 'минус', 'плюс', 'делить', 'умнож', ' / ', ' - ', ' * ') and find_measures(t) and not has(t, 'дашборд'):
        comp = parse_computation(t, raw, comps, len(comps) + 1)
        if comp:
            return {'intent': 'add_column', 'computation': comp}
    if has(t, 'средн', 'медиан', 'минимальн', 'максимальн') and has(t, 'по групп', 'по регион', 'по точк', 'по категор'):
        return stats_command(t)

    # 3. Правка графиков
    chart_idx = None
    for k, v in ORDINALS.items():
        if re.search(k + r'\w*\s+(график|диаграм)', t):
            chart_idx = v
    if has_dash and (has(t, 'перестрой', 'отсортируй', 'сортир', 'топ-', 'топ ') or (chart_idx and has(t, 'покажи', 'сделай', 'с учетом'))):
        cmd = {'intent': 'chart_edit', 'chart': chart_idx}
        ref = find_metric_ref(t, comps)
        if has(t, 'отсортируй', 'сортир', 'по убыв', 'по возраст'):
            cmd['sort_by'] = ref
            cmd['ascending'] = has(t, 'по возраст', 'снизу', 'отстающ', 'худш')
        elif ref:
            cmd['metric'] = ref
        if has(t, 'топ'):
            cmd['top'] = top_n(t)
        return cmd

    if has_dash and has(t, 'резюме', 'инсайт', 'выводы', 'вывод по', 'что видно', 'итоги'):
        return {'intent': 'summary'}
    if has_dash and has(t, 'таблиц') and not has(t, 'дашборд', 'excel', 'эксель'):
        return {'intent': 'show_table', 'dim': first_dim(find_dims(t))}

    # 4. Интерфейс дашборда: фильтры, переключатели, KPI
    filters = find_filters(t, ctx.get('lookups', {}))
    period = parse_period(t, ctx['data_end'], ctx['data_start'])
    new_topic = (period is not None and not has(t, 'переключат', 'фильтр')) or 'client' in filters or has(t, 'структур', 'сравни', 'план-факт', 'какие скидки')
    if has_dash and not new_topic and not has(t, 'дашборд', 'собери', 'построй'):
        ui = {}
        if has(t, 'только', 'оставь', 'отфильтруй', 'покажи по') and filters:
            ui['filters'] = filters
        if has(t, 'сбрось фильтр', 'убери фильтр', 'все регионы', 'без фильтр'):
            ui['reset_filters'] = True
        if has(t, 'разбивк', 'по кварт', 'по месяц', 'по год', 'переключ', 'период'):
            if has(t, 'кварт'):
                ui['grain'] = 'quarter'
            elif has(t, 'по год', 'годам'):
                ui['grain'] = 'year'
            elif has(t, 'месяц'):
                ui['grain'] = 'month'
        if has(t, 'на точк', 'по точк', 'точки', 'разрез точ') and not has(t, 'каскад', 'регион → точ', 'регион ->'):
            ui['dim'] = 'outlet'
        elif has(t, 'на регион', 'по регион', 'разрез регион') and not has(t, 'фильтр', 'каскад'):
            ui['dim'] = 'region'
        elif has(t, 'по категор', 'на категор'):
            ui['dim'] = 'category'
        if has(t, 'переключ') and has(t, 'план') and has(t, 'факт'):
            ui['ack'] = 'Переключатель «План / Факт» есть в панели «Метрика»: выбери план, факт или выполнение.'
        elif has(t, 'фильтр') and has(t, 'регион') and has(t, 'поиск'):
            ui['ack'] = 'Фильтр «Регион» с поиском уже на панели: начни вводить название, можно выбрать несколько.'
        elif has(t, 'каскад'):
            ui['ack'] = 'Каскад включен: выбери регион, и список торговых точек сузится до его точек.'
        elif has(t, 'итогов', 'kpi', 'ключевые цифр'):
            ui['ack'] = 'Итоговые цифры стоят сверху дашборда и пересчитываются при каждом фильтре.'
        elif has(t, 'переключатель период'):
            ui['ack'] = 'Переключатель периода «Месяц / Квартал / Год» есть на панели.'
        if has(t, 'резюме', 'инсайт', 'выводы', 'что видно'):
            return {'intent': 'summary'}
        if ui:
            return {'intent': 'set_ui', 'ui': ui}

    if has(t, 'таблиц', 'выгрузи данные', 'покажи данные', 'покажи строки') and has_dash and not has(t, 'дашборд'):
        return {'intent': 'show_table', 'dim': first_dim(find_dims(t))}

    # 5. Новый дашборд или график
    dims = find_dims(t)
    measures = find_measures(t)
    build_words = ('дашборд', 'покажи', 'выведи', 'дай ', 'нужен', 'хочу увидеть', 'отчет', 'сколько', 'как продава', 'как выполн', 'сравни', 'собери', 'построй', 'план-факт', 'план факт', 'структур', 'визуализ', 'график', 'диаграм', 'какие скидки', 'выдели')
    if has(t, *build_words) or (dims and measures):
        kind = 'full'
        if has(t, 'скидк') and (has(t, 'клиент', 'причин', 'почему') or 'client' in filters):
            kind = 'discounts'
        elif has(t, 'дашборд'):
            kind = 'full'
        elif has(t, 'структур'):
            kind = 'structure'
        elif has(t, 'сравни', 'отстающ', 'выдели', 'худш', 'лучш', 'рейтинг', 'хуже', 'лучше', 'отстает'):
            kind = 'compare'
        elif not has(t, 'дашборд'):
            kind = 'planfact'
        return {'intent': 'dashboard', 'kind': kind, 'period': period, 'dims': dims, 'measures': measures,
                'filters': filters, 'text': text, 'with_table': has(t, 'таблиц')}
    if has_dash and has(t, 'таблиц'):
        return {'intent': 'show_table', 'dim': None}
    return {'intent': 'unknown'}


def first_dim(dims):
    for d in dims:
        if d != 'period':
            return d
    return None


def top_n(t):
    m = re.search(r'топ[- ]?(\d+)', t)
    return int(m.group(1)) if m else 10


def stats_command(t):
    stat = 'mean'
    if has(t, 'медиан'):
        stat = 'median'
    elif has(t, 'минимальн', 'min'):
        stat = 'min'
    elif has(t, 'максимальн', 'max'):
        stat = 'max'
    group = 'region'
    if has(t, 'по категор'):
        group = 'category'
    if has(t, 'по тип'):
        group = 'outlet_type'
    unit = 'outlet'
    metric = 'fact'
    if has(t, 'скидк'):
        metric = 'discount'
    return {'intent': 'stats', 'stat': stat, 'group': group, 'unit': unit, 'metric': metric}
