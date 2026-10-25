"""Вычисления на стороне бота после выгрузки данных.

Формула хранится как маленькое дерево из JSON: {'op': '/', 'a': {'col': 'fact'}, 'b': {'col': 'plan'}}.
Дерево вычисляется здесь в pandas и в браузере тем же алгоритмом. Никакого eval и exec:
допустимы только четыре действия, числа и имена колонок из таблицы.
"""
import re
import numpy as np
import pandas as pd

from .catalog import MEASURES, BUILTIN_FORMULAS

OPS = ['+', '-', '*', '/']

WORD_COLUMNS = [
    ('fact', ['факт', 'продаж', 'выручк']),
    ('plan', ['план']),
    ('discount', ['скидк']),
    ('qty', ['количеств', 'штук']),
    ('deals', ['сделк', 'сделок', 'заказ']),
]

WORD_OPS = [
    ('-', ['минус', 'вычесть', 'отнять']),
    ('+', ['плюс', 'прибавить', 'сложить']),
    ('*', ['умножить на', 'умножить', 'умножь на', 'умножь', 'times']),
    ('/', ['делить на', 'разделить на', 'поделить на', 'делить', 'раздели на']),
]


def eval_expr(node, df):
    """Вычисляет дерево формулы на колонках DataFrame."""
    if 'num' in node:
        return float(node['num'])
    if 'col' in node:
        return df[node['col']].astype(float)
    a = eval_expr(node['a'], df)
    b = eval_expr(node['b'], df)
    if node['op'] == '+':
        return a + b
    if node['op'] == '-':
        return a - b
    if node['op'] == '*':
        return a * b
    if node['op'] == '/':
        if isinstance(b, pd.Series):
            b = b.replace(0, np.nan)
        elif b == 0:
            return a * np.nan
        return a / b
    raise ValueError('Недопустимая операция')


def expr_columns(node):
    if 'col' in node:
        return [node['col']]
    if 'num' in node:
        return []
    return expr_columns(node['a']) + expr_columns(node['b'])


def expr_text(node, titles):
    if 'num' in node:
        return ('%g' % node['num']).replace('.', ',')
    if 'col' in node:
        return titles.get(node['col'], node['col'])
    left, right = expr_text(node['a'], titles), expr_text(node['b'], titles)
    if node['op'] in '*/':
        if 'op' in node['a'] and node['a']['op'] in '+-':
            left = '(' + left + ')'
        if 'op' in node['b']:
            right = '(' + right + ')'
    return f"{left} {node['op'].replace('*', '×').replace('/', '÷')} {right}"


def parse_word_formula(text, known_columns):
    """«факт минус план, делить на план, умножить на 100» -> дерево.
    Операции применяются по порядку слева направо, как их произносит человек."""
    t = text.lower().replace('ё', 'е')
    t = re.sub(r'(посчитай|добавь|колонк[ауи]|вычисли|формул[ау]|сделай|с формулой|по формуле|как|рассчитай)', ' ', t)
    tokens = []
    pos = 0
    pattern_parts = []
    for col, words in WORD_COLUMNS:
        for w in words:
            pattern_parts.append((w, 'col', col))
    for c in known_columns:
        pattern_parts.append((c['title'].lower().split(',')[0], 'col', c['id']))
    for op, words in WORD_OPS:
        for w in words:
            pattern_parts.append((w, 'op', op))
    for sym in ['+', '-', '*', '/', '×', '÷']:
        pattern_parts.append((sym, 'op', {'×': '*', '÷': '/'}.get(sym, sym)))
    pattern_parts.sort(key=lambda p: -len(p[0]))
    while pos < len(t):
        if t[pos].isdigit():
            num = re.match(r'\d+([.,]\d+)?', t[pos:]).group(0)
            tokens.append(('num', float(num.replace(',', '.'))))
            pos += len(num)
            continue
        matched = False
        for word, kind, value in pattern_parts:
            if t.startswith(word, pos):
                tokens.append((kind, value))
                pos += len(word)
                while pos < len(t) and t[pos].isalpha():
                    pos += 1
                matched = True
                break
        if not matched:
            pos += 1
    # собираем слева направо
    node = None
    op = None
    for kind, value in tokens:
        if kind == 'op':
            op = value
            continue
        leaf = {'num': value} if kind == 'num' else {'col': value}
        if node is None:
            node = leaf
        elif op:
            node = {'op': op, 'a': node, 'b': leaf}
            op = None
    if node is None or 'op' not in node:
        return None
    return node


def computed_frame(df, dim, computations, grain_dims=None):
    """Агрегирует единую таблицу по разрезу и добавляет все вычисляемые колонки."""
    measures = [m for m in MEASURES if m in df.columns]
    group = [dim] if dim else []
    if dim == 'period' or not dim:
        g = df.groupby('period', as_index=False)[measures].sum() if 'period' in df.columns else df[measures].sum().to_frame().T
    else:
        g = df.groupby(group, as_index=False)[measures].sum()
    for f in BUILTIN_FORMULAS:
        if all(c in g.columns for c in expr_columns(f['expr'])):
            g[f['id']] = eval_expr(f['expr'], g).round(2)
    for c in computations:
        g = apply_computation(g, c, dim)
    return g


def apply_computation(g, c, dim):
    if c['kind'] == 'formula':
        if all(col in g.columns for col in expr_columns(c['expr'])):
            g[c['id']] = eval_expr(c['expr'], g).round(2)
        return g
    metric = c.get('metric', 'fact')
    if metric not in g.columns:
        return g
    if c['kind'] == 'share':
        total = g[metric].sum()
        g[c['id']] = (g[metric] / total * 100).round(2) if total else np.nan
    elif c['kind'] == 'cumsum':
        g[c['id']] = g[metric].cumsum().round(2) if dim == 'period' else np.nan
    elif c['kind'] == 'pct_change':
        lag = c.get('lag', 1)
        g[c['id']] = (g[metric].pct_change(periods=lag) * 100).round(2) if dim == 'period' else np.nan
    elif c['kind'] == 'rank':
        g[c['id']] = g[metric].rank(ascending=False, method='min')
    return g
