// Служебные пометки автора данных не должны доходить до интерфейса: проверяем то, что видит пользователь, после cleanNote.
import { cleanNote, SERVICE_RE } from '../../../src/search/clean'

type Rec = Record<string, unknown>
const FIELDS: Record<string, string[]> = {
  places: ['name', 'hint', 'facts', 'parent_text'],
  events: ['title', 'description', 'date_text'],
  people: ['name', 'role', 'based_in', 'notable', 'affiliation', 'years'],
  orgs: ['name', 'hq', 'leader', 'presence', 'influence', 'kind'],
}
export function checkService(data: Record<string, Rec[] | undefined>): string[] {
  const out: string[] = []
  for (const [kind, fields] of Object.entries(FIELDS))
    for (const r of data[kind] ?? [])
      for (const f of fields) {
        const v = r[f]
        if (typeof v !== 'string') continue
        for (const piece of v.split(' | ')) {
          const t = f === 'name' ? piece : cleanNote(piece).text
          const m = SERVICE_RE.exec(t)
          if (m) out.push(`${kind}:${r.id}.${f}: служебная пометка «${m[0]}» в тексте для пользователя`)
        }
      }
  return out
}
