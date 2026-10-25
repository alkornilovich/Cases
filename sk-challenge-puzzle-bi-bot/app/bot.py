"""Диалог: команда -> действие над состоянием дашборда -> сообщения в чат."""
import copy
import re
import pandas as pd

from . import db, store, llm, nlu
from .catalog import DIMENSIONS, MEASURES, all_metrics, metric_title
from .compute import computed_frame, expr_text, apply_computation
from .nlu import norm, parse_period, month_add

DATA = {}
SESSIONS = {}

EXAMPLES = [
    'Собери дашборд по продажам: план-факт по регионам и торговым точкам за последний год',
    'Покажи план-факт продаж по регионам за последний квартал',
    'Сравни продажи по торговым точкам за год, выдели отстающих',
    'Покажи по клиенту Сибирский Продукт за последние 3 года, какие скидки делались и почему',
    'Покажи структуру продаж по продуктам за последний месяц',
]


def init():
    db.connect()
    DATA['start'], DATA['end'] = db.data_range()
    DATA['lookups'] = db.lookup_values()
    DATA['llm'] = llm.available()


def session(sid):
    if sid not in SESSIONS:
        SESSIONS[sid] = {'state': None, 'table': None, 'pending': None, 'undo': []}
    return SESSIONS[sid]


# ---------- единая таблица: компактная передача в браузер ----------

def pack_table(df):
    cols = {}
    for c in df.columns:
        if not pd.api.types.is_numeric_dtype(df[c]):
            values = df[c].fillna('').astype(str)
            dictionary = sorted(values.unique().tolist())
            index = {v: i for i, v in enumerate(dictionary)}
            cols[c] = {'dict': dictionary, 'codes': [index[v] for v in values]}
        else:
            cols[c] = [None if pd.isna(v) else round(float(v), 2) for v in df[c]]
    return {'n': len(df), 'cols': cols, 'order': list(df.columns)}


def unpack_table(table):
    data = {}
    for c in table['order']:
        col = table['cols'][c]
        if isinstance(col, dict):
            data[c] = [col['dict'][i] for i in col['codes']]
        else:
            data[c] = col
    return pd.DataFrame(data)


def filtered_frame(state, table, current_only=True):
    df = unpack_table(table)
    ui = state['ui']
    if current_only and 'period' in df.columns:
        df = df[(df['period'] >= ui['range']['start']) & (df['period'] <= ui['range']['end'])]
    for dim, values in ui.get('filters', {}).items():
        if values and dim in df.columns:
            df = df[df[dim].isin(values)]
    return df


# ---------- форматирование ----------

def money(v):
    if v is None or pd.isna(v):
        return '—'
    a = abs(v)
    if a >= 1e9:
        s = f'{v / 1e9:.2f} млрд ₽'
    elif a >= 1e6:
        s = f'{v / 1e6:.1f} млн ₽'
    elif a >= 1e3:
        s = f'{v / 1e3:.0f} тыс. ₽'
    else:
        s = f'{v:.0f} ₽'
    return s.replace('.', ',')


