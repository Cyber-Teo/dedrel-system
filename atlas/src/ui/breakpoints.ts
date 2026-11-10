// Брейкпоинты интерфейса в px (ширина окна). В style.css те же значения стоят в @media (min-/max-width), менять вместе.
export const BP = {
  /** Телефон в портрете: шторка вместо правой панели, карта заполняет высоту. */
  phone: 600,
  /** Узкая шапка: поиск раскрывается по кнопке-лупе. */
  narrow: 640,
  /** Колонка инструментов и панель слоёв становятся листами. */
  tools: 900,
  /** Мелкие тосты. */
  compact: 480,
} as const

export const isPhone = () => innerWidth <= BP.phone
export const isNarrow = () => innerWidth <= BP.narrow
export const isToolsSheet = () => innerWidth <= BP.tools
export const isCompact = () => innerWidth <= BP.compact
