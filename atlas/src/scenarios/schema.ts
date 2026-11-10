import { z } from 'zod'

const Px = z.tuple([z.number(), z.number()])
const Via = z.union([z.string(), Px]) // id места или пиксели карты
export const StepDate = z.object({
  year: z.number().int(),
  month: z.number().int().min(1).max(12).optional(),
  day: z.number().int().min(1).max(31).optional(),
  time: z.string().optional(),
  label: z.string().optional(),
  note: z.string().optional(),
})
export const Step = z.object({
  title: z.string().min(1),
  date: StepDate,
  text: z.string().min(1),
  camera: z
    .object({ place: z.string().optional(), px: Px.optional(), zoom: z.number().min(1).max(8).default(3) })
    .refine((c) => !!c.place !== !!c.px, 'нужно ровно одно: place или px'),
  highlight: z
    .object({
      places: z.array(z.string()).default([]),
      lines: z.array(z.object({ label: z.string(), via: z.array(Via).min(2) })).default([]),
      polities: z.array(z.string()).default([]),
    })
    .default({ places: [], lines: [], polities: [] }),
  owners_at: z.number().optional(), // дробный год кадра политики (1005.5), если нужен кадр внутри года
  sources: z.array(z.string()).min(1),
})
export const Scenario = z.object({
  id: z.string(),
  title: z.string(),
  summary: z.string(),
  sources: z.array(z.string()).min(1),
  steps: z.array(Step).min(3),
})
export type ScenarioT = z.infer<typeof Scenario>
export type StepT = z.infer<typeof Step>
