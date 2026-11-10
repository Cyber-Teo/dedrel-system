// Кнопка «✕» карточек и окон: подпись «Закрыть» для скринридера и подсказка заданы здесь, а не правятся постфактум по DOM.
export function CloseBtn({ onClick, label = 'Закрыть' }: { onClick: () => void; label?: string }) {
  return (
    <button type="button" class="x" aria-label={label} title={label} onClick={onClick}>
      ✕
    </button>
  )
}
