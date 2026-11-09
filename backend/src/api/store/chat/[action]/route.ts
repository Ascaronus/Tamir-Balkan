import type { AuthenticatedMedusaRequest, MedusaResponse } from '@medusajs/framework/http'
import { ContainerRegistrationKeys } from '@medusajs/framework/utils'
import { chatDb, failure, identity, limit } from '../../../../utils/chat/http'
import { publicSettings, settings } from '../../../../utils/chat/settings'
import {
  readOwn,
  appendMessage,
  claimGuest,
  customerMessage,
  customerView,
  listOwn,
  messages,
  owned,
  publicConversation,
  startConversation,
  changeStatus,
} from '../../../../utils/chat/conversations'
import { prepareImage, readImage, imageResponse } from '../../../../utils/chat/images'
import { ChatError } from '../../../../utils/chat/security'
import { kickChat } from '../../../../utils/chat/delivery'
export async function GET(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  res.setHeader('Cache-Control', 'no-store')
  try {
    const db = chatDb(req)
    await limit(req, 'chat-read', 120)
    if (req.params.action === 'config') return res.json(await publicSettings(db))
    const who = await identity(req)
    if (req.params.action === 'conversations') return res.json({ conversations: await listOwn(db, who) })
    if (req.params.action === 'image')
      return imageResponse(res, await readImage(db, String(req.query.id || ''), String(req.query.image || ''), who))
    if (req.params.action === 'messages') {
      return res.json(
        await readOwn(
          db,
          String(req.query.id || ''),
          who,
          typeof req.query.before === 'string' ? req.query.before : undefined,
        ),
      )
    }
    throw new ChatError(404, 'CHAT_ENDPOINT_NOT_FOUND')
  } catch (e) {
    return failure(e, res)
  }
}
export async function POST(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  res.setHeader('Cache-Control', 'no-store')
  try {
    const db = chatDb(req),
      who = await identity(req),
      body = req.body as any,
      action = req.params.action
    await limit(req, 'chat-' + action, action === 'session' ? 15 : action === 'image-message' ? 10 : 40)
    if (action === 'session') return res.json(await startConversation(db, who, body))
    if (action === 'claim') return res.json(await claimGuest(db, who))
    const c = await owned(db, String(body?.id || ''), who),
      { config } = await settings(db)
    if (!config.enabled && action !== 'delete') throw new ChatError(409, 'CHAT_DISABLED')
    if (action === 'image-message') {
      const image = await prepareImage(body.image)
      const result = await appendMessage(db, c.id, 'customer', { text: body.text, clientId: body.clientId }, who.profile, who, image)
      kickChat(db)
      return res.json(result)
    }
    if (action === 'messages') {
      const result = await customerMessage(db, c.id, who, { text: body.text, clientId: body.clientId })
      kickChat(db)
      return res.json(result)
    }
    if (action === 'reopen') return res.json(await changeStatus(db, c.id, 'open', who.customerId || 'guest', who))
    if (action === 'context') {
      if (!config.translation.locales.includes(body.locale)) throw new ChatError(400, 'INVALID_LOCALE')
      let context: any = null
      if (config.productContext && body.productId) {
        if (
          typeof body.productId !== 'string' ||
          !/^prod_[a-zA-Z0-9]+$/.test(body.productId) ||
          typeof body.path !== 'string' ||
          !/^\/(?!\/)[^?#\s\\]{0,300}$/.test(body.path)
        )
          throw new ChatError(400, 'INVALID_PRODUCT_CONTEXT')
        const { data } = await req.scope.resolve(ContainerRegistrationKeys.QUERY).graph({
          entity: 'product',
          fields: [
            'id',
            'title',
            'status',
            'variants.id',
            'variants.title',
            'variants.options.value',
            'variants.options.option.title',
          ],
          filters: { id: body.productId },
        })
        const p = data[0]
        if (p?.status !== 'published') throw new ChatError(400, 'INVALID_PRODUCT_CONTEXT')
        const v = body.variantId ? p.variants?.find((x: any) => x.id === body.variantId) : null
        if (body.variantId && !v) throw new ChatError(400, 'INVALID_VARIANT')
        context = {
          productId: p.id,
          title: p.title?.slice(0, 200),
          url: 'https://tamir.rs' + body.path,
          variantId: v?.id || null,
          variantTitle: v?.title?.slice(0, 100) || null,
          size:
            v?.options
              ?.filter((o: any) => /size|veličina|velicina/i.test(o.option?.title || ''))
              .map((o: any) => o.value)
              .join(', ')
              .slice(0, 50) || null,
        }
      }
      await db.transaction(async (trx) => {
        await owned(trx, c.id, who, true)
        await trx('tamir_chat_conversation')
          .where({ id: c.id })
          .update({ locale: body.locale, context: context ? JSON.stringify(context) : null })
      })
      return res.json({ saved: true })
    }
    if (action === 'delete') {
      await db.transaction(async (trx) => {
        await owned(trx, c.id, who, true)
        await trx('tamir_chat_conversation').where({ id: c.id }).delete()
      })
      return res.json({ deleted: true })
    }
    throw new ChatError(404, 'CHAT_ENDPOINT_NOT_FOUND')
  } catch (e) {
    return failure(e, res)
  }
}
