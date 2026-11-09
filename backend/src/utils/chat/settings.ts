import type { Knex } from 'knex'
import { chatConfigSchema, type ChatConfig } from '../../shared/chat-config'
import { ChatError, encryptSecret, decryptSecret, newGuestToken } from './security'
// Legacy rows stored telegram.chatId as a jsonb number; readers and comparisons need the canonical string.
function normalizeChatConfig(config: any): ChatConfig {
  const chatId = config?.telegram?.chatId
  if (typeof chatId !== 'number' && !(typeof chatId === 'string' && chatId !== chatId.trim())) return config
  return { ...config, telegram: { ...config.telegram, chatId: String(chatId).trim() } }
}
export async function settings(db: Knex): Promise<{ config: ChatConfig; revision: number }> {
  const row = await db('tamir_chat_settings').where({ id: 1 }).first()
  if (!row) throw new ChatError(503, 'CHAT_NOT_INITIALIZED')
  const config = normalizeChatConfig(row.config)
  // Repair the stored document once so every consumer, including SQL reports, sees the same value.
  if (config !== row.config)
    await db('tamir_chat_settings')
      .where({ id: 1 })
      .update({ config: JSON.stringify(config) })
  return { ...row, config }
}
export async function audit(db: Knex, kind: string, actor?: string, conversation?: string, code?: string) {
  await db('tamir_chat_event').insert({
    kind,
    actor_id: actor || null,
    conversation_id: conversation || null,
    code: code || null,
  })
}
export async function secret(db: Knex, name: string) {
  const row = await db('tamir_chat_secret').where({ name }).first()
  return row ? decryptSecret(row.ciphertext) : null
}
export async function setSecret(db: Knex, name: string, value: string) {
  await db('tamir_chat_secret')
    .insert({ name, ciphertext: encryptSecret(value) })
    .onConflict('name')
    .merge()
}
export async function saveSettings(db: Knex, input: any, actor: string) {
  const parsed = chatConfigSchema.safeParse(input?.config)
  if (!parsed.success) throw new ChatError(400, 'INVALID_CHAT_SETTINGS')
  const config = parsed.data
  return db.transaction(async (trx) => {
    const row = await trx('tamir_chat_settings').where({ id: 1 }).forUpdate().first()
    if (!row || input.revision !== row.revision) throw new ChatError(409, 'CHAT_SETTINGS_CHANGED')
    if (
      config.telegram.enabled &&
      (!config.telegram.chatId || !(await trx('tamir_chat_secret').where({ name: 'telegram' }).first()))
    )
      throw new ChatError(400, 'TELEGRAM_NOT_CONFIGURED')
    // Compare canonical forms so a legacy numeric chatId in jsonb is not treated as a new target.
    const currentConfig = normalizeChatConfig(row.config)
    if (config.telegram.chatId !== currentConfig.telegram.chatId || config.telegram.topics !== currentConfig.telegram.topics)
      await trx('tamir_chat_conversation').update({ telegram_chat_id: null, telegram_thread_id: null })
    await trx('tamir_chat_settings')
      .where({ id: 1 })
      .update({ config: JSON.stringify(config), revision: row.revision + 1, updated_at: new Date() })
    await audit(trx, 'settings_saved', actor)
    return settings(trx)
  })
}
export async function saveSecrets(db: Knex, input: any, actor: string) {
  return db.transaction(async (trx) => {
    if (input?.kind === 'telegram') {
      if (typeof input.value !== 'string' || !/^\d{5,20}:[A-Za-z0-9_-]{20,100}$/.test(input.value))
        throw new ChatError(400, 'INVALID_BOT_TOKEN')
      await setSecret(trx, 'telegram', input.value)
      await setSecret(trx, 'webhook', newGuestToken())
      await trx('tamir_chat_conversation').update({ telegram_chat_id: null, telegram_thread_id: null })
      await trx('tamir_chat_connection').where({ service: 'telegram' }).delete()
    } else if (input?.kind === 'google') {
      if (typeof input.value !== 'string' || !/^[-_A-Za-z0-9]{20,200}$/.test(input.value))
        throw new ChatError(400, 'INVALID_GOOGLE_KEY')
      await setSecret(trx, 'google', input.value)
    } else throw new ChatError(400, 'INVALID_SECRET_KIND')
    await audit(trx, 'secret_replaced', actor)
    return { saved: true }
  })
}
export async function publicSettings(db: Knex) {
  const { config } = await settings(db),
    available = Boolean(
      await db('tamir_chat_operator')
        .where({ enabled: true, available: true })
        .whereIn('role', ['operator', 'manager'])
        .first(),
    )
  const { telegram, translation, ...widget } = config
  return { ...widget, locales: translation.locales, available }
}
