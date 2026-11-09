export type Conversation = { id: string; number: string; status: 'open' | 'closed'; locale: 'sr' | 'en' }
export type ChatMessage = {
  id: string
  seq: string
  sender: 'customer' | 'operator' | 'system'
  text: string | null
  status: string
  created_at: string
  locale: string
  has_image?: boolean
  template_key?: string | null
}
export type WidgetConfig = {
  enabled: boolean
  guests: boolean
  position: 'left' | 'right'
  showStatus: boolean
  productContext: boolean
  notifications: boolean
  available: boolean
  locales: string[]
  retentionDays: number
  title: { sr: string; en: string }
  button: { sr: string; en: string }
  templates: Record<string, { enabled: boolean; text: { sr: string; en: string } }>
}
export async function chatRequest<T = Record<string, unknown>>(
  action: string,
  body?: unknown,
  signal?: AbortSignal,
): Promise<T> {
  const response = await fetch('/api/chat/' + action, {
    method: body === undefined ? 'GET' : 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
    credentials: 'same-origin',
    cache: 'no-store',
    signal,
  })
  const data = await response.json()
  if (!response.ok) throw Error(data.code || 'CHAT_UNAVAILABLE')
  return data
}
export function mergeMessages(old: ChatMessage[], incoming: ChatMessage[]) {
  const map = new Map(old.map((m) => [m.id, m]))
  for (const m of incoming) map.set(m.id, m)
  return [...map.values()].sort((a, b) => Number(a.seq) - Number(b.seq))
}
export function guestValid(name: string, email: string, phone: string) {
  return (
    name.trim().length >= 2 &&
    name.trim().length <= 100 &&
    (!email || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) &&
    email.length <= 254 &&
    /^$|^\+?[0-9 ()-]{6,30}$/.test(phone.trim())
  )
}

export function imageFileError(file: { type: string; size: number }) {
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) return 'CHAT_IMAGE_INVALID'
  return file.size > 5 * 1024 * 1024 ? 'CHAT_IMAGE_TOO_LARGE' : ''
}
export function imageData(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = () => reject(Error('CHAT_IMAGE_INVALID'))
    reader.readAsDataURL(file)
  })
}
// Template identity survives locale changes. Legacy status messages can still match their old text.
export function systemText(message: ChatMessage, config: WidgetConfig, locale: 'sr' | 'en') {
  if (message.sender !== 'system') return message.text
  const key = message.template_key || ['closed', 'reopened'].find((key) =>
    Object.values(config.templates[key]?.text || {}).includes(message.text || ''))
  return key && config.templates[key] ? config.templates[key].text[locale] : message.text
}
