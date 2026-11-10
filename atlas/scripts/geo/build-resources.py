"""data/resources.yaml из lore/*.json (поле resources): по одной записи на пару «ресурс — место с координатами».
Место ищется по тексту where тем же резолвером, что у гильдий. Запуск: python3 scripts/geo/build-resources.py"""
import glob, json, re, yaml
from layer_links import resolve, P
pl = {p['id']: p for p in P}
pages = json.load(open('data/site/pages.json'))
SKIP = re.compile(r'Карта мира|Маркеры|Паломничеств|Тракт |Следящая вода|торговый перекрёсток|морская торговля|Игральные карты|Караваны|рабы|Рабы|Краденые|Ограбл|Проклятые|Печать|Гладиатор|Живые картины|живые картины|доспехи|мечи Первых', re.I)
CAT = [('древесина', r'древесин|питомник|^лес$|травы, лес'),
       ('артефакты и твари', r'реагент|артефакт|чудовищ|твари|шкуры и органы|мутаген|нежить'),
       ('ремесло и товары', r'корабл|порох|пушки|ювелир|телепорт|литейн|взрывчат|огнестрел|шёлк|ткани'),
       ('камень', r'гранит|мрамор|^камень'),
       ('металлы и руда', r'железо|уголь|сталь|серебро|золото|адамантин|мифрил|мышьяк|руда|металл|алмаз|изумруд|камни|шахты'),
       ('зерно, еда и вино', r'зерно|хмель|ячмень|рыба|фрукт|вина?$|пиво|виноград|сахар|кофе|какао|пушнина|скот|шерсть|молоко|провизия|плодородн|шкуры, редк'),
       ('пряности и растения', r'перец|специи|пряност|благовони|дурман|драконник|растени|травы')]
def cat(t):
    for name, rx in CAT:
        if re.search(rx, t, re.I): return name
    return 'прочее'
out, miss, seen = [], [], set()
for f in sorted(glob.glob('docs/research/lore/*.json')):
    if '/J_' in f: continue
    for r in json.load(open(f)).get('resources', []):
        if SKIP.search(r['resource']): continue
        slugs = [s for s in re.findall(r'[a-z_]+/[A-Za-z0-9_/\-]+', r.get('notes') or '') if s in pages]
        slugs += [s for s in re.findall(r'[a-z_]+/[A-Za-z0-9_/\-]+', r['where']) if s in pages]
        for part in re.split(r'\s*[,;]\s*|\s+и\s+', r['where']):
            res = resolve(part)
            if not res: miss.append((r['resource'], part)); continue
            pid, how = res
            key = (r['resource'], pid)
            if key in seen: continue
            seen.add(key)
            src = list(dict.fromkeys(slugs + ([] if slugs else pl[pid]['sources'][:1])))
            out.append({'id': f"res:{len(out)+1:03d}", 'resource': r['resource'], 'kind': cat(r['resource']), 'place': pid, 'where_text': part,
                        'note': (lambda n: None if not n or re.fullmatch(r'[a-z_]+/[A-Za-z0-9_/\-]+(;\s*[a-z_]+/[A-Za-z0-9_/\-]+)*', n.strip()) else n)(r.get('notes') or ''), 'sources': src,
                        'confidence': 'canon' if slugs and how == 'exact' else 'derived'})
for o in out:
    if o['note'] is None: del o['note']
open('data/resources.yaml', 'w').write('# Ресурсы и месторождения: lore/*.json (resources), место по тексту «where» (scripts/geo/build-resources.py); правится вручную.\n' + yaml.safe_dump(out, allow_unicode=True, sort_keys=False, width=200))
print(len(out), 'записей; без места:', len(miss))
import collections; print(collections.Counter(o['kind'] for o in out))
for m in miss[:60]: print('  -', m[0][:35], '|', m[1])
