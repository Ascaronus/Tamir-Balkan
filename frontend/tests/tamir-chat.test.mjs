import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import { load, hooks, find } from '../test-support/component-harness.mjs'
import { guestValid, mergeMessages, imageFileError, imageData, systemText, systemTemplateKey } from '../src/components/chat/chat-client.ts'
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
    set = [],
    warnings = []
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
      console: { warn: (...args) => warnings.push(args.join(' ')), log: () => {}, error: () => {} },
      Buffer,
      Response,
      fetch: async (url, options) => {
        calls.push({ url: String(url), options })
        return { ok: status === 200, status, json: async () => ({ ...response }) }
      },
    },
  )
  return { GET, POST, calls, set, warnings }
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
    // A broken build-time value must not lock out the public storefront, but the
    // internal Next.js origin is not opened for it.
    assert.equal((await r.POST(post('session'))).status, 200)
    assert.equal((await r.POST(post('session', {}, 'https://evil.test'))).status, 403)
    assert.equal(
      (await r.POST(new Request('http://localhost:3000/api/chat/session', { method: 'POST' }))).status,
      403,
    )
    assert.ok(/NEXT_PUBLIC_SITE_URL/.test(r.warnings.join('\n')), siteUrl)
  }
  const r = route()
  const result = await r.POST(new Request('http://localhost:3000/api/chat/session', {
    method: 'POST', headers: { origin: 'http://localhost:3000' },
  }))
  assert.equal(result.status, 200)
})

test('chat BFF accepts our public https origins even with a local NEXT_PUBLIC_SITE_URL', async () => {
  for (const siteUrl of ['', 'https://localhost:3000', 'https://test.tamir.rs']) {
    const r = route({ siteUrl })
    for (const origin of ['https://tamir.rs', 'https://www.tamir.rs'])
      assert.equal((await r.POST(post('session', {}, origin))).status, 200, `${siteUrl} ${origin}`)
    for (const origin of ['http://tamir.rs', 'https://tamir.rs:444', 'https://tamir.rs.evil.test',
      'https://evil.tamir.rs', 'http://www.tamir.rs', 'null'])
      assert.equal((await r.POST(post('session', {}, origin))).status, 403, `${siteUrl} ${origin}`)
    assert.equal(
      (await r.POST(new Request('https://tamir.rs/api/chat/session', { method: 'POST' }))).status, 403,
    )
    if (siteUrl === 'https://localhost:3000')
      assert.ok(/NEXT_PUBLIC_SITE_URL/.test(r.warnings.join('\n')))
    else assert.equal(r.warnings.length, 0)
  }
})


