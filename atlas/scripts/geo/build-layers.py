"""data/layers.yaml — реестр 60 слоёв из docs/plan/layers.md (таблицы групп). Запуск: python3 scripts/geo/build-layers.py
Готовые (status: ready) слои и их данные заданы в READY; остальные — planned."""
import re, yaml
GROUPS = [('география', 'geography', 'География'), ('политика', 'politics', 'Политика'), ('история', 'history', 'История'), ('военное', 'military', 'Военное'),
          ('экономика', 'economy', 'Экономика'), ('религия', 'religion', 'Религия'), ('магия', 'magic', 'Магия'), ('люди', 'people', 'Люди'),
          ('культура', 'culture', 'Культура'), ('организации', 'orgs', 'Организации'), ('сервис', 'service', 'Сервис')]
IDS = {
 'география': 'base-map seas rivers forests swamps hazards mountains deserts relief-eras lakes',
 'политика': 'states-1005 prefectures empire-growth territory-status regions noble-holdings camps capitals',
 'история': 'timeline events-by-type great-war campaigns igni-rojo-war arnost-hours dynasties epidemics',
 'военное': 'legions fortresses army-size fleets vyshnevodsk-front',
 'экономика': 'resources trade-routes roads currencies slavery population tolls banks',
 'религия': 'religions shrines schisms',
 'магия': 'undead anomalies schools fae-passages teleport magic-sources',
 'люди': 'people houses races',
 'культура': 'languages illior-districts festivals',
 'организации': 'guild-hq guild-spheres monopolies crime',
 'сервис': 'confidence grid',
}
# id -> (data, icon, color)
READY = {
 'hazards': ('hazards.yaml', 'triangle', '#8c1c13'), 'legions': ('military.yaml', 'shield', '#8c1c13'),
 'fortresses': ('places.yaml?kind=fortress + fortress-dates.yaml', 'diamond', '#5a3b1c'), 'resources': ('resources.yaml', 'hex', '#b8892b'),
 'shrines': ('religion.yaml', 'star', '#b8892b'), 'undead': ('magic.yaml?type=undead', 'cross', '#4a2a55'),
 'anomalies': ('magic.yaml?type=anomaly', 'ring', '#4a2a55'), 'schools': ('places.yaml?kind=school', 'square', '#3f4f5a'),
 'religions': ('areas.yaml?layer=religion', 'fill', '#6f86a3'), 'languages': ('areas.yaml?layer=language', 'fill', '#c9a44c'),
 'currencies': ('areas.yaml?layer=currency', 'fill', '#b5703f'), 'guild-spheres': ('areas.yaml?layer=guild', 'hatch', '#7a1f16'),
 'trade-routes': ('routes.yaml?kind=trade_*,caravan + geo/routes.geojson', 'line', '#8a6a1f'), 'slavery': ('routes.yaml?kind=slave + geo/routes.geojson', 'line', '#4a1a2a'),
 'campaigns': ('routes.yaml?kind=campaign + geo/routes.geojson', 'line', '#8c1c13'),
 'people': ('people-loc.yaml + people.yaml', 'circle', '#5a3b1c'), 'guild-hq': ('guild-hq.yaml + orgs.yaml', 'flag', '#8c1c13'),
}
rows, grp, i = [], None, {k: iter(v.split()) for k, v in IDS.items()}
for line in open('docs/plan/layers.md', encoding='utf8'):
    if line.startswith('## '): grp = line[3:].strip(); continue
    m = re.match(r'\| (P\d) \| (.*?) \| (.*?) \| (.*?) \| (.*?) \|\s*$', line)
    if m and grp in IDS:
        p, name, control, data, vol = m.groups()
        lid = next(i[grp]); gid = next(g[1] for g in GROUPS if g[0] == grp)
        r = {'id': lid, 'group': gid, 'name': name, 'control': control, 'priority': p}
        if lid in READY:
            d, icon, color = READY[lid]; r.update({'status': 'ready', 'data': d, 'icon': icon, 'color': color})
        else: r.update({'status': 'planned', 'data': None})
        r['source_note'] = data if len(data) < 400 else data[:397] + '…'
        r['volume'] = vol
        rows.append(r)
assert len(rows) == 60, len(rows)
out = {'groups': [{'id': g[1], 'name': g[2]} for g in GROUPS], 'layers': rows}
open('data/layers.yaml', 'w', encoding='utf8').write('# Реестр слоёв атласа (60), из docs/plan/layers.md; scripts/geo/build-layers.py. status: ready — слой работает, planned — «скоро».\n' + yaml.safe_dump(out, allow_unicode=True, sort_keys=False, width=200))
print(len(rows), 'слоёв, готовых', sum(r['status'] == 'ready' for r in rows))
