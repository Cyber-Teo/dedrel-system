// Поиск обязательных узлов разметки index.html с понятной ошибкой вместо «!».
export function byId<T extends HTMLElement = HTMLElement>(id: string): T {
  const el = document.getElementById(id)
  if (!el) throw new Error(`В index.html нет элемента #${id}`)
  return el as T
}

/** Слоты разметки, в которые портируются компоненты. */
export const slots = {
  /** Правая панель «досье» — стек карточек. */
  get dossier() {
    return byId('dossier')
  },
  /** Контейнер подсказок и плашек свёрнутых карточек над картой. */
  get toolBar() {
    return byId('tool-bar')
  },
}