def period_label(start, end):
    months = ['янв', 'фев', 'мар', 'апр', 'май', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек']
    a = f'{months[int(start[5:7]) - 1]} {start[:4]}'
    b = f'{months[int(end[5:7]) - 1]} {end[:4]}'
    return a if start == end else f'{a} – {b}'


def table_message(state, table, dim=None, caption=None, highlight=None, limit=40):
    dim = dim or state['ui']['dim']
    df = filtered_frame(state, table)
    if dim not in df.columns:
        dim = 'period'
    g = computed_frame(df, dim, state['computations'])
    metric_ids = [m['id'] for m in all_metrics(state['computations'])]
    cols = [dim] + [c for c in metric_ids if c in g.columns]
    sort_col = 'fact' if 'fact' in g.columns else cols[1]
    if dim != 'period':
        g = g.sort_values(sort_col, ascending=False)
    g = g[cols]
    titles = {dim: DIMENSIONS[dim]['title']}
    for m in all_metrics(state['computations']):
        titles[m['id']] = m['title']
    rows = []
    for _, r in g.head(limit).iterrows():
        rows.append([r[c] if not isinstance(r[c], (int, float)) else (None if pd.isna(r[c]) else round(float(r[c]), 2)) for c in cols])
    return {'type': 'table', 'columns': [titles.get(c, c) for c in cols], 'keys': cols, 'rows': rows,
            'total_rows': len(g), 'flat_rows': len(df), 'highlight': highlight,
            'caption': caption or f'Единая таблица, сгруппированная по разрезу «{titles[dim]}»'}


def dashboard_message(state, table, send_rows=True):
    payload = {'state': strip_versions(state), 'metrics': all_metrics(state['computations']),
               'dims': {k: v['title'] for k, v in DIMENSIONS.items()}}
    if send_rows:
        payload['table'] = table
    return {'type': 'dashboard', 'payload': payload}


def strip_versions(state):
    return {k: v for k, v in state.items() if k != 'versions'}


def text(t, **extra):
    msg = {'type': 'text', 'text': t}
    msg.update(extra)
    return msg


# ---------- построение дашборда ----------

def chart_set(kind, dims, grain_table):
    dim_main = nlu.first_dim(dims)
    if kind == 'full':
        return [
            {'type': 'period_bars', 'title': 'План-факт по периодам', 'metrics': ['plan', 'fact']},
            {'type': 'structure_pie', 'title': 'Структура продаж за последний период', 'metric': 'fact', 'dim': 'category', 'last_period': True},
            {'type': 'top_hbar', 'title': 'ТОП по отклонению от плана', 'metric': '@metric', 'dim': '@dim', 'sort_by': 'dev', 'ascending': False, 'top': 10},
            {'type': 'exec_line', 'title': 'Динамика выполнения плана', 'metric': 'exec_pct'},
        ]
    if kind == 'planfact':
        return [{'type': 'dim_planfact', 'title': 'План-факт по разрезу', 'dim': '@dim', 'top': 15},
                {'type': 'exec_line', 'title': 'Выполнение плана по периодам', 'metric': 'exec_pct'}]
    if kind == 'structure':
        return [{'type': 'structure_pie', 'title': 'Структура продаж', 'metric': '@metric', 'dim': dim_main or 'category', 'last_period': False},
                {'type': 'top_hbar', 'title': 'Рейтинг по продажам', 'metric': '@metric', 'dim': dim_main or 'category', 'sort_by': '@metric', 'ascending': False, 'top': 15}]
    if kind == 'compare':
        return [{'type': 'top_hbar', 'title': 'Выполнение плана: отстающие сверху', 'metric': 'exec_pct', 'dim': '@dim', 'sort_by': 'exec_pct',
                 'ascending': True, 'top': 20, 'threshold': 100},
                {'type': 'dim_planfact', 'title': 'План-факт по разрезу', 'dim': '@dim', 'top': 20, 'sort_by': 'exec_pct', 'ascending': True}]
    if kind == 'discounts':
        return [{'type': 'period_bars', 'title': 'Скидки по периодам', 'metrics': ['discount']},
                {'type': 'structure_pie', 'title': 'Причины скидок', 'metric': 'discount', 'dim': 'reason', 'last_period': False, 'exclude': ['Без скидки']},
                {'type': 'top_hbar', 'title': 'Скидки по категориям товаров', 'metric': 'discount', 'dim': 'category', 'sort_by': 'discount', 'ascending': False, 'top': 10},
                {'type': 'exec_line', 'title': 'Скидки к продажам по периодам, %', 'metric': 'disc_share'}]
    return []


def build_dashboard(sess, cmd):
    kind = cmd['kind']
    start, end, plabel = cmd['period']
    dims = cmd.get('dims') or []
    filters = cmd.get('filters') or {}
    grain = 'clients' if kind == 'discounts' or any(d in dims for d in ['client', 'segment', 'reason']) or filters.get('client') or filters.get('segment') else 'sales'
    if grain == 'clients' and kind not in ('discounts',):
        kind = 'discounts' if 'скидк' in norm(cmd.get('text', '')) else kind
    if grain == 'sales':
        table_dims = ['period', 'region', 'outlet', 'outlet_type', 'category']
        if 'product' in dims:
            table_dims.append('product')
    else:
        table_dims = ['period', 'region', 'client', 'segment', 'reason', 'category']
        if 'product' in dims:
            table_dims.append('product')
    server_filters = {k: v for k, v in filters.items() if k in ('outlet_type', 'client', 'segment')}
    ui_filters = {k: v for k, v in filters.items() if k in ('region', 'category')}
    spec = {'grain': grain, 'dims': table_dims, 'start': start, 'end': end, 'prev': True, 'filters': server_filters}
    df, sql, measures = db.fetch_table(spec)
    if df.empty or df[df['period'] >= start].empty:
        return [text('По этому запросу данных нет. Проверь период и фильтры: данные есть с '
                     f'{period_label(DATA["start"], DATA["start"])} по {period_label(DATA["end"], DATA["end"])}.')]
    table = pack_table(df)
    dim = nlu.first_dim(dims) or ('reason' if kind == 'discounts' else 'region')
    if dim not in table_dims:
        dim = 'region'
    if kind == 'compare' and 'outlet' in dims:
        dim = 'outlet'
    if kind == 'discounts':
        dim = 'reason'
    metric = 'discount' if kind == 'discounts' else ('fact' if not cmd.get('measures') or cmd['measures'][0] == 'plan' else cmd['measures'][0])
    months = (int(end[:4]) * 12 + int(end[5:7])) - (int(start[:4]) * 12 + int(start[5:7])) + 1
    computations = []
    if kind == 'discounts':
        computations.append({'id': 'disc_share', 'kind': 'formula', 'title': 'Скидки к продажам, %', 'unit': '%',
                             'expr': {'op': '*', 'a': {'op': '/', 'a': {'col': 'discount'}, 'b': {'col': 'fact'}}, 'b': {'num': 100}}})
    filter_dims = ['region', 'outlet', 'category'] if grain == 'sales' else ['region', 'client', 'segment', 'reason', 'category']
    if 'product' in table_dims:
        filter_dims.append('product')
    names = {'full': 'Продажи', 'planfact': 'План-факт', 'structure': 'Структура продаж', 'compare': 'Сравнение и отстающие', 'discounts': 'Скидки'}
    state = {
        'id': None, 'name': f'{names[kind]} по разрезу «{DIMENSIONS[dim]["title"].lower()}», {period_label(start, end)}',
        'query': cmd.get('text', ''), 'kind': kind, 'kpi': 'discounts' if kind == 'discounts' else 'planfact',
        'spec': spec, 'measures': measures, 'computations': computations, 'history': [],
        'charts': chart_set(kind, dims, grain),
        'ui': {'filters': ui_filters, 'dim': dim, 'metric': metric, 'grain': 'quarter' if months >= 24 else 'month', 'view': 'abs',
               'range': {'start': start, 'end': end}},
        'filter_dims': filter_dims,
        'dim_options': [d for d in (['region', 'outlet', 'outlet_type', 'category', 'product'] if grain == 'sales' else ['reason', 'client', 'segment', 'region', 'category', 'product']) if d in table_dims],
    }
    sess['undo'] = []
    sess['state'], sess['table'] = state, table
    n_charts = len(state['charts'])
    rows_txt = f'{len(df):,}'.replace(',', ' ')
    msgs = [text(f'Выгрузил данные за {plabel} ({period_label(start, end)}): единая таблица на {rows_txt} строк, '
                 + f'включая прошлый год для сравнения. Ниже таблица и дашборд из {n_charts} '
                 + ('графиков' if n_charts > 4 else 'графиков' if n_charts != 1 else 'графика') + '.')]
    tm = table_message(state, table, limit=12)
    tm['sql'] = sql
    msgs.append(tm)
    msgs.append(dashboard_message(state, table))
    if kind == 'discounts':
        msgs.append(text('Можно продолжить: «посчитай долю скидок в продажах», «покажи итоговые выводы», «сохрани как …».',
                         buttons=['Покажи итоговые выводы', 'Добавь динамику к прошлому году', 'Сохрани дашборд']))
    else:
        msgs.append(text('Можно продолжить: «добавь колонку с процентом выполнения», «покажи только Центральный», «переключи на точки», «сохрани как …».',
                         buttons=['Добавь колонку с отклонением факта от плана', 'Покажи итоговые выводы', 'Сохрани дашборд']))
    return msgs


# ---------- обработка сообщения ----------

def handle(sid, message, ui=None):
    sess = session(sid)
    if ui and sess['state']:
        sess['state']['ui'].update({k: v for k, v in ui.items() if k in ('filters', 'dim', 'metric', 'grain', 'view')})
        if 'charts' in ui and isinstance(ui['charts'], list) and len(ui['charts']) == len(sess['state']['charts']):
            sess['state']['charts'] = ui['charts']

    ctx = {'has_dashboard': sess['state'] is not None, 'computations': sess['state']['computations'] if sess['state'] else [],
           'data_end': DATA['end'], 'data_start': DATA['start'], 'lookups': DATA['lookups']}

    # ответ на уточняющий вопрос
    if sess['pending']:
        pending = sess['pending']
        period = parse_period(norm(message), DATA['end'], DATA['start'])
        if period:
            sess['pending'] = None
            pending['period'] = period
            return build_dashboard(sess, pending)
        sess['pending'] = None

    cmd = None
    if llm.MODE == 'primary' and DATA.get('llm'):
        cmd = from_llm(message, ctx)
    if cmd is None:
        cmd = nlu.parse(message, ctx)
    if cmd['intent'] == 'unknown' and DATA.get('llm'):
        cmd = from_llm(message, ctx) or cmd
    return dispatch(sess, cmd, message)


def from_llm(message, ctx):
    raw = llm.ask(message)
    if not raw:
        return None
    if raw['intent'] == 'dashboard':
        raw['period'] = parse_period(norm(raw.get('period_text', message)), ctx['data_end'], ctx['data_start'])
        raw.setdefault('kind', 'full')
        raw.setdefault('dims', [])
        raw.setdefault('filters', {})
        raw['measures'] = []
        raw['text'] = message
    if raw['intent'] == 'add_column':
        ft = raw.get('formula_text', message)
        comp = nlu.parse_computation(norm(ft), ft, ctx['computations'], len(ctx['computations']) + 1)
        if not comp:
            return None
        raw['computation'] = comp
    return raw


def push_undo(sess):
    sess['undo'].append(copy.deepcopy(sess['state']))
    sess['undo'] = sess['undo'][-30:]


def need_dashboard():
    return [text('Сначала построим дашборд. Например:', buttons=EXAMPLES[:3])]


def dispatch(sess, cmd, message):
    intent = cmd['intent']
    state, table = sess['state'], sess['table']

    if intent == 'help':
        return [text('Я строю дашборды по вопросу на русском, добавляю вычисления, фильтры и сохраняю результат. '
                     'Данные: продажи, план, скидки, клиенты, 300 торговых точек в 8 регионах, '
                     f'{period_label(DATA["start"], DATA["end"])}. Попробуй:', buttons=EXAMPLES)]

    if intent == 'dashboard':
        if not cmd.get('period'):
            sess['pending'] = cmd
            return [text('За какой период?', buttons=['Последний месяц', 'Последний квартал', 'Последний год', 'Последние 3 года'])]
        return build_dashboard(sess, cmd)

    if intent == 'list':
        items = store.all_states()
        if not items:
            return [text('Сохраненных дашбордов пока нет. Скажи «сохрани дашборд», когда он будет готов.')]
        return [{'type': 'list', 'title': 'Мои дашборды', 'items': items}]

    if intent == 'find':
        items = store.find(cmd.get('text'))
        if not items:
            return [text(f'Не нашел дашбордов по запросу «{cmd.get("text")}».')]
        return [{'type': 'list', 'title': f'Найдено по запросу «{cmd.get("text")}»', 'items': items}]

    if intent == 'open':
        item = store.by_name(cmd.get('name'))
        if not item:
            return [text(f'Не нашел дашборд «{cmd.get("name")}». Список: «покажи мои дашборды».')]
        sess['state'], sess['table'] = store.load(item['id'])
        sess['undo'] = []
        st = sess['state']
        return [text(f'Открыл «{st["name"]}» в том виде, в каком он был сохранен {st["updated"]}: таблица, вычисления, графики, фильтры.'),
                dashboard_message(st, sess['table'])]

    if intent == 'delete':
        item = store.by_name(cmd.get('name')) if cmd.get('name') else (state and state.get('id') and {'id': state['id'], 'name': state['name']})
        if not item:
            return [text('Не понял, какой дашборд удалить. Напиши название в кавычках.')]
        store.delete(item['id'])
        if state and state.get('id') == item['id']:
            state['id'] = None
        return [text(f'Удалил дашборд «{item["name"]}».')]

    if intent == 'rename':
        names = re.findall(r'[«"“]([^»"”]+)[»"”]', message)
        new_name = names[-1] if names else cmd.get('name')
        target = store.by_name(names[0]) if len(names) >= 2 else None
        if target:
            store.rename(target['id'], new_name)
            if state and state.get('id') == target['id']:
                state['name'] = new_name
            return [text(f'Переименовал «{target["name"]}» в «{new_name}».')]
        if not state or not new_name:
            return [text('Напиши новое название в кавычках: «переименуй дашборд в “Продажи Q3 финал”».')]
        state['name'] = new_name
        if state.get('id'):
            sess['state'] = store.save(state, table)
        return [text(f'Дашборд теперь называется «{new_name}».')]

    if not state:
        if intent in ('save', 'copy', 'undo', 'export', 'add_column', 'chart_edit', 'set_ui', 'show_table', 'summary', 'stats'):
            return need_dashboard()
        return [text('Не понял запрос. Я умею строить дашборды по продажам, плану и скидкам. Например:', buttons=EXAMPLES)]

    if intent == 'save':
        as_new = cmd.get('as_new')
        if cmd.get('name'):
            # «сохрани как Другое имя» у уже сохраненного дашборда — это новый дашборд
            if state.get('id') and cmd['name'] != state['name']:
                as_new = True
            state['name'] = cmd['name']
        sess['state'] = store.save(state, table, as_new=as_new)
        v = len(sess['state']['versions'])
        return [text(f'Сохранил «{sess["state"]["name"]}»' + (f', версия {v}' if v > 1 else '') +
                     '. Вернуться: «покажи мои дашборды» или «открой «название»».')]

    if intent == 'copy':
        copy_state = copy.deepcopy(state)
        copy_state['name'] = cmd.get('name') or state['name'] + ' (копия)'
        sess['state'] = store.save(copy_state, table, as_new=True)
        return [text(f'Сделал копию «{sess["state"]["name"]}». Работаем в копии, оригинал не меняется.')]

    if intent == 'undo':
        if not sess['undo']:
            return [text('Отменять нечего: изменений после построения не было.')]
        sess['state'] = sess['undo'].pop()
        return [text('Отменил последнее изменение.'), dashboard_message(sess['state'], table, send_rows=False)]

    if intent == 'export':
        return [text('Готово, файл можно скачать:', link={'href': f'/export/{cmd["format"]}', 'label': 'Скачать дашборд в HTML' if cmd['format'] == 'html' else 'Скачать таблицу в Excel'})]

    if intent == 'show_table':
        return [table_message(state, table, dim=cmd.get('dim'), limit=50)]

    if intent == 'summary':
        return [text(summary(state, table))]

    if intent == 'stats':
        return [stats_message(state, table, cmd)]

    if intent == 'add_column':
        push_undo(sess)
        comp = cmd['computation']
        existing = [c for c in state['computations'] if c.get('title') == comp['title']]
        if existing and comp['kind'] != 'formula':
            comp['id'] = existing[0]['id']
            state['computations'] = [c for c in state['computations'] if c['id'] != comp['id']]
        used = {c['id'] for c in state['computations']}
        while comp['id'] in used:
            comp['id'] = 'c' + str(int(comp['id'][1:]) + 1)
        state['computations'].append(comp)
        how = describe_computation(comp, state)
        state['history'].append(f'Добавлена колонка «{comp["title"]}»: {how}')
        msgs = [text(f'Добавил колонку «{comp["title"]}» = {how}. Она появилась в таблице и в переключателе «Метрика».')]
        if cmd.get('then_top'):
            top_chart = find_chart(state, 'top_hbar')
            if top_chart is not None:
                state['charts'][top_chart].update({'sort_by': comp['id'], 'metric': comp['id'], 'top': cmd['then_top'], 'ascending': False})
                msgs.append(text(f'График {top_chart + 1} отсортирован по новой колонке, показан ТОП-{cmd["then_top"]}.'))
        msgs.append(table_message(state, table, highlight=comp['id'], limit=15))
        msgs.append(dashboard_message(state, table, send_rows=False))
        return msgs

    if intent == 'chart_edit':
        push_undo(sess)
        idx = cmd.get('chart')
        if idx is None:
            idx = (find_chart(state, 'top_hbar') if cmd.get('sort_by') or cmd.get('top') else len(state['charts']) - 1)
            idx = 0 if idx is None else idx
        else:
            idx -= 1
        if idx < 0 or idx >= len(state['charts']):
            return [text(f'На дашборде {len(state["charts"])} графика, графика №{idx + 1} нет.')]
        chart = state['charts'][idx]
        changes = []
        if cmd.get('sort_by'):
            chart['sort_by'] = cmd['sort_by']
            chart['ascending'] = cmd.get('ascending', False)
            if chart['type'] in ('top_hbar',):
                chart['metric'] = cmd['sort_by']
            changes.append('сортировка по «' + metric_title(cmd['sort_by'], state['computations']) + '»')
        if cmd.get('metric'):
            chart['metric'] = cmd['metric']
            if chart['type'] == 'period_bars':
                chart['metrics'] = [cmd['metric']]
            changes.append('метрика «' + metric_title(cmd['metric'], state['computations']) + '»')
        if cmd.get('top'):
            chart['top'] = cmd['top']
            changes.append(f'ТОП-{cmd["top"]}')
        if not changes:
            return [text('Что поменять в графике? Например: «отсортируй третий график по проценту выполнения».')]
        state['history'].append(f'График {idx + 1}: ' + ', '.join(changes))
        return [text(f'Перестроил график {idx + 1} «{chart["title"]}»: ' + ', '.join(changes) + '.'),
                dashboard_message(state, table, send_rows=False)]

    if intent == 'set_ui':
        ui = cmd['ui']
        if ui.get('ack') and len(ui) == 1:
            return [text(ui['ack']), dashboard_message(state, table, send_rows=False)]
        push_undo(sess)
        notes = []
        if ui.get('reset_filters'):
            state['ui']['filters'] = {}
            notes.append('фильтры сброшены')
        for dim, values in ui.get('filters', {}).items():
            if dim in state['filter_dims'] or dim in ('region', 'category'):
                state['ui']['filters'][dim] = values
                notes.append(f'{DIMENSIONS[dim]["title"].lower()}: ' + ', '.join(values))
        if ui.get('dim') and ui['dim'] in state['dim_options']:
            state['ui']['dim'] = ui['dim']
            notes.append(f'разрез «{DIMENSIONS[ui["dim"]]["title"].lower()}»')
        if ui.get('grain'):
            state['ui']['grain'] = ui['grain']
            notes.append({'month': 'по месяцам', 'quarter': 'по кварталам', 'year': 'по годам'}[ui['grain']])
        if ui.get('ack'):
            notes.append(ui['ack'])
        state['history'].append('Интерфейс: ' + ', '.join(notes))
        return [text('Готово: ' + ', '.join(notes) + '. Графики и итоговые цифры пересчитаны.'),
                dashboard_message(state, table, send_rows=False)]

    return [text('Не понял запрос. Попробуй так:', buttons=EXAMPLES[:3])]


def find_chart(state, ctype):
    for i, c in enumerate(state['charts']):
        if c['type'] == ctype:
            return i
    return None


def describe_computation(comp, state):
    titles = {k: v['short'].lower() for k, v in MEASURES.items()}
    for c in state['computations']:
        titles[c['id']] = c['title'].lower()
    if comp['kind'] == 'formula':
        return expr_text(comp['expr'], titles)
    metric = titles.get(comp.get('metric', 'fact'), 'факт')
    if comp['kind'] == 'share':
        return f'{metric} ÷ итог по всем строкам × 100'
    if comp['kind'] == 'cumsum':
        return f'нарастающая сумма «{metric}» по периодам'
    if comp['kind'] == 'pct_change':
        return f'изменение «{metric}» к ' + ('тому же месяцу прошлого года' if comp.get('lag') == 12 else 'предыдущему периоду') + ', %'
    if comp['kind'] == 'rank':
        return f'место по «{metric}»'
    return comp['kind']


def summary(state, table):
    df = filtered_frame(state, table)
    if df.empty:
        return 'С текущими фильтрами данных нет.'
    if state['kpi'] == 'discounts':
        total, fact = df['discount'].sum(), df['fact'].sum()
        by = df[df['reason'] != 'Без скидки'].groupby('reason')['discount'].sum().sort_values(ascending=False)
        top = by.index[0] if len(by) else '—'
        return (f'Скидки за период {money(total)}, это {total / fact * 100:.1f}% продаж. '
                f'Главная причина — «{top}» ({by.iloc[0] / total * 100:.0f}% суммы скидок).')
    plan, fact = df['plan'].sum(), df['fact'].sum()
    dim = state['ui']['dim'] if state['ui']['dim'] in df.columns and state['ui']['dim'] != 'period' else 'region'
    g = df.groupby(dim)[['plan', 'fact']].sum()
    g = g[g['plan'] > 0]
    g['exec'] = g['fact'] / g['plan'] * 100
    best, worst = g['exec'].idxmax(), g['exec'].idxmin()
    prev = filtered_frame(state, table, current_only=False)
    r = state['ui']['range']
    prev = prev[(prev['period'] >= month_add(r['start'], -12)) & (prev['period'] <= month_add(r['end'], -12))]
    yoy = (fact / prev['fact'].sum() - 1) * 100 if prev['fact'].sum() else None
    gap = 'отставание ' + money(plan - fact) if fact < plan else 'перевыполнение на ' + money(fact - plan)
    parts = [f'План выполнен на {fact / plan * 100:.0f}%, факт {money(fact)} при плане {money(plan)}, {gap}.']
    parts.append(f'Лучше всех {DIMENSIONS[dim]["title"].lower()} «{best}» ({g.loc[best, "exec"]:.0f}%), хуже всех «{worst}» ({g.loc[worst, "exec"]:.0f}%).')
    if yoy is not None:
        parts.append(f'К тому же периоду прошлого года продажи {"выросли" if yoy >= 0 else "снизились"} на {abs(yoy):.0f}%.')
    under = (g['exec'] < 100).sum()
    parts.append(f'Ниже плана {under} из {len(g)}.')
    return ' '.join(parts)


def stats_message(state, table, cmd):
    df = filtered_frame(state, table)
    unit = 'outlet' if 'outlet' in df.columns else 'client'
    group = cmd['group'] if cmd['group'] in df.columns else 'region'
    per_unit = df.groupby([group, unit])[cmd['metric']].sum().reset_index()
    stat_names = {'mean': 'Среднее', 'median': 'Медиана', 'min': 'Минимум', 'max': 'Максимум'}
    g = per_unit.groupby(group)[cmd['metric']].agg(['mean', 'median', 'min', 'max']).reset_index().sort_values(cmd['stat'], ascending=False)
    cols = [group, 'mean', 'median', 'min', 'max']
    rows = [[r[group]] + [round(float(r[c]), 2) for c in cols[1:]] for _, r in g.iterrows()]
    return {'type': 'table', 'columns': [DIMENSIONS[group]['title']] + [stat_names[c] + ', ₽' for c in cols[1:]], 'keys': cols,
            'rows': rows, 'caption': f'{MEASURES[cmd["metric"]]["short"]} на одну {"торговую точку" if unit == "outlet" else "клиента"} по группе «{DIMENSIONS[group]["title"]}»',
            'total_rows': len(rows), 'flat_rows': len(df), 'highlight': cmd['stat']}


def export_frames(state, table):
    df = filtered_frame(state, table)
    agg = computed_frame(df, state['ui']['dim'] if state['ui']['dim'] in df.columns else 'region', state['computations'])
    by_period = computed_frame(df, 'period', state['computations'])
    titles = {m['id']: m['title'] for m in all_metrics(state['computations'])}
    titles.update({k: v['title'] for k, v in DIMENSIONS.items()})
    return [('По разрезу', agg.rename(columns=titles)), ('По периодам', by_period.rename(columns=titles)),
            ('Единая таблица', df.rename(columns=titles))]
