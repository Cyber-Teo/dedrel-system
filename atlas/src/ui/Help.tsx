// Окно «?»: как пользоваться, горячие клавиши, легенда достоверности, шкала лет, атрибуция. Открывается кнопкой в шапке или клавишей «?».
// Из других мест: emit('help') (lib/bus).
import { createPortal } from 'preact/compat'
import { COATS_ATTRIBUTION } from '../history/coats'
import { useEffect, useRef, useState } from 'preact/hooks'
import { useOverlay } from './overlayStack'
import { Ic } from './uiIcons'
import { WIKI_URL } from '../config'
import { byId } from './dom'
import { CloseBtn } from './CloseBtn'
import { on } from '../lib/bus'

export function Help({ onWelcome }: { onWelcome: () => void }) {
  const [open, setOpen] = useState(false)
  const opener = useRef<HTMLElement | null>(null)
  const box = useRef<HTMLDivElement>(null)
  const show = () => {
    opener.current = document.activeElement as HTMLElement
    setOpen(true)
  }
  const hide = () => {
    setOpen(false)
    setTimeout(() => opener.current?.isConnected && opener.current.focus(), 0)
  }
  useOverlay(open, hide, 0)
  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement
      if (e.key === '?' && !/^(INPUT|SELECT|TEXTAREA)$/.test(t.tagName) && !e.metaKey && !e.ctrlKey) {
        e.preventDefault()
        open ? hide() : show()
      }
    }
    const h = () => show()
    addEventListener('keydown', k)
    const offHelp = on('help', h)
    return () => {
      removeEventListener('keydown', k)
      offHelp()
    }
  }, [open])
  useEffect(() => {
    if (open) box.current?.querySelector<HTMLElement>('h2')?.focus()
  }, [open])
  return (
    <>
      {createPortal(
        <button
          type="button"
          id="help-btn"
          class="hbtn"
          aria-label="Справка"
          aria-haspopup="dialog"
          aria-expanded={open}
          title="Справка и горячие клавиши (?)"
          onClick={() => (open ? hide() : show())}
        >
          <Ic n="help" size={20} />
          <span class="hl">Справка</span>
        </button>,
        byId('slot-help'),
      )}
      {open &&
        createPortal(
          <div class="modal-ov" onClick={(e) => e.target === e.currentTarget && hide()}>
            <div class="modal help" role="dialog" aria-modal="true" aria-labelledby="help-h" ref={box}>
              <div class="modal-head">
                <h2 id="help-h" tabIndex={-1}>
                  Как пользоваться атласом
                </h2>
                <CloseBtn onClick={hide} />
              </div>
              <div class="modal-body">
                <section>
                  <h3>Основное</h3>
                  <ul>
                    <li>
                      <b>Поиск</b> (строка сверху, клавиша «/») находит места, людей, государства и события; выбор
                      открывает карточку и переводит карту.
                    </li>
                    <li>
                      <b>Слои</b> включают точки и области на карте: города, дороги, религии, угрозы. Рядом с названием
                      — «N на карте из M»: сколько объектов видно сейчас и сколько их всего в слое.
                    </li>
                    <li>
                      <b>Время</b>: нижняя линейка меняет год; красные штрихи на шкале — события хроники, каждый штрих —
                      одно событие. Пробел запускает прокрутку лет.
                    </li>
                    <li>
                      <b>Инструменты</b> слева (рельс значков, по клику открывается список): измерить расстояние,
                      маршрут или площадь; готовые наборы слоёв; списки (государства года, сценарии, цены, луны и
                      кометы); окна; экспорт PNG.
                    </li>
                    <li>
                      <b>Подложка</b> (кнопка в шапке): «рисованная» — карта мира как есть; «приглушённая» — бледный
                      фон, на нём читаются цвета государств.
                    </li>
                  </ul>
                </section>
                <section>
                  <h3>Горячие клавиши</h3>
                  <dl class="keys">
                    <dt>
                      <kbd>?</kbd>
                    </dt>
                    <dd>эта справка</dd>
                    <dt>
                      <kbd>/</kbd>
                    </dt>
                    <dd>перейти в поиск</dd>
                    <dt>
                      <kbd>Esc</kbd>
                    </dt>
                    <dd>закрыть окно, карточку, инструмент, врезку, слои — по очереди</dd>
                    <dt>
                      <kbd>Пробел</kbd>
                    </dt>
                    <dd>запустить или остановить прокрутку лет</dd>
                    <dt>
                      <kbd>[</kbd> <kbd>]</kbd>
                    </dt>
                    <dd>
                      шаг по шкале времени назад / вперёд (по умолчанию 5 лет); на сфокусированной линейке — к соседнему
                      событию (также <kbd>Alt</kbd>+<kbd>←</kbd> / <kbd>→</kbd>)
                    </dd>
                    <dt>
                      <kbd>PgUp</kbd> <kbd>PgDn</kbd> <kbd>Home</kbd> <kbd>End</kbd>
                    </dt>
                    <dd>
                      когда в фокусе линейка лет: стрелки — на год, PgUp/PgDn — на 10 лет, Home/End — к началу и к концу
                      шкалы. Вне линейки стрелки двигают карту
                    </dd>
                    <dt>
                      <kbd>↑</kbd> <kbd>↓</kbd> <kbd>Enter</kbd>
                    </dt>
                    <dd>выбор в выдаче поиска</dd>
                  </dl>
                </section>
                <section>
                  <h3>Как читать заливку</h3>
                  <ul class="conf-leg fill-leg">
                    <li>
                      <i class="fsw solid" /> <b>Сплошная</b> — сказано прямо в вики.
                    </li>
                    <li>
                      <i class="fsw hatch" /> <b>Полосы</b> — вывод из текста вики или гипотеза автора карты; границы
                      приблизительные.
                    </li>
                    <li>
                      <i class="fsw none" /> <b>Серое, без заливки</b> — сведений нет.
                    </li>
                  </ul>
                </section>
                <section>
                  <h3>Что значат «факт», «вывод», «гипотеза», «нет сведений»</h3>
                  <ul class="conf-leg">
                    <li>
                      <span class="conf canon">факт</span> сказано прямо в вики.
                    </li>
                    <li>
                      <span class="conf derived">вывод</span> следует из текста вики, но прямо там не записано.
                    </li>
                    <li>
                      <span class="conf speculative">гипотеза</span> предположение автора карты; на карте такие объекты
                      обычно приблизительные.
                    </li>
                    <li>
                      <span class="conf none">нет сведений</span> данных нет; область или точка не закрашены.
                    </li>
                  </ul>
                </section>
                <section>
                  <h3>Годы</h3>
                  <p>
                    <b>1</b> — победа над Асмодеем, с него идёт летоисчисление; годы до неё отрицательные («−300» — за
                    300 лет до победы над Асмодеем), года 0 нет. <b>1006</b> — условный текущий год карты, события вики
                    доходят до 1005. Окно ±N лет у линейки определяет, какие события попадают в список.
                  </p>
                </section>
                <section>
                  <h3>О проекте</h3>
                  <p>
                    Атлас построен по вики мира Дедрела:{' '}
                    <a href={WIKI_URL} target="_blank" rel="noreferrer">
                      {WIKI_URL}
                    </a>
                    . Иконки интерфейса нарисованы для проекта и отдельной атрибуции не требуют.
                  </p>
                  <p>{COATS_ATTRIBUTION}</p>
                  <p>
                    <button
                      type="button"
                      onClick={() => {
                        hide()
                        setTimeout(onWelcome, 0)
                      }}
                    >
                      Показать приветствие снова
                    </button>
                  </p>
                </section>
              </div>
            </div>
          </div>,
          document.body,
        )}
    </>
  )
}
