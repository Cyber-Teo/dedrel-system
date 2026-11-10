// Кнопка «Мастер» в верхней панели: вход по паролю, бейдж «режим мастера», выход.
// /api/master запрашивается только по нажатию (или при повторном заходе мастера — флаг в localStorage); недоступен — кнопка disabled.
import { createPortal } from 'preact/compat'
import { useEffect, useState } from 'preact/hooks'
import { login, logout, probe, resume, useMaster } from './master'
import { Ic } from './ui/uiIcons'

export function MasterUI() {
  const master = useMaster()
  const [open, setOpen] = useState(false)
  const [unavail, setUnavail] = useState(false)
  const [pw, setPw] = useState('')
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  useEffect(() => {
    resume()
  }, [])
  const press = async () => {
    if (open) {
      setOpen(false)
      return
    }
    setBusy(true)
    const ok = await probe()
    setBusy(false)
    if (!ok) {
      setUnavail(true)
      return
    }
    setOpen(true)
    setErr('')
  }
  const submit = async (e: Event) => {
    e.preventDefault()
    setBusy(true)
    setErr('')
    const m = await login(pw)
    setBusy(false)
    if (m) setErr(m)
    else {
      setOpen(false)
      setPw('')
    }
  }
  return createPortal(
    <>
      {master ? (
        <>
          <span class="master-badge" title="Мастерские события и слухи включены">
            режим мастера
          </span>
          <button type="button" class="mbtn" onClick={logout}>
            Выйти
          </button>
        </>
      ) : (
        <button
          type="button"
          class={`mbtn ${open ? 'on' : ''}`}
          disabled={unavail || busy}
          aria-expanded={open}
          aria-controls="master-login"
          title={unavail ? 'Режим мастера недоступен' : 'Режим ведущего'}
          onClick={press}
        >
          <Ic n="quill" />
          <span class="mtxt">Мастер</span>
        </button>
      )}
      {open && !master && (
        <form class="master-login" id="master-login" onSubmit={submit}>
          <input
            type="password"
            autoComplete="current-password"
            placeholder="Пароль мастера"
            aria-label="Пароль мастера"
            value={pw}
            autoFocus
            onInput={(e) => setPw((e.target as HTMLInputElement).value)}
          />
          <button type="submit" disabled={busy || !pw}>
            Войти
          </button>
          {err && <div class="err">{err}</div>}
        </form>
      )}
    </>,
    document.getElementById('slot-master')!,
  )
}
