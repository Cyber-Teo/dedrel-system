// pnpm tsx scripts/import/build-chronicle.ts — пересобирает data/events.yaml из docs/research/events-raw.yaml (734 сырых события):
// склейка дублей, date_precision, alt[] для спорных, слухи → master, смена владения структурно.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { parse, stringify } from 'yaml'
import {
  addHolder,
  cluster,
  isRumorEvent,
  mergedPrecision,
  parseTerritory,
  polityName,
  precisionOf,
  type Holder,
  type PlaceRef,
  type R,
} from './chronicle-lib'
import { MANUAL } from './territory-manual'
import { fixEvent, mergeEvents } from './chronicle-fixes'
import { applyOverrides } from './chronicle-overrides'

const raw: R[] = parse(readFileSync('docs/research/events-raw.yaml', 'utf8'))
const placesAll: R[] = parse(readFileSync('data/places.yaml', 'utf8'))
const refs: PlaceRef[] = placesAll.map((p) => ({ id: p.id, name: p.name, aliases: p.aliases }))
const uniq = <T>(a: T[]) => [...new Set(a)]

// Спорные версии: только то, что прямо сказано в docs/errata.md и chronicle.json (timeline_gaps).
type Dispute = {
  year: number | null
  title: RegExp
  absorb?: { year: number | null; title: RegExp }
  alt: { text: string; sources: string[] }[]
}
const DISPUTES: Dispute[] = [
  {
    year: -290,
    title: /^Падение Аркадии/,
    absorb: { year: null, title: /^Битва при Аркадии и гибель города/ },
    alt: [
      {
        text: 'По статьям о расах Аркадию уничтожил отряд архидемона Лигры в первые ~10 лет войны (≈−500…−490), и это стало концом цивилизации Первых людей; ночного штурма ≈−290 в этой версии нет.',
        sources: ['knowledges/demons', 'knowledges/first_humans'],
      },
      {
        text: 'Положение: «Раскопки А» на карте (6725,1600) лежат к востоку от Виларина, «Раскопки Б» (6155,1700) — к юго-западу, а текст относит «Раскопки А» на юго-запад префектуры Виларин. Подписи либо перепутаны, либо ошибся текст; привязку Аркадии автор не подтвердил.',
        sources: ['countries/illior_empire/regions/illior_empire_vilarin_region', 'history/great_war'],
      },
    ],
  },
  {
    year: -490,
    title: /^Битва при Аркадии/,
    alt: [
      {
        text: 'Дата Битвы при Аркадии прямо не названа, только «после −490»; по другой версии (статьи о расах) Аркадия погибла от отряда Лигры в первые ~10 лет войны.',
        sources: ['history/great_war', 'knowledges/first_humans', 'knowledges/demons'],
      },
      {
        text: 'Положение Аркадии: подписи «Раскопки А» и «Раскопки Б» на карте и в тексте префектуры Виларин расходятся (А — на карте к востоку от Виларина, в тексте — юго-запад); до подтверждения автором показывать зоной «одно из двух».',
        sources: ['countries/illior_empire/regions/illior_empire_vilarin_region', 'history/great_war'],
      },
    ],
  },
  {
    year: -50,
    title: /^Штурм Асмодиуса/,
    alt: [
      {
        text: 'Смерть демона Влозгата описана дважды: по статье о демонах он погиб в Битве Огненной ярости (≈−490, голову оторвал Эозиарти); хроника history/great_war относит гибель к штурму Асмодиуса (−50, убил Тирдес из Бронзового клана) — принято за основную.',
        sources: ['knowledges/demons', 'history/great_war'],
      },
    ],
  },
  {
    year: -490,
    title: /^Битва Огненной ярости/,
    alt: [
      {
        text: 'Вариант: Влозгат погиб в этой битве (голову оторвал Эозиарти); хроника history/great_war относит его гибель к штурму Асмодиуса в −50 (основная версия).',
        sources: ['knowledges/demons', 'history/great_war'],
      },
    ],
  },
  {
    year: -170,
    title: /^Основание Вышневодска/,
    alt: [
      {
        text: 'Дата основания между −180 и −160, точных сведений нет; Энфорис при этом пишет о росте Вышневодска в 80–170-х, а в Иллиорский союз Вышневодск вошёл в 176 г. и в префектуру Арност — в 206 г.',
        sources: [
          'countries/vishnevodskoye_principality/index',
          'countries/enforis/index',
          'history/era_imperial',
          'history/arnost_catastrophe',
        ],
      },
    ],
  },
  {
    year: -1700,
    title: /^Первые люди приходят со звёзд/,
    alt: [
      {
        text: 'По статье о Первых людях они пришли «около 3000 лет назад», то есть ≈−2000; хроника эпох даёт ≈−1700.',
        sources: ['knowledges/first_humans', 'knowledges/index'],
      },
    ],
  },
  {
    year: -495,
    title: /^Основание Этеля/,
    alt: [
      {
        text: 'Этель «основан ≈1500 лет назад» (≈−500), но первые эльфы прибыли ≈−470.',
        sources: ['countries/ethel/index', 'history/great_war'],
      },
    ],
  },
  {
    year: 70,
    title: /^Сбор Иллиорского союза/,
    alt: [
      {
        text: 'Начало Иллиорского союза: «с 70-х» (countries/illior_empire/index) против 74 (Малдред избран во главе Иллиора) и 76 (союз с Дагором) по history/era_imperial.',
        sources: ['countries/illior_empire/index', 'history/era_imperial'],
      },
    ],
  },
  {
    year: 151,
    title: /^Ирина Ландовска принимает корону/,
    alt: [
      {
        text: 'Утверждение «первое принятие королевского титула людьми» спорно: Хашем I провозгласил себя махараджей Игни ещё в 135–140 гг., раджи Тарпета упоминаются с ≈−400; Ирина — первая королева в узком смысле (корона из лап дракона).',
        sources: ['countries/gross/index', 'countries/igni/index', 'history/great_war'],
      },
    ],
  },
  {
    year: 567,
    title: /независимость Ройо/i,
    alt: [
      {
        text: 'Королевство Ройо существует с 560–562; «независимость после семилетней войны в 567» против признания империей в августе 573.',
        sources: [
          'countries/illior_empire/index',
          'countries/gross/index',
          'history/era_troubles',
          'countries/rojo/index',
        ],
      },
    ],
  },
  {
    year: 573,
    title: /^Отделение Гросса/,
    alt: [
      {
        text: 'Отделение Гросса «без кровопролития» (countries/illior_empire/index) против штурма дворца и захвата префекта мятежниками (countries/gross/index).',
        sources: ['countries/illior_empire/index', 'countries/gross/index'],
      },
    ],
  },
  {
    year: 658,
    title: /^Третий династический кризис/,
    absorb: { year: 690, title: /^Третий династический кризис/ },
    alt: [
      {
        text: 'Нумерация кризисов: третий — это 658 (смерть Люция, Гней II; history/era_troubles) или «конец VII века» (спор Фернанда и Линри, 690–691; countries/illior_empire/index, characters/houses_clans/furia).',
        sources: ['history/era_troubles', 'countries/illior_empire/index', 'characters/houses_clans/furia'],
      },
    ],
  },
  {
    year: 819,
    title: /^Вышневодско-энфорисская война/,
    alt: [
      {
        text: 'Война объявлена в 818 (countries/vishnevodskoye_principality/index) или в 819 (history/era_troubles).',
        sources: ['countries/vishnevodskoye_principality/index', 'history/era_troubles'],
      },
    ],
  },
]

