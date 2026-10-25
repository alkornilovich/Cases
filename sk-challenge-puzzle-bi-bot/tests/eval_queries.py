"""Проверка точности разбора: все запросы из приложения к кейсу Puzzle RPA.

Для каждого запроса задан правильный ответ: намерение и ключевые параметры.
Запуск:  python -m tests.eval_queries
"""
import sys
from app import bot, nlu

bot.init()
CTX_EMPTY = {'has_dashboard': False, 'computations': [], 'data_end': bot.DATA['end'], 'data_start': bot.DATA['start'], 'lookups': bot.DATA['lookups']}
CTX_DASH = dict(CTX_EMPTY, has_dashboard=True, computations=[{'id': 'c1', 'kind': 'formula', 'title': 'Процент выполнения плана, %'},
                                                             {'id': 'c2', 'kind': 'pct_change', 'title': 'Динамика к прошлому периоду, %'}])

# (запрос, есть ли открытый дашборд, проверка)
CASES = [
    # запросы на данные и визуализацию
    ('Покажи план-факт продаж по регионам за последний квартал', False, lambda c: c['intent'] == 'dashboard' and c['kind'] == 'planfact' and c['dims'][0] == 'region' and c['period'][0] == '2026-07'),
    ('Собери дашборд по продажам: динамика, структура, ТОП точек, выполнение плана', False, lambda c: c['intent'] == 'dashboard' and c['kind'] == 'full'),
    ('Покажи по клиенту Сибирский Продукт за последние 3 года, какие скидки делались и почему', False, lambda c: c['intent'] == 'dashboard' and c['kind'] == 'discounts' and c['filters'].get('client') and c['period'][0] == '2023-10'),
    ('Сравни продажи по торговым точкам за год, выдели отстающих', False, lambda c: c['intent'] == 'dashboard' and c['kind'] == 'compare' and 'outlet' in c['dims']),
    ('Покажи структуру продаж по продуктам за последний месяц', False, lambda c: c['intent'] == 'dashboard' and c['kind'] == 'structure' and c['dims'][0] == 'product' and c['period'][0] == '2026-09'),
    ('Собери дашборд по продажам: план-факт по регионам и торговым точкам за последний год', False, lambda c: c['intent'] == 'dashboard' and c['kind'] == 'full' and c['dims'][0] == 'region' and c['period'][0] == '2025-10'),
    ('Собери дашборд по продажам', False, lambda c: c['intent'] == 'dashboard' and c['period'] is None),
    # вычисления
    ('Добавь колонку с отклонением факта от плана', True, lambda c: c['intent'] == 'add_column' and c['computation']['kind'] == 'formula' and c['computation']['expr']['op'] == '-'),
    ('Посчитай процент выполнения плана', True, lambda c: c['intent'] == 'add_column' and 'выполнения' in c['computation']['title']),
    ('Добавь динамику к предыдущему месяцу', True, lambda c: c['intent'] == 'add_column' and c['computation']['kind'] == 'pct_change' and c['computation']['lag'] == 1),
    ('Посчитай долю каждого региона в общем объёме', True, lambda c: c['intent'] == 'add_column' and c['computation']['kind'] == 'share'),
    ('Добавь накопительный итог по месяцам', True, lambda c: c['intent'] == 'add_column' and c['computation']['kind'] == 'cumsum'),
    ('Отсортируй по проценту выполнения и покажи ТОП-10', True, lambda c: c['intent'] == 'chart_edit' and c['top'] == 10 and c['sort_by'] in ('c1', 'exec_pct')),
    ('Перестрой график с учётом новой колонки', True, lambda c: c['intent'] == 'chart_edit' and c.get('metric') == 'c2'),
    ('Факт минус план, делить на план, умножить на 100', True, lambda c: c['intent'] == 'add_column' and c['computation']['expr']['op'] == '*'),
    ('Добавь колонку с процентом выполнения плана', True, lambda c: c['intent'] == 'add_column'),
    ('Перестрой третий график — отсортируй по проценту выполнения', True, lambda c: c['intent'] == 'chart_edit' and c['chart'] == 3 and c['sort_by'] in ('c1', 'exec_pct')),
    ('Добавь вычисление динамики к прошлому месяцу', True, lambda c: c['intent'] == 'add_column' and c['computation']['kind'] == 'pct_change'),
    ('Покажи четвёртый график с учётом динамики', True, lambda c: c['intent'] == 'chart_edit' and c['chart'] == 4 and c.get('metric') == 'c2'),
    # интерактивность
    ('Добавь фильтр по региону с поиском', True, lambda c: c['intent'] == 'set_ui' and 'ack' in c['ui']),
    ('Сделай переключатель план/факт', True, lambda c: c['intent'] == 'set_ui' and 'ack' in c['ui']),
    ('Покажи итоговые цифры сверху', True, lambda c: c['intent'] == 'set_ui' and 'ack' in c['ui']),
    ('Сделай каскадный фильтр: регион → точка', True, lambda c: c['intent'] == 'set_ui' and 'ack' in c['ui']),
    ('Добавь переключатель периода: месяц/квартал/год', True, lambda c: c['intent'] == 'set_ui'),
    ('Покажи только Северо-Запад', True, lambda c: c['intent'] == 'set_ui' and c['ui']['filters'] == {'region': ['Северо-Западный']}),
    ('Добавь разбивку по кварталам', True, lambda c: c['intent'] == 'set_ui' and c['ui'].get('grain') == 'quarter'),
    ('Переключи разрез на точки', True, lambda c: c['intent'] == 'set_ui' and c['ui'].get('dim') == 'outlet'),
    # сохранение и возврат
    ('Сохрани дашборд', True, lambda c: c['intent'] == 'save' and not c['name']),
    ('Сохрани как "Продажи Q3"', True, lambda c: c['intent'] == 'save' and c['name'] == 'Продажи Q3'),
    ('Покажи мои дашборды', True, lambda c: c['intent'] == 'list'),
    ('Открой дашборд "Продажи Q3"', True, lambda c: c['intent'] == 'open' and c['name'] == 'Продажи Q3'),
    ('Переименуй дашборд в "Продажи Q3 финал"', True, lambda c: c['intent'] == 'rename' and c['name'] == 'Продажи Q3 финал'),
    ('Удали дашборд "Старый отчёт"', True, lambda c: c['intent'] == 'delete' and c['name'] == 'Старый отчёт'),
    ('Найди дашборд про скидки', True, lambda c: c['intent'] == 'find' and 'скидки' in c['text']),
    ('Сделай копию дашборда', True, lambda c: c['intent'] == 'copy'),
    ('Отмени последнее изменение', True, lambda c: c['intent'] == 'undo'),
    ('Скачай дашборд в HTML', True, lambda c: c['intent'] == 'export' and c['format'] == 'html'),
    ('Выгрузи таблицу в Excel', True, lambda c: c['intent'] == 'export' and c['format'] == 'xlsx'),
]

