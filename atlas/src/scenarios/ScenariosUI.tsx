// «Сценарии» (пошаговый плеер), «Деньги» (калькулятор), «Небо» (луны и кометы), «Снимок PNG». Карточки — в едином слоте досье.
import type { Map } from 'maplibre-gl'
import { createPortal } from 'preact/compat'
import { useEffect, useMemo, useRef, useState } from 'preact/hooks'
import { wikiTitle } from '../search/data'
import { dossierSlot, useDossier } from '../dossier'
import { toolGroup } from '../ui/toolGroup'
import { ToolBtn } from '../ui/ToolBtn'
import { YEAR_MAX, YEAR_MIN, lngLatOf, places, wikiUrl, yearG, yearLabel } from '../events'
import { highlightPolity, setPolitics } from '../history/politics'
import { readHistoryLayers, readLayerIds, withLayerIds } from '../layers/layerHash'
import { toast } from '../ui/toast'
import { formatHash, parseHash } from '../hash'
import { lngLatToPx, pxToLngLat } from '../geo/pixel'
import { COINS, PRICES, breakdown, exchange, parseAmount, toCopper, type Coin } from './money'
import { clampCenter, frameOf, setOverlay, type Pad } from './overlay'
import { byTime, dateText, scYear, scenarios } from './scenarios'
import { COMETS, MONTHS, MONTHS_NOM, MOONS, moonPhase, nearestComets, phaseName } from './sky'
import { emit, on } from '../lib/bus'
import { CloseBtn } from '../ui/CloseBtn'

