export type Conversation = { id: string; number: string; status: 'open' | 'closed'; locale: 'sr' | 'en' }
export type ChatMessage = {
  id: string
  seq: string
  sender: 'customer' | 'operator' | 'system'
  text: string | null
  status: string
  created_at: string
  locale: string
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