# Отложенная выборка: перефразировки, которые не использовались при настройке правил
HOLDOUT = [
    ('Нужен дашборд по выручке за 2025 год', False, lambda c: c['intent'] == 'dashboard' and c['period'][0] == '2025-01'),
    ('Как выполнялся план по категориям в третьем квартале?', False, lambda c: c['intent'] == 'dashboard' and c['dims'][:1] == ['category'] and c['period'][0] == '2026-07'),
    ('Какие точки хуже всех выполняют план за последние 6 месяцев', False, lambda c: c['intent'] == 'dashboard' and c['kind'] == 'compare' and 'outlet' in c['dims'] and c['period'][0] == '2026-04'),
    ('Построй график продаж по месяцам в Уральском регионе за год', False, lambda c: c['intent'] == 'dashboard' and c['filters'].get('region') == ['Уральский']),
    ('Дай структуру скидок по причинам за последний квартал', False, lambda c: c['intent'] == 'dashboard' and c['kind'] in ('discounts', 'structure') and 'reason' in c['dims']),
    ('Покажи продажи супермаркетов по регионам за год', False, lambda c: c['intent'] == 'dashboard' and c['filters'].get('outlet_type') == ['Супермаркет']),
    ('Выведи план и факт по молочной продукции за 2026', False, lambda c: c['intent'] == 'dashboard' and c['filters'].get('category') == ['Молочная продукция'] and c['period'][0] == '2026-01'),
    ('Оставь только Сибирь', True, lambda c: c['intent'] == 'set_ui' and c['ui']['filters'] == {'region': ['Сибирский']}),
    ('Хочу видеть по годам', True, lambda c: c['intent'] == 'set_ui' and c['ui'].get('grain') == 'year'),
    ('Рассчитай средний чек', True, lambda c: c['intent'] == 'add_column' and c['computation']['expr']['b'] == {'col': 'deals'}),
    ('Добавь отклонение в процентах', True, lambda c: c['intent'] == 'add_column' and c['computation']['unit'] == '%'),
    ('Посчитай изменение год к году', True, lambda c: c['intent'] == 'add_column' and c['computation'].get('lag') == 12),
    ('Покажи первый график по кварталам', True, lambda c: c['intent'] in ('set_ui', 'chart_edit')),
    ('Отсортируй второй график по отклонению', True, lambda c: c['intent'] == 'chart_edit' and c['chart'] == 2 and c['sort_by'] == 'dev'),
    ('Сохрани это как «Отчет для директора»', True, lambda c: c['intent'] == 'save' and c['name'] == 'Отчет для директора'),
    ('Какие у меня есть сохраненные дашборды?', True, lambda c: c['intent'] == 'list'),
    ('Верни как было', True, lambda c: c['intent'] == 'undo'),
    ('Сбрось фильтры', True, lambda c: c['intent'] == 'set_ui' and c['ui'].get('reset_filters')),
    ('Какие выводы по дашборду?', True, lambda c: c['intent'] == 'summary'),
    ('Покажи таблицу по категориям', True, lambda c: c['intent'] == 'show_table' and c['dim'] == 'category'),
]