// ---------- склейка ----------
const groups = cluster(raw)
// явные поглощения (вариант-версия из спорного списка уходит в alt головы)
for (const d of DISPUTES)
  if (d.absorb) {
    const head = groups.find((g) => g[0].year === d.year && d.title.test(g[0].title))
    const gi = groups.findIndex((g) => g[0].year === d.absorb!.year && d.absorb!.title.test(g[0].title) && g !== head)
    if (head && gi >= 0) head.push(...groups.splice(gi, 1)[0])
  }

// Грубые склейки 1005 г. (ручная проверка chronicle-merges.md): запись выделяется из чужой группы и либо остаётся отдельным событием,
// либо уходит в группу, чья голова — то же событие (месяц/смысл совпадают).
const SPLITS: { raw: string; into?: { year: number; title: RegExp } }[] = [
  { raw: 'ev:1005:mesyats_boev_za_ruiny_vesthelda_mige' }, // май: бои за Вестхельд ≠ амнистия Фуриев
  { raw: 'ev:1005:detsimus_furiy_mer_illiora' }, // Децимус Фурий — мэр ≠ убийство Мигеля I
  {
    raw: 'ev:1005:bitva_u_abbatstva_neugasimogo_plamen',
    into: { year: 1005, title: /^Август 1005: битва у Аббатства/ },
  }, // битва ≠ формирование XXIV легиона
  { raw: 'ev:1005:ognennaya_chuma_zakryvaet_granitsy_p' }, // огненная чума ≠ Виларинский конвент
  {
    raw: 'ev:1005:royo_stanovitsya_protektoratom_basti',
    into: { year: 1005, title: /^Ройо становится протекторатом Иллиорской/ },
  }, // протекторат ≠ раскол Церкви
  { raw: 'ev:1005:mir_mezhdu_royo_i_igni', into: { year: 1005, title: /^Мир 7 ноября 1005/ } }, // мир ≠ нападение Игни
]
for (const s of SPLITS) {
  const gi = groups.findIndex((g) => g.some((x) => x.id === s.raw))
  if (gi < 0) throw new Error(`split: нет записи ${s.raw}`)
  const rec = groups[gi].find((x) => x.id === s.raw)!
  if (groups[gi][0] === rec && groups[gi].length === 1 && !s.into) continue
  if (groups[gi][0] === rec) throw new Error(`split: ${s.raw} — голова группы`)
  groups[gi] = groups[gi].filter((x) => x !== rec)
  const target = s.into ? groups.find((g) => g[0].year === s.into!.year && s.into!.title.test(g[0].title)) : undefined
  if (s.into && !target) throw new Error(`split: не найдена группа для ${s.raw}`)
  if (target) target.push(rec)
  else groups.push([rec])
}
// Ручные слияния дублей, которые автокластер не видит: запись absorb уходит в группу keep, голова — keep.
// title/description — готовая формулировка слитого события (иначе берутся голова и самое длинное описание).
const MERGES: { keep: string; absorb: string[]; title?: string; description?: string }[] = [
  {
    keep: 'ev:817:illiorskaya_revolyutsiya',
    absorb: ['ev:817:revolyutsiya_817_goda'],
    description:
      'Бунт в столице; Сульпиции, Фурии, Эмилии, Клавдии, Лариции ограничивают власть императора; в сенате появляется народный депутат; начало либерализации. Великие Дома, возглавляемые Фуриями, ограничили власть императора; с тех пор Дома настороженно помнят 817 год. Одновременно молодые Папирии ушли с добровольческим легионом на Микрис.',
  },
  {
    keep: 'ev:817:nezavisimost_zanry',
    absorb: ['ev:817:zanra_obretaet_nezavisimost_sozdanie'],
    title: 'Независимость Занры; создание Пантеона',
    description:
      'На фоне смуты Занра заявляет о независимости; сенат её признаёт. Новое правительство создало из разрозненных культов единую церковь, канон и иерархию.',
  },
  { keep: 'ev:818:reformy_any_12_departamentov_zemlya_', absorb: ['ev:818:reformy_korolevy_any'] },
]
const overrides = new Map<string, { title?: string; description?: string }>()
for (const m of MERGES) {
  const gi = groups.findIndex((g) => g.some((x) => x.id === m.keep))
  if (gi < 0) throw new Error(`merge: нет записи ${m.keep}`)
  const g = groups[gi]
  g.sort((a, b) => (a.id === m.keep ? -1 : 0) - (b.id === m.keep ? -1 : 0))
  for (const id of m.absorb) {
    const ai = groups.findIndex((x) => x.some((r) => r.id === id))
    if (ai < 0) throw new Error(`merge: нет записи ${id}`)
    if (groups[ai] === g) continue
    g.push(...groups.splice(ai, 1)[0])
  }
  overrides.set(m.keep, { title: m.title, description: m.description })
}
const merges: string[] = []
const out: R[] = []
for (const g of groups) {
  const [head, ...rest] = g
  const e: R = { ...head }
  const all = g
  e.description = all
    .map((x) => x.description)
    .filter(Boolean)
    .sort((a: string, b: string) => b.length - a.length)[0]
  const ov = overrides.get(head.id)
  if (ov?.title) e.title = ov.title
  if (ov?.description) e.description = ov.description
  e.places = uniq(all.flatMap((x) => x.places ?? []))
  const actors: R[] = []
  for (const a of all.flatMap((x) => x.actors ?? [])) if (!actors.some((b) => b.name === a.name)) actors.push(a)
  e.actors = actors
  e.sources = uniq(all.flatMap((x) => x.sources))
  e.confidence = all.some((x) => x.confidence === 'canon') ? 'canon' : 'derived'
  e.date_precision =
    head.year == null
      ? 'approx'
      : mergedPrecision(
          { ...head, date_precision: precisionOf(head.date_text, head.year) },
          all.map((x) => ({ ...x, date_precision: precisionOf(x.date_text, x.year) })),
        )
  e.territorial_text = all
    .map((x) => x.territorial_change)
    .filter(Boolean)
    .sort((a: string, b: string) => b.length - a.length)[0]
  e.rumor = all.every(isRumorEvent)
  e.alt = []
  if (rest.length)
    merges.push(
      `- ${head.year ?? '?'} «${head.title}» ← ${rest.map((r) => `«${r.title}»${r.year !== head.year ? ` (${r.year ?? 'без года'})` : ''}`).join('; ')}`,
    )
  out.push(e)
}
out.sort((a, b) => (a.year ?? 1e9) - (b.year ?? 1e9) || a.id.localeCompare(b.id))

