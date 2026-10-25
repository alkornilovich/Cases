"""Проверки безопасности: база только на чтение, SQL без пользовательского текста, формулы без кода.
Запуск:  python -m tests.test_security
"""
from app import db, bot, nlu
from app.compute import eval_expr, parse_word_formula
import pandas as pd

bot.init()
results = []


def check(name, ok):
    results.append(ok)
    print(('OK   ' if ok else 'FAIL ') + name)


def blocked(sql):
    try:
        db.run_select(sql, [])
        return False
    except Exception:
        return True


check('запрет изменения данных', blocked('DELETE FROM sales'))
check('запрет DROP', blocked('DROP TABLE sales'))
check('запрет чтения файлов с диска', blocked("SELECT * FROM read_csv_auto('/etc/passwd')"))
check('запрет обращения к сети', blocked("SELECT * FROM read_csv_auto('https://example.com/a.csv')"))
try:
    db.connect()[1].execute('SET enable_external_access = true')
    check('настройки безопасности заблокированы', False)
except Exception:
    check('настройки безопасности заблокированы', True)

evil = "Покажи продажи'); DROP TABLE sales; -- за последний год"
cmd = nlu.parse(evil, {'has_dashboard': False, 'computations': [], 'data_end': bot.DATA['end'], 'data_start': bot.DATA['start'], 'lookups': bot.DATA['lookups']})
spec = {'grain': 'sales', 'dims': ['period', 'region'], 'start': '2025-10', 'end': '2026-09', 'filters': {'region': ["x'); DROP TABLE sales; --"]}}
sql, params, _ = db.build_sql(spec)
check('текст пользователя не попадает в SQL, значения идут параметрами', 'DROP' not in sql and "x'); DROP TABLE sales; --" in params)
check('после попытки инъекции таблица на месте', len(db.run_select('SELECT count(*) AS n FROM sales', [])) == 1)

df = pd.DataFrame({'fact': [10.0, 0.0], 'plan': [0.0, 5.0]})
check('деление на ноль не ломает вычисления', eval_expr({'op': '/', 'a': {'col': 'fact'}, 'b': {'col': 'plan'}}, df).isna().iloc[0])
try:
    eval_expr({'op': '**', 'a': {'num': 2}, 'b': {'num': 3}}, df)
    check('недопустимая операция в формуле отклонена', False)
except ValueError:
    check('недопустимая операция в формуле отклонена', True)
check('из фразы с кодом формула не собирается', parse_word_formula("__import__('os').system('rm -rf /')", []) is None)

out = bot.handle('sec', 'Покажи план-факт по регионам за 2010 год')
check('пустой период: понятный ответ вместо ошибки', out[0]['type'] == 'text' and 'нет' in out[0]['text'].lower())

print(f'\n{sum(results)} из {len(results)} проверок пройдено')