# Слепая выборка: написана после всех правок правил, правила под нее не меняли.
BLIND = [
    ('Сделай отчет по продажам бытовой химии за прошлый квартал', False, lambda c: c['intent'] == 'dashboard' and c['filters'].get('category') == ['Бытовая химия'] and c['period'][0] == '2026-07'),
    ('Сколько продали в Южном регионе за последний месяц', False, lambda c: c['intent'] == 'dashboard' and c['filters'].get('region') == ['Южный'] and c['period'][0] == '2026-09'),
    ('Рейтинг регионов по выполнению плана за 2025', False, lambda c: c['intent'] == 'dashboard' and c['dims'][:1] == ['region'] and c['period'][0] == '2025-01'),
    ('Покажи скидки по сегментам клиентов за год', False, lambda c: c['intent'] == 'dashboard' and 'segment' in c['dims']),
    ('Дашборд по гипермаркетам за весь период', False, lambda c: c['intent'] == 'dashboard' and c['filters'].get('outlet_type') == ['Гипермаркет'] and c['period'][0] == '2023-01'),
    ('Убери фильтры', True, lambda c: c['intent'] == 'set_ui' and c['ui'].get('reset_filters')),
    ('Покажи только Дальний Восток и Сибирь', True, lambda c: c['intent'] == 'set_ui' and sorted(c['ui']['filters'].get('region', [])) == ['Дальневосточный', 'Сибирский']),
    ('Переключи на категории', True, lambda c: c['intent'] == 'set_ui' and c['ui'].get('dim') == 'category'),
    ('Добавь колонку план минус факт', True, lambda c: c['intent'] == 'add_column' and c['computation']['expr'] == {'op': '-', 'a': {'col': 'plan'}, 'b': {'col': 'fact'}}),
    ('Посчитай долю скидок в продажах', True, lambda c: c['intent'] == 'add_column' and c['computation']['expr']['a']['a'] == {'col': 'discount'}),
    ('Покажи на третьем графике топ-5', True, lambda c: c['intent'] == 'chart_edit' and c['chart'] == 3 and c['top'] == 5),
    ('Отсортируй по возрастанию выполнения плана', True, lambda c: c['intent'] == 'chart_edit' and c['ascending'] is True),
    ('Запомни этот дашборд как Регионы 2026', True, lambda c: c['intent'] == 'save'),
    ('Открой Регионы 2026', True, lambda c: c['intent'] == 'open' and 'Регионы 2026' in c['name']),
    ('Удали колонку, которую добавил последней', True, lambda c: c['intent'] == 'undo'),
]


def run(cases):
    ok = 0
    for text, with_dash, check in cases:
        cmd = nlu.parse(text, CTX_DASH if with_dash else CTX_EMPTY)
        try:
            good = bool(check(cmd))
        except Exception:
            good = False
        ok += good
        print(('OK   ' if good else 'FAIL ') + text + ('' if good else f'  ->  {cmd}'))
    return ok


def main():
    a = run(CASES)
    print(f'\nЗапросы из кейса: {a} из {len(CASES)} ({a / len(CASES) * 100:.0f}%)\n')
    b = run(HOLDOUT)
    print(f'\nОтложенная выборка: {b} из {len(HOLDOUT)} ({b / len(HOLDOUT) * 100:.0f}%)')
    c = run(BLIND)
    print(f'\nСлепая выборка: {c} из {len(BLIND)} ({c / len(BLIND) * 100:.0f}%)')
    return a == len(CASES)


if __name__ == '__main__':
    sys.exit(0 if main() else 1)
