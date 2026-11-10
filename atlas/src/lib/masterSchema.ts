// Схема мастер-данных: общая для функции api/master.ts (проверка перед отдачей) и клиента src/master.ts (проверка ответа).
import { z } from 'zod'

const Actor = z.object({ name: z.string(), id: z.string().optional() })

/** Событие мастера: те же поля, что у публичного Ev (src/events.ts), плюс запас под новые поля данных. */
export const MasterEventSchema = z.looseObject({
  id: z.string(),
  year: z.number().nullable().optional(),
  date_precision: z.string().default('year'),
  date_text: z.string().optional(),
  title: z.string(),
  type: z.string().optional(),
  description: z.string().optional(),
  places: z.array(z.string()).default([]),
  actors: z.array(Actor).optional(),
  sources: z.array(z.string()).default([]),
  visibility: z.string().default('master'),
})

/** Весь ответ /api/master: события и произвольные остальные списки из data/master/*.yaml. */
export const MasterDataSchema = z.looseObject({ events: z.array(MasterEventSchema).default([]) })

export type MasterEvent = z.infer<typeof MasterEventSchema>
export type MasterData = z.infer<typeof MasterDataSchema>
