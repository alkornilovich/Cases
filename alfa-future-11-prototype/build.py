# Сборка в один файл dist/index.html: данные, движок, код и картинки внутри
import json, base64, re, os
root = os.path.dirname(os.path.abspath(__file__))
def rd(f): return open(os.path.join(root, f), encoding='utf-8').read()
bundle = json.load(open(os.path.join(root, 'data/bundle.json'), encoding='utf-8'))
for p in bundle['profiles']:
    for u in p['users']:
        u.pop('role_true_hidden', None)
    if p.get('journey_last_session'):
        p['journey_last_session'].pop('pattern_true', None)
html = rd('index.src.html')
html = html.replace('<script src="data/bundle.js"></script>', '<script>window.DATA = ' + json.dumps(bundle, ensure_ascii=False) + ';</script>')
html = html.replace('<script src="engine.js"></script>', '<script>' + rd('engine.js') + '</script>')
app = rd('app.js')
for name in ['logo_af.png', 'logo_alfa.png', 'logo_a.png']:
    uri = 'data:image/png;base64,' + base64.b64encode(open(os.path.join(root, 'assets', name), 'rb').read()).decode()
    app = app.replace('assets/' + name, uri)
    html = html.replace('assets/' + name, uri)
html = html.replace('<script src="app.js"></script>', '<script>' + app + '</script>')
os.makedirs(os.path.join(root, 'dist'), exist_ok=True)
open(os.path.join(root, 'dist/index.html'), 'w', encoding='utf-8').write(html)
print('dist/index.html', len(html) // 1024, 'KB')
