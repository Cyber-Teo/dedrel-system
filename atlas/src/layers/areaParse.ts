// Разбор data/areas.yaml со схемой zod — только для Node (validate, тесты); в браузер приходит предсобранный JSON (scripts/build/data-json.ts).
import { parse } from 'yaml'
import { AreasFile, type AreasFileT } from '../data/schema'

export const parseAreas = (s: string): AreasFileT => AreasFile.parse(parse(s))
