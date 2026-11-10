// КОНТРАКТ. Вспомогательное для оболочки: взаимное исключение панелей и безопасный localStorage.
//  announcePanel('layers'|'tools') — «я открылась»; onPanel(f) — подписка (остальные панели на узком экране закрываются сами).
//  store.get/set — localStorage с try/catch (приватный режим): ключи с префиксом dedrel-.
import { isToolsSheet } from './breakpoints'

type P = 'layers' | 'tools'
const subs = new Set<(p: P) => void>()
export const announcePanel = (p: P) => {
  if (isToolsSheet()) subs.forEach((f) => f(p))
}
export const onPanel = (f: (p: P) => void) => {
  subs.add(f)
  return () => {
    subs.delete(f)
  }
}
export const store = {
  get(k: string): string | null {
    try {
      return localStorage.getItem('dedrel-' + k)
    } catch {
      return null /* приватный режим: хранилища нет */
    }
  },
  set(k: string, v: string) {
    try {
      localStorage.setItem('dedrel-' + k, v)
    } catch {
      /* нет хранилища */
    }
  },
}
