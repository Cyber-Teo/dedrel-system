# Склейка дублей персонажей: python3 scripts/import/dedup-people.py [--dry]. Группы заданы вручную по имени/роли/годам/вики.
import yaml, re, sys, glob, collections
G = {
 'person:yorik_maldred_avgust_tarkviniy': ['person:yorik', 'person:imperator_yorik'],
 'person:maldred_avgust_tarkviniy': ['person:maldred_zavoevatel'],
 'person:avl_maldred_avgust_tarkviniy': ['person:avl', 'person:avl_imperator', 'person:imperator_avl'],
 'person:numeriya_maldreda_avgusta_tarkviniya': ['person:numeriya'],
 'person:kirena_klavdiya': ['person:kirena_imperatritsa'],
 'person:raloro_maldred_avgust_tarkviniy': ['person:raloro', 'person:imperator_raloro'],
 'person:linri_tariana_avgusta_tarkviniya_furiya': ['person:linri'],
 'person:ralvek_maldred_avgust_tarkviniy': ['person:ralvek'],
 'person:elen_maldreda_avgusta_tarkviniya': ['person:elen'],
 'person:lukas_maldred_avgust_tarkviniy': ['person:lukas', 'person:imperator_lukas'],
 'person:markus_maldred_avgust_tarkviniy': ['person:markus', 'person:imperator_markus'],
 'person:gney_maldred_avgust_tarkviniy': ['person:gney'],
 'person:eloren_neschastnaya': ['person:eloren'],
 'characters/decimus_furia': ['person:detsimus_furiy'],
 'characters/oktavius_opius': ['person:oktaviy_opiy'],
 'characters/filomen_papiria': ['person:filomen_papiriy'],
 'characters/ana_vranova': ['person:anna_vranova'],
 'characters/morena': ['person:morena', 'person:morena_i', 'person:koroleva_morena'],
 'characters/dzhok_i': ['person:dzhok_i_silvertuf', 'person:dzhok_silvertuf_povtor_rol_grafa_hrella'],
 'person:aleks_stilvind': ['person:aleks_stilvind_arhimag_aleks_skryaga'],
 'person:megram_varaniy_v_tekste_megramom_varaniem': ['person:megram_varaniy'],
 'person:avian': ['person:avian_evian_letayuschiy'],
}
dry = '--dry' in sys.argv
P = yaml.safe_load(open('data/people.yaml')); by = {p['id']: p for p in P}
red = {}
for c, ds in G.items():
    assert c in by, c
    for d in ds: assert d in by and d not in red, d; red[d] = c
rep = ['| Было (id → имя) | Стало |', '|---|---|']
for c, ds in G.items():
    cp = by[c]; alts = cp.setdefault('alt', []) if 'alt' in cp or True else None
    names = {cp['name']}
    for d in ds:
        dp = by[d]
        rep.append(f"| `{d}` — {dp['name']} ({dp.get('role')}; {dp.get('years')}) | `{c}` — {cp['name']} |")
        for k, v in dp.items():
            if k in ('id', 'name', 'alt', 'sources', 'aliases'): continue
            if cp.get(k) in (None, '', '?', 'неизвестно') and v not in (None, ''): cp[k] = v
        if dp['name'] not in names:
            names.add(dp['name']); alts.append({'text': f"вариант имени: {dp['name']}", 'sources': list(dp.get('sources') or [])})
        for a in dp.get('alt') or []: alts.append(a)
        src = cp.setdefault('sources', [])
        for s in dp.get('sources') or []:
            if s not in src: src.append(s)
        if dp.get('aliases'):
            cp['aliases'] = list(dict.fromkeys((cp.get('aliases') or []) + dp['aliases']))
    if not alts: del cp['alt']
P2 = [p for p in P if p['id'] not in red]
# ссылки: только id вида person:* (characters/* — канонические, не переписываются)
pat = re.compile(r'(?<![\w/:])(' + '|'.join(re.escape(d) for d in sorted(red, key=len, reverse=True)) + r')(?![\w])')
touched = {}
def sub(txt):
    n = [0]
    def f(m): n[0] += 1; return red[m.group(1)]
    return pat.sub(f, txt), n[0]
for f in glob.glob('data/*.yaml'):
    if f.endswith('people.yaml'): continue
    t = open(f).read(); t2, n = sub(t)
    if n: touched[f] = n; (not dry) and open(f, 'w').write(t2)
if not dry:
    yaml.safe_dump  # people.yaml: сохраняем шапку
    head = ''.join(l for l in open('data/people.yaml') if l.startswith('#'))
    out = head + yaml.safe_dump(P2, allow_unicode=True, sort_keys=False, width=1000)
    open('data/people.yaml', 'w').write(out)
    # relations: убрать петли и повторы
    R = yaml.safe_load(open('data/relations.yaml')); seen = set(); R2 = []; dropped = 0
    for r in R:
        k = (frozenset((r['a'], r['b'])), r['type'])
        if r['a'] == r['b'] or k in seen: dropped += 1; continue
        seen.add(k); R2.append(r)
    h = ''.join(l for l in open('data/relations.yaml') if l.startswith('#'))
    open('data/relations.yaml', 'w').write(h + yaml.safe_dump(R2, allow_unicode=True, sort_keys=False, width=1000))
    L = yaml.safe_load(open('data/people-loc.yaml')); seen = set(); L2 = []
    for r in L:
        if r['ref'] in seen: continue
        seen.add(r['ref']); L2.append(r)
    h = ''.join(l for l in open('data/people-loc.yaml') if l.startswith('#'))
    open('data/people-loc.yaml', 'w').write(h + yaml.safe_dump(L2, allow_unicode=True, sort_keys=False, width=1000))
    print('relations dropped', dropped, 'people-loc', len(L) - len(L2))
print('people', len(P), '->', len(P2), 'refs rewritten', touched)
open('/tmp/dedup-table.md', 'w').write('\n'.join(rep))
