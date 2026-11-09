import sharp from 'sharp'
import type { Knex } from 'knex'
import { ChatError } from './security'
import { owned, type ChatIdentity } from './conversations'

export const IMAGE_MAX_BYTES = 5 * 1024 * 1024
export type ChatImage = { content: Buffer; mime: string; width: number; height: number }
// Decode and re-encode: MIME/extension checks alone cannot validate an image.
// No user filenames, metadata, animation or executable SVG are retained.
export async function prepareImage(value: unknown): Promise<ChatImage> {
  if (typeof value !== 'string' || value.length > Math.ceil(IMAGE_MAX_BYTES / 3) * 4 + 64)
    throw new ChatError(413, 'CHAT_IMAGE_TOO_LARGE')
  const match = /^data:image\/(jpeg|png|webp);base64,([A-Za-z0-9+/]+={0,2})$/.exec(value)
  if (!match) throw new ChatError(400, 'CHAT_IMAGE_INVALID')
  const bytes = Buffer.from(match[2], 'base64')
  if (bytes.length > IMAGE_MAX_BYTES) throw new ChatError(413, 'CHAT_IMAGE_TOO_LARGE')
  if (bytes.toString('base64') !== match[2]) throw new ChatError(400, 'CHAT_IMAGE_INVALID')
  try {
    const image = sharp(bytes, { limitInputPixels: 20000000, failOn: 'warning' })
    const metadata = await image.metadata()
    if (metadata.format !== match[1] || (metadata.pages || 1) > 1) throw Error('format')
    if (!metadata.width || !metadata.height || Math.max(metadata.width / metadata.height, metadata.height / metadata.width) > 20)
      throw Error('dimensions')
    // libvips can expose APNG as a single page; explicitly reject its animation-control chunk.
    if (metadata.format === 'png') {
      for (let offset = 8; offset + 12 <= bytes.length;) {
        if (bytes.toString('ascii', offset + 4, offset + 8) === 'acTL') throw Error('animation')
        offset += 12 + bytes.readUInt32BE(offset)
      }
    }
    const { data, info } = await image.rotate()
      .resize({ width: 1600, height: 1600, fit: 'inside', withoutEnlargement: true })
      .flatten({ background: '#ffffff' }).jpeg({ quality: 85 }).toBuffer({ resolveWithObject: true })
    if (data.length > 2 * 1024 * 1024) throw new ChatError(413, 'CHAT_IMAGE_TOO_LARGE')
    return { content: data, mime: 'image/jpeg', width: info.width, height: info.height }
  } catch (e) {
    if (e instanceof ChatError) throw e
    throw new ChatError(400, 'CHAT_IMAGE_INVALID')
  }
}
export async function readImage(db: Knex, conversationId: string, messageId: string, who?: ChatIdentity) {
  if (!/^[a-f\d-]{36}$/i.test(conversationId) || !/^[a-f\d-]{36}$/i.test(messageId))
    throw new ChatError(404, 'CHAT_NOT_FOUND')
  return db.transaction(async (trx) => {
    // Omit who only after the admin route has checked chat permissions.
    if (who) await owned(trx, conversationId, who, true)
    const image = await trx('tamir_chat_image as i')
      .join('tamir_chat_message as m', 'm.id', 'i.message_id')
      .where({ 'm.id': messageId, 'm.conversation_id': conversationId })
      .select('i.content', 'i.mime').first()
    if (!image) throw new ChatError(404, 'CHAT_NOT_FOUND')
    return image
  })
}
export function imageResponse(res: any, image: { content: Buffer; mime: string }) {
  res.setHeader('Content-Type', image.mime)
  res.setHeader('Cache-Control', 'private, no-store')
  res.setHeader('X-Content-Type-Options', 'nosniff')
  res.setHeader('Content-Disposition', 'inline; filename="chat-image.jpg"')
  return res.send(image.content)
}
