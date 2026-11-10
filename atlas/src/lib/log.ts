// Единая точка логирования: префикс «[atlas]» и область; в тестах (vitest) вывод подавлен.
const quiet = import.meta.env?.MODE === 'test'

/** Предупреждение: сбой, после которого приложение продолжает работать. */
export const warn = (scope: string, ...details: unknown[]): void => {
  if (!quiet) console.warn(`[atlas] ${scope}`, ...details)
}

/** Ошибка: сбой, из-за которого часть функций не заработала. */
export const error = (scope: string, ...details: unknown[]): void => {
  if (!quiet) console.error(`[atlas] ${scope}`, ...details)
}
