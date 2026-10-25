"""Сохранение дашбордов: состояние и единая таблица в JSON-файлах.

Состояние — это запрос, спецификация данных, список вычислений, настройки графиков,
фильтров и переключателей. Таблица хранится рядом, поэтому открытый дашборд
восстанавливается в том же виде без нового запроса к базе. Каждое сохранение
добавляет версию, к любой можно откатиться.
"""
import copy
import datetime
import json
import os
import uuid

DIR = os.path.join(os.path.dirname(os.path.dirname(__file__)), 'dashboards')
os.makedirs(DIR, exist_ok=True)


def now():
    return datetime.datetime.now().strftime('%Y-%m-%d %H:%M')


def path(dash_id, suffix='json'):
    return os.path.join(DIR, f'{dash_id}.{suffix}')


def save(state, table, as_new=False):
    state = copy.deepcopy(state)
    if as_new or not state.get('id'):
        state['id'] = uuid.uuid4().hex[:8]
        state['created'] = now()
        state['versions'] = []
    state['updated'] = now()
    snapshot = {k: v for k, v in state.items() if k != 'versions'}
    state.setdefault('versions', []).append({'at': state['updated'], 'state': snapshot})
    state['versions'] = state['versions'][-20:]
    with open(path(state['id']), 'w', encoding='utf-8') as f:
        json.dump(state, f, ensure_ascii=False)
    with open(path(state['id'], 'table.json'), 'w', encoding='utf-8') as f:
        json.dump(table, f, ensure_ascii=False)
    return state


def load(dash_id):
    with open(path(dash_id), encoding='utf-8') as f:
        state = json.load(f)
    with open(path(dash_id, 'table.json'), encoding='utf-8') as f:
        table = json.load(f)
    return state, table


def all_states():
    items = []
    for name in os.listdir(DIR):
        if name.endswith('.json') and not name.endswith('.table.json'):
            with open(os.path.join(DIR, name), encoding='utf-8') as f:
                s = json.load(f)
            items.append({'id': s['id'], 'name': s['name'], 'query': s.get('query', ''), 'created': s.get('created', ''),
                          'updated': s.get('updated', ''), 'versions': len(s.get('versions', []))})
    items.sort(key=lambda x: x['updated'], reverse=True)
    return items


def find(text):
    t = (text or '').lower().replace('ё', 'е')
    words = [w for w in t.split() if len(w) > 2]
    result = []
    for item in all_states():
        hay = (item['name'] + ' ' + item['query']).lower().replace('ё', 'е')
        if t and (t in hay or (words and all(w[:5] in hay for w in words))):
            result.append(item)
    return result


def by_name(name):
    if not name:
        return None
    items = all_states()
    for item in items:
        if item['name'].lower() == name.lower().strip():
            return item
    found = find(name)
    return found[0] if found else None


def delete(dash_id):
    for suffix in ['json', 'table.json']:
        if os.path.exists(path(dash_id, suffix)):
            os.remove(path(dash_id, suffix))


def rename(dash_id, new_name):
    state, table = load(dash_id)
    state['name'] = new_name
    return save(state, table)
