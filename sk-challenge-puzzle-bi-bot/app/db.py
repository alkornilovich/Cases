"""Доступ к данным только на чтение и сборка SQL по спецификации.

По умолчанию база — встроенная DuckDB: CSV загружаются в таблицы при старте,
после чего доступ к файлам и сети отключается настройкой
enable_external_access = false и конфигурация блокируется.
Можно подключить PostgreSQL: переменная DATABASE_URL, роль только на чтение,
транзакция READ ONLY и statement_timeout.
"""
import os
import threading
import duckdb
import pandas as pd

from .catalog import DIMENSIONS

DATA_DIR = os.path.join(os.path.dirname(os.path.dirname(__file__)), 'data')
TABLES = ['regions', 'outlets', 'products', 'clients', 'contracts', 'sales', 'sales_plan', 'discounts']
TIMEOUT_SECONDS = 15
MAX_ROWS = 200000

_conn = None
_lock = threading.Lock()


def connect():
    global _conn
    if _conn is not None:
        return _conn
    url = os.environ.get('DATABASE_URL')
    if url:
        _conn = ('postgres', url)
        return _conn
    con = duckdb.connect(':memory:')
    for name in TABLES:
        path = os.path.join(DATA_DIR, name + '.csv')
        con.execute(f"CREATE TABLE {name} AS SELECT * FROM read_csv_auto('{path}', nullstr='\\N', header=true)")
    # После загрузки: никаких файлов, сети и смены настроек
    con.execute('SET enable_external_access = false')
    con.execute('SET lock_configuration = true')
    _conn = ('duckdb', con)
    return _conn


def dialect():
    return connect()[0]


def run_select(sql, params):
    """Выполняет только SELECT, с таймаутом и лимитом строк."""
    if not sql.lstrip().upper().startswith(('SELECT', 'WITH')):
        raise ValueError('Разрешены только запросы на чтение')
    kind, con = connect()
    if kind == 'postgres':
        import psycopg
        with psycopg.connect(con) as pg:
            pg.read_only = True
            with pg.cursor() as cur:
                cur.execute(f'SET statement_timeout = {TIMEOUT_SECONDS * 1000}')
                cur.execute(sql.replace('?', '%s'), params)
                cols = [d.name for d in cur.description]
                rows = cur.fetchmany(MAX_ROWS)
        return pd.DataFrame(rows, columns=cols)
    with _lock:
        timer = threading.Timer(TIMEOUT_SECONDS, con.interrupt)
        timer.start()
        try:
            df = con.execute(sql, params).fetch_df()
        finally:
            timer.cancel()
    return df.head(MAX_ROWS)


def data_range():
    df = run_select('SELECT min(sale_date) AS a, max(sale_date) AS b FROM sales', [])
    return str(df['a'][0])[:7], str(df['b'][0])[:7]


def lookup_values():
    """Значения для фильтров и для поиска клиентов и точек по имени."""
    result = {}
    result['client'] = run_select('SELECT client_name FROM clients ORDER BY 1', [])['client_name'].tolist()
    result['outlet'] = run_select('SELECT outlet_name FROM outlets ORDER BY 1', [])['outlet_name'].tolist()
    result['product'] = run_select('SELECT product_name FROM products ORDER BY 1', [])['product_name'].tolist()
    return result


