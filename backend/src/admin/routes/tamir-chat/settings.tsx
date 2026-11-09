import { Alert, Button, Heading, Input, Label, Select, Switch, Text, Textarea, usePrompt } from '@medusajs/ui'
import { useEffect, useRef, useState } from 'react'
import { type ChatConfig, templateNames } from '../../../shared/chat-config'
export async function request<T = any>(action: string, body?: unknown): Promise<T> {
  const r = await fetch('/admin/tamir-chat/' + action, {
    method: body === undefined ? 'GET' : 'POST',
    credentials: 'include',
    cache: 'no-store',
    headers: { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  const data = await r.json()
  if (!r.ok) throw Error(data.code || 'CHAT_UNAVAILABLE')
  return data
}
export function Toggle({
  label,
  value,
  onChange,
}: {
  label: string
  value: boolean
  onChange: (value: boolean) => void
}) {
  return (
    <label className="chat-toggle">
      <Text>{label}</Text>
      <Switch checked={value} onCheckedChange={onChange} />
    </label>
  )
}
export function Choice({
  label,
  value,
  onChange,
  options,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  options: [string, string][]
}) {
  return (
    <div className="chat-field">
      <Label>{label}</Label>
      <Select value={value} onValueChange={onChange}>
        <Select.Trigger aria-label={label}>
          <Select.Value />
        </Select.Trigger>
        <Select.Content>
          {options.map(([v, label]) => (
            <Select.Item key={v} value={v}>
              {label}
            </Select.Item>
          ))}
        </Select.Content>
      </Select>
    </div>
  )
}
function Pair({
  label,
  value,
  onChange,
  max = 1000,
}: {
  label: string
  value: { sr: string; en: string }
  onChange: (v: { sr: string; en: string }) => void
  max?: number
}) {
  return (
    <fieldset className="chat-pair">
      <legend>
        <Label>{label}</Label>
      </legend>
      {(['sr', 'en'] as const).map((l) => (
        <label key={l}>
          <Text size="small">{l.toUpperCase()}</Text>
          <Textarea
            aria-label={label + ' ' + l.toUpperCase()}
            maxLength={max}
            value={value[l]}
            onChange={(e) => onChange({ ...value, [l]: e.target.value })}
          />
        </label>
      ))}
    </fieldset>
  )
}
type State = {
  config: ChatConfig
  revision: number
  secrets: string[]
  connections: { service: string; state: string; details: Record<string, unknown>; checked_at: string }[]
  googleEnvironmentConfigured: boolean
}
export function Settings({ tab }: { tab: string }) {
  const [state, setState] = useState<State | null>(null),
    [draft, setDraft] = useState<ChatConfig | null>(null),
    [error, setError] = useState(''),
    [success, setSuccess] = useState(''),
    [busy, setBusy] = useState(false),
    [token, setToken] = useState(''),
    [google, setGoogle] = useState(''),
    [phrase, setPhrase] = useState('Zdravo!'),
    [target, setTarget] = useState('ru'),
    [result, setResult] = useState<any>(null),
    [preview, setPreview] = useState<'sr' | 'en'>('sr')
  const lock = useRef(false),
    prompt = usePrompt()
  const load = async () => {
    const s = await request<State>('settings')
    setState(s)
    setDraft(s.config)
  }
  useEffect(() => {
    void load().catch((e) => setError(e.message))
  }, [])
  useEffect(() => {
    setError('')
    setSuccess('')
    setResult(null)
  }, [tab])
  const dirty = Boolean(state && draft && JSON.stringify(draft) !== JSON.stringify(state.config))
  useEffect(() => {
    if (!dirty) return
    const warn = (e: BeforeUnloadEvent) => {
      e.preventDefault()
      e.returnValue = ''
    }
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [dirty])
  const run = async (fn: () => Promise<void>) => {
    if (lock.current) return
    lock.current = true
    setBusy(true)
    setError('')
    setSuccess('')
    try {
      await fn()
      setSuccess('Сохранено / выполнено успешно')
    } catch (e) {
      setError((e as Error).message)
    } finally {
      lock.current = false
      setBusy(false)
    }
  }
  const refreshConnection = async () => {
    const s = await request<State>('settings')
    setState((old) =>
      old
        ? {
            ...old,
            secrets: s.secrets,
            connections: s.connections,
            googleEnvironmentConfigured: s.googleEnvironmentConfigured,
          }
        : s,
    )
  }
  if (!draft || !state)
    return (
      <>
        {error ? <Alert variant="error">{error}</Alert> : <Text>Загрузка…</Text>}
        <Button variant="secondary" onClick={() => void load().catch((e) => setError(e.message))}>
          Повторить
        </Button>
      </>
    )
  const patch = (v: Partial<ChatConfig>) => setDraft({ ...draft, ...v })
  const provider = async (action: string, body?: unknown) => {
    try {
      setResult(await request(action, body ?? {}))
    } finally {
      await refreshConnection()
    }
  }
  return (
    <div className="chat-settings">
      {error && <Alert variant="error">{error}</Alert>}
      {success && <Alert variant="success">{success}</Alert>}
      <div className="chat-actions">
        <Button
          disabled={busy || !dirty}
          isLoading={busy}
          onClick={() =>
            void run(async () => {
              const s = await request('settings', { config: draft, revision: state.revision })
              setState({ ...state, ...s })
              setDraft(s.config)
            })
          }
        >
          Сохранить настройки
        </Button>
        <Button
          variant="secondary"
          disabled={busy}
          onClick={() =>
            void run(async () => {
              if (
                !dirty ||
                (await prompt({
                  title: 'Отменить изменения?',
                  description: 'Будут загружены сохранённые настройки.',
                  confirmText: 'Загрузить',
                  cancelText: 'Продолжить редактирование',
                }))
              )
                await load()
            })
          }
        >
          Загрузить сохранённые
        </Button>
        {dirty && <Text size="small">Есть несохранённые изменения</Text>}
      </div>
      <div hidden={tab !== 'widget'} className="chat-section">
        <Heading level="h2">Настройки чата</Heading>
        <Toggle label="Включить чат на сайте" value={draft.enabled} onChange={(enabled) => patch({ enabled })} />
        <Pair label="Заголовок" value={draft.title} max={120} onChange={(title) => patch({ title })} />
        <Pair label="Кнопка открытия" value={draft.button} max={120} onChange={(button) => patch({ button })} />
        <Choice
          label="Положение"
          value={draft.position}
          options={[
            ['right', 'Справа'],
            ['left', 'Слева'],
          ]}
          onChange={(v) => patch({ position: v as 'left' | 'right' })}
        />
        <Toggle
          label="Показывать статус поддержки"
          value={draft.showStatus}
          onChange={(showStatus) => patch({ showStatus })}
        />
        <Toggle label="Разрешить гостевые обращения" value={draft.guests} onChange={(guests) => patch({ guests })} />
        <Toggle
          label="Передавать контекст товара"
          value={draft.productContext}
          onChange={(productContext) => patch({ productContext })}
        />
        <Toggle
          label="Счётчик новых сообщений"
          value={draft.notifications}
          onChange={(notifications) => patch({ notifications })}
        />
        <label className="chat-field">
          <Label>Хранение неактивной истории, дней (7–730)</Label>
          <Input
            type="number"
            min={7}
            max={730}
            value={draft.retentionDays}
            onChange={(e) => patch({ retentionDays: Number(e.target.value) })}
          />
        </label>
        <Text size="small">
          Приветствие и сообщение об отсутствии операторов редактируются во вкладке «Автоматические сообщения».
          Доступность задаётся у операторов.
        </Text>
        <Choice
          label="Язык предпросмотра"
          value={preview}
          options={[
            ['sr', 'SR'],
            ['en', 'EN'],
          ]}
          onChange={(v) => setPreview(v as 'sr' | 'en')}
        />
        <div className="chat-widget-preview" aria-label="Предпросмотр виджета">
          <strong>{draft.title[preview]}</strong>
          {draft.templates.welcome.enabled && <p>{draft.templates.welcome.text[preview]}</p>}
          {draft.templates.offline.enabled && <p>{draft.templates.offline.text[preview]}</p>}
          <span>{draft.button[preview]}</span>
        </div>
      </div>
      <div hidden={tab !== 'telegram'} className="chat-section">
        <Heading level="h2">Telegram</Heading>
        <Text size="small">
          Сначала сохраните токен и настройки группы, затем проверьте соединение и установите webhook.
        </Text>
        <Toggle
          label="Включить Telegram"
          value={draft.telegram.enabled}
          onChange={(enabled) => patch({ telegram: { ...draft.telegram, enabled } })}
        />
        <label className="chat-field">
          <Label>Chat ID приватной группы поддержки</Label>
          <Input
            value={draft.telegram.chatId}
            onChange={(e) => patch({ telegram: { ...draft.telegram, chatId: e.target.value } })}
            placeholder="-100…"
          />
        </label>
        <Toggle
          label="Отдельная тема для каждого диалога"
          value={draft.telegram.topics}
          onChange={(topics) => patch({ telegram: { ...draft.telegram, topics } })}
        />
        {(['notifyNew', 'notifyMessages', 'notifyErrors'] as const).map((key, i) => (
          <Toggle
            key={key}
            label={['Уведомления о новых обращениях', 'Уведомления о сообщениях', 'Уведомления об ошибках'][i]}
            value={draft.telegram[key]}
            onChange={(v) => patch({ telegram: { ...draft.telegram, [key]: v } })}
          />
        ))}
        <label className="chat-field">
          <Label>Bot Token {state.secrets.includes('telegram') ? '(•••••••• сохранён)' : '(не задан)'}</Label>
          <Input type="password" autoComplete="new-password" value={token} onChange={(e) => setToken(e.target.value)} />
        </label>
        <Button
          variant="secondary"
          disabled={busy || !token}
          onClick={() =>
            void run(async () => {
              setResult(await request('secrets', { kind: 'telegram', value: token }))
              setToken('')
              await refreshConnection()
            })
          }
        >
          Сохранить / заменить токен
        </Button>
        <div className="chat-actions">
          {[
            ['telegram-check', 'Проверить соединение'],
            ['telegram-test', 'Тестовое сообщение'],
            ['telegram-webhook', 'Установить webhook'],
          ].map(([action, label]) => (
            <Button
              key={action}
              variant="secondary"
              disabled={busy || dirty}
              onClick={() => void run(() => provider(action))}
            >
              {label}
            </Button>
          ))}
        </div>
        <Text size="small">
          После замены токена приложение проверяет Telegram и устанавливает webhook автоматически. Если в ответе
          есть ошибка — исправьте токен или настройки группы и нажмите «Установить webhook» вручную. При смене Chat ID
          или режима тем привязки диалогов к темам сбрасываются, темы создаются заново.
        </Text>
      </div>
      <div hidden={tab !== 'templates'} className="chat-section">
        <Heading level="h2">Автоматические сообщения</Heading>
        {templateNames.map((key, i) => (
          <section className="chat-template" key={key}>
            <Toggle
              label={
                [
                  'Приветствие',
                  'Оператор недоступен',
                  'Индикатор доставки — две галочки',
                  'Ошибка доставки',
                  'Возвращение посетителя',
                  'Закрытие диалога',
                  'Возобновление диалога',
                ][i]
              }
              value={draft.templates[key].enabled}
              onChange={(enabled) =>
                patch({ templates: { ...draft.templates, [key]: { ...draft.templates[key], enabled } } })
              }
            />
            {key === 'sent' ? (
              <Text size="small">Две маленькие галочки тёмной фуксии рядом со временем вашего сообщения после доставки в Telegram. Это не отметка о прочтении. Текстовое подтверждение в переписке не показывается.</Text>
            ) : <>
            <Pair
              label={key}
              value={draft.templates[key].text}
              onChange={(text) =>
                patch({ templates: { ...draft.templates, [key]: { ...draft.templates[key], text } } })
              }
            />
            <Text size="small">Предпросмотр SR: {draft.templates[key].text.sr}</Text>
            <Text size="small">Предпросмотр EN: {draft.templates[key].text.en}</Text>
            </>}

          </section>
        ))}
      </div>
      <div hidden={tab !== 'translation'} className="chat-section">
        <Heading level="h2">Переводы</Heading>
        <Text>Google Cloud Project: tamir-493911</Text>
        <Toggle
          label="Автоматический перевод"
          value={draft.translation.enabled}
          onChange={(enabled) => patch({ translation: { ...draft.translation, enabled } })}
        />
        <Choice
          label="Язык оператора"
          value={draft.translation.operatorLanguage}
          options={[
            ['ru', 'Русский'],
            ['sr', 'Сербский'],
            ['en', 'Английский'],
          ]}
          onChange={(v) => patch({ translation: { ...draft.translation, operatorLanguage: v as 'ru' | 'sr' | 'en' } })}
        />
        {(['sr', 'en'] as const).map((l) => (
          <Toggle
            key={l}
            label={'Обслуживать ' + l.toUpperCase()}
            value={draft.translation.locales.includes(l)}
            onChange={(v) =>
              patch({
                translation: {
                  ...draft.translation,
                  locales: v ? [...draft.translation.locales, l] : draft.translation.locales.filter((x) => x !== l),
                },
              })
            }
          />
        ))}
        <Text size="small">
          {state.secrets.includes('google')
            ? 'Ключ сохранён на сервере'
            : state.googleEnvironmentConfigured
              ? 'Используется существующий серверный ключ'
              : 'Ключ не настроен'}
          . Credentials не отображаются.
        </Text>
        <label className="chat-field">
          <Label>Новый Google Translation API key</Label>
          <Input
            type="password"
            autoComplete="new-password"
            value={google}
            onChange={(e) => setGoogle(e.target.value)}
          />
        </label>
        <Button
          variant="secondary"
          disabled={busy || !google}
          onClick={() =>
            void run(async () => {
              await request('secrets', { kind: 'google', value: google })
              setGoogle('')
              await refreshConnection()
            })
          }
        >
          Сохранить ключ
        </Button>
        <label className="chat-field">
          <Label>Тестовая фраза</Label>
          <Textarea maxLength={500} value={phrase} onChange={(e) => setPhrase(e.target.value)} />
        </label>
        <Choice
          label="Перевести на"
          value={target}
          onChange={setTarget}
          options={[
            ['ru', 'RU'],
            ['sr', 'SR'],
            ['en', 'EN'],
          ]}
        />
        <Button
          variant="secondary"
          disabled={busy || !phrase.trim()}
          onClick={() => void run(() => provider('translation-test', { text: phrase, target }))}
        >
          Проверить API / перевести
        </Button>
      </div>
      {(tab === 'telegram' || tab === 'translation') && (
        <section className="chat-section">
          <Heading level="h3">Состояние подключения</Heading>
          {state.connections
            .filter((c) => c.service === (tab === 'telegram' ? 'telegram' : 'google'))
            .map((c) => (
              <div key={c.service}>
                <Text>
                  {c.state} · {new Date(c.checked_at).toLocaleString()}
                </Text>
                <pre className="chat-result">{JSON.stringify(c.details, null, 2)}</pre>
              </div>
            ))}
          {!state.connections.some((c) => c.service === (tab === 'telegram' ? 'telegram' : 'google')) && (
            <Text>Соединение ещё не проверено</Text>
          )}
          {result && <pre className="chat-result">{JSON.stringify(result, null, 2)}</pre>}
        </section>
      )}
    </div>
  )
}
