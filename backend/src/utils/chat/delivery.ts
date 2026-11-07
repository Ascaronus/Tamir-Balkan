import type { Knex } from 'knex'
import { randomUUID } from 'node:crypto'
import { settings, secret, audit } from './settings'
import { telegram, translate, type Transport } from './providers'
import { ChatError, matchesSecret, safeCode } from './security'
import { messageSchema } from '../../shared/chat-config'
// Row locks protect the durable queue across application workers. External calls are at-least-once.
export async function deliverOne(db: Knex, transport: Transport = fetch) {
  return db.transaction(async (trx) => {
    const task = await trx('tamir_chat_outbox')
      .where({ done: false })
      .where('attempts', '<', 8)
      .where('next_at', '<=', new Date())
      .orderBy('next_at')
      .forUpdate()
      .skipLocked()
      .first()
    if (!task) return false
    const m = await trx('tamir_chat_message').where({ id: task.message_id }).first(),
      c = await trx('tamir_chat_conversation').where({ id: m.conversation_id }).forUpdate().first(),
      { config } = await settings(trx)
    const earlier = await trx('tamir_chat_outbox as o')
      .join('tamir_chat_message as m', 'm.id', 'o.message_id')
      .where('m.conversation_id', c.id)
      .where('m.seq', '<', m.seq)
      .where('o.done', false)
      .where('o.attempts', '<', 8)
      .first()
    if (earlier || !config.enabled || (m.sender === 'customer' && !config.telegram.enabled)) {
      await trx('tamir_chat_outbox')
        .where({ message_id: m.id })
        .update({ next_at: new Date(Date.now() + (earlier ? 3000 : 30000)) })
      return true
    }
    let stage = 'translation'
    try {
      const target = m.sender === 'customer' ? config.translation.operatorLanguage : c.locale
      if (m.translation_state === 'pending' || (m.sender === 'operator' && m.target_language !== target)) {
        if (config.translation.enabled) {
          const translated = await translate(trx, m.original, target, transport)
          m.translated = translated.text
          m.source_language = translated.source
          m.translation_state = 'translated'
        } else {
          m.translated = m.original
          m.source_language = 'und'
          m.translation_state = 'disabled'
        }
        m.target_language = target
        await trx('tamir_chat_message')
          .where({ id: m.id })
          .update({
            translated: m.translated,
            source_language: m.source_language,
            target_language: target,
            translation_state: m.translation_state,
            locale: m.sender === 'operator' ? c.locale : m.locale,
            updated_at: new Date(),
          })
      }
      if (m.sender === 'customer') {
        stage = 'telegram'
        let thread = c.telegram_thread_id
        if (config.telegram.topics && !thread) {
          const result = await telegram(
            trx,
            'createForumTopic',
            {
              chat_id: config.telegram.chatId,
              name: `#${c.number} — ${c.profile.name} — ${c.locale.toUpperCase()}`.slice(0, 128),
            },
            transport,
          )
          thread = result.message_thread_id
          await trx('tamir_chat_conversation')
            .where({ id: c.id })
            .update({ telegram_chat_id: config.telegram.chatId, telegram_thread_id: thread })
        }
        const p = c.profile,
          context = c.context
            ? `\nProduct: ${c.context.title}\n${c.context.url}\n${c.context.productId} ${c.context.variantTitle || ''} ${c.context.size || ''}`
            : ''
        const first = !(await trx('tamir_chat_message')
          .where({ conversation_id: c.id, sender: 'customer', status: 'delivered' })
          .first())
        const text = `#${c.number} | ${p.name} | ${c.locale.toUpperCase()}\n${p.email || ''} ${p.phone || ''}\n${c.customer_id ? 'Customer: ' + c.customer_id : 'Guest conversation: ' + c.number}${context}\n\nOriginal (${m.source_language}):\n${m.original}\n\n${m.translation_state === 'disabled' ? 'AUTO TRANSLATION DISABLED — original text' : target.toUpperCase()}:\n${m.translated}`
        // Keep every chunk's ID so direct replies work even without forum topics.
        for (const chunk of text.match(/[\s\S]{1,3800}/gu) || []) {
          const result = await telegram(
            trx,
            'sendMessage',
            {
              chat_id: config.telegram.chatId,
              ...(thread ? { message_thread_id: Number(thread) } : {}),
              text: chunk,
              disable_notification: !(first ? config.telegram.notifyNew : config.telegram.notifyMessages),
              link_preview_options: { is_disabled: true },
            },
            transport,
          )
          await trx('tamir_chat_telegram_ref')
            .insert({ chat_id: config.telegram.chatId, telegram_id: result.message_id, message_id: m.id })
            .onConflict(['chat_id', 'telegram_id'])
            .ignore()
          await trx('tamir_chat_message')
            .where({ id: m.id })
            .update({ telegram_chat_id: config.telegram.chatId, telegram_message_id: result.message_id })
        }
      }
      await trx('tamir_chat_message').where({ id: m.id }).update({ status: 'delivered', updated_at: new Date() })
      await trx('tamir_chat_outbox').where({ message_id: m.id }).update({ done: true, error_code: null })
      await audit(trx, 'message_delivered', undefined, c.id)
      return true
    } catch (e) {
      const code = safeCode(e),
        attempts = task.attempts + 1
      await trx('tamir_chat_outbox')
        .where({ message_id: m.id })
        .update({ attempts, error_code: code, next_at: new Date(Date.now() + Math.min(3600000, 5000 * 2 ** attempts)) })
      await trx('tamir_chat_message').where({ id: m.id }).update({ status: 'error', updated_at: new Date() })
      await audit(trx, stage + '_error', undefined, c.id, code)
      if (task.attempts === 0 && config.telegram.enabled && config.telegram.notifyErrors) {
        try {
          await telegram(
            trx,
            'sendMessage',
            {
              chat_id: config.telegram.chatId,
              text: `TAMIR Chat #${c.number}: ${code}. Message saved; retry scheduled.`,
            },
            transport,
          )
        } catch {}
      }
      return true
    }
  })
}
export async function drainChat(db: Knex, transport: Transport = fetch, batch = 10) {
  for (let n = 0; n < batch; n++) if (!(await deliverOne(db, transport))) break
}
const active = new WeakSet<object>()
export function kickChat(db: Knex) {
  if (active.has(db)) return
  active.add(db)
  void drainChat(db)
    .catch(() => {})
    .finally(() => active.delete(db))
}
export async function telegramUpdate(db: Knex, header: unknown, update: any) {
  const expected = await secret(db, 'webhook')
  if (!expected || !matchesSecret(header, expected)) throw new ChatError(401, 'INVALID_WEBHOOK')
  const { config } = await settings(db),
    m = update?.message
  if (
    !config.enabled ||
    !config.telegram.enabled ||
    !Number.isSafeInteger(update?.update_id) ||
    !m ||
    m.from?.is_bot ||
    m.sender_chat ||
    m.forward_origin ||
    String(m.chat?.id) !== config.telegram.chatId
  )
    return { ignored: true }
  const input = messageSchema.safeParse({ text: m.text, clientId: randomUUID() })
  if (!input.success) return { ignored: true }
  return db.transaction(async (trx) => {
    const op = await trx('tamir_chat_operator')
      .where({ telegram_id: String(m.from?.id), enabled: true })
      .whereIn('role', ['operator', 'manager'])
      .first()
    if (!op) return { ignored: true }
    const key = `${(await secret(trx, 'telegram'))?.split(':')[0]}:${update.update_id}`
    const inserted = await trx('tamir_chat_update').insert({ key }).onConflict('key').ignore().returning('key')
    if (!inserted.length) return { duplicate: true }
    let c
    if (config.telegram.topics)
      c = await trx('tamir_chat_conversation')
        .where({ telegram_chat_id: String(m.chat.id), telegram_thread_id: m.message_thread_id || -1 })
        .forUpdate()
        .first()
    else {
      const ref = await trx('tamir_chat_telegram_ref as r')
        .join('tamir_chat_message as m', 'm.id', 'r.message_id')
        .where({ 'r.chat_id': String(m.chat.id), 'r.telegram_id': m.reply_to_message?.message_id || -1 })
        .select('m.conversation_id')
        .first()
      if (ref) c = await trx('tamir_chat_conversation').where({ id: ref.conversation_id }).forUpdate().first()
    }
    if (!c || c.status === 'closed') return { ignored: true }
    const id = randomUUID()
    await trx('tamir_chat_message').insert({
      id,
      conversation_id: c.id,
      sender: 'operator',
      operator_id: op.id,
      original: input.data.text,
      locale: c.locale,
      client_id: 'telegram:' + key,
      telegram_message_id: m.message_id,
      telegram_chat_id: String(m.chat.id),
    })
    await trx('tamir_chat_outbox').insert({ message_id: id })
    await trx('tamir_chat_conversation').where({ id: c.id }).update({ updated_at: new Date() })
    return { accepted: true }
  })
}
