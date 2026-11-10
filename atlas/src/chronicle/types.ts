import type { DedupeEv } from '../dedupe'

/** Событие хроники: поля склейки дублей (DedupeEv) плюс то, что показывают карточки. */
export type Ev = DedupeEv & {
  date_precision: string
  date_text?: string
  visibility: string
  alt?: { text: string; sources: string[] }[]
  /** Есть служебная пометка автора («вывод», «расхождение») — см. search/clean.ts. */
  derived?: boolean
  notes?: string[]
  type?: string
  territorial_change?: { gains?: { polity: string }[]; losses?: { polity: string }[]; note?: string }
}

export type Pl = { id: string; name: string; x?: number; y?: number }
