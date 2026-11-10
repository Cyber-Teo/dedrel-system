import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// Файл api/_data/master.json собирается скриптом и в git не лежит, поэтому в тесте он подменён.
vi.mock('./_data/master.json', () => ({ default: { events: [{ id: 'ev:1', year: 5, title: 'Слух' }] } }))

const HOST = 'atlas.test'
const URL_ = `https://${HOST}/api/master`
const post = (body: unknown, headers: Record<string, string> = {}) =>
  new Request(URL_, {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { origin: `https://${HOST}`, host: HOST, 'x-real-ip': '1.1.1.1', ...headers },
  })

let handler: (req: Request) => Promise<Response>
beforeEach(async () => {
  vi.resetModules() // у каждого теста свой счётчик лимитера
  vi.stubEnv('MASTER_PASSWORD', 'pw')
  vi.stubEnv('MASTER_SECRET', 'sign-key')
  handler = (await import('./master')).default
})
afterEach(() => vi.unstubAllEnvs())

describe('/api/master', () => {
  it('401 без cookie', async () => {
    const r = await handler(new Request(URL_))
    expect(r.status).toBe(401)
    expect(r.headers.get('cache-control')).toBe('no-store')
  })

  it('вход с верным паролем ставит cookie, по ней отдаются данные', async () => {
    const login = await handler(post({ password: 'pw' }))
    expect(login.status).toBe(200)
    const cookie = login.headers.get('set-cookie')!.split(';')[0]
    const r = await handler(new Request(URL_, { headers: { cookie } }))
    expect(r.status).toBe(200)
    expect(((await r.json()) as { events: unknown[] }).events).toHaveLength(1)
  })

  it('429 после 10 неверных попыток с одного адреса', async () => {
    for (let i = 0; i < 10; i++) expect((await handler(post({ password: 'x' }))).status).toBe(401)
    expect((await handler(post({ password: 'pw' }))).status).toBe(429)
    // другой адрес не затронут
    expect((await handler(post({ password: 'x' }, { 'x-real-ip': '2.2.2.2' }))).status).toBe(401)
  })

  it('лимит не обходится подменой x-forwarded-for', async () => {
    for (let i = 0; i < 10; i++) await handler(post({ password: 'x' }, { 'x-forwarded-for': `9.9.9.${i}` }))
    expect((await handler(post({ password: 'pw' }, { 'x-forwarded-for': '8.8.8.8' }))).status).toBe(429)
  })

  it('503 без пароля', async () => {
    vi.stubEnv('MASTER_PASSWORD', '')
    expect((await handler(post({ password: 'pw' }))).status).toBe(503)
  })

  it('503 без MASTER_SECRET (cookie паролем не подписывается)', async () => {
    vi.stubEnv('MASTER_SECRET', '')
    expect((await handler(post({ password: 'pw' }))).status).toBe(503)
    expect((await handler(new Request(URL_))).status).toBe(503)
  })

  it('403 при чужом Origin на POST и DELETE', async () => {
    expect((await handler(post({ password: 'pw' }, { origin: 'https://evil.test' }))).status).toBe(403)
    const del = new Request(URL_, { method: 'DELETE', headers: { origin: 'https://evil.test', host: HOST } })
    expect((await handler(del)).status).toBe(403)
  })

  it('413 на слишком большое тело', async () => {
    expect((await handler(post({ password: 'x'.repeat(5000) }))).status).toBe(413)
  })

  it('405 на чужой метод', async () => {
    expect((await handler(new Request(URL_, { method: 'PUT' }))).status).toBe(405)
  })
})
