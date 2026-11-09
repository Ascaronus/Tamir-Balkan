const { test, before, beforeEach, after } = require('node:test'),
  assert = require('node:assert/strict'),
  { randomUUID, randomBytes } = require('node:crypto')
require('ts-node/register/transpile-only')
const { assertNonProduction } = require('../test-support/guard-env.cjs'),
  connection = process.env.TEST_REVIEWS_DB_URL
assertNonProduction(connection, 'TEST_REVIEWS_DB_URL')
const knex = require('knex'),
  schema = 'chat_test_' + process.pid,
  root = knex({ client: 'pg', connection }),
  db = knex({ client: 'pg', connection, searchPath: [schema], pool: { min: 0, max: 4 } })
const { setupChat } = require('../src/utils/chat/schema'),
  { defaultChatConfig } = require('../src/shared/chat-config'),
  { settings, saveSettings, saveSecrets, publicSettings, secret } = require('../src/utils/chat/settings')
const {
  startConversation,
  owned,
  listOwn,
  claimGuest,
  customerMessage,
  appendMessage,
  messages,
  customerView,
  changeStatus,
  pruneChat,
  readOwn,
  streamOwn,
} = require('../src/utils/chat/conversations')
const { deliverOne, telegramUpdate } = require('../src/utils/chat/delivery'),
  { translate, checkTelegram } = require('../src/utils/chat/providers'),
  { admin, identity, limit } = require('../src/utils/chat/http')
let oldKey,
  seq = 100,
  thread = 200,
  calls = []
const fake = async (url, init) => {
  const body = init.body instanceof FormData ? Object.fromEntries(init.body) : JSON.parse(init.body)
  calls.push({ url, body })
  if (url.includes('translation.googleapis.com'))
    return {
      ok: true,
      json: async () => ({
        data: {
          translations: [
            {
              translatedText: body.target === 'sr' ? 'Здраво' : body.target === 'ru' ? 'Здравствуйте' : 'Hello',
              detectedSourceLanguage: body.q.includes('Hello') ? 'en' : body.q.includes('Здрав') ? 'ru' : 'sr',
            },
          ],
        },
      }),
    }
  const method = url.split('/').at(-1)
  return {
    ok: true,
    json: async () => ({
      ok: true,
      result:
        method === 'createForumTopic'
          ? { message_thread_id: ++thread }
          : method === 'getMe'
            ? { id: 123456, username: 'tamir_test' }
            : method === 'getChat'
              ? { id: -100123, title: 'Test', type: 'supergroup', is_forum: true }
              : method === 'getChatMember'
                ? { status: 'administrator', can_manage_topics: true }
                : method === 'getWebhookInfo'
                  ? { url: 'https://example.test/webhook', pending_update_count: 0 }
                  : { message_id: ++seq },
    }),
  }
}
const profile = { name: 'Ana', email: 'ana@example.test', phone: '' },
  who = { customerId: 'cus_a', profile }
