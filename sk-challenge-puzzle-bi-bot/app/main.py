"""Веб-сервер: чат, API и экспорт.

Запуск:  uvicorn app.main:app --port 8000   затем открыть http://localhost:8000
"""
import io
import json
import os

from fastapi import FastAPI, Request
from fastapi.responses import HTMLResponse, JSONResponse, StreamingResponse, Response
from fastapi.staticfiles import StaticFiles

from . import bot, store

ROOT = os.path.dirname(os.path.dirname(__file__))
STATIC = os.path.join(ROOT, 'static')

app = FastAPI(title='Puzzle BI чат-бот')
app.mount('/static', StaticFiles(directory=STATIC), name='static')
bot.init()


@app.get('/', response_class=HTMLResponse)
def index():
    with open(os.path.join(STATIC, 'index.html'), encoding='utf-8') as f:
        return f.read()


@app.get('/api/info')
def info():
    return {'data_start': bot.DATA['start'], 'data_end': bot.DATA['end'], 'llm': bot.DATA['llm'], 'examples': bot.EXAMPLES}


@app.post('/api/chat')
async def chat(request: Request):
    body = await request.json()
    sid = str(body.get('sid', 'default'))[:64]
    message = str(body.get('message', ''))[:1000]
    try:
        messages = bot.handle(sid, message, body.get('ui'))
    except Exception as e:
        messages = [{'type': 'text', 'text': f'Не получилось выполнить запрос: {e}. Попробуй переформулировать.'}]
    return JSONResponse({'messages': messages})


@app.get('/api/dashboards')
def dashboards():
    return store.all_states()


@app.get('/export/{fmt}')
def export(fmt: str, sid: str = 'default'):
    sess = bot.session(sid)
    state, table = sess['state'], sess['table']
    if not state:
        return Response('Нет открытого дашборда', status_code=404)
    name = state['name'][:60].replace('/', '-')
    if fmt == 'xlsx':
        buf = io.BytesIO()
        import pandas as pd
        with pd.ExcelWriter(buf, engine='openpyxl') as writer:
            for sheet, frame in bot.export_frames(state, table):
                frame.to_excel(writer, sheet_name=sheet, index=False)
        buf.seek(0)
        return StreamingResponse(buf, media_type='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
                                 headers={'Content-Disposition': f"attachment; filename*=UTF-8''{quote(name)}.xlsx"})
    payload = bot.dashboard_message(state, table)['payload']
    with open(os.path.join(STATIC, 'dashboard.js'), encoding='utf-8') as f:
        js = f.read()
    with open(os.path.join(STATIC, 'style.css'), encoding='utf-8') as f:
        css = f.read()
    with open(os.path.join(STATIC, 'vendor', 'plotly.min.js'), encoding='utf-8') as f:
        plotly = f.read()
    html = f"""<!doctype html><html lang="ru"><head><meta charset="utf-8"><title>{state['name']}</title>
<meta name="viewport" content="width=device-width, initial-scale=1">
<script>{plotly}</script>
<style>{css}</style></head><body class="export"><div id="dash"></div>
<script>{js}</script>
<script>renderDashboard(document.getElementById('dash'), {json.dumps(payload, ensure_ascii=False).replace('</', '<\\/')}, null);</script>
</body></html>"""
    return Response(html, media_type='text/html', headers={'Content-Disposition': f"attachment; filename*=UTF-8''{quote(name)}.html"})


def quote(s):
    from urllib.parse import quote as q
    return q(s)