// ---------- спорные ----------
const disputed: string[] = []
for (const d of DISPUTES) {
  const hits = out.filter((e) => e.year === d.year && d.title.test(e.title))
  if (hits.length !== 1) throw new Error(`спор ${d.year} ${d.title}: найдено ${hits.length}`)
  hits[0].alt.push(...d.alt)
  disputed.push(
    `- **${d.year} г. — ${hits[0].title}** (${hits[0].id})\n${d.alt.map((a) => `  - ${a.text} [${a.sources.join(', ')}]`).join('\n')}`,
  )
}

// ---------- слухи, смена владения ----------
let structured = 0,
  noteOnly = 0
const noteOnlyList: string[] = []
const masters: string[] = []
const ownRefs = (e: R) =>
  (e.places as string[]).map((id) => refs.find((r) => r.id === id)).filter((x): x is PlaceRef => !!x)
const unresolved: string[] = []
const known = new Set(placesAll.map((p) => p.id as string))
const manualUsed = new Set<string>()
const final: R[] = out.map((e) => {
  const { rumor, territorial_text, ...rest } = e
  const f: R = { ...rest }
  if (territorial_text) {
    const man = MANUAL[e.id]
    let t: { gains: Holder[]; losses: Holder[]; note: string }
    if (man) {
      manualUsed.add(e.id)
      const mk = (rows?: [string, string[]][]) => {
        const l: Holder[] = []
        for (const [pol, pls] of rows ?? []) {
          for (const id of pls) if (!known.has(id)) unresolved.push(`${e.id}: место «${id}» нет в places.yaml`)
          addHolder(l, polityName(pol), pls, true)
        }
        return l
      }
      t = { gains: mk(man.g), losses: mk(man.l), note: territorial_text }
    } else t = parseTerritory(territorial_text, ownRefs(e), refs)
    if (t.gains.length || t.losses.length) structured++
    else {
      noteOnly++
      noteOnlyList.push(`- ${e.year ?? '?'} ${e.id} — ${territorial_text}`)
    }
    f.territorial_change = t
  }
  if (rumor) {
    f.visibility = 'master'
    masters.push(`- ${e.year ?? '?'} — ${e.title} (${e.id})`)
  } else f.visibility = 'public'
  return fixEvent(f)
})
const unusedManual = Object.keys(MANUAL).filter((k) => !manualUsed.has(k))
if (unusedManual.length || unresolved.length)
  throw new Error(`territory-manual: нет событий ${unusedManual.join(', ')}; ${unresolved.join('; ')}`)