async function start(locale = 'sr', identity = who) {
  return (await startConversation(db, identity, { locale })).conversation
}
async function send(c, identity = who, text = 'Zdravo') {
  return customerMessage(db, c.id, identity, { text, clientId: randomUUID() })
}
before(async () => {
  oldKey = process.env.CHAT_ENCRYPTION_KEY
  process.env.CHAT_ENCRYPTION_KEY = randomBytes(32).toString('hex')
  await root.raw(`CREATE SCHEMA ${schema}`)
  await setupChat(db)
  await setupChat(db)
  await saveSecrets(db, { kind: 'telegram', value: '123456:abcdefghijklmnopqrstuvxyz_test' }, 'admin')
  await saveSecrets(db, { kind: 'google', value: 'abcdefghijklmnopqrstuvwxyz_test' }, 'admin')
})
beforeEach(async () => {
  for (const table of ['conversation', 'guest', 'operator', 'update', 'rate']) await db('tamir_chat_' + table).delete()
  const s = await settings(db)
  await saveSettings(
    db,
    {
      revision: s.revision,
      config: {
        ...defaultChatConfig,
        enabled: true,
        telegram: { ...defaultChatConfig.telegram, enabled: true, chatId: '-100123' },
      },
    },
    'admin',
  )
  calls = []
})
after(async () => {
  await db.destroy()
  await root.raw(`DROP SCHEMA ${schema} CASCADE`)
  await root.destroy()
  if (oldKey === undefined) delete process.env.CHAT_ENCRYPTION_KEY
  else process.env.CHAT_ENCRYPTION_KEY = oldKey
})
test('SQL persistence, revision conflicts and encrypted secrets', async () => {
  const s = await settings(db)
  await saveSettings(
    db,
    { config: { ...s.config, title: { sr: 'Podrška', en: 'Support' } }, revision: s.revision },
    'admin',
  )
  await assert.rejects(
    () => saveSettings(db, { config: s.config, revision: s.revision }, 'admin'),
    /CHAT_SETTINGS_CHANGED/,
  )
  assert.equal((await publicSettings(db)).title.en, 'Support')
  assert.equal((await publicSettings(db)).telegram, undefined)
  assert.ok(!JSON.stringify(await db('tamir_chat_secret')).includes('abcdefghijklmnopqrstuvxyz_test'))
})
test('SQL guest restore, explicit claim, logout and changed profile', async () => {
  const g = await startConversation(db, {}, { locale: 'en', guest: { name: 'Marko' } }),
    guest = { guestToken: g.guest_token }
  assert.equal((await startConversation(db, guest, { locale: 'sr' })).conversation.id, g.conversation.id)
  await assert.rejects(() => readOwn(db, g.conversation.id, {}), /CHAT_NOT_FOUND/)
  await assert.rejects(() => owned(db, g.conversation.id, who), /CHAT_NOT_FOUND/)
  await claimGuest(db, { ...who, ...guest })
  await assert.rejects(() => readOwn(db, g.conversation.id, guest), /CHAT_NOT_FOUND/)
  await assert.rejects(
    () =>
      appendMessage(
        db,
        g.conversation.id,
        'customer',
        { text: 'late guest request', clientId: randomUUID() },
        undefined,
        guest,
      ),
    /CHAT_NOT_FOUND/,
  )
  await assert.rejects(() => changeStatus(db, g.conversation.id, 'closed', 'guest', guest), /CHAT_NOT_FOUND/)
  await assert.rejects(() => startConversation(db, guest, { locale: 'sr' }), /INVALID_GUEST/)
  assert.equal((await listOwn(db, { customerId: 'cus_other' })).length, 0)
  await startConversation(db, { ...who, profile: { ...profile, name: 'Updated' } }, { locale: 'en' })
  assert.equal((await owned(db, g.conversation.id, who)).profile.name, 'Updated')
})
test('SQL concurrent idempotency, persisted queue and isolated topics', async () => {
  const a = await start(),
    clientId = randomUUID()
  await Promise.all([1, 2, 3].map(() => customerMessage(db, a.id, who, { text: 'Zdravo', clientId })))
  assert.equal((await messages(db, a.id)).length, 1)
  await deliverOne(db, fake)
  const c = await owned(db, a.id, who),
    m = (await messages(db, a.id))[0]
  assert.equal(m.status, 'delivered')
  assert.equal(m.translated, 'Здравствуйте')
  assert.ok(await db('tamir_chat_telegram_ref').where({ message_id: m.id }).first())
  const other = { customerId: 'cus_b', profile },
    b = await start('en', other)
  await send(b, other, 'Hello')
  await deliverOne(db, fake)
  assert.notEqual((await owned(db, b.id, other)).telegram_thread_id, c.telegram_thread_id)
})
test('SQL translation failure preserves original and retries', async () => {
  const c = await start('en')
  await send(c, who, 'Hello')
  await deliverOne(db, async (url, opts) => {
    if (url.includes('translation')) throw Error('private detail')
    return fake(url, opts)
  })
  let m = (await messages(db, c.id))[0]
  assert.equal(m.original, 'Hello')
  assert.equal(m.status, 'error')
  assert.equal(
    (await db('tamir_chat_outbox').where({ message_id: m.id }).first()).error_code,
    'TRANSLATION_UNAVAILABLE',
  )
  await db('tamir_chat_outbox')
    .where({ message_id: m.id })
    .update({ next_at: new Date(0) })
  await deliverOne(db, fake)
  assert.equal((await messages(db, c.id))[0].status, 'delivered')
})
test('SQL Telegram retry reuses translation without website duplicates', async () => {
  const c = await start()
  await send(c)
  await deliverOne(db, async (url, opts) =>
    url.endsWith('/sendMessage') ? Promise.reject(Error('offline')) : fake(url, opts),
  )
  const m = (await messages(db, c.id))[0]
  assert.equal(m.translation_state, 'translated')
  calls = []
  await db('tamir_chat_outbox')
    .where({ message_id: m.id })
    .update({ next_at: new Date(0) })
  await deliverOne(db, fake)
  assert.equal(
    calls.some((c) => c.url.includes('translation.googleapis.com')),
    false,
  )
  assert.equal((await messages(db, c.id)).length, 1)
  assert.equal((await messages(db, c.id))[0].status, 'delivered')
})
test('SQL webhook authorization, duplicate update and current response locale', async () => {
  const a = await start()
  await send(a)
  await deliverOne(db, fake)
  const c = await owned(db, a.id, who),
    webhook = await secret(db, 'webhook')
  await db('tamir_chat_operator').insert({
    id: randomUUID(),
    name: 'Operator',
    telegram_id: '555',
    role: 'operator',
    enabled: true,
    available: false,
  })
  const update = {
    update_id: 1,
    message: {
      message_id: 1000,
      chat: { id: -100123 },
      message_thread_id: Number(c.telegram_thread_id),
      from: { id: 555, is_bot: false },
      text: 'Здравствуйте',
    },
  }
  await assert.rejects(() => telegramUpdate(db, 'forged', update), /INVALID_WEBHOOK/)
  for (const message of [
    { ...update.message, from: { id: 999 } },
    { ...update.message, chat: { id: -99 } },
  ])
    assert.equal((await telegramUpdate(db, webhook, { ...update, message })).ignored, true)
  await db('tamir_chat_conversation').where({ id: c.id }).update({ locale: 'en' })
  assert.equal((await telegramUpdate(db, webhook, update)).accepted, true)
  assert.equal((await telegramUpdate(db, webhook, update)).duplicate, true)
  assert.equal(customerView((await messages(db, c.id)).at(-1)).text, null)
  await deliverOne(db, fake)
  const m = (await messages(db, c.id)).at(-1)
  assert.equal(m.target_language, 'en')
  assert.equal(customerView(m).text, 'Hello')
  await db('tamir_chat_operator').where({ telegram_id: '555' }).update({ enabled: false })
  assert.equal((await telegramUpdate(db, webhook, { ...update, update_id: 2 })).ignored, true)
})
test('SQL numeric chat id jsonb heals on read, keeps operator replies routed and settings bindings', async () => {
  const c = await start()
  await send(c)
  await deliverOne(db, fake)
  const bound = await owned(db, c.id, who)
  assert.equal(bound.telegram_chat_id, '-100123')
  assert.ok(bound.telegram_thread_id)
  const legacy = (config) => ({ ...config, telegram: { ...config.telegram, chatId: -100123 } })
  // Legacy rows carry telegram.chatId as a jsonb number, which used to make every
  // operator reply look like it belonged to another chat and be ignored.
  let row = await db('tamir_chat_settings').where({ id: 1 }).first()
  await db('tamir_chat_settings').where({ id: 1 }).update({ config: JSON.stringify(legacy(row.config)) })
  assert.equal(typeof (await db('tamir_chat_settings').where({ id: 1 }).first()).config.telegram.chatId, 'number')
  const healed = await settings(db)
  assert.equal(healed.config.telegram.chatId, '-100123')
  assert.equal(healed.revision, row.revision)
  assert.equal(typeof (await db('tamir_chat_settings').where({ id: 1 }).first()).config.telegram.chatId, 'string')
  await db('tamir_chat_operator').insert({
    id: randomUUID(),
    name: 'Ops',
    telegram_id: '555',
    role: 'operator',
    enabled: true,
    available: false,
  })
  const reply = {
    update_id: 77,
    message: {
      message_id: 2000,
      chat: { id: -100123 },
      message_thread_id: Number(bound.telegram_thread_id),
      from: { id: 555, is_bot: false },
      text: 'Готово',
    },
  }
  assert.equal((await telegramUpdate(db, await secret(db, 'webhook'), reply)).accepted, true)
  // A manager saving an unrelated field with the numeric id from the UI must not unbind topics.
  row = await db('tamir_chat_settings').where({ id: 1 }).first()
  const numeric = legacy(row.config)
  await db('tamir_chat_settings').where({ id: 1 }).update({ config: JSON.stringify(numeric) })
  await saveSettings(
    db,
    { revision: row.revision, config: { ...numeric, title: { sr: 'Podrška', en: 'Support' } } },
    'admin',
  )
  const kept = await owned(db, c.id, who)
  assert.equal(kept.telegram_chat_id, '-100123')
  assert.equal(kept.telegram_thread_id, bound.telegram_thread_id)
  const saved = (await db('tamir_chat_settings').where({ id: 1 }).first()).config
  assert.equal(saved.telegram.chatId, '-100123')
  assert.equal(saved.title.en, 'Support')
  assert.equal((await messages(db, c.id)).at(-1).sender, 'operator')
})
test('SQL system templates never enqueue translation or notification loops', async () => {
  const c = await start()
  await changeStatus(db, c.id, 'closed', 'admin')
  await assert.rejects(() => send(c), /CHAT_CLOSED/)
  await changeStatus(db, c.id, 'closed', 'admin')
  await changeStatus(db, c.id, 'open', 'admin')
  const rows = await messages(db, c.id)
  assert.equal(rows.length, 2)
  assert.ok(rows.every((m) => m.sender === 'system' && m.translation_state === 'skipped'))
  assert.equal((await db('tamir_chat_outbox')).length, 0)
})
test('SQL retention cascades messages, references and pending queue', async () => {
  const c = await start()
  await send(c)
  const m = (await messages(db, c.id))[0]
  await db('tamir_chat_conversation')
    .where({ id: c.id })
    .update({ updated_at: new Date(0) })
  await pruneChat(db)
  assert.equal(await db('tamir_chat_message').where({ id: m.id }).first(), undefined)
  assert.equal(await db('tamir_chat_outbox').where({ message_id: m.id }).first(), undefined)
})
test('SQL roles, customer lookup, actual availability and rate limit', async () => {
  const { ContainerRegistrationKeys, Modules } = require('@medusajs/framework/utils')
  await db('tamir_chat_operator').insert({
    id: randomUUID(),
    name: 'Reader',
    user_id: 'user_reader',
    role: 'viewer',
    enabled: true,
    available: true,
  })
  const req = {
    auth_context: { actor_id: 'user_reader', actor_type: 'user' },
    scope: {
      resolve: (k) =>
        k === ContainerRegistrationKeys.PG_CONNECTION
          ? db
          : k === Modules.USER
            ? { retrieveUser: async () => ({ id: 'user_reader', email: 'reader@example.test' }) }
            : {
                retrieveCustomer: async () => ({
                  id: 'cus_real',
                  has_account: true,
                  first_name: 'Real',
                  last_name: 'Customer',
                  email: 'real@example.test',
                }),
              },
    },
    headers: {},
    socket: { remoteAddress: '127.0.0.1' },
  }
  assert.equal((await admin(req)).role, 'viewer')
  await assert.rejects(() => admin(req, 'manager'), /CHAT_FORBIDDEN/)
  assert.equal((await publicSettings(db)).available, false)
  assert.equal(
    (await identity({ ...req, auth_context: { actor_type: 'customer', actor_id: 'cus_real' } })).profile.name,
    'Real Customer',
  )
  await limit(req, 'test', 1)
  await assert.rejects(() => limit(req, 'test', 1), /CHAT_RATE_LIMIT/)
})
for (const target of ['ru', 'sr', 'en'])
  test('provider auto-detection and target ' + target, async () => {
    const r = await translate(db, 'Hello', target, fake)
    assert.equal(r.source, 'en')
    assert.equal(calls[0].body.source, undefined)
    assert.equal(calls[0].body.target, target)
    if (target === 'sr') assert.equal(r.text, 'Zdravo')
  })