test('chat composer submits Enter through the Send form and preserves Shift+Enter and IME', async () => {
  const h = hooks(), calls = [], noop = () => {}, refresh = async () => {}
  let release, locale = 'en'
  const config = { enabled: true, locales: ['en', 'sr'], available: true, templates: { welcome: { enabled: true, text: { en: 'Hello!', sr: 'Zdravo!' } }, sent: { enabled: true, text: { en: 'Saved', sr: 'Sačuvano' } } }, title: { en: 'Support' }, button: { en: 'Chat' } }
  const client = {
    guestValid, mergeMessages, imageFileError, imageData: async () => 'data:image/png;base64,dGVzdA==', systemText, systemTemplateKey,
    chatRequest: async (action, body) => {
      calls.push({ action, body })
      if (action === 'config') return config
      if (action === 'conversations') return { conversations: [] }
      if (action === 'session') return { conversation: { id: 'chat_1', status: 'open' }, conversations: [] }
      if (action === 'messages') await new Promise(resolve => { release = resolve })
      return {}
    },
  }
  const { default: Widget } = load('frontend/src/components/chat/ChatWidget.tsx', {
    react: h.react, 'next/navigation': { usePathname: () => '/en' },
    '@/components/auth/AuthProvider': { useAuth: () => ({ customer: { id: 'cus_1' }, isReady: true, refresh }) },
    '@/components/i18n/LocaleProvider': { useLocaleContext: () => ({ locale, t: key => key }) },
    './chat-client': client, './chat.css': {},
  }, {
    AbortController, setInterval: () => 1, clearInterval: noop,
    document: { addEventListener: noop, removeEventListener: noop, querySelector: () => null },
    window: { addEventListener: noop, removeEventListener: noop },
    EventSource: class { addEventListener() {} close() {} },
    crypto: { randomUUID: () => 'message-1' },
  })
  const session = Widget(), render = () => h.render(() => session.type(session.props))
  render(); await h.flush()
  let tree = render()
  find(tree, n => n.props.className === 'tamir-chat-launcher').props.onClick()
  render(); await h.flush(); tree = render(); await h.flush()
  const bubble = () => find(render(), n => n.type === 'article' && n.props.role === 'status')
  assert.equal(find(bubble(), n => n.type === 'p').props.children, 'Hello!')
  locale = 'sr'
  assert.equal(find(bubble(), n => n.type === 'p').props.children, 'Zdravo!')
  locale = 'en'
  const input = () => find(render(), n => n.type === 'textarea')
  const press = (overrides = {}) => {
    let prevented = false
    const form = find(render(), n => n.type === 'form' && find(n, c => c.type === 'textarea'))
    input().props.onKeyDown({ key: 'Enter', nativeEvent: {}, preventDefault: () => { prevented = true },
      currentTarget: { form: { requestSubmit: () => form.props.onSubmit({ preventDefault: noop }) } }, ...overrides })
    return prevented
  }
  input().props.onChange({ target: { value: 'Zdravo!' } })
  assert.equal(press({ shiftKey: true }), false)
  assert.equal(press({ nativeEvent: { isComposing: true } }), false)
  assert.equal(press({ nativeEvent: { keyCode: 229 } }), false)
  assert.equal(press({ repeat: true }), true)
  assert.equal(calls.filter(c => c.action === 'messages').length, 0)
  assert.equal(press(), true)
  await h.flush()
  press(); await h.flush()
  assert.equal(calls.filter(c => c.action === 'messages').length, 1)
  assert.equal(calls.find(c => c.action === 'messages').body.text, 'Zdravo!')
  release(); await h.flush()
  assert.equal(input().props.value, '')
  press(); await h.flush()
  assert.equal(calls.filter(c => c.action === 'messages').length, 1)
  input().props.onChange({ target: { value: 'Button message' } })
  const form = find(render(), n => n.type === 'form' && find(n, c => c.type === 'textarea'))
  assert.equal(find(form, n => n.type === 'button').props.type, 'submit')
  form.props.onSubmit({ preventDefault: noop }); await h.flush()
  assert.equal(calls.filter(c => c.action === 'messages').length, 2)
  release(); await h.flush()
  const choose = () => find(render(), n => n.type === 'input' && n.props.type === 'file')
  await choose().props.onChange({ target: { files: [{ name: 'photo.png', type: 'image/png', size: 20 }], value: 'photo.png' } })
  assert.ok(find(render(), n => n.type === 'img' && n.props.src.startsWith('data:')))
  press(); await h.flush()
  const upload = calls.find(c => c.action === 'image-message')
  assert.equal(upload.body.text, '')
  assert.equal(upload.body.image, 'data:image/png;base64,dGVzdA==')
  assert.equal(find(render(), n => n.type === 'img' && n.props.src.startsWith('data:')), null)

})


test('automatic status messages resolve the current locale, including legacy stored text', () => {
  const config = { templates: { closed: { enabled: true, text: { sr: 'Zatvoreno', en: 'Closed' } } } }
  for (const message of [
    { sender: 'system', template_key: 'closed', text: 'Old custom text' },
    { sender: 'system', text: 'Zatvoreno' },
  ]) {
    assert.equal(systemText(message, config, 'en'), 'Closed')
    assert.equal(systemText(message, config, 'sr'), 'Zatvoreno')
  }
  assert.equal(systemText({ sender: 'customer', text: 'Zatvoreno' }, config, 'en'), 'Zatvoreno')
})
test('image chooser restricts types and size before reading files', () => {
  assert.equal(imageFileError({ type: 'image/png', size: 5 * 1024 * 1024 }), '')
  assert.equal(imageFileError({ type: 'image/png', size: 5 * 1024 * 1024 + 1 }), 'CHAT_IMAGE_TOO_LARGE')
  for (const type of ['image/svg+xml', 'image/gif', 'application/pdf'])
    assert.equal(imageFileError({ type, size: 100 }), 'CHAT_IMAGE_INVALID')
})
test('image BFF forwards image identity with private no-store responses and bounded uploads', async () => {
  const r = route({ customer: 'customer-token' })
  const image = await r.GET(new Request('https://tamir.rs/api/chat/image?id=c&image=m&token=evil'))
  assert.equal(image.headers.get('cache-control'), 'private, no-store')
  assert.equal(image.headers.get('x-content-type-options'), 'nosniff')
  assert.equal(r.calls[0].url, 'http://backend.test/store/chat/image?id=c&image=m')
  assert.equal(r.calls[0].options.headers.authorization, 'Bearer customer-token')
  assert.equal((await r.POST(post('image-message', { image: 'x'.repeat(9000) }))).status, 200)
  assert.equal((await r.POST(post('image-message', { image: 'x'.repeat(7 * 1024 * 1024) }))).status, 413)
  assert.equal((await r.POST(post('image-message', {}, 'https://evil.test'))).status, 403)
})

