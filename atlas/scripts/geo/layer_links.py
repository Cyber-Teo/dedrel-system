"""Привязка организаций и людей к местам с координатами по тексту hq / based_in.
Результат: data/guild-hq.yaml, data/people-loc.yaml (список {ref, place, match, text}). Запуск: python3 scripts/geo/layer_links.py [--stat]"""
import re, sys, yaml

P = yaml.safe_load(open('data/places.yaml'))
O = yaml.safe_load(open('data/orgs.yaml'))
H = yaml.safe_load(open('data/people.yaml'))
norm = lambda s: re.sub(r'[^\w ]', ' ', s.lower().replace('ё', 'е')).split()
xy = [p for p in P if 'x' in p]
byname = {}
for p in xy:
    for n in [p['name']] + p.get('aliases', []) + p['name'].split(';') + [re.sub(r'\(.*?\)', '', p['name'])]:
        k = ' '.join(norm(n))
        if k and k not in byname: byname[k] = p['id']
# обе стороны без значков «типов» — частые слова, которые не должны давать совпадение сами по себе
STOP = set('около город префектура река остров')

def resolve(text):
    if not text: return None
    t = text.strip()
    for part in [t] + [s.strip() for s in re.split(r'[,;(]', t)][::-1]:
        k = ' '.join(norm(part))
        if k in byname: return byname[k], 'exact'
    t = re.sub(r'^(префектура|острова|район|подземелья|около|драконий квартал)\s+', '', t, flags=re.I)
    words = norm(t)
    best = None
    for k, pid in byname.items():
        kw = k.split()
        if len(k) < 4 or k in STOP: continue
        # слово места как приставка слова текста: «Иллиоре» ~ «Иллиор» (падежи)
        for i in range(len(words) - len(kw) + 1):
            if all(len(a) >= 4 and (a.startswith(b[:max(4, len(b) - 2)]) and abs(len(a) - len(b)) <= 3) for a, b in zip(words[i:i+len(kw)], kw)):
                if best is None or (i, -len(k)) < best[0]: best = ((i, -len(k)), pid)
    return (best[1], 'contains') if best else None

def is_guild(o):
    return bool(re.search(r'гильд|guild', o.get('kind') or '', re.I)) or (
        any(s.startswith('guilds/') and s != 'guilds/index' for s in o['sources']) and not re.search(r'знать|госорган', o.get('kind') or ''))

def run(items, field, flt=lambda x: True):
    out, miss = [], []
    for it in items:
        if not flt(it) or not it.get(field): continue
        r = resolve(it[field])
        (out if r else miss).append({'ref': it['id'], 'place': r[0] if r else None, 'match': r[1] if r else None, 'text': it[field]})
    return out, miss

def main():
    g, gm = run(O, 'hq', is_guild)
    pe, pm = run(H, 'based_in')
    print(f'гильдий с hq: {len(g)+len(gm)}, привязано {len(g)}; людей с based_in: {len(pe)+len(pm)}, привязано {len(pe)}')
    if '--stat' in sys.argv:
        for m in gm[:40]: print('G-', m['text'])
        for m in pm[:40]: print('P-', m['text'])
        sys.exit()
    dump = lambda path, rows, head: open(path, 'w').write(head + yaml.safe_dump([{k: r[k] for k in ('ref', 'place', 'match', 'text')} for r in rows], allow_unicode=True, sort_keys=False, width=200))
    dump('data/guild-hq.yaml', g, '# Привязка штабов гильдий к местам с координатами (scripts/geo/layer_links.py). match: exact — имя места совпало целиком, contains — найдено в тексте hq.\n')
    dump('data/people-loc.yaml', pe, '# Привязка персонажей к местам с координатами по based_in (scripts/geo/layer_links.py).\n')

if __name__ == '__main__':
    main()