test('provider checks group rights and records safe failure', async () => {
  assert.equal((await checkTelegram(db, fake)).botName, 'tamir_test')
  await assert.rejects(
    () =>
      checkTelegram(db, async (url, opts) =>
        url.endsWith('/getChatMember')
          ? { ok: true, json: async () => ({ ok: true, result: { status: 'member' } }) }
          : fake(url, opts),
      ),
    /TELEGRAM_ADMIN_RIGHTS_REQUIRED/,
  )
  assert.equal((await db('tamir_chat_connection').where({ service: 'telegram' }).first()).state, 'error')
})

test('SQL SSE reconnect replays more than 100 missed messages and refreshes statuses', async () => {
  const c = await start()
  await db('tamir_chat_message').insert(Array.from({length:205}, (_,i)=>({id:randomUUID(),conversation_id:c.id,sender:'customer',original:'Message '+i,locale:'sr',client_id:randomUUID()})))
  const all=await db('tamir_chat_message').where({conversation_id:c.id}).orderBy('seq')
  const first=await streamOwn(db,c.id,who,String(all[0].seq))
  assert.equal(first.cursor,String(all[100].seq))
  const second=await streamOwn(db,c.id,who,first.cursor)
  assert.equal(second.cursor,String(all[200].seq))
  const third=await streamOwn(db,c.id,who,second.cursor)
  assert.equal(third.cursor,String(all[204].seq))
  await db('tamir_chat_message').where({id:all[204].id}).update({status:'delivered'})
  assert.equal((await streamOwn(db,c.id,who,third.cursor)).messages.find(m=>m.id===all[204].id).status,'delivered')
})