// ---------- запись ----------
const KEYS = [
  'id',
  'year',
  'date_precision',
  'date_text',
  'title',
  'type',
  'description',
  'places',
  'actors',
  'territorial_change',
  'campaign',
  'sources',
  'confidence',
  'visibility',
  'alt',
]
const clean = (e: R) =>
  Object.fromEntries(
    KEYS.filter(
      (k) =>
        e[k] !== undefined &&
        e[k] !== '' &&
        !(Array.isArray(e[k]) && !e[k].length && k !== 'alt') &&
        !(k === 'alt' && !e.alt.length),
    ).map((k) => [k, e[k]]),
  )
const HEAD =
  '# События. Собрано scripts/import/build-chronicle.ts из сырых событий импорта (в репозиторий не входят) (склейка дублей, alt[] для спорных, слухи → master).\n'
const isMaster = (e: R) => e.visibility === 'master'
// CHRONICLE_OUT=<dir> — писать во временный каталог (scripts/import/check-chronicle.ts), не трогая data/ и docs/
const OUT = process.env.CHRONICLE_OUT ? process.env.CHRONICLE_OUT + '/' : ''
if (OUT) for (const d of ['data/master', 'docs/research']) mkdirSync(OUT + d, { recursive: true })
writeFileSync(
  OUT + 'data/events.yaml',
  HEAD + stringify(applyOverrides(mergeEvents(final.filter((e) => !isMaster(e)))).map(clean), { lineWidth: 0 }),
)
mkdirSync(OUT + 'data/master', { recursive: true })
writeFileSync(
  OUT + 'data/master/events.yaml',
  '# Мастерские события (visibility: master): слухи, тайны, решения кампаний. В публичный бандл НЕ попадают.\n' +
    stringify(applyOverrides(final.filter(isMaster)).map(clean), { lineWidth: 0 }),
)

