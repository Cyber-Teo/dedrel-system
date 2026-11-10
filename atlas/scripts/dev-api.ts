// Локальный сервер для api/*.ts (мастер-режим): vite проксирует на него /api. Запуск: pnpm dev:api
// Переменные берутся из .env.local (MASTER_PASSWORD, MASTER_SECRET), см. .env.example.
import { createServer, type IncomingHttpHeaders } from 'node:http'
import { existsSync } from 'node:fs'
import { DEV_API_PORT } from './lib/dev-port'

if (existsSync('.env.local')) process.loadEnvFile('.env.local')
process.env.MASTER_INSECURE_COOKIE = '1' // локально http, cookie без Secure

type Handler = (req: Request) => Promise<Response>
const { default: master } = (await import('../api/master')) as { default: Handler }
const routes: Record<string, Handler> = { '/api/master': master }

const toHeaders = (h: IncomingHttpHeaders): Headers => {
  const out = new Headers()
  for (const [k, v] of Object.entries(h)) if (v !== undefined) out.set(k, Array.isArray(v) ? v.join(', ') : v)
  return out
}

createServer(async (rq, rs) => {
  const url = new URL(rq.url ?? '/', `http://${rq.headers.host}`)
  const handler = routes[url.pathname]
  if (!handler) {
    rs.writeHead(404).end('{"error":"not found"}')
    return
  }
  const chunks: Buffer[] = []
  for await (const c of rq) chunks.push(c as Buffer)
  const hasBody = chunks.length > 0 && rq.method !== 'GET' && rq.method !== 'HEAD'
  const res = await handler(
    new Request(url, {
      method: rq.method,
      headers: toHeaders(rq.headers),
      body: hasBody ? Buffer.concat(chunks) : undefined,
    }),
  )
  const headers: Record<string, string | string[]> = {}
  res.headers.forEach((v, k) => {
    headers[k] = v
  })
  const cookies = res.headers.getSetCookie()
  if (cookies.length) headers['set-cookie'] = cookies
  rs.writeHead(res.status, headers).end(Buffer.from(await res.arrayBuffer()))
}).listen(DEV_API_PORT, '127.0.0.1', () => console.log(`dev-api http://127.0.0.1:${DEV_API_PORT}`))