test('private image and message persist atomically, replay once, deliver to their topic and cascade on deletion', async () => {
  const { prepareImage, readImage } = require('../src/utils/chat/images')
  const sharp = require('sharp')
  const content = await sharp({ create: { width: 8, height: 8, channels: 3, background: 'white' } }).png().toBuffer()
  const image = await prepareImage('data:image/png;base64,' + content.toString('base64'))
  const c = await start(), other = await start('en', { customerId: 'cus_b', profile })
  const body = { text: '', clientId: randomUUID() }
  const m = await appendMessage(db, c.id, 'customer', body, profile, who, image)
  assert.deepEqual(await appendMessage(db, c.id, 'customer', body, profile, who, image), m)
  assert.equal((await messages(db, c.id)).length, 1)
  assert.equal((await readImage(db, c.id, m.id, who)).mime, 'image/jpeg')
  await assert.rejects(readImage(db, c.id, m.id, { customerId: 'cus_b' }), /CHAT_NOT_FOUND/)
  await assert.rejects(readImage(db, other.id, m.id, { customerId: 'cus_b' }), /CHAT_NOT_FOUND/)
  await assert.rejects(readImage(db, c.id, m.id, {}), /CHAT_NOT_FOUND/)
  await deliverOne(db, fake)
  const photo = calls.find(x => x.url.endsWith('/sendPhoto'))
  assert.ok(photo)
  assert.equal(photo.body.chat_id, '-100123')
  assert.ok(photo.body.message_thread_id)
  assert.equal(photo.body.photo.type, 'image/jpeg')
  assert.equal(calls.filter(x => x.url.includes('translation.googleapis.com')).length, 0)
  const view = (await readOwn(db, c.id, who)).messages[0]
  assert.equal(view.status, 'delivered')
  assert.equal(view.has_image, true)
  assert.equal(view.content, undefined)
  await deliverOne(db, fake)
  assert.equal(calls.filter(x => x.url.endsWith('/sendPhoto')).length, 1)
  await db('tamir_chat_conversation').where({ id: c.id }).delete()
  assert.equal((await db('tamir_chat_image')).length, 0)
})

