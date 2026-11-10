// Группы типов событий: цвет штриха на шкале времени и легенда. Тип берётся из events.yaml.
export const EVENT_GROUPS = [
  { id: 'war', label: 'война, битва', color: '#b3261e', types: ['war', 'battle', 'annexation'] },
  { id: 'founding', label: 'основание, независимость', color: '#2e7d4f', types: ['founding', 'independence'] },
  { id: 'dynasty', label: 'династия, коронация', color: '#8a5a14', types: ['dynasty', 'coronation', 'birth', 'death'] },
  { id: 'treaty', label: 'договор, политика', color: '#2b6cb0', types: ['treaty', 'politics'] },
  { id: 'rebellion', label: 'восстание', color: '#d9822b', types: ['rebellion', 'trial'] },
  { id: 'other', label: 'прочее', color: '#6b6256', types: [] as string[] },
] as const

export const groupOfType = (t: string | undefined) =>
  EVENT_GROUPS.find((g) => (g.types as readonly string[]).includes(t ?? '')) ?? EVENT_GROUPS[EVENT_GROUPS.length - 1]
