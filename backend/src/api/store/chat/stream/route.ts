import type { AuthenticatedMedusaRequest, MedusaResponse } from '@medusajs/framework/http'
import { chatDb, failure, identity, limit } from '../../../../utils/chat/http'
import { streamOwn, owned } from '../../../../utils/chat/conversations'
import { publicSettings } from '../../../../utils/chat/settings'
export async function GET(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  let closed = false,
    timer: ReturnType<typeof setTimeout> | undefined
  try {
    const db = chatDb(req)
    await limit(req, 'chat-stream', 20)
    const who = await identity(req),
      id = String(req.query.id || '')
    await owned(db, id, who)
    res.setHeader('Content-Type', 'text/event-stream')
    res.setHeader('Cache-Control', 'no-store, no-transform')
    res.setHeader('X-Accel-Buffering', 'no')
    res.flushHeaders()
    res.write('retry: 1500\n\n')
    const deadline = Date.now() + 20000
    let cursor =
      typeof req.headers['last-event-id'] === 'string' && /^\d{1,19}$/.test(req.headers['last-event-id'])
        ? req.headers['last-event-id']
        : undefined
    const close = () => {
      closed = true
      if (timer) clearTimeout(timer)
    }
    res.on('close', close)
    const tick = async () => {
      if (closed) return
      try {
        const snapshot = await streamOwn(db, id, who, cursor),
          config = await publicSettings(db)
        if (!config.enabled) {
          res.write('event: disabled\ndata: {}\n\n')
          res.end()
          close()
          return
        }
        cursor = snapshot.cursor
        res.write(`id: ${cursor}\ndata: ${JSON.stringify({ ...snapshot, available: config.available })}\n\n`)
        if (Date.now() >= deadline) {
          res.end()
          close()
        } else timer = setTimeout(() => void tick(), 2000)
      } catch {
        res.write('event: expired\ndata: {}\n\n')
        res.end()
        close()
      }
    }
    await tick()
  } catch (e) {
    if (!res.headersSent) return failure(e, res)
    res.end()
  }
}
