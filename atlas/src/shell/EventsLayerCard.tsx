// Сводная карточка слоя «События»: список событий окна лет, на карте и без координат.
import { hasCoords, yearLabel, type Ev } from '../events'
import { CloseBtn } from '../ui/CloseBtn'

type Props = {
  year: number
  win: number
  listed: Ev[]
  noXY: Ev[]
  onMapCount: number
  onPick: (e: Ev) => void
  onClose: () => void
}

export function EventsLayerCard({ year, win, listed, noXY, onMapCount, onPick, onClose }: Props) {
  return (
    <div class="card evlayer">
      <CloseBtn onClick={onClose} />
      <h3>
        События: {yearLabel(year)} ±{win}
      </h3>
      <div class="meta">
        на карте {onMapCount}, без координат {noXY.length}
      </div>
      {onMapCount > 0 && (
        <div class="evlist">
          {listed.filter(hasCoords).map((e) => (
            <a class={e.master ? 'is-master' : ''} onClick={() => onPick(e)}>
              {e.year} — {e.title}
            </a>
          ))}
        </div>
      )}
      {noXY.length > 0 && (
        <div class="noxy">
          <b>Без координат на карте</b>
          {noXY.map((e) => (
            <a onClick={() => onPick(e)}>
              {e.year} — {e.title}
              {e.master && <em class="tag-master">мастер</em>}
            </a>
          ))}
        </div>
      )}
      {!listed.length && <p>В этом окне лет событий нет.</p>}
    </div>
  )
}
