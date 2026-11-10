"""data/anchors.yaml — приблизительное положение мест без x,y: ближайший по иерархии предок с координатами
(по parent; если у предка нет x,y — место с тем же именем, у которого они есть). Только для мест, на которые ссылаются слои.
Запуск: python3 scripts/geo/build-anchors.py (из корня; PYTHONPATH=scripts)"""
import re, yaml
from layer_links import P, resolve
pl = {p['id']: p for p in P}
need = set()
for f, key in [('military', 'place'), ('fortress-dates', 'place'), ('religion', 'place'), ('hazards', 'place'), ('magic', 'place')]:
    try: need |= {r[key] for r in yaml.safe_load(open(f'data/{f}.yaml')) if r.get(key)}
    except FileNotFoundError: pass
need |= {p['id'] for p in P if p['kind'] in ('fortress', 'school', 'temple') and 'x' not in p}
OKK = {'city', 'capital', 'port', 'fortress', 'mountains', 'mine', 'ruin', 'forest', 'swamp', 'lake', 'sea', 'island', 'school', 'village'}
def anchor(pid):
    cur, hops = pl.get(pid), 0
    while cur and cur.get('parent') and hops < 4:
        par = pl.get(cur['parent'])
        if not par: return None
        if 'x' in par and par['kind'] in OKK and 'marker' not in par['id']: return par['id'], 'parent'
        r = resolve(par['name'])
        if r and r[1] == 'exact' and pl[r[0]]['kind'] in OKK: return r[0], 'parent-name'
        cur, hops = par, hops + 1
    return None
out = []
for pid in sorted(need):
    p = pl.get(pid)
    if not p or 'x' in p: continue
    a = anchor(pid)
    if a: out.append({'place': pid, 'anchor': a[0], 'via': a[1]})
open('data/anchors.yaml', 'w').write('# Приблизительная привязка мест без x,y к предку с координатами (scripts/geo/build-anchors.py). На карте — полый значок «положение приблизительное».\n' + yaml.safe_dump(out, allow_unicode=True, sort_keys=False, width=200))
print(len(need), 'нужных мест без xy:', len([i for i in need if i in pl and 'x' not in pl[i]]), 'привязано:', len(out))
