import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { getCustomerSessionToken, proxyBackendUrl, forwardedClientIp } from '@/lib/auth/session'
export const dynamic = 'force-dynamic'
const guestCookie = 'tb_chat_guest'
const paths = new Set([
  'config',
  'session',
  'conversations',
  'messages',
  'image',
  'image-message',
  'context',
  'claim',
  'reopen',
  'delete',
  'stream',
])
export async function GET(request: Request) {
  return proxy(request)
}
export async function POST(request: Request) {
  return proxy(request)
}
function hasValidOrigin(request: Request, url: URL) {
  // Behind nginx/Cloudflare, request.url can contain the internal HTTP origin.
  // Use the configured storefront URL, never client-supplied forwarding headers.
  try {
    const site = new URL(process.env.NEXT_PUBLIC_SITE_URL?.trim() || url.origin)
    if (!['http:', 'https:'].includes(site.protocol) || site.username || site.password) return false
    return request.headers.get('origin') === site.origin
  } catch {
    return false
  }
}
async function proxy(request: Request) {
  const url = new URL(request.url),
    path = url.pathname.slice('/api/chat/'.length)
  if (!paths.has(path)) return NextResponse.json({ code: 'NOT_FOUND' }, { status: 404 })
  if (request.method === 'POST' && !hasValidOrigin(request, url))
    return NextResponse.json({ code: 'INVALID_ORIGIN' }, { status: 403 })
  try {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' },
      token = await getCustomerSessionToken()
    const cursor = request.headers.get('last-event-id')
    if (path === 'stream' && cursor && /^\d{1,19}$/.test(cursor)) headers['last-event-id'] = cursor
    if (token) headers.authorization = `Bearer ${token}`
    const guest = (await cookies()).get(guestCookie)?.value
    if (guest && /^[a-f0-9]{64}$/.test(guest)) headers['x-tamir-chat-guest'] = guest
    if (process.env.NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY)
      headers['x-publishable-api-key'] = process.env.NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY
    const ip = forwardedClientIp(request.headers)
    if (ip) headers['x-forwarded-for'] = ip
    const target = new URL(proxyBackendUrl() + '/store/chat/' + path)
    for (const key of ['id', 'before', 'image']) {
      const v = url.searchParams.get(key)
      if (v) target.searchParams.set(key, v)
    }
    let body: string | undefined
    if (request.method === 'POST') {
      const maxBytes = path === 'image-message' ? 7 * 1024 * 1024 : 8192
      if (Number(request.headers.get('content-length')) > maxBytes)
        return NextResponse.json({ code: 'PAYLOAD_TOO_LARGE' }, { status: 413 })
      const reader = request.body?.getReader(),
        chunks: Uint8Array[] = []
      let size = 0
      if (reader) {
        for (;;) {
          const { value, done } = await reader.read()
          if (done) break
          size += value.byteLength
          if (size > maxBytes) {
            await reader.cancel()
            return NextResponse.json({ code: 'PAYLOAD_TOO_LARGE' }, { status: 413 })
          }
          chunks.push(value)
        }
      }
      body = Buffer.concat(chunks).toString('utf8')
    }
    const upstream = await fetch(target, {
      method: request.method,
      headers,
      body,
      cache: 'no-store',
      redirect: 'error',
      signal: AbortSignal.any([request.signal, AbortSignal.timeout(path === 'stream' ? 25000 : 20000)]),
    })
    if (path === 'stream' && upstream.ok)
      return new Response(upstream.body, {
        headers: {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-store, no-transform',
          'X-Accel-Buffering': 'no',
        },
      })
    if (path === 'image' && upstream.ok)
      return new Response(upstream.body, { headers: {
        'Content-Type': 'image/jpeg', 'Cache-Control': 'private, no-store',
        'X-Content-Type-Options': 'nosniff', 'Content-Disposition': 'inline; filename="chat-image.jpg"',
      } })
    const data = await upstream.json(),
      guestToken = data.guest_token
    delete data.guest_token
    const response = NextResponse.json(data, { status: upstream.status, headers: { 'Cache-Control': 'no-store' } })
    const options = {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax' as const,
      path: '/',
    }
    if (upstream.ok && typeof guestToken === 'string' && /^[a-f0-9]{64}$/.test(guestToken))
      response.cookies.set(guestCookie, guestToken, { ...options, maxAge: 30 * 86400 })
    if (upstream.ok && path === 'claim') response.cookies.set(guestCookie, '', { ...options, maxAge: 0 })
    return response
  } catch {
    return NextResponse.json({ code: 'CHAT_UNAVAILABLE' }, { status: 503, headers: { 'Cache-Control': 'no-store' } })
  }
}
