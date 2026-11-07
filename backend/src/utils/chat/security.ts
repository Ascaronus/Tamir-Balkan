import { createCipheriv, createDecipheriv, randomBytes, createHash, timingSafeEqual } from 'node:crypto'
export class ChatError extends Error {
  constructor(
    public status: number,
    public code: string,
  ) {
    super(code)
  }
}
export const hashGuest = (s: string) => createHash('sha256').update(s).digest('hex')
export const newGuestToken = () => randomBytes(32).toString('hex')
export const validGuest = (v: unknown): v is string => typeof v === 'string' && /^[a-f0-9]{64}$/.test(v)
function key() {
  const k = process.env.CHAT_ENCRYPTION_KEY
  if (!k || !/^[a-f\d]{64}$/i.test(k)) throw new ChatError(503, 'CHAT_ENCRYPTION_KEY_REQUIRED')
  return Buffer.from(k, 'hex')
}
export function encryptSecret(s: string) {
  const iv = randomBytes(12),
    c = createCipheriv('aes-256-gcm', key(), iv)
  return [
    iv.toString('base64'),
    c.update(s, 'utf8', 'base64') + c.final('base64'),
    c.getAuthTag().toString('base64'),
  ].join('.')
}
export function decryptSecret(s: string) {
  try {
    const [iv, data, tag] = s.split('.'),
      c = createDecipheriv('aes-256-gcm', key(), Buffer.from(iv, 'base64'))
    c.setAuthTag(Buffer.from(tag, 'base64'))
    return c.update(data, 'base64', 'utf8') + c.final('utf8')
  } catch {
    throw new ChatError(503, 'CHAT_SECRET_UNAVAILABLE')
  }
}
export function matchesSecret(value: unknown, expected: string) {
  if (typeof value !== 'string') return false
  const a = Buffer.from(value),
    b = Buffer.from(expected)
  return a.length === b.length && timingSafeEqual(a, b)
}
export const safeCode = (e: unknown) => (e instanceof ChatError ? e.code : 'CHAT_UNAVAILABLE')
