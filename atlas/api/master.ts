// /api/master — режим мастера. POST {password} → cookie-сессия; GET → мастер-JSON (только с валидной cookie); DELETE → выход.
// Мастер-данные собираются в api/_data/master.json скриптом scripts/build-master.ts (вне public/, в бандл сайта не попадают).
// Для входа нужны обе переменные окружения: MASTER_PASSWORD (пароль) и отдельный MASTER_SECRET (ключ подписи cookie).
import master from './_data/master.json' with { type: 'json' }
import { MasterDataSchema } from '../src/lib/masterSchema.js'
import { COOKIE, TTL_S, makeLimiter, readCookie, safeEqual, signToken, verifyToken } from './_session.js'

// Лимит в памяти инстанса: на serverless их может быть несколько, поэтому он приблизительный (см. makeLimiter).
const limiter = makeLimiter(10, 60_000)
const MAX_BODY_BYTES = 1024 // пароль и так короткий; больше — заведомо не вход
const secret = () => process.env.MASTER_SECRET ?? ''
const password = () => process.env.MASTER_PASSWORD ?? ''
const HEADERS = { 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex, nofollow' }
// Secure ставим всегда, кроме явного локального http (MASTER_INSECURE_COOKIE=1 в dev-api).
const flags = () => `Path=/; HttpOnly; SameSite=Strict${process.env.MASTER_INSECURE_COOKIE === '1' ? '' : '; Secure'}`
const json = (body: unknown, status = 200, extra: Record<string, string> = {}) =>
  Response.json(body, { status, headers: { ...HEADERS, ...extra } })

/** Ключ лимитера: адрес клиента из заголовков платформы. Заголовок x-forwarded-for клиент подделывает, ему не доверяем. */
const clientKey = (req: Request) => req.headers.get('x-real-ip') ?? req.headers.get('x-vercel-forwarded-for') ?? 'local'

/** Запись (POST/DELETE) допустима только со своей страницы: Origin обязан совпасть с Host. */
function sameOrigin(req: Request): boolean {
  const origin = req.headers.get('origin')
  const host = req.headers.get('host') ?? new URL(req.url).host
  if (!origin) return false
  try {
    return new URL(origin).host === host
  } catch {
    return false
  }
}

/** Тело запроса не длиннее MAX_BODY_BYTES; null — слишком большое или нечитаемое. */
async function readBody(req: Request): Promise<string | null> {
  const declared = Number(req.headers.get('content-length') ?? 0)
  if (declared > MAX_BODY_BYTES) return null
  const text = await req.text()
  return text.length > MAX_BODY_BYTES ? null : text
}

export async function GET(req: Request): Promise<Response> {
  if (!secret()) return json({ error: 'not configured' }, 503)
  if (!verifyToken(readCookie(req.headers.get('cookie')), secret(), Date.now()))
    return json({ error: 'unauthorized' }, 401)
  return json(MasterDataSchema.parse(master))
}

export async function POST(req: Request): Promise<Response> {
  if (!password() || !secret()) return json({ error: 'not configured' }, 503)
  if (!sameOrigin(req)) return json({ error: 'forbidden' }, 403)
  const now = Date.now(),
    key = clientKey(req)
  if (limiter.blocked(key, now)) return json({ error: 'too many attempts' }, 429, { 'Retry-After': '60' })
  let given = ''
  try {
    const body = await readBody(req)
    if (body === null) return json({ error: 'payload too large' }, 413)
    given = String((JSON.parse(body) as { password?: unknown }).password ?? '')
  } catch {
    /* пустой или битый JSON — считаем неверным паролем */
  }
  if (!given || !safeEqual(given, password())) {
    limiter.fail(key, now)
    return json({ error: 'unauthorized' }, 401)
  }
  limiter.reset(key)
  return json({ ok: true }, 200, {
    'Set-Cookie': `${COOKIE}=${signToken(secret(), now)}; ${flags()}; Max-Age=${TTL_S}`,
  })
}

export async function DELETE(req: Request): Promise<Response> {
  if (!sameOrigin(req)) return json({ error: 'forbidden' }, 403)
  return json({ ok: true }, 200, { 'Set-Cookie': `${COOKIE}=; ${flags()}; Max-Age=0` })
}

export default async function handler(req: Request): Promise<Response> {
  if (req.method === 'POST') return POST(req)
  if (req.method === 'DELETE') return DELETE(req)
  if (req.method === 'GET') return GET(req)
  return json({ error: 'method not allowed' }, 405, { Allow: 'GET, POST, DELETE' })
}