type Panel = 'scen' | 'money' | 'sky' | null
const readSc = (): { id: string; step: number } | null => {
  const v = new URLSearchParams(location.hash.replace(/^#/, '')).get('sc')
  if (!v) return null
  const [id, st] = v.split('.')
  return scenarios.some((x) => x.id === id) ? { id, step: Math.max(0, Number(st) || 0) } : null
}
const writeSc = (v: string | null) => {
  const p = new URLSearchParams(location.hash.replace(/^#/, ''))
  if (v) p.set('sc', v)
  else p.delete('sc')
  history.replaceState(null, '', '#' + p.toString().replace(/%2C/g, ','))
}
/** Подложка рисована по 1005 г.: для лет до 1000 на время сценария/прогулки ставим приглушённую (m=muted), на выходе возвращаем прежнюю. */
const baseNow = () => parseHash(location.hash).mode
const setBase = (m: 'drawn' | 'muted') => {
  if (baseNow() === m) return
  const p = new URLSearchParams(location.hash.replace(/^#/, ''))
  p.set('m', m)
  history.replaceState(null, '', '#' + p.toString().replace(/%2C/g, ','))
  dispatchEvent(new HashChangeEvent('hashchange'))
}
/** setBase с повтором: hashchange в main.tsx и откат истории досье могут вернуть прежний m сразу после нашей записи, поэтому проверяем хеш ещё несколько раз за ~1,6 с. Возвращает отмену. */
const holdBase = (m: 'drawn' | 'muted'): (() => void) => {
  const ts = [0, 120, 350, 700, 1100, 1600].map((ms) => window.setTimeout(() => setBase(m), ms))
  return () => ts.forEach(clearTimeout)
}
/** Тост сценария гасим сами: через 6 с и при смене шага (toast.ts держит «с Отменить» 8 с). */
let scToast = ''
const dropToast = () => {
  const h = document.getElementById('toasts')
  if (scToast && h?.textContent?.includes(scToast)) h.replaceChildren()
  scToast = ''
}
/** Отступы камеры под то, что закрывает карту: правая панель на десктопе, шторка на телефоне, легенда слева. */
const padOf = (map: Map): Pad => {
  const top = map.getPadding().top ?? 0 // полоса под шапкой: main.tsx держит её сам
  const card = document.querySelector<HTMLElement>('.card.sc')
  const leg = document.querySelector<HTMLElement>('.hist-legend')?.getBoundingClientRect()
  if (innerWidth <= 900) return { top, left: 0, right: 0, bottom: card?.offsetHeight ?? 0 }
  return {
    top,
    bottom: 0,
    left: leg && leg.width > 0 ? Math.max(0, Math.round(leg.right + 10)) : 0,
    right: (card?.offsetWidth ?? 0) + 24,
  }
}
const AUTO_MS = 7000
/** «Прогулка по эпохам»: пять остановок; камера в пикселях карты. Автоход выключен, ‹ ▶ › и ←/→ ведёт зритель; ▶ листает по 12 с */
const TOUR_MS = 12000
const noMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches
const dropTourParam = () => {
  const u = new URL(location.href)
  if (u.searchParams.has('tour')) {
    u.searchParams.delete('tour')
    history.replaceState(null, '', u.pathname + u.search + u.hash)
  }
}
const TOUR: {
  year: number
  title: string
  text: string
  c: [number, number, number]
  fit?: boolean
  place?: string
}[] = [
  {
    year: -300,
    title: 'Великая война',
    text: 'Эпоха Великой войны (−500…1 г.): карта показывает государства по сохранившимся сведениям, участки без сведений остаются серыми. Весь материк целиком; дальше — эпохи, когда границы известны подробнее.',
    c: [3960, 2980, 1.3],
    fit: true,
  },
  {
    year: 1,
    title: 'Победа над Асмодеем',
    text: 'Союзники находят убежище Асмодея в южной горе: Ларгири и Тирандаль убивают Асмодея, Роландо из Данира — Рулфари. Конец Великой войны; год победы — первый год новой эры, с него идёт летосчисление.',
    c: [3960, 3700, 3],
    place: 'geo:asmodius',
  },
  {
    year: 206,
    title: 'Имперская эпоха',
    text: 'Иллиорская империя собирает земли вокруг столицы: тракты, порты и легионы.',
    c: [5791, 1953, 3.2],
  },
  {
    year: 573,
    title: 'Смутные годы',
    text: 'Королевство Гросс отделяется от империи: переворот в Берсане.',
    c: [5109, 2363, 3.4],
  },
  {
    year: 1006,
    title: 'Новое время',
    text: '1005 — последний год событий вики, карта показывает 1006: война и пожары, границы государств, как их знает Дедрел.',
    c: [4800, 2500, 2.2],
  },
]

const pluralIdx = (n: number): 0 | 1 | 2 => {
  const m = Math.abs(n) % 100,
    d = m % 10
  return m > 10 && m < 20 ? 2 : d === 1 ? 0 : d > 1 && d < 5 ? 1 : 2
}
const WORD: Record<Coin, [string, string, string]> = {
  copper: ['медный', 'медных', 'медных'],
  silver: ['серебряный', 'серебряных', 'серебряных'],
  gold: ['золотой', 'золотых', 'золотых'],
  platinum: ['платиновый', 'платиновых', 'платиновых'],
}
const fmtN = (n: number) => (Number.isInteger(n) ? n : +n.toPrecision(6)).toLocaleString('ru-RU')
const coinWord = (c: Coin, n: number) => `${fmtN(n)} ${WORD[c][pluralIdx(n)]}`

/** Цена в той монете, в которой её называет вики: золотые, серебряные или медные. */
function priceText(copper: number): string {
  const k: Coin = copper % 100 === 0 ? 'gold' : copper % 10 === 0 ? 'silver' : 'copper'
  return coinWord(k, exchange(copper, 'copper', k))
}

/** Значок типа сценария (череп — катастрофа, огонь — чума, корона — революция, мечи — война, флаг — отделение) и год из id. */
const ICON: Record<string, string> = {
  skull: 'M12 3a7 7 0 0 0-7 7c0 2.5 1.2 4 3 5v3h2v-1.5h4V18h2v-3c1.8-1 3-2.5 3-5a7 7 0 0 0-7-7zM9 10.5h.01M15 10.5h.01',
  flame: 'M12 2c1 4 5 6 5 11a5 5 0 0 1-10 0c0-2 1-3 2-4 0 2 1 3 2 3 0-4-1-7 1-10z',
  crown: 'M3 18h18l1-10-5 4-5-8-5 8-5-4z',
  swords: 'M5 4l14 14M19 4L5 18M3 7l4-4M21 7l-4-4M3 17l4 4M21 17l-4 4',
  flag: 'M6 3v18M6 4h12l-3 4 3 4H6',
}
const KIND: Record<string, keyof typeof ICON> = {
  'arnost-672': 'skull',
  'fire-plague-1005': 'flame',
  'revolution-817': 'crown',
  'war-1005': 'swords',
  'gross-573': 'flag',
  'maldred-east-88': 'swords',
}
const KindIcon = ({ id }: { id: string }) => (
  <svg class="sc-ic" viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
    <path
      d={ICON[KIND[id] ?? 'flag']}
      fill="none"
      stroke="currentColor"
      stroke-width="1.8"
      stroke-linecap="round"
      stroke-linejoin="round"
    />
  </svg>
)

export function ScenariosUI({ map, year, setYear }: { map: Map; year: number; setYear: (y: number) => void }) {
  const init = useMemo(readSc, [])
  const [panel, setPanel] = useState<Panel>(
    init || new URLSearchParams(location.search).get('tour') === '1' ? 'scen' : null,
  )
  const close = (p: Panel) => () => setPanel((cur) => (cur === p ? null : cur))
  useDossier('scen', panel === 'scen', close('scen'))
  useDossier('money', panel === 'money', close('money'))
  useDossier('sky', panel === 'sky', close('sky'))
  const [sid, setSid] = useState<string | null>(init?.id ?? null) // выбранный сценарий
  const [step, setStep] = useState(() =>
    init ? Math.min(init.step, (scenarios.find((x) => x.id === init.id)?.steps.length ?? 1) - 1) : 0,
  )
  const session = useRef<{
    year: number
    polOn: boolean
    land: boolean
    cam: { center: [number, number]; zoom: number; bearing: number; pitch: number }
  } | null>(null) // что было до сценария
  const baseRef = useRef<'drawn' | 'muted' | null>(null),
    prevStep = useRef<string | null>(null)
  const [auto, setAuto] = useState(false)
  const [notice, setNotice] = useState<{ text: string; undo: () => void } | null>(null) // «Сценарий меняет вид карты» внутри шторки (телефон)
  const [tour, setTour] = useState<number | null>(() =>
    new URLSearchParams(location.search).get('tour') === '1' ? 0 : null,
  )
  const [tourPlay, setTourPlay] = useState(false) // автоход по умолчанию выключен
  const [peek, setPeek] = useState(false) // шторка на телефоне: свёрнута (заголовок и кнопки) / полная
  const [skyD, setSkyD] = useState({ y: year, m: 1, d: 1 })
  const [shot, setShot] = useState('')
  const sc = scenarios.find((s) => s.id === sid) ?? null
  const cur = sc?.steps[step] ?? null
  const nextSc = sc ? (byTime[byTime.findIndex((x) => x.id === sc.id) + 1] ?? null) : null
  const goNext = () => {
    if (!nextSc) return
    setAuto(false)
    switching.current = true
    setSid(nextSc.id)
    setStep(0)
  }
  // «Сценарий: …» из карточки события
  useEffect(() => {
    return on('open-scenario', ({ id }) => {
      if (scenarios.some((x) => x.id === id)) {
        setSid(id)
        setStep(0)
        setPanel('scen')
      }
    })
  }, [])

  // вход в сценарий: запомнить вид, сообщить о смене года и политики; выход — вернуть прежнее
  const active = !!sc && panel === 'scen'
  const carried = useRef<{ s: NonNullable<typeof session.current>; base: 'drawn' | 'muted' } | null>(null) // «Следующий сценарий»: исходный вид сохраняется до настоящего выхода
  const switching = useRef(false),
    scWritten = useRef(false),
    backAt = useRef(-1e9)
  useEffect(() => {
    if (!active) return
    const hl = readHistoryLayers(location.hash)
    const first = sc!.steps[0]
    const needPol = sc!.steps.some((x) => x.highlight.polities.length || x.owners_at !== undefined)
    const c = map.getCenter()
    const carry = carried.current
    carried.current = null
    session.current = carry?.s ?? {
      year,
      polOn: hl.politics,
      land: hl.landscape,
      cam: { center: [c.lng, c.lat], zoom: map.getZoom(), bearing: map.getBearing(), pitch: map.getPitch() },
    }
    const turned = needPol && !hl.politics
    const wasBase = carry?.base ?? baseNow()
    baseRef.current = wasBase
    const old = sc!.steps.some((x) => x.date.year < 1000)
    const cancelBase = old ? holdBase('muted') : () => {} // слушатель hashchange у main.tsx вешается после дочерних эффектов, а откат истории досье может вернуть m=drawn
    if (turned) emit('history', { politics: true, landscape: hl.landscape })
    const fresh = !carry && (!init || init.id !== sc!.id)
    let tt = 0,
      tt2 = 0
    if (fresh) {
      const was = session.current
      const text = `Год ${yearLabel(first.date.year)}${needPol ? ', политика включена' : ''}${old ? '; подложка нарисована по 1005 г.' : ''}`
      const undo = () => {
        setYear(was.year)
        setBase(wasBase)
        if (turned) emit('history', { politics: false, landscape: was.land })
        setSid(null)
        setAuto(false)
        setNotice(null)
      }
      // на телефоне о смене подложки уже говорит один тост самой карты; второго сообщения и строки в шторке нет, текст шага виден сразу
      if (innerWidth > 900)
        tt = window.setTimeout(() => {
          toast(text, { undo })
          scToast = text
          tt2 = window.setTimeout(dropToast, 6000)
        }, 700)
      else setPeek(false)
    }
    return () => {
      clearTimeout(tt)
      clearTimeout(tt2)
      cancelBase()
      dropToast()
      const was = session.current
      session.current = null
      setNotice(null)
      scWritten.current = false
      // «Назад» браузера: фокус не возвращаем на «Сценарии» в рейке (это заново раскрыло бы меню «Списки»), а уводим на карту
      if (performance.now() - backAt.current < 800) {
        backAt.current = -1e9
        map.getCanvas().focus({ preventScroll: true })
      }
      if (!was) return
      if (switching.current) {
        // переход к следующему сценарию: вид не возвращаем, его заберёт следующий вход
        switching.current = false
        carried.current = { s: was, base: baseRef.current ?? 'drawn' }
        setOverlay(map, null)
        highlightPolity(map, null)
        writeSc(null)
        return
      }
      if (baseRef.current) {
        const b = baseRef.current
        setBase(b)
        const h = holdBase(b)
        setTimeout(h, 1700)
      }
      setYear(was.year)
      map.stop()
      // stop() и откат истории браузера (overlayStack) пишут в хеш кадр сценария и двигают камеру к нему; прежний вид — после них
      setTimeout(() => {
        if (session.current) return // уже вошли в другой сценарий — камера его
        history.replaceState(
          null,
          '',
          formatHash(
            { center: lngLatToPx(was.cam.center), zoom: was.cam.zoom, mode: parseHash(location.hash).mode },
            location.hash,
          ),
        )
        map.stop()
        map.easeTo({ ...was.cam, padding: { top: 0, left: 0, right: 0, bottom: 0 }, duration: 600 })
      }, 120)
      emit('history', { politics: was.polOn, landscape: was.land }) // всегда: исходные политика и ландшафт
      if (was.polOn) setTimeout(() => setPolitics(map, true, was.year), 150)
      setOverlay(map, null)
      highlightPolity(map, null)
      writeSc(null)
    }
  }, [active, sid])
  // «Назад» браузера (или правка адреса): sc= пропал из хеша — выходим тем же путём, что и по ✕
  useEffect(() => {
    if (!active) return
    const f = () => {
      if (scWritten.current && !readSc()) {
        backAt.current = performance.now()
        setPanel(null)
      }
    }
    const pop = () => {
      backAt.current = performance.now()
      f()
    }
    addEventListener('hashchange', f)
    addEventListener('popstate', pop)
    return () => {
      removeEventListener('hashchange', f)
      removeEventListener('popstate', pop)
    }
  }, [active, sid])
  // прогулка по эпохам: запомнить вид, на каждой остановке — год и камера, по Esc/✕ — вернуть
  const touring = tour !== null && panel === 'scen' && !sc
  const tourBase = useRef<'drawn' | 'muted'>('drawn'),
    tourHold = useRef<() => void>(() => {}),
    tourKeep = useRef(false) // tourKeep: «Остаться на карте» — год, камера и слои остаются
  const tourSess = useRef<{
    year: number
    polOn: boolean
    land: boolean
    cam: { center: [number, number]; zoom: number; bearing: number; pitch: number }
  } | null>(null)
  useEffect(() => {
    if (!touring) return
    dropTourParam()
    const c = map.getCenter(),
      hl = readHistoryLayers(location.hash)
    tourBase.current = baseNow()
    tourSess.current = {
      year,
      polOn: hl.politics,
      land: hl.landscape,
      cam: { center: [c.lng, c.lat], zoom: map.getZoom(), bearing: map.getBearing(), pitch: map.getPitch() },
    }
    // остановки показывают государства и ландшафт: включаем, чтобы текст не расходился с картой
    if (!hl.politics) emit('history', { politics: true, landscape: true })
    return () => {
      const was = tourSess.current
      tourSess.current = null
      setTour(null)
      setTourPlay(false)
      if (!was) return
      const keep = tourKeep.current
      tourKeep.current = false
      tourHold.current()
      setBase(tourBase.current)
      const hb = holdBase(tourBase.current)
      setTimeout(hb, 1700)
      // после Esc/✕ фокус не должен падать на BODY: кнопка, с которой открыли, а при старте с приветствия — «Время и политика»
      setTimeout(() => {
        if (
          document.activeElement &&
          document.activeElement !== document.body &&
          !document.querySelector('#dossier')?.contains(document.activeElement)
        )
          return
        const c = ['#tg-time .tg-rail', '.tools-btn', '#tg-time .tg-b button']
          .map((q) => document.querySelector<HTMLElement>(q))
          .find((el) => el && el.offsetParent !== null)
        c?.focus({ preventScroll: true })
      }, 80)
      if (keep) return
      emit('history', { politics: was.polOn, landscape: was.land })
      setYear(was.year)
      map.stop()
      setTimeout(() => {
        history.replaceState(
          null,
          '',
          formatHash(
            { center: lngLatToPx(was.cam.center), zoom: was.cam.zoom, mode: parseHash(location.hash).mode },
            location.hash,
          ),
        )
        dropTourParam() // откат истории при закрытии карточки возвращает адрес со стартовым ?tour=1
        map.easeTo({ ...was.cam, duration: 600 })
      }, 120)
    }
  }, [touring])
  useEffect(() => {
    if (!touring || tour === null) return
    const st = TOUR[tour]
    setYear(st.year)
    tourHold.current()
    tourHold.current = holdBase(st.year < 1000 ? 'muted' : tourBase.current) // подложка рисована по 1005 г.: до 1000 г. приглушённая
    let fitT = 0
    if (st.fit) {
      // вся карта в видимой области: ждём, пока main.tsx выставит отступ камеры под панель (≈60 мс), и считаем зум по нему
      fitT = window.setTimeout(() => {
        const card = document.querySelector<HTMLElement>('.card.sc'),
          el = map.getContainer(),
          narrow = innerWidth <= 900
        const pad = narrow
          ? { top: 8, left: 0, right: 0, bottom: (card?.offsetHeight ?? 0) + 8 }
          : { top: 8, left: 0, right: (card?.offsetWidth ?? 0) + 24, bottom: 0 }
        const spp =
          Math.min((el.clientWidth - pad.left - pad.right) / 7920, (el.clientHeight - pad.top - pad.bottom) / 5960) *
          0.97
        map.flyTo({
          center: pxToLngLat([3960, 2980]),
          zoom: Math.max(-0.5, Math.log2(spp * 16)),
          padding: pad,
          duration: 1500,
          essential: true,
        })
      }, 450)
    } else {
      const ll = (st.place && lngLatOf(places.get(st.place))) || pxToLngLat([st.c[0], st.c[1]])
      const g = map.getPadding(),
        pad = { top: g.top ?? 0, bottom: g.bottom ?? 0, left: g.left ?? 0, right: g.right ?? 0 }
      map.flyTo({ center: clampCenter(map, ll, st.c[2], pad), zoom: st.c[2], duration: 1500, essential: true })
    }
    if (!tourPlay || noMotion()) return () => clearTimeout(fitT)
    const t = setTimeout(() => {
      if (tour + 1 < TOUR.length) setTour(tour + 1)
      else setTourPlay(false)
    }, TOUR_MS)
    return () => {
      clearTimeout(t)
      clearTimeout(fitT)
    }
  }, [touring, tour, tourPlay])
  useEffect(() => () => tourHold.current(), [])
  // ←/→ листают остановки
  useEffect(() => {
    if (!touring) return
    const k = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null
      if (t && (/^(INPUT|SELECT|TEXTAREA)$/.test(t.tagName) || t.isContentEditable)) return
      if (e.key === 'ArrowRight') {
        e.preventDefault()
        setTour((i) => (i !== null && i + 1 < TOUR.length ? i + 1 : i))
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault()
        setTour((i) => (i !== null && i > 0 ? i - 1 : i))
      }
    }
    addEventListener('keydown', k)
    return () => removeEventListener('keydown', k)
  }, [touring])
  // шаг: год, камера, подсветка, кадр политики, дата для неба
  useEffect(() => {
    if (!cur || !active) return
    setYear(Math.max(YEAR_MIN, Math.min(YEAR_MAX, cur.date.year)))
    // шторка (телефон) или карточка досье (десктоп) закрывает часть карты: кадр строится в оставшейся видимой части
    document.querySelector('.card.sc')?.scrollTo(0, 0)
    if (prevStep.current !== null && prevStep.current !== `${sid}.${step}`) dropToast()
    prevStep.current = `${sid}.${step}`
    // камера: main.tsx через ~60 мс после смены панели/высоты шторки делает easeTo(padding) и обрывает наш flyTo — поэтому проверяем конец полёта и повторяем
    const fly = (ms: number) => {
      const pad = padOf(map),
        c = frameOf(map, cur, pad)
      map.flyTo({ ...c, duration: ms, essential: true, padding: pad })
      return c
    }
    fly(1400)
    const verify = () => {
      if (map.isMoving()) return
      const c = frameOf(map, cur, padOf(map)),
        spp = 2 ** map.getZoom() / 16,
        a = lngLatToPx(map.getCenter().toArray() as [number, number]),
        b = lngLatToPx(c.center)
      if (Math.abs(map.getZoom() - c.zoom) > 0.05 || Math.hypot(a[0] - b[0], a[1] - b[1]) * spp > 40) fly(900)
    }
    const camT = [450, 900, 1800, 2800].map((ms) => window.setTimeout(verify, ms))
    setOverlay(map, cur)
    if (cur.owners_at !== undefined)
      setTimeout(
        () => setPolitics(map, true, Math.floor(cur.owners_at!), cur.owners_at! - Math.floor(cur.owners_at!)),
        200,
      )
    if (cur.date.month) setSkyD({ y: cur.date.year, m: cur.date.month, d: Math.min(cur.date.day ?? 1, 30) })
    writeSc(`${sc!.id}.${step}`)
    scWritten.current = true
    return () => camT.forEach(clearTimeout)
  }, [sid, step, active])
  // активная строка списка шагов видна без ручной прокрутки; ←/→ листают шаги, пока фокус не в поле ввода
  useEffect(() => {
    if (active) document.querySelector('.sc-steps li.on')?.scrollIntoView({ block: 'nearest' })
  }, [sid, step, active])
  useEffect(() => {
    if (!active || !sc) return
    const k = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null
      if (
        e.altKey ||
        e.ctrlKey ||
        e.metaKey ||
        (t &&
          (/^(INPUT|SELECT|TEXTAREA)$/.test(t.tagName) || t.isContentEditable || t.getAttribute('role') === 'slider'))
      )
        return
      if (e.key === 'ArrowRight') {
        e.preventDefault()
        setAuto(false)
        setStep((i) => Math.min(i + 1, sc.steps.length - 1))
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault()
        setAuto(false)
        setStep((i) => Math.max(i - 1, 0))
      }
    }
    addEventListener('keydown', k)
    return () => removeEventListener('keydown', k)
  }, [active, sid])
  const fwdRef = useRef<HTMLButtonElement>(null)
  useEffect(() => {
    if (active) setTimeout(() => fwdRef.current?.focus({ preventScroll: true }), 60)
  }, [sid, active])
  useEffect(() => {
    if (!auto || !sc) return
    const t = setTimeout(() => (step + 1 < sc.steps.length ? setStep(step + 1) : setAuto(false)), AUTO_MS)
    return () => clearTimeout(t)
  }, [auto, step, sc])
  useEffect(() => {
    if (panel !== 'scen') setAuto(false)
  }, [panel])
  // контракт: body.sc-sheet и --sheet-h (px) — высота шторки сценария на узком экране; легенда и чипы поднимаются на неё
  useEffect(() => {
    if (!active && !touring) return
    const el = document.querySelector<HTMLElement>('.card.sc')
    if (!el) return
    const set = () => {
      const on = innerWidth <= 900
      document.body.classList.toggle('sc-sheet', on)
      document.documentElement.style.setProperty('--sheet-h', on ? `${el.offsetHeight}px` : '0px')
    }
    set()
    const ro = new ResizeObserver(set)
    ro.observe(el)
    addEventListener('resize', set)
    return () => {
      ro.disconnect()
      removeEventListener('resize', set)
      document.body.classList.remove('sc-sheet')
      document.documentElement.style.removeProperty('--sheet-h')
    }
  }, [active, touring, sid, !!cur])
  useEffect(() => {
    if (!sc && init) writeSc(null)
  }, [sc])

  const toggle = (p: Panel) => {
    if (p === 'sky' && panel !== 'sky' && !active) setSkyD((d) => ({ ...d, y: year }))
    setPanel(panel === p ? null : p)
  }
  const [scale, setScale] = useState<1 | 2>(1)
  const [print, setPrint] = useState<'A4' | 'A3' | null>(null),
    [nospoil, setNospoil] = useState(false)
  const doShot = async () => {
    const n = await (
      await import('./exportPng')
    ).exportFrame(map, {
      scale,
      print: print ?? undefined,
      nospoil,
      year,
      caption: sc && panel === 'scen' && cur ? `${sc.title}: ${cur.title}` : undefined,
      sub: sc && panel === 'scen' && cur ? dateText(cur.date) : undefined,
    })
    setShot(n)
    setTimeout(() => setShot(''), 4000)
  }
  return (
    <>
      {createPortal(
        <>
          <ToolBtn
            n="scenarios"
            title="Пошаговые сценарии: события с картой и датой"
            on={panel === 'scen'}
            onClick={() => toggle('scen')}
          >
            Сценарии
          </ToolBtn>
          <ToolBtn n="money" title="Цены, монеты и курс валют" on={panel === 'money'} onClick={() => toggle('money')}>
            Цены и валюты
          </ToolBtn>
          <ToolBtn n="sky" title="Луны и кометы на выбранную дату" on={panel === 'sky'} onClick={() => toggle('sky')}>
            Луны и кометы
          </ToolBtn>
        </>,
        toolGroup('ref'),
      )}
      {createPortal(
        <>
          <div class="exp-opt exp-col">
            <div class="exp-row" role="group" aria-label="Размер картинки">
              <span class="exp-l">Размер</span>
              {([1, 2] as const).map((k) => (
                <button
                  type="button"
                  class={!print && scale === k ? 'on' : ''}
                  aria-pressed={!print && scale === k}
                  title={k === 2 ? 'Вдвое больше пикселей (дольше)' : 'Как на экране'}
                  onClick={() => {
                    setPrint(null)
                    setScale(k)
                  }}
                >
                  ×{k}
                </button>
              ))}
            </div>
            <div class="exp-row exp-pr">
              <span class="exp-l">Печать</span>
              <button
                type="button"
                class="pt"
                aria-pressed={!!print}
                title="Для печати: A4/A3 альбом, линейка, север, полная легенда"
                onClick={() => setPrint(print ? null : 'A4')}
              >
                {print ? 'Для печати: вкл.' : 'Для печати'}
              </button>
            </div>
            {print && (
              <>
                <div class="exp-row" role="group" aria-label="Формат листа">
                  <span class="exp-l">Лист</span>
                  {(['A4', 'A3'] as const).map((f) => (
                    <button
                      type="button"
                      class={print === f ? 'on' : ''}
                      aria-pressed={print === f}
                      onClick={() => setPrint(f)}
                    >
                      {f}
                    </button>
                  ))}
                </div>
                <label class="exp-sp" title="Снять слои данных: останутся подложка и политика">
                  <input
                    type="checkbox"
                    checked={nospoil}
                    onChange={(e) => setNospoil((e.target as HTMLInputElement).checked)}
                  />{' '}
                  без спойлеров
                </label>
              </>
            )}
          </div>
          <ToolBtn n="png" id="export-png" title="Сохранить текущий вид карты как картинку PNG" onClick={doShot}>
            {shot ? 'Сохранено' : 'Скачать PNG'}
          </ToolBtn>
        </>,
        toolGroup('export'),
      )}
      {createPortal(
        <>
          {panel === 'scen' && (
            <div class={`card sc${peek ? ' peek' : ''}`}>
              <CloseBtn onClick={() => setPanel(null)} />
              {sc && cur && (
                <button
                  class="sc-grip"
                  aria-label={peek ? 'Развернуть шторку' : 'Свернуть шторку'}
                  aria-pressed={peek}
                  onClick={() => setPeek(!peek)}
                >
                  {peek ? '▴ Развернуть' : '▾ Свернуть'}
                </button>
              )}
              {!sc || !cur ? (
                <>
                  {touring ? (
                    <div class="sc-tour">
                      <div class="meta">
                        Прогулка по эпохам · остановка {tour! + 1} из {TOUR.length}
                      </div>
                      <h3 aria-live="polite">
                        {TOUR[tour!].title}, {yearG(TOUR[tour!].year)}
                      </h3>
                      <p>{TOUR[tour!].text}</p>
                      <div class="sc-ctl sc-tour-ctl" role="group" aria-label="Прогулка">
                        <button
                          aria-label="Назад"
                          disabled={tour === 0}
                          onClick={() => {
                            setTourPlay(false)
                            setTour(tour! - 1)
                          }}
                        >
                          ‹ Назад
                        </button>
                        {!noMotion() && (
                          <button
                            aria-label={tourPlay ? 'Пауза' : 'Авто'}
                            aria-pressed={tourPlay}
                            class={tourPlay ? 'on' : ''}
                            onClick={() => setTourPlay(!tourPlay)}
                          >
                            {tourPlay ? '❚❚ Пауза' : '▶ Авто'}
                          </button>
                        )}
                        <button
                          aria-label="Вперёд"
                          disabled={tour! + 1 >= TOUR.length}
                          onClick={() => {
                            setTourPlay(false)
                            setTour(tour! + 1)
                          }}
                        >
                          Вперёд ›
                        </button>
                      </div>
                      {tour! + 1 >= TOUR.length && (
                        <div class="sc-ctl sc-tour-end">
                          <button
                            onClick={() => {
                              setTourPlay(false)
                              setTour(null)
                            }}
                          >
                            К сценариям
                          </button>
                          <button
                            onClick={() => {
                              tourKeep.current = true
                              setPanel(null)
                            }}
                          >
                            Остаться на карте
                          </button>
                        </div>
                      )}
                      <div class="sc-dots" aria-hidden="true">
                        {TOUR.map((_, i) => (
                          <i class={i === tour ? 'on' : ''} />
                        ))}
                      </div>
                      <div class="meta">
                        {matchMedia('(pointer: coarse)').matches
                          ? 'Нажмите ✕, чтобы выйти и вернуть прежний вид.'
                          : '←/→ — листать, Esc — выйти и вернуть прежний вид.'}
                      </div>
                    </div>
                  ) : (
                    <>
                      <h3>Сценарии</h3>
                      <div class="meta">Пошаговые разборы событий по вики: карта летит к месту, ставится год.</div>
                      <button class="sc-pick sc-tour-pick" onClick={() => setTour(0)}>
                        <b class="sc-t">Прогулка по эпохам</b>
                        <span>Пять остановок: −300, 1, 206, 573 и 1006 годы; листайте ‹ › или стрелками.</span>
                      </button>
                      {byTime.map((s) => (
                        <button
                          class="sc-pick"
                          onClick={() => {
                            setSid(s.id)
                            setStep(0)
                          }}
                        >
                          <b class="sc-t">
                            <KindIcon id={s.id} />
                            {s.title}
                            <em class="sc-yr">{scYear(s.id).replace(/^-/, '\u2212')} г.</em>
                          </b>
                          <span>{s.summary}</span>
                          <i>{s.steps.length} шагов</i>
                        </button>
                      ))}
                    </>
                  )}
                </>
              ) : (
                <>
                  <button
                    class="back"
                    onClick={() => {
                      setSid(null)
                      setAuto(false)
                    }}
                  >
                    ‹ к списку сценариев
                  </button>
                  <div class="sc-peekbar" aria-hidden={!peek}>
                    <span>
                      Шаг {step + 1}/{sc.steps.length}
                    </span>
                    <button
                      disabled={step === 0}
                      aria-label="Назад"
                      onClick={() => {
                        setAuto(false)
                        setStep(step - 1)
                      }}
                    >
                      ‹
                    </button>
                    <button
                      disabled={step + 1 >= sc.steps.length}
                      aria-label="Вперёд"
                      onClick={() => {
                        setAuto(false)
                        setStep(step + 1)
                      }}
                    >
                      ›
                    </button>
                  </div>
                  <div class="meta">
                    {sc.title} · шаг {step + 1} из {sc.steps.length}
                  </div>
                  <h3>{cur.title}</h3>
                  {notice && (
                    <div class="sc-notice" role="status">
                      {notice.text}.{' '}
                      <button type="button" class="mn-link" onClick={notice.undo}>
                        Отменить
                      </button>
                    </div>
                  )}
                  <div class="sc-date">{dateText(cur.date)}</div>
                  <p>{cur.text}</p>
                  {cur.highlight.lines.length > 0 && (
                    <p class="sc-note">Линии на карте: {cur.highlight.lines.map((l) => l.label).join('; ')}.</p>
                  )}
                  <div class="links sc-src">
                    {cur.sources.map((s, i) => (
                      <>
                        {i === 0 ? 'Источник: ' : i === 1 ? ' · См. также: ' : ' · '}
                        <a href={wikiUrl(s)} target="_blank" rel="noreferrer">
                          {wikiTitle(s) ?? wikiTitle(s + '/index') ?? 'страница вики'}
                        </a>
                      </>
                    ))}
                  </div>
                  <div class="sc-ctl">
                    <button
                      disabled={step === 0}
                      onClick={() => {
                        setAuto(false)
                        setStep(step - 1)
                      }}
                    >
                      ‹ Назад
                    </button>
                    <button
                      class={auto ? 'on' : ''}
                      onClick={() => {
                        if (!auto && step + 1 >= sc.steps.length) setStep(0)
                        setAuto(!auto)
                      }}
                    >
                      {auto ? '❚❚ Пауза' : '▶ Авто'}
                    </button>
                    {step + 1 < sc.steps.length ? (
                      <button
                        ref={fwdRef}
                        onClick={() => {
                          setAuto(false)
                          setStep(step + 1)
                        }}
                      >
                        Вперёд ›
                      </button>
                    ) : (
                      <button
                        class="sc-end"
                        onClick={() => {
                          setAuto(false)
                          setPanel(null)
                        }}
                      >
                        Закончить
                      </button>
                    )}
                    {step + 1 >= sc.steps.length && nextSc && (
                      <button ref={fwdRef} class="sc-next" onClick={goNext}>
                        Следующий: {nextSc.title} ›
                      </button>
                    )}
                  </div>
                  <div class="meta sc-keys">←/→ — шаги, Esc — выйти</div>
                  <ol class="sc-steps">
                    {sc.steps.map((s, i) => (
                      <li
                        class={i === step ? 'on' : ''}
                        onClick={() => {
                          setAuto(false)
                          setStep(i)
                        }}
                      >
                        {s.title}
                      </li>
                    ))}
                  </ol>
                </>
              )}
            </div>
          )}
          {panel === 'money' && <Money close={() => setPanel(null)} />}
          {panel === 'sky' && <Sky d={skyD} set={setSkyD} close={() => setPanel(null)} />}
        </>,
        dossierSlot(),
      )}
    </>
  )
}

const showCurrencies = () => {
  history.replaceState(
    null,
    '',
    withLayerIds(location.hash, [...new Set([...readLayerIds(location.hash), 'currencies'])]),
  )
  dispatchEvent(new HashChangeEvent('hashchange'))
}

function Money({ close }: { close: () => void }) {
  const [txt, setTxt] = useState('250'),
    [from, setFrom] = useState<Coin>('silver')
  const n = parseAmount(txt)
  const cop = n === null ? null : toCopper(n, from)
  const groups = useMemo(() => [...new Set(PRICES.map((p) => p.group))], [])
  return (
    <div class="card money">
      <CloseBtn onClick={close} />
      <h3>Калькулятор денег</h3>
      <div class="meta">
        10 медных = 1 серебряная, 10 серебряных = 1 золотая, 10 золотых = 1 платиновая. Цены в разных местах отличаются
        на ±30%.
      </div>
      <div class="mn-std">
        Все суммы — в монетах имперского стандарта. Валюты стран смотрите{' '}
        <button class="mn-link" onClick={showCurrencies}>
          на слое «Валюты»
        </button>
        .
      </div>
      <div class="mn-warn">
        Рю, песо Ройо и облигации банков здесь не пересчитываются: облигации «не привязаны к стандарту напрямую», их
        курс колеблется. Для расчёта берите монеты.
      </div>
      <div class="mn-in">
        <input
          id="mn-amount"
          inputMode="decimal"
          value={txt}
          onInput={(e) => setTxt((e.target as HTMLInputElement).value)}
        />
        <select id="mn-from" value={from} onChange={(e) => setFrom((e.target as HTMLSelectElement).value as Coin)}>
          {COINS.map((c) => (
            <option value={c.id}>{c.name}</option>
          ))}
        </select>
      </div>
      {cop === null ? (
        <p class="sc-note">Введите неотрицательное число.</p>
      ) : (
        <>
          <table class="mn-tab">
            <tbody>
              {COINS.map((c) => (
                <tr>
                  <td>{c.name}</td>
                  <td id={`mn-${c.id}`}>{fmtN(exchange(n!, from, c.id))}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {Number.isInteger(cop) && cop > 0 && (
            <p id="mn-break" class="sc-note">
              Монетами:{' '}
              {[...COINS]
                .reverse()
                .map((c) => [c.id, breakdown(cop)[c.id]] as const)
                .filter(([, v]) => v)
                .map(([c, v]) => coinWord(c, v))
                .join(', ')}
            </p>
          )}
        </>
      )}
      {groups.map((g) => (
        <>
          <h4>{g}</h4>
          <table class="mn-prices">
            <tbody>
              {PRICES.filter((p) => p.group === g).map((p) => (
                <tr title={p.note}>
                  <td class="pn">{p.name}</td>
                  <td class="r">
                    {priceText(p.copper)}
                    {p.per ? ` / ${p.per}` : ''}
                  </td>
                  {(p.note || (cop !== null && cop >= p.copper)) && (
                    <td class="pnote">
                      <small>{p.note}</small>
                      {cop !== null && cop >= p.copper && (
                        <b class="hv">
                          {p.note ? ' · ' : ''}хватит на {fmtN(Math.floor(cop / p.copper))}
                        </b>
                      )}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </>
      ))}
      <div class="links">
        Источник:{' '}
        <a href={wikiUrl('knowledges/monetary_system')} target="_blank" rel="noreferrer">
          {wikiTitle('knowledges/monetary_system')}
        </a>
        <a href={wikiUrl('knowledges/services_prices')} target="_blank" rel="noreferrer">
          {wikiTitle('knowledges/services_prices')}
        </a>
      </div>
      <p class="sc-note">Последний столбец — сколько раз введённой суммы хватит на цену.</p>
    </div>
  )
}

function Moon({ f, size = 22 }: { f: number; size?: number }) {
  const r = size / 2 - 2,
    c = size / 2,
    th = 2 * Math.PI * f,
    rx = Math.abs(r * Math.cos(th)),
    cs = Math.cos(th)
  const waxing = f < 0.5
  const sweep = waxing ? (cs > 0 ? 0 : 1) : cs > 0 ? 1 : 0
  const d = `M${c},${c - r} A${r},${r} 0 0 ${waxing ? 1 : 0} ${c},${c + r} A${rx},${r} 0 0 ${sweep} ${c},${c - r} Z`
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      <circle cx={c} cy={c} r={r} fill="#2b2113" stroke="#b8892b" />
      <path d={d} fill="#f1e6c8" />
    </svg>
  )
}

function Sky({
  d,
  set,
  close,
}: {
  d: { y: number; m: number; d: number }
  set: (v: { y: number; m: number; d: number }) => void
  close: () => void
}) {
  const day = Math.max(1, Math.min(30, d.d))
  const comets = nearestComets(d.y)
  const num = (v: string, lo: number, hi: number, dflt: number) => {
    const x = Math.round(Number(v))
    return Number.isFinite(x) ? Math.max(lo, Math.min(hi, x)) : dflt
  }
  return (
    <div class="card sky">
      <CloseBtn onClick={close} />
      <h3>Небесный календарь</h3>
      <div class="meta">Год — 12 месяцев по 30 дней. Выберите дату.</div>
      <div class="mn-in">
        <input
          id="sky-day"
          type="number"
          min={1}
          max={30}
          value={day}
          onInput={(e) => set({ ...d, d: num((e.target as HTMLInputElement).value, 1, 30, 1) })}
        />
        <select id="sky-month" value={d.m} onChange={(e) => set({ ...d, m: +(e.target as HTMLSelectElement).value })}>
          {MONTHS_NOM.map((m, i) => (
            <option value={i + 1}>{m}</option>
          ))}
        </select>
        <input
          id="sky-year"
          type="number"
          value={d.y}
          onInput={(e) => set({ ...d, y: num((e.target as HTMLInputElement).value, YEAR_MIN, YEAR_MAX, d.y) })}
        />
      </div>
      <div class="sc-date">
        {day} {MONTHS[d.m - 1]} {d.y} г.
      </div>
      {MOONS.map((m) => {
        const p = moonPhase(m, d.y, d.m, day)
        return (
          <div class="moon" id={`moon-${m.name}`}>
            <Moon f={p.frac} />
            <div>
              <b>{m.name}</b> — {phaseName(p.frac)}, освещено {Math.round(p.illum * 100)}%<br />
              <small>
                день {p.cycleDay + 1} из {m.period}; {m.note}
              </small>
            </div>
          </div>
        )
      })}
      <h4>Кометы</h4>
      {comets.map(({ comet, prev, next, now }) => (
        <p class="comet" id={`comet-${comet === COMETS[0] ? 'olaf' : 'oriana'}`}>
          <b>{comet.name}</b> (открыта в {comet.found} г., раз в {comet.every} лет)
          <br />
          {now ? (
            <>в {prev} г. — пролёт в этом году. </>
          ) : prev !== null ? (
            <>
              прошлый пролёт: {prev} г. ({d.y - prev} лет назад).{' '}
            </>
          ) : (
            <>до открытия пролётов в списке нет. </>
          )}
          {next !== d.y && (
            <>
              Следующий: {next} г. (через {next - d.y} лет).
            </>
          )}
          <br />
          <small>{comet.note}</small>
        </p>
      ))}
      <p class="sc-note">
        В вики указаны периоды лун и годы пролётов комет, но не календарные даты фаз. Фазы посчитаны от условной точки:
        новая луна у всех трёх в 1-й день 1-го месяца 1 года. Пролёт кометы — по году, без дня. Поэтому фазы показывают
        место в цикле, а не сверенную с вики дату.
      </p>
      <div class="links">
        Источник:{' '}
        <a href={wikiUrl('knowledges/astronomy')} target="_blank" rel="noreferrer">
          {wikiTitle('knowledges/astronomy')}
        </a>
      </div>
    </div>
  )
}