test('system rows respect switches and never render sent confirmations as conversation text', () => {
  const templates = Object.fromEntries(['welcome', 'returning', 'offline', 'closed', 'reopened', 'error', 'sent'].map(key =>
    [key, { enabled: true, text: { en: key + ' EN', sr: key + ' SR' } }]))
  const config = { templates }
  for (const key of Object.keys(templates)) {
    const row = { sender: 'system', template_key: key, text: 'historical text' }
    assert.equal(systemText(row, config, 'en'), key === 'sent' ? null : key + ' EN')
    assert.equal(systemTemplateKey({ sender: 'system', text: key + ' SR' }, config), key)
    templates[key].enabled = false
    assert.equal(systemText(row, config, 'sr'), null)
    templates[key].enabled = true
  }
  assert.equal(systemText({ sender: 'customer', text: 'sent EN' }, config, 'en'), 'sent EN')
})

for (const locale of ['sr', 'en']) test(`chat presentation ${locale}: greetings, robot events and delivery receipts`, async () => {
  const h = hooks(), noop = () => {}, refresh = async () => {}
  let stream, polling
  const templates = Object.fromEntries(['welcome', 'returning', 'offline', 'closed', 'reopened', 'error', 'sent'].map(key =>
    [key, { enabled: true, text: { en: key + ' EN', sr: key + ' SR' } }]))
  let config = { enabled: true, locales: ['en', 'sr'], available: false, templates, title: { en: 'Support', sr: 'Podrška' }, button: {} }
  const conversation = { id: 'c1', status: 'open' }
  const { default: Widget } = load('frontend/src/components/chat/ChatWidget.tsx', {
    react: h.react, 'next/navigation': { usePathname: () => '/en' },
    '@/components/auth/AuthProvider': { useAuth: () => ({ customer: { id: 'customer' }, isReady: true, refresh }) },
    '@/components/i18n/LocaleProvider': { useLocaleContext: () => ({ locale, t: key => key }) },
    './chat-client': { mergeMessages, guestValid, imageFileError, imageData, systemText, systemTemplateKey,
      chatRequest: async action => action === 'config' ? config : action === 'conversations' ? { conversations: [conversation] }
        : action === 'session' ? { conversation, conversations: [conversation] } : {} }, './chat.css': {},
  }, {
    AbortController, setInterval: fn => { polling = fn; return 1 }, clearInterval: noop,
    document: { addEventListener: noop, removeEventListener: noop, querySelector: () => null },
    window: { addEventListener: noop, removeEventListener: noop },
    EventSource: function () {
      stream = { addEventListener: noop, close: noop }
      return stream
    },
  })
  const session = Widget(), render = () => h.render(() => session.type(session.props))
  render(); await h.flush()
  find(render(), n => n.props.className === 'tamir-chat-launcher').props.onClick()
  render(); await h.flush(); render(); await h.flush()
  let tree = render()
  const text = node => JSON.stringify(node)
  assert.ok(text(find(tree, n => n.props.className?.includes('message-greeting'))).includes(templates.returning.text[locale]))
  assert.ok(text(find(tree, n => n.props.className === 'tamir-chat-event')).includes(templates.offline.text[locale]))
  const row = (id, sender, status, extra = {}) => ({ id, seq: id, sender, status, text: 'message', created_at: '2026-11-09T18:00:00Z', ...extra })
  const rows = [row('1', 'customer', 'sent'), row('2', 'operator', 'delivered'),
    row('3', 'system', 'delivered', { template_key: 'closed' }), row('4', 'system', 'delivered', { template_key: 'sent' }),
    row('5', 'system', 'delivered', { template_key: 'reopened' })]
  const emit = () => { stream.onmessage({ data: JSON.stringify({ conversation, available: false, messages: rows }) }); return render() }
  tree = emit()
  assert.equal(find(tree, n => n.props.className === 'tamir-chat-delivered'), null)
  assert.ok(!text(tree).includes(templates.sent.text[locale]))
  assert.equal(find(tree, n => n.key === '3').props.className, 'tamir-chat-event')
  assert.equal(find(tree, n => n.key === '5').props.className, 'tamir-chat-event')
  rows[0].status = 'delivered'
  rows[0].has_image = true
  tree = emit()
  const delivered = find(tree, n => n.props.className === 'tamir-chat-delivered')
  assert.equal(delivered.props['aria-label'], 'chat.delivered')
  assert.ok(find(delivered, n => n.type === 'svg'))
  rows[0].status = 'error'
  tree = emit()
  assert.equal(find(tree, n => n.props.className === 'tamir-chat-delivered'), null)
  assert.ok(find(tree, n => n.props.className === 'tamir-chat-delivery-error'))
  // Simulate the next 60-second config refresh after saving switches in admin.
  config = { ...config, templates: Object.fromEntries(Object.entries(templates).map(([key, value]) => [key, { ...value, enabled: false }])) }
  await polling(); await h.flush()
  rows[0].status = 'delivered'
  tree = emit()
  assert.equal(find(tree, n => n.props.className === 'tamir-chat-delivered'), null)
  assert.equal(find(tree, n => n.props.className === 'tamir-chat-event'), null)
  assert.equal(find(tree, n => n.props.className?.includes('message-greeting')), null)
})