def month_add(ym, n):
    y, m = int(ym[:4]), int(ym[5:7])
    total = y * 12 + (m - 1) + n
    return '%04d-%02d' % (total // 12, total % 12 + 1)


def build_sql(spec):
    """Собирает SQL из спецификации. Имена колонок берутся только из каталога,
    значения фильтров передаются параметрами."""
    grain = spec['grain']
    dims = [d for d in spec['dims'] if grain in DIMENSIONS[d]['grain']]
    start = month_add(spec['start'], -12) if spec.get('prev') else spec['start']
    end = spec['end']
    d_from, d_to = start + '-01', month_add(end, 1) + '-01'
    pg = dialect() == 'postgres'
    month_expr = "date_trunc('month', {})" if not pg else "date_trunc('month', {})::date"
    period_sql = "to_char(m, 'YYYY-MM')" if pg else "strftime(m, '%Y-%m')"

    params = []
    if grain == 'sales':
        base = f"""
WITH disc AS (SELECT sale_id, sum(discount_amount) AS discount FROM discounts GROUP BY sale_id),
f AS (
  SELECT {month_expr.format('s.sale_date')} AS m, s.outlet_id, s.product_id,
         sum(s.amount) AS fact, sum(s.quantity) AS qty, count(*) AS deals, sum(coalesce(d.discount, 0)) AS discount
  FROM sales s LEFT JOIN disc d ON d.sale_id = s.sale_id
  WHERE s.sale_date >= ? AND s.sale_date < ?
  GROUP BY 1, 2, 3),
p AS (
  SELECT {month_expr.format('plan_month')} AS m, outlet_id, product_id, sum(plan_amount) AS plan
  FROM sales_plan WHERE plan_month >= ? AND plan_month < ?
  GROUP BY 1, 2, 3),
j AS (
  SELECT coalesce(f.m, p.m) AS m, coalesce(f.outlet_id, p.outlet_id) AS outlet_id,
         coalesce(f.product_id, p.product_id) AS product_id,
         coalesce(p.plan, 0) AS plan, coalesce(f.fact, 0) AS fact, coalesce(f.qty, 0) AS qty,
         coalesce(f.deals, 0) AS deals, coalesce(f.discount, 0) AS discount
  FROM f FULL OUTER JOIN p ON f.m = p.m AND f.outlet_id = p.outlet_id AND f.product_id = p.product_id)
SELECT {{select}}
FROM j
JOIN outlets o ON o.outlet_id = j.outlet_id
JOIN regions r ON r.region_id = o.region_id
JOIN products pr ON pr.product_id = j.product_id
"""
        params += [d_from, d_to, d_from, d_to]
        measures = ['plan', 'fact', 'qty', 'deals', 'discount']
    else:
        base = f"""
WITH disc AS (SELECT sale_id, sum(discount_amount) AS discount, min(reason) AS reason FROM discounts GROUP BY sale_id),
j AS (
  SELECT {month_expr.format('s.sale_date')} AS m, s.client_id, s.product_id,
         coalesce(d.reason, 'Без скидки') AS reason,
         sum(s.amount) AS fact, sum(s.quantity) AS qty, count(*) AS deals, sum(coalesce(d.discount, 0)) AS discount
  FROM sales s LEFT JOIN disc d ON d.sale_id = s.sale_id
  WHERE s.sale_date >= ? AND s.sale_date < ?
  GROUP BY 1, 2, 3, 4)
SELECT {{select}}
FROM j
JOIN clients c ON c.client_id = j.client_id
JOIN regions r ON r.region_id = c.region_id
JOIN products pr ON pr.product_id = j.product_id
"""
        params += [d_from, d_to]
        measures = ['fact', 'qty', 'deals', 'discount']

    select_parts, group_parts = [], []
    for d in dims:
        expr = period_sql if d == 'period' else DIMENSIONS[d]['sql']
        select_parts.append(f'{expr} AS {d}')
        group_parts.append(expr)
    for m in measures:
        select_parts.append(f'sum({m}) AS {m}')

    where = []
    for dim, values in spec.get('filters', {}).items():
        if not values or dim not in DIMENSIONS or grain not in DIMENSIONS[dim]['grain'] or dim == 'period':
            continue
        marks = ', '.join(['?'] * len(values))
        where.append(f"{DIMENSIONS[dim]['sql']} IN ({marks})")
        params += list(values)

    sql = base.replace('{select}', ',\n       '.join(select_parts))
    if where:
        sql += 'WHERE ' + ' AND '.join(where) + '\n'
    sql += 'GROUP BY ' + ', '.join(group_parts) + '\nORDER BY ' + ', '.join(group_parts)
    return sql, params, measures


def fetch_table(spec):
    sql, params, measures = build_sql(spec)
    df = run_select(sql, params)
    for m in measures:
        df[m] = df[m].astype(float).round(2)
    return df, sql, measures
