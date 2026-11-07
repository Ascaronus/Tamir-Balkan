import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import { load } from '../test-support/component-harness.mjs'
import { guestValid, mergeMessages } from '../src/components/chat/chat-client.ts'
test('chat guest requires name and independently validates optional contacts', () => {
  assert.equal(guestValid('Ana', '', ''), true)
  assert.equal(guestValid('Ana', 'ana@example.test', ''), true)
  assert.equal(guestValid('Ana', '', '+381 63 123456'), true)
  assert.equal(guestValid('A', '', ''), false)
  assert.equal(guestValid('Ana', 'bad', ''), false)
  assert.equal(guestValid('Ana', '', 'invalid'), false)
})
test('chat merges replayed SSE IDs and status changes without duplicates', () => {
  const a = { id: 'a', seq: '1', status: 'sent', text: null },
    b = { id: 'b', seq: '2', status: 'delivered', text: 'Hello' }
  const rows = mergeMessages([b, a], [{ ...a, status: 'delivered', text: 'Zdravo' }, b])
  assert.equal(rows.length, 2)
  assert.equal(rows[0].text, 'Zdravo')
  assert.equal(rows[0].status, 'delivered')
})
for (const l of ['sr', 'en'])
  test('chat ' + l + ' dictionary covers form, errors, privacy and statuses', () => {
    const { chat } = JSON.parse(fs.readFileSync(new URL('../src/messages/' + l + '.json', import.meta.url)))
    for (const key of [
      'name',
      'email',
      'phone',
      'privacy',
      'start',
      'sending',
      'sent',
      'delivered',
      'deliveryError',
      'reconnecting',
      'deleteConfirm',
    ])
      assert.ok(chat[key]?.trim())
    assert.equal(chat.start, l === 'sr' ? 'Započni razgovor' : 'Start conversation')
    assert.ok(chat.privacy.includes('Google'))
  })
function route({ customer = null, guest = null, response = { saved: true }, status = 200, siteUrl = '' } = {}) {
  const calls = [],
    set = []
  const { GET, POST } = load(
    'frontend/src/app/api/chat/[...path]/route.ts',
    {
      'next/server': {
        NextResponse: {
          json: (data, opts = {}) => ({ data, status: opts.status || 200, cookies: { set: (...a) => set.push(a) } }),
        },
      },
      'next/headers': { cookies: async () => ({ get: () => (guest ? { value: guest } : undefined) }) },
      '@/lib/auth/session': {
        getCustomerSessionToken: async () => customer,
        proxyBackendUrl: () => 'http://backend.test',
        forwardedClientIp: () => null,
      },
    },
    {
      process: { env: { ...process.env, NEXT_PUBLIC_SITE_URL: siteUrl } },
      Buffer,
      Response,
      fetch: async (url, options) => {
        calls.push({ url: String(url), options })
        return { ok: status === 200, status, json: async () => ({ ...response }) }
      },
    },
  )
  return { GET, POST, calls, set }
}
const post = (path, body = {}, origin = 'https://tamir.rs') =>
  new Request('https://tamir.rs/api/chat/' + path, {
    method: 'POST',
    headers: { origin, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
test('chat BFF strips bearer and writes protected guest cookie', async () => {
  const token = 'a'.repeat(64),
    r = route({ response: { guest_token: token, conversation: { id: '1' } } })
  const result = await r.POST(post('session', { guest: { name: 'Ana' } }))
  assert.equal(result.data.guest_token, undefined)
  assert.equal(r.set[0][0], 'tb_chat_guest')
  assert.equal(r.set[0][1], token)
  assert.equal(r.set[0][2].httpOnly, true)
  assert.equal(r.set[0][2].sameSite, 'lax')
})
test('chat BFF rejects cross-origin, unsupported paths and oversized body', async () => {
  const r = route()
  assert.equal((await r.POST(post('messages', {}, 'https://evil.test'))).status, 403)
  assert.equal((await r.GET(new Request('https://tamir.rs/api/chat/admin'))).status, 404)
  assert.equal((await r.POST(post('messages', { text: 'x'.repeat(9000) }))).status, 413)
  assert.equal(r.calls.length, 0)
})
test('chat BFF uses server session only and forwards SSE cursor without query tokens', async () => {
  const r = route({ customer: 'real-session', guest: 'b'.repeat(64) })
  await r.GET(
    new Request('https://tamir.rs/api/chat/messages?id=1&token=attacker', {
      headers: { authorization: 'Bearer evil', 'last-event-id': '12' },
    }),
  )
  assert.equal(r.calls[0].options.headers.authorization, 'Bearer real-session')
  assert.ok(!r.calls[0].url.includes('attacker'))
  const out = route()
  await out.GET(new Request('https://tamir.rs/api/chat/messages?id=1'))
  assert.equal(out.calls[0].options.headers.authorization, undefined)
})
test('chat BFF clears guest proof after explicit successful claim', async () => {
  const r = route({ customer: 'real-session', guest: 'b'.repeat(64) })
  await r.POST(post('claim'))
  assert.equal(r.set[0][2].maxAge, 0)
})

test('chat BFF starts a guest session behind an HTTP reverse proxy using the configured public origin', async () => {
  const r = route({ siteUrl: 'https://test.tamir.rs/', response: { guest_token: 'c'.repeat(64) } })
  const result = await r.POST(new Request('http://localhost:3000/api/chat/session', {
    method: 'POST',
    headers: { origin: 'https://test.tamir.rs', 'Content-Type': 'application/json' },
    body: JSON.stringify({ locale: 'en', guest: { name: 'Igor', email: '', phone: '' } }),
  }))
  assert.equal(result.status, 200)
  assert.equal(r.calls[0].url, 'http://backend.test/store/chat/session')
  assert.equal(JSON.parse(r.calls[0].options.body).guest.name, 'Igor')
  assert.equal(r.set[0][0], 'tb_chat_guest')
  assert.equal(result.data.guest_token, undefined)
})

test('chat BFF rejects foreign, missing, null and internal origins despite spoofed proxy headers', async () => {
  const r = route({ siteUrl: 'https://test.tamir.rs' })
  for (const origin of [undefined, 'null', 'https://evil.test', 'http://localhost:3000',
    'http://test.tamir.rs', 'https://test.tamir.rs:444', 'https://test.tamir.rs.evil.test']) {
    const headers = { 'x-forwarded-host': 'evil.test', 'x-forwarded-proto': 'https', host: 'evil.test' }
    if (origin !== undefined) headers.origin = origin
    const result = await r.POST(new Request('http://localhost:3000/api/chat/session', { method: 'POST', headers }))
    assert.equal(result.status, 403, String(origin))
    assert.equal(result.data.code, 'INVALID_ORIGIN')
  }
  assert.equal(r.calls.length, 0)
  assert.equal(r.set.length, 0)
})

test('chat BFF fails closed for invalid configured origins and supports local development without configuration', async () => {
  for (const siteUrl of ['invalid-url', 'file:///tmp/site', 'https://user:password@tamir.rs']) {
    const r = route({ siteUrl })
    assert.equal((await r.POST(post('session'))).status, 403)
    assert.equal(r.calls.length, 0)
  }
  const r = route()
  const result = await r.POST(new Request('http://localhost:3000/api/chat/session', {
    method: 'POST', headers: { origin: 'http://localhost:3000' },
  }))
  assert.equal(result.status, 200)
})
