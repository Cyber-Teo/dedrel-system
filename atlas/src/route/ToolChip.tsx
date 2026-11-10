// Полоса над картой: «Активно: <инструмент> · Esc — выйти» (рисует Ruler, показывает активный из src/ui/activeTool.ts).
// На сенсорном экране Esc нет: плашка «<инструмент> · × выйти», тап по ней выходит из инструмента.
import { exitActiveTool, useActiveTool } from '../ui/activeTool'

const coarse = () => typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches

export function ToolChip() {
  const t = useActiveTool()
  if (!t) return null
  if (coarse())
    return (
      <button type="button" class="tool-chip" aria-label={`${t.label}: выйти`} onClick={exitActiveTool}>
        {t.label} · × выйти
      </button>
    )
  return (
    <span class="tool-chip" role="status">
      Активно: {t.label} · Esc — выйти
    </span>
  )
}