const stubs = placesAll.filter((p) => String(p.id).startsWith('geo:') && p.x === undefined)
const used = new Set(final.flatMap((e) => e.places))
const stubsUsed = stubs.filter((p) => used.has(p.id))
const prec: Record<string, number> = {}
for (const e of final) prec[e.date_precision] = (prec[e.date_precision] ?? 0) + 1
const report = `# Отчёт по хронике (scripts/import/build-chronicle.ts)

Было 734 → стало ${final.length} событий (склеено ${raw.length - final.length}).

Вход: docs/research/events-raw.yaml (снимок прежнего data/events.yaml: костяк chronicle.json + события выжимок lore/*.json). Пересборка: \`pnpm tsx scripts/import/build-chronicle.ts\`.

## Точность дат
${Object.entries(prec)
  .map(([k, v]) => `- ${k}: ${v}`)
  .join('\n')}

## Места
Все places событий резолвятся в data/places.yaml (проверяет \`pnpm validate\`). Мест-заглушек (geo:*, kind other, без координат) в реестре ${stubs.length}, из них используется событиями ${stubsUsed.length}; без координат события на карте не показываются, а идут списком.

## Спорные версии (alt[]): ${disputed.length} событий
${disputed.join('\n')}

## Слухи → visibility master (${masters.length})
${masters.join('\n') || '—'}

Правило: master, если слух стоит в названии/тексте даты события (по слухам, слух(и), ходят слухи, говорят, тайные цели) у всех склеенных записей. События, где слух — лишь деталь описания (например «по слухам, убит» при известном факте смерти), остались public.

## Решено игроками за столом (campaign)
Ни одна страница источника не называет конкретное событие решённым игроками: есть только общая фраза «часть ключевых событий этого мира случилась потому, что так решили игроки» (index). Флаг campaign не выставлен ни у одного события (вопрос автору уже есть в lore/F_history.json). Поле campaign в схеме есть.

## Смена владения
Структурно (gains/losses; polity_id — id государства из states-1006.geojson, где оно есть): ${structured} из ${structured + noteOnly}; только исходная формулировка (note): ${noteOnly}.

События, где смены владения нет по тексту (границы не двигались, «без перемен/нет/не указано», независимость сохранена, мир по границе, родной мир эльфов вне карты), оставлены только с note:
${noteOnlyList.join('\n')}

Вручную по тексту разобрано (scripts/import/territory-manual.ts): ${manualUsed.size}; остальное разобрал автоматический парсер с алиасами государств (scripts/import/chronicle-lib.ts, POLITIES).
`
writeFileSync(OUT + 'docs/research/chronicle-report.md', report)
writeFileSync(
  OUT + 'docs/research/chronicle-merges.md',
  `# Склейки хроники (${raw.length - final.length})\n\nГенерируется build-chronicle.ts: «голова» ← поглощённые записи.\n\n${merges.join('\n')}\n`,
)
console.log(
  `было ${raw.length} → стало ${final.length}; спорных ${disputed.length}; master ${masters.length}; структурных тер. ${structured}/${structured + noteOnly}`,
)
