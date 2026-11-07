'use client'
import { useEffect, useRef, useState } from 'react'
import { usePathname } from 'next/navigation'
import { useAuth } from '@/components/auth/AuthProvider'
import { useLocaleContext } from '@/components/i18n/LocaleProvider'
import {
  chatRequest,
  mergeMessages,
  guestValid,
  type Conversation,
  type ChatMessage,
  type WidgetConfig,
} from './chat-client'
import './chat.css'
export default function ChatWidget() {
  const { customer, isReady } = useAuth()
  return isReady ? <Session key={customer?.id || 'guest'} customer={Boolean(customer)} /> : null
}
function Session({ customer }: { customer: boolean }) {
  const { locale, t } = useLocaleContext(),
    { refresh } = useAuth(),
    path = usePathname()
  const [config, setConfig] = useState<WidgetConfig | null>(null),
    [open, setOpen] = useState(false),
    [conversation, setConversation] = useState<Conversation | null>(null),
    [threads, setThreads] = useState<Conversation[]>([]),
    [rows, setRows] = useState<ChatMessage[]>([])
  const [guestForm, setGuestForm] = useState(false),
    [claim, setClaim] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [connected, setConnected] = useState(false),
    [text, setText] = useState(''),
    [name, setName] = useState(''),
    [email, setEmail] = useState(''),
    [phone, setPhone] = useState(''),
    [notice, setNotice] = useState(''),
    [unread, setUnread] = useState(0),
    [older, setOlder] = useState(false)
  const locked = useRef(false),
    alive = useRef(true),
    opened = useRef(false),
    pending = useRef<{ text: string; id: string } | null>(null),
    trigger = useRef<HTMLButtonElement>(null),
    panel = useRef<HTMLElement>(null),
    input = useRef<HTMLTextAreaElement>(null),
    end = useRef<HTMLDivElement>(null),
    activeId = useRef<string | null>(null)
  useEffect(() => {
    activeId.current = conversation?.id || null
  }, [conversation?.id])
  const automatic = (key: string) => (config?.templates[key]?.enabled ? config.templates[key].text[locale] : '')
  useEffect(() => {
    alive.current = true
    return () => {
      alive.current = false
    }
  }, [])
  useEffect(() => {
    const abort = new AbortController()
    const load = () =>
      chatRequest<WidgetConfig>('config', undefined, abort.signal)
        .then(setConfig)
        .catch(() => {})
    void load()
    const timer = setInterval(load, 60000)
    return () => {
      abort.abort()
      clearInterval(timer)
    }
  }, [])
  useEffect(() => {
    const check = () => {
      if (document.visibilityState === 'visible') void refresh().catch(() => {})
    }
    document.addEventListener('visibilitychange', check)
    return () => document.removeEventListener('visibilitychange', check)
  }, [refresh])
  useEffect(() => {
    opened.current = open
    if (open) {
      setUnread(0)
      panel.current?.focus()
    }
  }, [open])
  const initialize = async (guest?: { name: string; email: string; phone: string }) => {
    if (locked.current) return
    locked.current = true
    setBusy(true)
    setError('')
    try {
      if (!customer && !guest) {
        const r = await chatRequest<{ conversations: Conversation[] }>('conversations')
        if (!alive.current) return
        if (!r.conversations.length) {
          setGuestForm(true)
          return
        }
      }
      const r = await chatRequest<{
        conversation: Conversation
        conversations: Conversation[]
        claimAvailable: boolean
      }>('session', { locale, ...(guest ? { guest } : {}) })
      if (!alive.current) return
      setConversation(r.conversation)
      setThreads(r.conversations)
      setClaim(r.claimAvailable)
      setGuestForm(false)
      setNotice(automatic('welcome'))
    } catch (e) {
      if (alive.current) {
        setError((e as Error).message)
        if (!customer) setGuestForm(true)
      }
    } finally {
      locked.current = false
      if (alive.current) setBusy(false)
    }
  }
  useEffect(() => {
    if (open && !conversation && !guestForm && !error) void initialize()
  }, [open, conversation, guestForm, error])
  useEffect(() => {
    if (!conversation) return
    const id = conversation.id,
      stream = new EventSource('/api/chat/stream?id=' + id),
      known = new Set<string>()
    let first = true,
      cancelled = false
    setRows([])
    setOlder(false)
    stream.onmessage = (e) => {
      if (cancelled || !alive.current) return
      try {
        const r = JSON.parse(e.data) as { conversation: Conversation; messages: ChatMessage[]; available: boolean }
        setConnected(true)
        setConversation(r.conversation)
        setConfig((c) => (c ? { ...c, available: r.available } : c))
        setRows((old) => mergeMessages(old, r.messages))
        if (first) setOlder(r.messages.length === 100)
        let count = 0
        for (const m of r.messages)
          if (m.sender === 'operator' && m.text) {
            if (!first && !known.has(m.id)) count++
            known.add(m.id)
          }
        first = false
        if (!opened.current && count) setUnread((n) => n + count)
      } catch {
        setConnected(false)
      }
    }
    stream.onerror = () => {
      if (!cancelled) {
        setConnected(false)
        void refresh().catch(() => {})
      }
    }
    stream.addEventListener('expired', () => {
      stream.close()
      setRows([])
      setConversation(null)
      setError('CHAT_SESSION_EXPIRED')
      setGuestForm(!customer)
    })
    stream.addEventListener('disabled', () => {
      stream.close()
      setConfig((c) => (c ? { ...c, enabled: false } : c))
    })
    return () => {
      cancelled = true
      stream.close()
      setConnected(false)
    }
  }, [conversation?.id, customer, refresh])
  const context = async (id: string) => {
    const p = document.querySelector<HTMLElement>('[data-chat-product]')
    return chatRequest('context', {
      id,
      locale,
      ...(config?.productContext && p
        ? {
            productId: p.dataset.chatProduct,
            variantId: p.dataset.chatVariant || undefined,
            path: window.location.pathname,
          }
        : {}),
    })
  }
  useEffect(() => {
    if (!conversation) return
    const send = () => {
      void context(conversation.id).catch(() => {})
    }
    send()
    window.addEventListener('tamir:product-context', send)
    return () => window.removeEventListener('tamir:product-context', send)
  }, [conversation?.id, locale, path, config?.productContext])
  useEffect(() => {
    if (open) end.current?.scrollIntoView({ block: 'nearest' })
  }, [rows.length, open])
  const send = async () => {
    if (!conversation || locked.current || !text.trim()) return
    locked.current = true
    setBusy(true)
    setError('')
    if (!pending.current || pending.current.text !== text) pending.current = { text, id: crypto.randomUUID() }
    try {
      await context(conversation.id)
      await chatRequest('messages', { id: conversation.id, text, clientId: pending.current.id })
      if (alive.current) {
        setText('')
        pending.current = null
        setNotice(automatic('sent'))
        input.current?.focus()
      }
    } catch (e) {
      if (alive.current) setError((e as Error).message)
    } finally {
      locked.current = false
      if (alive.current) setBusy(false)
    }
  }
  const act = async (action: string) => {
    if (!conversation || locked.current) return
    locked.current = true
    setBusy(true)
    setError('')
    try {
      await chatRequest(action, { id: conversation.id })
      if (!alive.current) return
      if (action === 'claim') {
        setClaim(false)
        setThreads((await chatRequest<{ conversations: Conversation[] }>('conversations')).conversations)
      }
      if (action === 'reopen') setConversation({ ...conversation, status: 'open' })
      if (action === 'delete') {
        setRows([])
        setConversation(null)
        setOpen(false)
        setGuestForm(false)
      }
    } catch (e) {
      if (alive.current) setError((e as Error).message)
    } finally {
      locked.current = false
      if (alive.current) setBusy(false)
    }
  }
  if (!config?.enabled || !config.locales.includes(locale)) return null
  return (
    <div className={`tamir-chat tamir-chat-${config.position}`}>
      {open && (
        <section
          ref={panel}
          tabIndex={-1}
          className="tamir-chat-panel"
          role="dialog"
          aria-modal="false"
          aria-labelledby="tamir-chat-title"
          onKeyDown={(e) => {
            if (e.key === 'Escape') {
              setOpen(false)
              trigger.current?.focus()
            }
          }}
        >
          <header className="tamir-chat-heading">
            <div>
              <h2 id="tamir-chat-title">{config.title[locale]}</h2>
              {config.showStatus && <p>{t(config.available ? 'chat.available' : 'chat.support')}</p>}
            </div>
            <button
              className="icon-button"
              aria-label={t('common.close')}
              onClick={() => {
                setOpen(false)
                trigger.current?.focus()
              }}
            >
              ×
            </button>
          </header>
          <div className="tamir-chat-body">
            <p className="tamir-chat-privacy">
              {t('chat.privacy', { days: config.retentionDays })}{' '}
              <a href={locale === 'en' ? '/en/privacy' : '/privacy'}>{t('chat.privacyLink')}</a>
            </p>
            {!config.available && automatic('offline') && <p role="status">{automatic('offline')}</p>}
            {busy && !conversation && <p role="status">{t('chat.loading')}</p>}
            {guestForm &&
              !customer &&
              (config.guests ? (
                <form
                  className="tamir-chat-form"
                  onSubmit={(e) => {
                    e.preventDefault()
                    if (guestValid(name, email, phone)) void initialize({ name, email, phone })
                  }}
                >
                  <label>
                    {t('chat.name')}
                    <input
                      required
                      minLength={2}
                      maxLength={100}
                      autoComplete="given-name"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                    />
                  </label>
                  <label>
                    {t('chat.email')}
                    <input
                      type="email"
                      maxLength={254}
                      autoComplete="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                    />
                  </label>
                  <label>
                    {t('chat.phone')}
                    <input
                      type="tel"
                      maxLength={30}
                      autoComplete="tel"
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                    />
                  </label>
                  <button className="button-primary" disabled={busy || !guestValid(name, email, phone)}>
                    {t('chat.start')}
                  </button>
                </form>
              ) : (
                <p>{t('chat.loginRequired')}</p>
              ))}
            {claim && (
              <button className="button-secondary" disabled={busy} onClick={() => void act('claim')}>
                {t('chat.claim')}
              </button>
            )}
            {threads.length > 1 && (
              <label>
                {t('chat.history')}
                <select
                  disabled={busy}
                  value={conversation?.id || ''}
                  onChange={(e) => {
                    const c = threads.find((x) => x.id === e.target.value)
                    if (c) {
                      setRows([])
                      setConversation(c)
                      pending.current = null
                      setText('')
                    }
                  }}
                >
                  {threads.map((c) => (
                    <option key={c.id} value={c.id}>
                      #{c.number} · {t(c.status === 'open' ? 'chat.open' : 'chat.closed')}
                    </option>
                  ))}
                </select>
              </label>
            )}
            {older && conversation && (
              <button
                className="button-quiet"
                onClick={async () => {
                  const id = conversation.id
                  try {
                    const r = await chatRequest<{ messages: ChatMessage[] }>(
                      'messages?id=' + id + '&before=' + rows[0]?.seq,
                    )
                    if (alive.current && activeId.current === id) {
                      setRows((old) => mergeMessages(r.messages, old))
                      setOlder(r.messages.length === 100)
                    }
                  } catch {
                    setError('CHAT_UNAVAILABLE')
                  }
                }}
              >
                {t('chat.older')}
              </button>
            )}
            <div className="tamir-chat-messages" role="log" aria-live="polite" aria-relevant="additions text">
              {rows.map((m) => (
                <article key={m.id} className={`tamir-chat-message tamir-chat-message-${m.sender}`}>
                  <p>{m.text ?? t('chat.awaitingTranslation')}</p>
                  <small>
                    {new Date(m.created_at).toLocaleTimeString(locale === 'sr' ? 'sr-Latn-RS' : 'en-GB', {
                      hour: '2-digit',
                      minute: '2-digit',
                    })}{' '}
                    ·{' '}
                    {t(
                      m.status === 'delivered'
                        ? 'chat.delivered'
                        : m.status === 'error'
                          ? 'chat.deliveryError'
                          : 'chat.sent',
                    )}
                  </small>
                  {m.status === 'error' && automatic('error') && <p>{automatic('error')}</p>}
                </article>
              ))}
            </div>
            {notice && (
              <p className="tamir-chat-notice" role="status">
                {notice}
              </p>
            )}
            {error && (
              <div role="alert">
                <p>{t('chat.error')}</p>
                <small>{error}</small>
                {!conversation && !guestForm && <button onClick={() => void initialize()}>{t('common.retry')}</button>}
              </div>
            )}
            <div ref={end} />
          </div>
          {conversation && (
            <footer className="tamir-chat-compose">
              <p role="status">{t(connected ? 'chat.connected' : 'chat.reconnecting')}</p>
              {conversation.status === 'closed' ? (
                <button className="button-secondary" disabled={busy} onClick={() => void act('reopen')}>
                  {t('chat.reopen')}
                </button>
              ) : (
                <form
                  onSubmit={(e) => {
                    e.preventDefault()
                    void send()
                  }}
                >
                  <textarea
                    ref={input}
                    aria-label={t('chat.message')}
                    rows={2}
                    maxLength={1500}
                    value={text}
                    onChange={(e) => setText(e.target.value)}
                  />
                  <button className="button-primary" disabled={busy || !text.trim()}>
                    {t(busy ? 'chat.sending' : 'chat.send')}
                  </button>
                </form>
              )}
              <button
                className="tamir-chat-delete"
                disabled={busy}
                onClick={() => {
                  if (window.confirm(t('chat.deleteConfirm'))) void act('delete')
                }}
              >
                {t('chat.delete')}
              </button>
            </footer>
          )}
        </section>
      )}
      <button
        ref={trigger}
        className="tamir-chat-launcher"
        aria-label={config.button[locale]}
        aria-expanded={open}
        onClick={() => {
          if (!open && conversation) setNotice(automatic('returning'))
          setOpen((v) => !v)
        }}
      >
        <svg
          width="24"
          height="24"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.6"
          aria-hidden="true"
        >
          <path d="M21 11.5a8.5 8.5 0 0 1-8.5 8.5H4l-2 2V11.5a9.5 9.5 0 0 1 19 0Z" />
          <path d="M7 10h10M7 14h7" />
        </svg>
        <span>{config.button[locale]}</span>
        {config.notifications && unread > 0 && <b>{unread}</b>}
      </button>
    </div>
  )
}
