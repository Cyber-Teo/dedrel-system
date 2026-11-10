// КОНТРАКТ. Кнопка колонки инструментов: SVG-иконка 18px + подпись + title. Для переключателей передавать on (даёт aria-pressed).
// Короткие подписи и уникальные иконки для длинных/повторяющихся пунктов подменяются здесь (полное имя уходит в title).
import type { ComponentChildren } from 'preact'
import { Ic, type IcName } from './uiIcons'

const SHORT: Record<string, { label?: string; n?: IcName }> = {
  'Крепости и опасности': { n: 'fort' },
  'Политика на 1006 г.': { n: 'crown' },
  Торговля: { n: 'trade' },
}

export function ToolBtn({
  n,
  title,
  on,
  onClick,
  id,
  disabled,
  children,
}: {
  n: IcName
  title: string
  on?: boolean
  onClick: () => void
  id?: string
  disabled?: boolean
  children: ComponentChildren
}) {
  const full = typeof children === 'string' ? children : ''
  const s = SHORT[full]
  const label = s?.label ?? children
  const tt = s?.label ? `${full}. ${title}` : title
  return (
    <button
      type="button"
      id={id}
      class={`tb ${on ? 'on' : ''}`}
      title={tt}
      aria-label={s?.label ? full : undefined}
      aria-pressed={on === undefined ? undefined : on}
      disabled={disabled}
      onClick={onClick}
    >
      <Ic n={s?.n ?? n} />
      <span class="tbl">{label}</span>
    </button>
  )
}
