// Верхняя полоса панели «досье»: кнопка «назад» (к свёрнутой карточке или к слоям), свёртка панели в ленту и заголовок.
export type DosBarProps = {
  /** Подпись кнопки «назад»; пусто — кнопки нет. */
  backLabel: string
  backTitle: string
  onBack: () => void
  folded: boolean
  onFold: () => void
  /** Заголовок верхней карточки (виден в свёрнутой ленте). */
  title: string
}

export function DosBar({ backLabel, backTitle, onBack, folded, onFold, title }: DosBarProps) {
  const foldTitle = folded ? 'Развернуть панель' : 'Свернуть панель'
  return (
    <>
      {backLabel && (
        <button type="button" class="dos-back" title={backTitle} onClick={onBack}>
          {backLabel}
        </button>
      )}
      <button
        type="button"
        class="dos-fold"
        title={foldTitle}
        aria-label={foldTitle}
        aria-expanded={!folded}
        onClick={onFold}
      >
        {folded ? '‹' : '›'}
      </button>
      <span class="dos-ttl">{title}</span>
    </>
  )
}
