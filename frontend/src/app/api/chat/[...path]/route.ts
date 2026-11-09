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
// Hosts we answer the storefront on. Their https origins are valid chat origins by
// themselves: the widget posts to the same origin it was loaded from, the DNS is ours,
// and naming them keeps one bad NEXT_PUBLIC_SITE_URL from rejecting every chat message.
const publicHosts = new Set(['tamir.rs', 'www.tamir.rs'])
let warnedSiteUrl = false

function parseOrigin(value?: string | null) {
  try {
    const parsed = new URL(String(value ?? '').trim())
    if (!['http:', 'https:'].includes(parsed.protocol) || parsed.username || parsed.password) return null
    return parsed
  } catch {
    return null
  }
}

function isLocalHost(hostname: string) {
  return (
    hostname === 'localhost' ||
    hostname.endsWith('.localhost') ||
    hostname === '127.0.0.1' ||
    hostname === '[::1]' ||
    hostname === '::1'
  )
}

function warnSiteUrl(value: string) {
  if (warnedSiteUrl) return
  warnedSiteUrl = true
  console.warn(
    `tamir-chat: NEXT_PUBLIC_SITE_URL=${value} is not a public storefront URL, so chat POSTs are ` +
      'accepted only from our public hosts and this exact origin. Set it to the public URL and ' +
      'rebuild the frontend: Next.js inlines NEXT_PUBLIC_* at build time.',
  )
}

function allowedOrigins(url: URL) {
  const allowed = new Set<string>()
  for (const host of publicHosts) allowed.add(`https://${host}`)
  const raw = process.env.NEXT_PUBLIC_SITE_URL?.trim() ?? ''
  const configured = parseOrigin(raw)
  if (configured) {
    allowed.add(configured.origin)
    if (isLocalHost(configured.hostname)) warnSiteUrl(raw)
  } else {
    // No usable configuration: local development, or a build made with a broken value.
    // The origin Next.js was addressed by stays open, exactly like before.
    if (raw) warnSiteUrl(raw)
    if (['http:', 'https:'].includes(url.protocol)) allowed.add(url.origin)
  }
  return allowed
}

function hasValidOrigin(request: Request, url: URL) {
  // Behind nginx/Cloudflare, request.url can contain the internal HTTP origin.
  // Only the configured storefront URL and our public hosts widen the list, never
  // client-supplied Host or X-Forwarded-* headers.
  const origin = parseOrigin(request.headers.get('origin'))
  return !!origin && allowedOrigins(url).has(origin.origin)
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
