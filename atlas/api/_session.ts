// Чистые функции сессии мастера: HMAC-подпись cookie и сравнение за постоянное время. Без побочных эффектов — тестируется напрямую.
import { createHmac, timingSafeEqual } from 'node:crypto'

export const COOKIE = 'dedrel_master'
export const TTL_S = 12 * 3600

/**
 * Ключ HMAC в safeEqual. Секретом не является: HMAC здесь нужен только чтобы привести обе строки
 * к одинаковой длине перед timingSafeEqual, поэтому ключ можно держать в коде.
 */
const CMP_KEY = 'dedrel-master-cmp'

/** Сравнение строк за постоянное время (по HMAC-SHA-256, чтобы длина не утекала). */
export function safeEqual(a: string, b: string): boolean {
  const ha = createHmac('sha256', CMP_KEY).update(a).digest()
  const hb = createHmac('sha256', CMP_KEY).update(b).digest()
  return timingSafeEqual(ha, hb)
}

const mac = (body: string, secret: string) => createHmac('sha256', secret).update(body).digest('base64url')

/** Токен `m1.<exp>.<подпись>`; exp — unix-секунды окончания. */
export function signToken(secret: string, nowMs: number, ttlS = TTL_S): string {
  const body = `m1.${Math.floor(nowMs / 1000) + ttlS}`
  return `${body}.${mac(body, secret)}`
}

export function verifyToken(token: string | null | undefined, secret: string, nowMs: number): boolean {
  if (!token || !secret) return false
  const parts = token.split('.')
  if (parts.length !== 3 || parts[0] !== 'm1') return false
  const exp = Number(parts[1])
  if (!Number.isFinite(exp) || exp * 1000 < nowMs) return false
  return safeEqual(parts[2], mac(`${parts[0]}.${parts[1]}`, secret))
}

export function readCookie(header: string | null, name = COOKIE): string | null {
  for (const part of (header ?? '').split(';')) {
    const i = part.indexOf('=')
    if (i > 0 && part.slice(0, i).trim() === name) return part.slice(i + 1).trim()
  }
  return null
}

/**
 * Лимит неверных попыток: не больше `max` за окно на ключ.
 * Ограничение: счётчик живёт в памяти процесса, а serverless поднимает несколько инстансов с отдельными счётчиками,
 * поэтому лимит приблизительный (защита от перебора «в лоб», не точная квота).
 */
export function makeLimiter(max = 10, windowMs = 60_000) {
  const fails = new Map<string, number[]>()
  const recent = (k: string, now: number) => (fails.get(k) ?? []).filter((t) => now - t < windowMs)
  return {
    blocked: (k: string, now: number) => recent(k, now).length >= max,
    fail: (k: string, now: number) => {
      fails.set(k, [...recent(k, now), now])
    },
    reset: (k: string) => {
      fails.delete(k)
    },
  }
}
