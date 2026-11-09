const { test } = require('node:test'),
  assert = require('node:assert/strict'),
  { randomBytes, randomUUID } = require('node:crypto')
require('ts-node/register/transpile-only')
const { guestSchema, messageSchema, chatConfigSchema, defaultChatConfig } = require('../src/shared/chat-config')
const {
  encryptSecret,
  decryptSecret,
  matchesSecret,
  newGuestToken,
  hashGuest,
  safeCode,
} = require('../src/utils/chat/security')
const { customerView } = require('../src/utils/chat/conversations')
test('guest accepts name alone and independent optional contacts', () => {
  assert.equal(guestSchema.parse({ name: 'Ana' }).email, '')
  for (const g of [
    { name: 'Ana', phone: '+381 63 123456' },
    { name: 'Ana', email: 'ana@example.test' },
  ])
    assert.equal(guestSchema.safeParse(g).success, true)
  for (const g of [{ name: 'A' }, { name: 'Ana', email: 'bad' }, { name: 'Ana', phone: 'abc' }])
    assert.equal(guestSchema.safeParse(g).success, false)
})
test('message validation rejects blank, controls, oversize and missing idempotency key', () => {
  for (const text of ['', ' '.repeat(4), 'a'.repeat(1501), 'hello\u0000'])
    assert.equal(messageSchema.safeParse({ text, clientId: randomUUID() }).success, false)
  assert.equal(messageSchema.safeParse({ text: 'hello' }).success, false)
  assert.equal(messageSchema.parse({ text: ' Zdravo ', clientId: randomUUID() }).text, 'Zdravo')
})
test('safe defaults and bounded localized settings', () => {
  assert.equal(chatConfigSchema.parse(defaultChatConfig).enabled, false)
  for (const patch of [
    { retentionDays: 1 },
    { title: { sr: 'x'.repeat(121), en: 'Hello' } },
    { translation: { ...defaultChatConfig.translation, locales: [] } },
  ])
    assert.equal(chatConfigSchema.safeParse({ ...defaultChatConfig, ...patch }).success, false)
})
test('chat id stays one canonical string for the admin UI and legacy jsonb rows', () => {
  const telegram = (chatId) => ({ ...defaultChatConfig.telegram, enabled: true, chatId })
  for (const chatId of [-1001234567890, '-1001234567890', ' -1001234567890 '])
    assert.equal(chatConfigSchema.parse({ ...defaultChatConfig, telegram: { ...telegram(0), chatId } }).telegram.chatId, '-1001234567890')
  assert.equal(chatConfigSchema.parse({ ...defaultChatConfig, telegram: telegram('') }).telegram.chatId, '')
  for (const chatId of ['-100abc', '1.5', '1'.repeat(21), { id: 1 }])
    assert.equal(chatConfigSchema.safeParse({ ...defaultChatConfig, telegram: { ...telegram(0), chatId } }).success, false)
})
test('secrets use authenticated encryption, distinct IVs and safe errors', () => {
  const old = process.env.CHAT_ENCRYPTION_KEY
  try {
    process.env.CHAT_ENCRYPTION_KEY = randomBytes(32).toString('hex')
    const a = encryptSecret('private-token'),
      b = encryptSecret('private-token')
    assert.notEqual(a, b)
    assert.equal(decryptSecret(a), 'private-token')
    assert.ok(!a.includes('private-token'))
    assert.throws(() => decryptSecret(a.slice(0, -5) + 'ABCDE'), /CHAT_SECRET_UNAVAILABLE/)
    delete process.env.CHAT_ENCRYPTION_KEY
    assert.throws(() => encryptSecret('x'), /CHAT_ENCRYPTION_KEY_REQUIRED/)
  } finally {
    if (old === undefined) delete process.env.CHAT_ENCRYPTION_KEY
    else process.env.CHAT_ENCRYPTION_KEY = old
  }
})
test('webhook comparison and guest tokens are unguessable and not stored as bearers', () => {
  assert.equal(matchesSecret('abc', 'abc'), true)
  assert.equal(matchesSecret('abc', 'abcd'), false)
  assert.equal(matchesSecret(undefined, 'abc'), false)
  const a = newGuestToken()
  assert.match(a, /^[a-f0-9]{64}$/)
  assert.notEqual(a, newGuestToken())
  assert.notEqual(hashGuest(a), a)
})
test('pending or failed operator translation never exposes original to customer', () => {
  for (const status of ['sent', 'error'])
    assert.equal(customerView({ sender: 'operator', status, original: 'secret RU', translated: 'pending' }).text, null)
  assert.equal(customerView({ sender: 'operator', status: 'delivered', translated: 'Hello' }).text, 'Hello')
  assert.equal(
    customerView({ sender: 'customer', status: 'sent', original: '<img onerror=x>' }).text,
    '<img onerror=x>',
  )
})
test('unknown errors do not reveal credentials or SQL', () =>
  assert.equal(safeCode(Error('password=secret SELECT *')), 'CHAT_UNAVAILABLE'))
