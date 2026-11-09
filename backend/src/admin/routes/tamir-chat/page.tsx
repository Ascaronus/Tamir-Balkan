import { defineRouteConfig } from '@medusajs/admin-sdk'
import { ChatBubbleLeftRight } from '@medusajs/icons'
import {
  Alert,
  Badge,
  Button,
  Container,
  Drawer,
  Heading,
  Input,
  Label,
  Table,
  Tabs,
  Text,
  Textarea,
  usePrompt,
} from '@medusajs/ui'
import { useEffect, useRef, useState } from 'react'
import { Choice, request, Settings, Toggle } from './settings'
import './chat-admin.css'
type Operator = {
  id?: string
  name: string
  userId: string | null
  telegramId: string | null
  role: 'viewer' | 'operator' | 'manager'
  enabled: boolean
  available: boolean
}
const tabs = [
  ['overview', 'Обзор'],
  ['dialogs', 'Диалоги'],
  ['widget', 'Настройки чата'],
  ['telegram', 'Telegram'],
  ['templates', 'Автоматические сообщения'],
  ['translation', 'Переводы'],
  ['operators', 'Операторы'],
  ['history', 'История и статистика'],
]
const managerTabs = ['widget', 'telegram', 'templates', 'translation', 'operators']
export default function TamirChat() {
  const [role, setRole] = useState(''),
    [tab, setTab] = useState('overview'),
    [error, setError] = useState(''),
    [success, setSuccess] = useState(''),
    [busy, setBusy] = useState(false),
    [overview, setOverview] = useState<any>(null),
    [list, setList] = useState<any[]>([]),
    [count, setCount] = useState(0),
    [offset, setOffset] = useState(0),
    [search, setSearch] = useState(''),
    [status, setStatus] = useState('all'),
    [locale, setLocale] = useState('all'),
    [events, setEvents] = useState<any[]>([]),
    [eventOffset, setEventOffset] = useState(0),
    [operators, setOperators] = useState<any[]>([]),
    [op, setOp] = useState<Operator | null>(null),
    [dialog, setDialog] = useState<any>(null),
    [older, setOlder] = useState(false),
    [reply, setReply] = useState('')
  const prompt = usePrompt(),
    lock = useRef(false),
    pending = useRef<{ text: string; id: string } | null>(null),
    generation = useRef(0)
  const allowed = role === 'manager' ? tabs : tabs.filter(([key]) => !managerTabs.includes(key)),
    canReply = role === 'operator' || role === 'manager'
  useEffect(() => {
    request('access')
      .then((r) => setRole(r.role))
      .catch((e) => setError(e.message))
  }, [])
  const load = async () => {
    if (tab === 'overview') setOverview(await request('overview'))
    if (tab === 'dialogs') {
      const r = await request(
        'conversations?' + new URLSearchParams({ search, status, locale, offset: String(offset) }),
      )
      setList(r.conversations)
      setCount(r.count)
    }
    if (tab === 'operators') setOperators((await request('operators')).operators)
    if (tab === 'history') setEvents((await request('history?offset=' + eventOffset)).events)
  }
  useEffect(() => {
    if (!role) return
    let active = true
    const timer = setTimeout(() => {
      if (active)
        void load().catch((e) => {
          if (active) setError(e.message)
        })
    }, 200)
    return () => {
      active = false
      clearTimeout(timer)
    }
  }, [role, tab, offset, search, status, locale, eventOffset])
  const run = async (fn: () => Promise<void>) => {
    if (lock.current) return
    lock.current = true
    setBusy(true)
    setError('')
    setSuccess('')
    try {
      await fn()
      setSuccess('Выполнено успешно')
    } catch (e) {
      setError((e as Error).message)
    } finally {
      lock.current = false
      setBusy(false)
    }
  }
  const openDialog = async (id: string) => {
    const g = ++generation.current
    const r = await request('dialog?id=' + id)
    if (g !== generation.current) return
    setDialog(r)
    setOlder(r.messages.length === 100)
    setReply('')
    pending.current = null
    if (canReply && r.messages.length) await request('seen', { id, seq: r.messages.at(-1).seq })
  }
  const action = async (name: string, body: Record<string, unknown> = {}) => {
    const id = dialog.conversation.id
    await request(name, { id, ...body })
    if (name === 'delete') {
      generation.current++
      setDialog(null)
    } else await openDialog(id)
    await load()
  }
  return (
    <Container className="chat-admin">
      <div className="chat-actions">
        <Heading>TAMIR Chat</Heading>
        <Button variant="secondary" disabled={busy} onClick={() => void run(load)}>
          Обновить
        </Button>
      </div>
      {error && <Alert variant="error">{error}</Alert>}
      {success && <Alert variant="success">{success}</Alert>}
      {!role && !error && <Text>Загрузка…</Text>}
      {role && (
        <>
          <Tabs
            value={tab}
            onValueChange={(v) => {
              setTab(v)
              setError('')
              setSuccess('')
            }}
          >
            <Tabs.List className="chat-tabs">
              {allowed.map(([key, label]) => (
                <Tabs.Trigger key={key} value={key}>
                  {label}
                </Tabs.Trigger>
              ))}
            </Tabs.List>
          </Tabs>
          {tab === 'overview' && overview && (
            <div className="chat-stats">
              {[
                ['total', 'Всего обращений'],
                ['today', 'Новых сегодня'],
                ['active', 'Активные'],
                ['closed', 'Закрытые'],
                ['unread', 'Непрочитанные сообщения'],
                ['sr', 'SR'],
                ['en', 'EN'],
              ].map(([key, label]) => (
                <div className="chat-stat" key={key}>
                  <Text>{label}</Text>
                  <Heading>{overview[key]}</Heading>
                </div>
              ))}
              {['telegram_error', 'translation_error'].map((k) => (
                <div className="chat-stat" key={k}>
                  <Text>{k === 'telegram_error' ? 'Ошибки Telegram' : 'Ошибки перевода'}</Text>
                  <Heading>{overview.errors.find((e: any) => e.kind === k)?.count || 0}</Heading>
                </div>
              ))}
              <Text size="small">
                Сегодня — по времени Белграда. Показатели рассчитаны по сохранённой истории. «Непрочитанные» —
                обращения, не отмеченные оператором в админке.
              </Text>
            </div>
          )}
          {tab === 'dialogs' && (
            <section className="chat-section">
              <div className="chat-filters">
                <Input
                  aria-label="Поиск по имени, email, телефону"
                  placeholder="Имя, email, телефон"
                  value={search}
                  onChange={(e) => {
                    setSearch(e.target.value)
                    setOffset(0)
                  }}
                />
                <Choice
                  label="Статус"
                  value={status}
                  onChange={(v) => {
                    setStatus(v)
                    setOffset(0)
                  }}
                  options={['all', 'open', 'closed'].map((v, i) => [v, ['Все', 'Открытые', 'Закрытые'][i]])}
                />
                <Choice
                  label="Локаль"
                  value={locale}
                  onChange={(v) => {
                    setLocale(v)
                    setOffset(0)
                  }}
                  options={['all', 'sr', 'en'].map((v) => [v, v.toUpperCase()])}
                />
              </div>
              <div className="chat-table">
                <Table>
                  <Table.Header>
                    <Table.Row>
                      {['Обращение', 'Покупатель', 'Контакты', 'Язык', 'Статус'].map((h) => (
                        <Table.HeaderCell key={h}>{h}</Table.HeaderCell>
                      ))}
                    </Table.Row>
                  </Table.Header>
                  <Table.Body>
                    {list.map((c) => (
                      <Table.Row key={c.id}>
                        <Table.Cell>
                          <Button variant="transparent" onClick={() => void run(() => openDialog(c.id))}>
                            #{c.number}
                          </Button>
                        </Table.Cell>
                        <Table.Cell>{c.profile.name}</Table.Cell>
                        <Table.Cell>
                          {c.profile.email}
                          <br />
                          {c.profile.phone}
                        </Table.Cell>
                        <Table.Cell>{c.locale.toUpperCase()}</Table.Cell>
                        <Table.Cell>
                          <Badge>{c.status}</Badge>
                        </Table.Cell>
                      </Table.Row>
                    ))}
                  </Table.Body>
                </Table>
              </div>
              {!list.length && <Text>Диалогов не найдено</Text>}
              <div className="chat-actions">
                <Button variant="secondary" disabled={!offset} onClick={() => setOffset((n) => Math.max(0, n - 30))}>
                  Назад
                </Button>
                <Text>
                  {offset + list.length} / {count}
                </Text>
                <Button variant="secondary" disabled={offset + 30 >= count} onClick={() => setOffset((n) => n + 30)}>
                  Далее
                </Button>
              </div>
            </section>
          )}
          {role === 'manager' && (
            <div hidden={!managerTabs.includes(tab) || tab === 'operators'}>
              <Settings tab={tab} />
            </div>
          )}
          {tab === 'operators' && (
            <section className="chat-section">
              <Button
                onClick={() =>
                  setOp({ name: '', userId: null, telegramId: null, role: 'operator', enabled: true, available: false })
                }
              >
                Добавить оператора
              </Button>
              <div className="chat-table">
                <Table>
                  <Table.Header>
                    <Table.Row>
                      {['Имя', 'Medusa User ID', 'Telegram ID', 'Роль', 'Состояние', ''].map((h, i) => (
                        <Table.HeaderCell key={i}>{h}</Table.HeaderCell>
                      ))}
                    </Table.Row>
                  </Table.Header>
                  <Table.Body>
                    {operators.map((o) => (
                      <Table.Row key={o.id}>
                        <Table.Cell>{o.name}</Table.Cell>
                        <Table.Cell>{o.user_id}</Table.Cell>
                        <Table.Cell>{o.telegram_id}</Table.Cell>
                        <Table.Cell>{o.role}</Table.Cell>
                        <Table.Cell>{!o.enabled ? 'Отключён' : o.available ? 'Доступен' : 'Недоступен'}</Table.Cell>
                        <Table.Cell>
                          <Button
                            variant="secondary"
                            onClick={() =>
                              setOp({
                                id: o.id,
                                name: o.name,
                                userId: o.user_id,
                                telegramId: o.telegram_id,
                                role: o.role,
                                enabled: o.enabled,
                                available: o.available,
                              })
                            }
                          >
                            Изменить
                          </Button>
                        </Table.Cell>
                      </Table.Row>
                    ))}
                  </Table.Body>
                </Table>
              </div>
            </section>
          )}
          {tab === 'history' && (
            <section className="chat-section">
              <Text>История событий, доставки и ошибок. Тексты сообщений и секреты в журнал не записываются.</Text>
              <div className="chat-table">
                <Table>
                  <Table.Header>
                    <Table.Row>
                      {['Время', 'Событие', 'Код', 'Диалог'].map((v) => (
                        <Table.HeaderCell key={v}>{v}</Table.HeaderCell>
                      ))}
                    </Table.Row>
                  </Table.Header>
                  <Table.Body>
                    {events.map((e) => (
                      <Table.Row key={e.id}>
                        <Table.Cell>{new Date(e.created_at).toLocaleString()}</Table.Cell>
                        <Table.Cell>{e.kind}</Table.Cell>
                        <Table.Cell>{e.code || '—'}</Table.Cell>
                        <Table.Cell>
                          {e.conversation_id ? (
                            <Button variant="transparent" onClick={() => void run(() => openDialog(e.conversation_id))}>
                              Открыть
                            </Button>
                          ) : (
                            '—'
                          )}
                        </Table.Cell>
                      </Table.Row>
                    ))}
                  </Table.Body>
                </Table>
              </div>
              <div className="chat-actions">
                <Button
                  variant="secondary"
                  disabled={!eventOffset}
                  onClick={() => setEventOffset((n) => Math.max(0, n - 100))}
                >
                  Назад
                </Button>
                <Button
                  variant="secondary"
                  disabled={events.length < 100}
                  onClick={() => setEventOffset((n) => n + 100)}
                >
                  Далее
                </Button>
              </div>
            </section>
          )}
        </>
      )}
      <Drawer
        open={Boolean(dialog)}
        onOpenChange={(v) => {
          if (!v) {
            generation.current++
            setDialog(null)
          }
        }}
      >
        <Drawer.Content>
          <Drawer.Header>
            <Drawer.Title>Диалог #{dialog?.conversation.number}</Drawer.Title>
          </Drawer.Header>
          <Drawer.Body className="chat-drawer">
            {dialog && (
              <>
                <Text>{dialog.conversation.profile.name}</Text>
                <Text>
                  {dialog.conversation.profile.email} {dialog.conversation.profile.phone}
                </Text>
                {dialog.conversation.customer_id ? (
                  <a className="text-ui-fg-interactive" href={'/app/customers/' + dialog.conversation.customer_id}>
                    Профиль покупателя
                  </a>
                ) : (
                  <Text>Гостевое обращение</Text>
                )}
                {dialog.conversation.context && (
                  <a
                    className="text-ui-fg-interactive"
                    href={dialog.conversation.context.url}
                    target="_blank"
                    rel="noreferrer"
                  >
                    {dialog.conversation.context.title} · {dialog.conversation.context.variantTitle} ·{' '}
                    {dialog.conversation.context.size}
                  </a>
                )}
                <div className="chat-actions">
                  <Button
                    variant="secondary"
                    disabled={busy}
                    onClick={() => void run(() => openDialog(dialog.conversation.id))}
                  >
                    Обновить переписку
                  </Button>
                  {canReply && (
                    <>
                      <Button
                        variant="secondary"
                        disabled={busy}
                        onClick={() =>
                          void run(() =>
                            action('status', { status: dialog.conversation.status === 'open' ? 'closed' : 'open' }),
                          )
                        }
                      >
                        {dialog.conversation.status === 'open' ? 'Закрыть' : 'Открыть снова'}
                      </Button>
                      <Button variant="secondary" disabled={busy} onClick={() => void run(() => action('retry'))}>
                        Повторить доставку ошибок
                      </Button>
                    </>
                  )}
                  {role === 'manager' && (
                    <Button
                      variant="danger"
                      disabled={busy}
                      onClick={() =>
                        void run(async () => {
                          if (
                            await prompt({
                              title: 'Удалить историю?',
                              description: 'Удаление из TAMIR необратимо. Копии в Telegram удаляются отдельно.',
                              confirmText: 'Удалить',
                              cancelText: 'Отмена',
                              variant: 'danger',
                            })
                          )
                            await action('delete')
                        })
                      }
                    >
                      Удалить
                    </Button>
                  )}
                </div>
                {older && (
                  <Button
                    variant="secondary"
                    disabled={busy}
                    onClick={() =>
                      void run(async () => {
                        const id = dialog.conversation.id,
                          r = await request('dialog?id=' + id + '&before=' + dialog.messages[0]?.seq)
                        setDialog((d: any) =>
                          d?.conversation.id === id ? { ...d, messages: [...r.messages, ...d.messages] } : d,
                        )
                        setOlder(r.messages.length === 100)
                      })
                    }
                  >
                    Ранее
                  </Button>
                )}
                {dialog.messages.map((m: any) => (
                  <article key={m.id} className="chat-message">
                    <Text size="small">
                      {m.sender} · {m.status} · {new Date(m.created_at).toLocaleString()}
                    </Text>
                    <Label>Оригинал ({m.source_language || '…'})</Label>
                    <p>{m.original}</p>
                    {m.has_image && (
                      <a href={`/admin/tamir-chat/image?id=${dialog.conversation.id}&image=${m.id}`} target="_blank" rel="noreferrer">
                        <img src={`/admin/tamir-chat/image?id=${dialog.conversation.id}&image=${m.id}`} alt="Изображение покупателя" loading="lazy" style={{ maxWidth: '100%', maxHeight: 280, borderRadius: 8 }} />
                      </a>
                    )}
                    {m.translated && (
                      <>
                        <Label>Перевод ({m.target_language})</Label>
                        <p>{m.translated}</p>
                      </>
                    )}
                  </article>
                ))}
                {canReply && dialog.conversation.status === 'open' && (
                  <form
                    onSubmit={(e) => {
                      e.preventDefault()
                      void run(async () => {
                        if (!pending.current || pending.current.text !== reply)
                          pending.current = { text: reply, id: crypto.randomUUID() }
                        await action('reply', { text: reply, clientId: pending.current.id })
                        pending.current = null
                        setReply('')
                      })
                    }}
                  >
                    <Label>Ответ оператора</Label>
                    <Textarea maxLength={1500} value={reply} onChange={(e) => setReply(e.target.value)} />
                    <Button disabled={busy || !reply.trim()} type="submit">
                      Отправить
                    </Button>
                  </form>
                )}
                {error && <Alert variant="error">{error}</Alert>}
              </>
            )}
          </Drawer.Body>
        </Drawer.Content>
      </Drawer>
      <Drawer
        open={Boolean(op)}
        onOpenChange={(v) => {
          if (!v) setOp(null)
        }}
      >
        <Drawer.Content>
          <Drawer.Header>
            <Drawer.Title>Оператор</Drawer.Title>
          </Drawer.Header>
          <Drawer.Body className="chat-drawer">
            {op && (
              <form
                className="chat-section"
                onSubmit={(e) => {
                  e.preventDefault()
                  void run(async () => {
                    await request('operators', op)
                    setOp(null)
                    await load()
                  })
                }}
              >
                <label>
                  <Label>Имя</Label>
                  <Input
                    required
                    minLength={2}
                    maxLength={100}
                    value={op.name}
                    onChange={(e) => setOp({ ...op, name: e.target.value })}
                  />
                </label>
                <label>
                  <Label>Medusa User ID</Label>
                  <Input value={op.userId || ''} onChange={(e) => setOp({ ...op, userId: e.target.value || null })} />
                </label>
                <label>
                  <Label>Telegram User ID</Label>
                  <Input
                    value={op.telegramId || ''}
                    onChange={(e) => setOp({ ...op, telegramId: e.target.value || null })}
                  />
                </label>
                <Choice
                  label="Права"
                  value={op.role}
                  options={[
                    ['viewer', 'Просмотр'],
                    ['operator', 'Оператор'],
                    ['manager', 'Управление настройками'],
                  ]}
                  onChange={(v) => setOp({ ...op, role: v as Operator['role'] })}
                />
                <Toggle label="Включён" value={op.enabled} onChange={(enabled) => setOp({ ...op, enabled })} />
                <Toggle
                  label="Доступен для поддержки"
                  value={op.available}
                  onChange={(available) => setOp({ ...op, available })}
                />
                <Text size="small">
                  Telegram ID разрешает ответы бота. Для доступа к админке привяжите существующий Medusa User ID. Статус
                  задаётся вручную.
                </Text>
                {error && <Alert variant="error">{error}</Alert>}
                <Button type="submit" disabled={busy}>
                  Сохранить оператора
                </Button>
              </form>
            )}
          </Drawer.Body>
        </Drawer.Content>
      </Drawer>
    </Container>
  )
}
export const config = defineRouteConfig({ label: 'TAMIR Chat', icon: ChatBubbleLeftRight })