test('system messages retain template identity across locale changes and schema upgrades', async () => {
  const c = await start()
  await changeStatus(db, c.id, 'closed', 'admin')
  const row = (await messages(db, c.id))[0]
  assert.equal(customerView(row).template_key, 'closed')
  await db('tamir_chat_message').where({ id: row.id }).update({ template_key: null })
  await setupChat(db)
  assert.equal((await messages(db, c.id))[0].template_key, 'closed')
})

test('photo failures retry saved bytes without repeating confirmed context and image limits reject atomically', async () => {
  const c = await start()
  const sharp = require('sharp')
  const content = await sharp({ create: { width: 8, height: 8, channels: 3, background: 'white' } }).jpeg().toBuffer()
  const image = { content, mime: 'image/jpeg', width: 8, height: 8 }
  const m = await appendMessage(db, c.id, 'customer', { text: 'Zdravo', clientId: randomUUID() }, profile, who, image)
  await deliverOne(db, async (url, init) => url.endsWith('/sendPhoto')
    ? { ok: false, status: 503, json: async () => ({ ok: false }) } : fake(url, init))
  assert.equal((await messages(db, c.id))[0].status, 'error')
  const contexts = calls.filter(x => x.url.endsWith('/sendMessage') && x.body.text.includes('Original')).length
  assert.equal(contexts, 1)
  await db('tamir_chat_outbox').where({ message_id: m.id }).update({ next_at: new Date(0) })
  await deliverOne(db, fake)
  assert.equal((await messages(db, c.id))[0].status, 'delivered')
  assert.equal(calls.filter(x => x.url.endsWith('/sendMessage') && x.body.text.includes('Original')).length, 1)
  assert.equal(calls.filter(x => x.url.includes('translation.googleapis.com')).length, 1)
  for (let i = 1; i < 50; i++)
    await appendMessage(db, c.id, 'customer', { text: '', clientId: randomUUID() }, profile, who, image)
  await assert.rejects(appendMessage(db, c.id, 'customer', { text: '', clientId: randomUUID() }, profile, who, image), /CHAT_IMAGE_LIMIT/)
  assert.equal((await db('tamir_chat_image')).length, 50)
  assert.equal((await messages(db, c.id)).length, 50)
})
