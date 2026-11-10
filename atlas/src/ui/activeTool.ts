// КОНТРАКТ. Один активный инструмент карты (Линейка, Маршрут, Площадь, …).
//   activateTool(id, label, off) — сделать инструмент активным. Прежний активный получает off() (он обязан выключиться).
//     Регистрирует Esc в overlayStack (rank 2) — Esc вызывает off(). Возвращает release() для cleanup эффекта (off не вызывает).
//   deactivateTool(id) — снять, если id всё ещё активен. activeToolId() / useActiveTool() — кто активен сейчас ({id,label} | null).
//   Пока инструмент активен: body.tool-active, а map.queryRenderedFeatures возвращает [] (см. guardMap) — чужие клики по карте
//   (досье ячейки, значки слоёв) не открывают карточки; сам инструмент ставит точки по e.lngLat/e.point и map.project.
//   Использование в компоненте:  useEffect(() => (on ? activateTool('ruler', 'Линейка', () => setOn(false)) : undefined), [on])
import type { Map as MLMap } from 'maplibre-gl'
import { useEffect, useState } from 'preact/hooks'
import { register } from './overlayStack'

type Tool = { id: string; label: string; off: () => void; unreg: () => void }
let cur: Tool | null = null
const subs = new Set<() => void>()
const emit = () => {
  document.body.classList.toggle('tool-active', !!cur)
  subs.forEach((f) => f())
}

export const activeToolId = () => cur?.id ?? null

export function activateTool(id: string, label: string, off: () => void): () => void {
  const prev = cur
  if (prev && prev.id !== id) {
    prev.unreg()
    cur = null
    prev.off()
  }
  cur?.unreg()
  const t: Tool = { id, label, off, unreg: register(off, 2, `tool-${id}`) }
  cur = t
  emit()
  return () => {
    if (cur === t) {
      t.unreg()
      cur = null
      emit()
    }
  }
}
/** Выйти из активного инструмента (тап по плашке на сенсорном экране): вызывает его off(). */
export const exitActiveTool = () => cur?.off()
export function deactivateTool(id: string) {
  if (cur?.id === id) {
    cur.unreg()
    cur = null
    emit()
  }
}

export function useActiveTool(): { id: string; label: string } | null {
  const [, set] = useState(0)
  useEffect(() => {
    const f = () => set((n) => n + 1)
    subs.add(f)
    return () => {
      subs.delete(f)
    }
  }, [])
  return cur ? { id: cur.id, label: cur.label } : null
}

let guarded = false
/** Один раз на карту: пока активен инструмент, queryRenderedFeatures пуст — слои не открывают карточки по клику. */
export function guardMap(map: MLMap) {
  if (guarded) return
  guarded = true
  const q = map.queryRenderedFeatures.bind(map)
  map.queryRenderedFeatures = ((...a: Parameters<MLMap['queryRenderedFeatures']>) =>
    cur ? [] : q(...a)) as MLMap['queryRenderedFeatures']
}
