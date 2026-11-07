import type { Knex } from 'knex'
import { randomUUID } from 'node:crypto'
import { guestSchema, messageSchema } from '../../shared/chat-config'
import { ChatError, hashGuest, validGuest, newGuestToken } from './security'
import { settings, audit } from './settings'
export type ChatIdentity = {
  customerId?: string
  profile?: { name: string; email: string; phone: string }
  guestToken?: string
}
export async function guest(db: Knex, token?: string) {
  return validGuest(token)
    ? db('tamir_chat_guest')
        .where({ hash: hashGuest(token) })
        .where('expires_at', '>', new Date())
        .first()
    : null
}
export async function owned(db: Knex, id: string, who: ChatIdentity, lock = false) {
  if (!/^[a-f\d-]{36}$/i.test(id || '')) throw new ChatError(404, 'CHAT_NOT_FOUND')
  const query = db('tamir_chat_conversation').where({ id })
  if (lock) query.forUpdate()
  const row = await query.first()
  if (
    !row ||
    !(who.customerId
      ? row.customer_id === who.customerId
      : !row.customer_id && row.guest_hash === (await guest(db, who.guestToken))?.hash)
  )
    throw new ChatError(404, 'CHAT_NOT_FOUND')
  return row
}
export function publicConversation(c: any) {
  return {
    id: c.id,
    number: c.number,
    status: c.status,
    locale: c.locale,
    context: c.context,
    created_at: c.created_at,
  }
}
export async function listOwn(db: Knex, who: ChatIdentity) {
  const g = who.customerId ? null : await guest(db, who.guestToken)
  if (!who.customerId && !g) return []
  return db('tamir_chat_conversation')
    .where(who.customerId ? { customer_id: who.customerId } : { guest_hash: g.hash })
    .select('id', 'number', 'locale', 'status', 'created_at')
    .orderBy('updated_at', 'desc')
    .limit(50)
}
export async function startConversation(db: Knex, who: ChatIdentity, body: any) {
  const { config } = await settings(db)
  if (!config.enabled) throw new ChatError(409, 'CHAT_DISABLED')
  if (!config.translation.locales.includes(body?.locale)) throw new ChatError(400, 'INVALID_LOCALE')
  let g = await guest(db, who.guestToken),
    token: string | undefined
  if (!who.customerId) {
    if (!config.guests) throw new ChatError(401, 'LOGIN_REQUIRED')
    if (!g) {
      const p = guestSchema.safeParse(body?.guest)
      if (!p.success) throw new ChatError(400, 'INVALID_GUEST')
      token = newGuestToken()
      g = { hash: hashGuest(token), profile: p.data, expires_at: new Date(Date.now() + 30 * 86400000) }
    }
  }
  return db.transaction(async (trx) => {
    await trx.raw('SELECT pg_advisory_xact_lock(hashtext(?))', ['chat-owner:' + (who.customerId || g.hash)])
    if (!who.customerId && !token) {
      g = await guest(trx, who.guestToken)
      if (!g) throw new ChatError(404, 'GUEST_SESSION_EXPIRED')
    }
    if (!who.customerId && token)
      await trx('tamir_chat_guest')
        .insert({ ...g, profile: JSON.stringify(g.profile) })
        .onConflict('hash')
        .ignore()
    let row = await trx('tamir_chat_conversation')
      .where(who.customerId ? { customer_id: who.customerId } : { guest_hash: g.hash })
      .orderBy('updated_at', 'desc')
      .first()
    const profile = who.customerId ? who.profile : g.profile
    if (!row) {
      const id = randomUUID()
      ;[row] = await trx('tamir_chat_conversation')
        .insert({
          id,
          customer_id: who.customerId || null,
          guest_hash: who.customerId ? null : g.hash,
          profile: JSON.stringify(profile),
          locale: body.locale,
        })
        .returning('*')
      await audit(trx, 'conversation_created', undefined, id)
    } else
      [row] = await trx('tamir_chat_conversation')
        .where({ id: row.id })
        .update({ profile: JSON.stringify(profile), locale: body.locale, updated_at: new Date() })
        .returning('*')
    return {
      conversation: publicConversation(row),
      ...(token ? { guest_token: token } : {}),
      conversations: await listOwn(trx, { ...who, guestToken: token || who.guestToken }),
      claimAvailable: Boolean(
        who.customerId && g && (await trx('tamir_chat_conversation').where({ guest_hash: g.hash }).first()),
      ),
    }
  })
}
export async function claimGuest(db: Knex, who: ChatIdentity) {
  if (!who.customerId) throw new ChatError(401, 'LOGIN_REQUIRED')
  return db.transaction(async (trx) => {
    await trx.raw('SELECT pg_advisory_xact_lock(hashtext(?))', ['chat-owner:' + hashGuest(who.guestToken || '')])
    const g = await guest(trx, who.guestToken)
    if (!g) throw new ChatError(404, 'GUEST_SESSION_EXPIRED')
    const locked = await trx('tamir_chat_guest').where({ hash: g.hash }).forUpdate().first()
    if (!locked) throw new ChatError(404, 'GUEST_SESSION_EXPIRED')
    const rows = await trx('tamir_chat_conversation')
      .where({ guest_hash: g.hash, customer_id: null })
      .update({
        guest_hash: null,
        customer_id: who.customerId,
        profile: JSON.stringify(who.profile),
        updated_at: new Date(),
      })
      .returning('id')
    await trx('tamir_chat_guest').where({ hash: g.hash }).delete()
    await audit(trx, 'guest_claimed', who.customerId)
    return { claimed: rows.length }
  })
}
export async function appendMessage(
  db: Knex,
  id: string,
  sender: 'customer' | 'operator',
  body: any,
  profile?: ChatIdentity['profile'],
  who?: ChatIdentity,
) {
  const p = messageSchema.safeParse(body)
  if (!p.success) throw new ChatError(400, 'INVALID_MESSAGE')
  return db.transaction(async (trx) => {
    const c = who
      ? await owned(trx, id, who, true)
      : await trx('tamir_chat_conversation').where({ id }).forUpdate().first()
    if (!c) throw new ChatError(404, 'CHAT_NOT_FOUND')
    const clientId = sender + ':' + p.data.clientId,
      existing = await trx('tamir_chat_message').where({ conversation_id: id, client_id: clientId }).first()
    if (existing) return { id: existing.id }
    if (c.status === 'closed') throw new ChatError(409, 'CHAT_CLOSED')
    const messageId = randomUUID()
    await trx('tamir_chat_message').insert({
      id: messageId,
      conversation_id: id,
      sender,
      original: p.data.text,
      client_id: clientId,
      locale: c.locale,
    })
    await trx('tamir_chat_outbox').insert({ message_id: messageId })
    await trx('tamir_chat_conversation')
      .where({ id })
      .update({ updated_at: new Date(), ...(profile ? { profile: JSON.stringify(profile) } : {}) })
    return { id: messageId }
  })
}
export async function customerMessage(db: Knex, id: string, who: ChatIdentity, body: any) {
  await owned(db, id, who)
  if (!(await settings(db)).config.enabled) throw new ChatError(409, 'CHAT_DISABLED')
  return appendMessage(db, id, 'customer', body, who.profile, who)
}
export async function messages(db: Knex, id: string, before?: string) {
  const q = db('tamir_chat_message').where({ conversation_id: id }).orderBy('seq', 'desc').limit(100)
  if (before && /^\d+$/.test(before)) q.where('seq', '<', before)
  return (await q).reverse()
}
export function customerView(m: any) {
  return {
    id: m.id,
    seq: m.seq,
    sender: m.sender,
    text: m.sender === 'operator' ? (m.status === 'delivered' ? m.translated : null) : m.original,
    status: m.status,
    created_at: m.created_at,
    locale: m.locale,
  }
}
export async function changeStatus(db: Knex, id: string, status: 'open' | 'closed', actor: string, who?: ChatIdentity) {
  return db.transaction(async (trx) => {
    const c = who
      ? await owned(trx, id, who, true)
      : await trx('tamir_chat_conversation').where({ id }).forUpdate().first()
    if (!c) throw new ChatError(404, 'CHAT_NOT_FOUND')
    if (c.status === status) return publicConversation(c)
    const { config } = await settings(trx),
      template = config.templates[status === 'open' ? 'reopened' : 'closed']
    await trx('tamir_chat_conversation').where({ id }).update({ status, updated_at: new Date() })
    if (template.enabled)
      await trx('tamir_chat_message').insert({
        id: randomUUID(),
        conversation_id: id,
        sender: 'system',
        original: template.text[c.locale as 'sr' | 'en'],
        locale: c.locale,
        translation_state: 'skipped',
        status: 'delivered',
        client_id: randomUUID(),
      })
    await audit(trx, 'conversation_' + status, actor, id)
    return publicConversation({ ...c, status })
  })
}
export async function pruneChat(db: Knex) {
  const { config } = await settings(db),
    cutoff = new Date(Date.now() - config.retentionDays * 86400000)
  await db.transaction(async (trx) => {
    await trx('tamir_chat_conversation').where('updated_at', '<', cutoff).delete()
    await trx('tamir_chat_guest').where('expires_at', '<', new Date()).delete()
    await trx('tamir_chat_event').where('created_at', '<', cutoff).delete()
    await trx('tamir_chat_update').where('created_at', '<', cutoff).delete()
    await trx('tamir_chat_rate').where('expires_at', '<', new Date()).delete()
  })
}

export async function readOwn(db: Knex, id: string, who: ChatIdentity, before?: string) {
  return db.transaction(async (trx) => {
    const c = await owned(trx, id, who, true)
    return { conversation: publicConversation(c), messages: (await messages(trx, id, before)).map(customerView) }
  })
}

// Reconnects replay every unseen row in order, even if more than one page arrived offline.
// Also resend recent older rows so delivery/translation status changes replace prior values.
export async function streamOwn(db: Knex, id: string, who: ChatIdentity, after?: string) {
  return db.transaction(async (trx) => {
    const c = await owned(trx, id, who, true)
    const fresh = after
      ? await trx('tamir_chat_message')
          .where({ conversation_id: id })
          .where('seq', '>', after)
          .orderBy('seq')
          .limit(100)
      : await messages(trx, id)
    const previous = after
      ? await trx('tamir_chat_message')
          .where({ conversation_id: id })
          .where('seq', '<=', after)
          .orderBy('seq', 'desc')
          .limit(100)
      : []
    return {
      conversation: publicConversation(c),
      messages: [...previous, ...fresh].map(customerView),
      cursor: String(fresh.at(-1)?.seq || after || '0'),
    }
  })
}
