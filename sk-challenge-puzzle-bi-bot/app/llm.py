"""Бесплатная LLM через OpenAI-совместимый API.

По умолчанию — локальная Ollama (бесплатно, без ключа, данные не уходят из компании):
    ollama pull qwen2.5:7b
Можно указать любой совместимый сервис с бесплатным тарифом, например Groq:
    LLM_BASE_URL=https://api.groq.com/openai/v1  LLM_MODEL=llama-3.1-8b-instant  LLM_API_KEY=...

Модель не пишет SQL и код. Она только переводит фразу в команду из каталога,
а validate() отбрасывает все, чего в каталоге нет.
"""
import json
import os
import httpx

from .catalog import DIMENSIONS, MEASURES, REGION_ALIASES, CATEGORY_ALIASES

BASE_URL = os.environ.get('LLM_BASE_URL', 'http://localhost:11434/v1')
MODEL = os.environ.get('LLM_MODEL', 'qwen2.5:7b')
API_KEY = os.environ.get('LLM_API_KEY', 'ollama')
MODE = os.environ.get('LLM_MODE', 'fallback')  # fallback: правила, затем LLM; off: только правила; primary: сначала LLM

INTENTS = ['dashboard', 'show_table', 'add_column', 'chart_edit', 'set_ui', 'save', 'list', 'open', 'rename',
           'delete', 'find', 'copy', 'undo', 'export', 'summary', 'stats', 'help']

SYSTEM = f"""Ты переводишь запрос менеджера к BI чат-боту в JSON-команду. Отвечай только JSON без пояснений.
Поле intent — одно из: {', '.join(INTENTS)}.
Разрезы (dims): {', '.join(f'{k} ({v["title"]})' for k, v in DIMENSIONS.items())}.
Метрики: {', '.join(f'{k} ({v["title"]})' for k, v in MEASURES.items())}, exec_pct (выполнение плана, %), dev (отклонение, ₽).
Регионы: {', '.join(REGION_ALIASES)}. Категории: {', '.join(CATEGORY_ALIASES)}.
Форматы:
dashboard: {{"intent":"dashboard","kind":"full|planfact|structure|compare|discounts","period_text":"последний год","dims":["region"],"filters":{{"region":["Уральский"]}}}}
add_column: {{"intent":"add_column","formula_text":"факт минус план делить на план умножить на 100"}}
chart_edit: {{"intent":"chart_edit","chart":3,"sort_by":"exec_pct","top":10}}
set_ui: {{"intent":"set_ui","ui":{{"filters":{{"region":["Центральный"]}},"dim":"outlet","grain":"quarter"}}}}
save/open/rename/delete/find: {{"intent":"save","name":"Продажи Q3"}}
"""


def available():
    if MODE == 'off':
        return False
    try:
        r = httpx.get(BASE_URL.rstrip('/') + '/models', headers={'Authorization': f'Bearer {API_KEY}'}, timeout=1.5)
        return r.status_code == 200
    except Exception:
        return False


def ask(text, context_hint=''):
    payload = {
        'model': MODEL,
        'temperature': 0,
        'response_format': {'type': 'json_object'},
        'messages': [{'role': 'system', 'content': SYSTEM + context_hint}, {'role': 'user', 'content': text}],
    }
    try:
        r = httpx.post(BASE_URL.rstrip('/') + '/chat/completions', json=payload,
                       headers={'Authorization': f'Bearer {API_KEY}'}, timeout=30)
        content = r.json()['choices'][0]['message']['content']
        return validate(json.loads(content))
    except Exception:
        return None


def validate(cmd):
    """Пропускаем только то, что есть в каталоге."""
    if not isinstance(cmd, dict) or cmd.get('intent') not in INTENTS:
        return None
    if 'dims' in cmd:
        cmd['dims'] = [d for d in cmd['dims'] if d in DIMENSIONS]
    allowed = {'region': list(REGION_ALIASES), 'category': list(CATEGORY_ALIASES)}
    for holder in [cmd, cmd.get('ui', {})]:
        if 'filters' in holder:
            clean = {}
            for dim, values in holder['filters'].items():
                if dim in allowed:
                    vals = [v for v in values if v in allowed[dim]]
                    if vals:
                        clean[dim] = vals
            holder['filters'] = clean
    for key in ['sort_by', 'metric']:
        if key in cmd and cmd[key] not in list(MEASURES) + ['exec_pct', 'dev'] and not str(cmd[key]).startswith('c'):
            cmd.pop(key)
    return cmd
