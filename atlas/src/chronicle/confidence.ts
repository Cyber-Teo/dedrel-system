// Достоверность записи истории: подписи для легенды, бейджей досье и окна «?».
export type ConfidenceKey = 'canon' | 'derived' | 'speculative' | 'none'

export const CONFIDENCE_RU: Record<ConfidenceKey, { label: string; title: string }> = {
  canon: { label: 'факт', title: 'факт — прямо сказано в вики' },
  derived: { label: 'вывод', title: 'вывод — следует из текста вики' },
  speculative: { label: 'гипотеза', title: 'гипотеза — предположение автора карты' },
  none: { label: 'нет сведений', title: 'нет сведений — вики об этом молчит' },
}

export const confidenceTitle = (c: string | null | undefined) => {
  const k = (c && c in CONFIDENCE_RU ? c : 'none') as ConfidenceKey
  return CONFIDENCE_RU[k].title
}
