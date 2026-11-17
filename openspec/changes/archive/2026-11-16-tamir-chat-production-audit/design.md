# Design

## Context

Мотивация — в `proposal.md`. Здесь — фактическое текущее устройство TAMIR Chat, подтверждённое чтением кода (источник истины для аудита — код, документы вторичны).

Базовая линия аудита (2026-11-16): релиз стенда `test.tamir.rs`/`test-api.tamir.rs` = **`origin/main` = `218d8fb`** (merge PR #117; в него уже входят чат‑тики доставки PR #114 `70b8d95`). Локальный `main` (`1f9de9a`) — предок origin/main, все сверки кода вести по `git show 218d8fb:<путь>`. Схема БД стенда подтверждена прямым запросом `information_schema`: ровно 13 таблиц `tamir_chat_*` — идентично DDL `schema.ts` (settings, secret, operator, guest, conversation, message, image, outbox, telegram_ref, update, event, connection, rate); отдельных таблиц product_context/template/delivery_event нет — контекст в `conversation.context`, шаблоны в `settings.config->templates`, дедуп в `update`.

### Architecture and message flow (code confirms)

1. **Storefront**: `frontend/src/components/chat/ChatWidget.tsx` + `chat-client.ts` → same-origin BFF `frontend/src/app/api/chat/[...path]/route.ts` (allowlist действий, проверка `Origin` по публичным хостам, лимиты тела 7 MiB / 8 KiB → 413 `PAYLOAD_TOO_LARGE`, httpOnly-cookie `tb_chat_guest` 30 дней, 503 `CHAT_UNAVAILABLE` при недоступности Medusa).
2. **Store API Medusa**: `backend/src/api/store/chat/[action]/route.ts` (config, conversations, conversation-stream; session, claim, image-message, messages, reopen, context, delete) и `.../stream/route.ts` (SSE). Идентичность: Medusa customer-auth или заголовок `x-tamir-chat-guest` (`backend/src/utils/chat/http.ts`); rate-limit по действиям (`tamir_chat_rate`).
3. **Данные**: PostgreSQL, таблицы `tamir_chat_*` (`schema.ts`): settings(revision), secret(AES-256-GCM, `CHAT_ENCRYPTION_KEY`), operator, guest(SHA-256 hash; session expiry 90 дней, storefront-cookie 30 дней), conversation (customer XOR guest, profile jsonb, telegram_chat_id+thread), message (seq bigserial, UNIQUE(conversation_id, sender, client_id), статусы pending/delivered/error, translation_state, original+translated), image (нормализованный JPEG ≤2 MiB), outbox (attempts<8), telegram_ref, update (дедуп), event (аудит), connection, rate.
4. **Delivery**: `conversations.ts::appendMessage` атомарно пишет message+image+outbox и дедуплицирует по client UUID; `delivery.ts::deliverOne` — транзакция с `FOR UPDATE SKIP LOCKED`, строгий FIFO внутри диалога, перевод (customer→`operatorLanguage` (ru), operator→locale диалога; `sr` нормализуется в латиницу), `sendMessage` чанками ≤3800 симв. + `sendPhoto`, `telegram_ref` на каждый чанк, статус `delivered`; при ошибке: `attempts+1`, backoff `min(1ч, 5с·2^attempts)`, статус `error`, разовое оповещение в группу (notifyErrors). Job `jobs/tamir-chat.ts` каждые 10 с (concurrency forbid) + немедленный `kickChat`; там же `pruneChat` по `retentionDays` (7–730, по умолчанию 90).
5. **Входящие из Telegram**: webhook `POST /hooks/tamir-chat` — сверка `X-Telegram-Bot-Api-Secret-Token` (timing-safe), игнор ботов/каналов/репостов/чужих чатов, дедуп по `<bot_id>:<update_id>`, автор должен быть включённым operator/manager по `telegram_id`; маршрутизация: топики — по `message_thread_id`, без топиков — по reply-ссылке на `telegram_ref`; закрытые диалоги игнорируются; ответ оператора проходит тот же outbox и **виден клиенту только после `delivered`** (перевод не показывается до подтверждения).
6. **Realtime клиенту**: SSE `/store/chat/stream` — поллинг `streamOwn` каждые 2 с, числовой курсор по `seq`, поддержка `Last-Event-ID`, жизненный цикл ~20 с с `retry: 1500`, события `disabled`/`expired`; при реплее последних ~100 строк обновляются статусы уже известных сообщений (мердж по id в `chat-client.ts`).
7. **Admin**: страницы `src/admin/routes/tamir-chat/*` ↔ `backend/src/api/admin/tamir-chat/[action]/route.ts`: access, settings(revision-conflict 409 `CHAT_SETTINGS_CHANGED`), secrets (write-only; при смене токена бота — ротация webhook-секрета и переустановка вебхука без отката секрета), telegram-check/webhook/test, translation-test, operators, conversations/dialog/overview/history, status/seen/reply/retry/delete. Роли viewer<operator<manager проверяются на сервере; bootstrap-emejлы `CHAT_ADMIN_EMAILS`/`BANNER_ADMIN_EMAILS`.
8. **Изображения**: `images.ts` — вход base64 ≤5 MiB и ≤20 Мп (`limitInputPixels`), только статичные JPEG/PNG/WebP (APNG отсекается по `acTL`), соотношение сторон ≤20:1, перекодировка в JPEG ≤1600 px, q85, ≤2 MiB (иначе 400/413); лимит 50 изображений на диалог (409 `CHAT_IMAGE_LIMIT`); отдача приватно (`private, no-store`, owner-check).
9. **Ограничения ввода**: текст 1–1500 символов без control-символов (`shared/chat-config.ts`); гость: имя 2–100 обязательно, email ≤254 и телефон опциональны; `clientId` — UUID.

### Documentation and test state

- `docs/TAMIR-CHAT.md` существует и, по предварительной сверке, частично отстаёт от кода (драйф — предмет этапа аудита).
- Тесты чата уже существуют и покрывают значительную часть поведения: `backend/tests/tamir-chat.test.cjs` (unit: валидация guest/сообщения, safe defaults, канонический chat id, шифрование секретов, стойкость webhook-сравнения и guest-токенов, сокрытие оригинала при недоступном переводе, безопасные тексты ошибок), `backend/tests/tamir-chat-http-errors.test.cjs` (413 и обработка ошибок), `backend/tests/tamir-chat-images.test.cjs` (кодек/политика изображений), `backend/tests/tamir-chat.integration.cjs` (16 SQL-сценариев: персистентность, идемпотентность, ретраи перевода и Telegram, webhook, retention-каскады, роли и rate limit, SSE-replay, вложения), `frontend/tests/tamir-chat.test.mjs` (BFF: bearer/cookie, origins, SSE cursor, claim; composer Enter/Shift+Enter/IME; словарь по локалям; выбор файла), `backend/integration-tests/http/tamir-chat.spec.ts` (изоляция аккаунтов/claimed guests, защита admin-секретов). Правила и маски зон — `docs/TESTING-RULES.md`, реестр — `docs/02_EXISTING_TESTS_AUDIT.md`. Playwright/vitest в этом репозитории не используются; внешний e2e живёт в отдельном репозитории Tamir-QA-Automation.

### Stage 1–2 audit results (2026-11-16, `test.tamir.rs` stand)

Раздел «Архитектура» выше подтверждён live‑пробами на релизе `218d8fb`: сквозной цикл клиент→Telegram за 25 с (seq 52, tg_msg 59 в топике 58 группы `-1003977063535`), ответы оператора в трёх диалогах (ru→en, ru→sr, en→sr), идемпотентность по `client_id` (повтор = тот же id), SSE `retry: 1500` + replay по `Last-Event-ID`, rate limit 40/мин (`429 CHAT_RATE_LIMIT`, ключ `chat-context`), дедуп update_id (23 ключа), connections google/telegram ok, журнал проб — в `tasks.md` §3.

Подтверждённые расхождения ожиданий плана с фактом (правки только в доки/спеку, не в код):

1. Галочки = доставка, не прочтение (см. Open Questions) — устарел Development‑план §1.6/§2.2.
2. Коды ошибок API: `INVALID_LOCALE`, `INVALID_PRODUCT_CONTEXT` (в т.ч. для draft‑товара), `INVALID_MESSAGE`, `GUEST_SESSION_EXPIRED`/`LOGIN_REQUIRED`, `CHAT_RATE_LIMIT`; мёртвый guest‑hash → пустой список / `404 CHAT_NOT_FOUND` (не 401). Ожидаемых планом `CHAT_SESSION_EXPIRED`/`PRODUCT_NOT_FOUND` в коде нет.
3. Нет кэша переводов 24ч, метрик first reply/SLA/стоимости/P95 — feature‑gap плана (§11), не дефект реализации.
4. Провайдеры настраиваются через UI/`tamir_chat_secret`, ENV `TELEGRAM_*`/`GOOGLE_*` на стенде отсутствуют (`googleEnvironmentConfigured:false` при рабочем переводе) — ENV‑таблица плана (§6) не соответствует факту.
5. Пагинация: история 100/стр, список чатов 30 (план: 500/100).
6. `context.url` жёстко `https://tamir.rs/...` — на staging контекст‑ссылки ведут на прод (no env‑domain override).
7. Webhook‑маршрут доступен извне без rate‑лимита (в отличие от `/chat/*`) — наблюдение по безопасности для отчёта.
8. Шум инфраструктуры стенда: периодические `ioredis ECONNRESET` в логах Next‑контейнера, на чат не влияют.

Не проверялось намеренно (деструктивно или требует ручного участия): правки/удаления в Telegram‑группе (F‑05), ответ оператора вручную в теме (1.7.4), фактическая доставка медиа и выгрузка CSV, POST webhook‑ротации, mutation‑действия админки (seen/status/retry/delete).

## Goals / Non-Goals

**Goals:**

- Верифицировать каждый пункт чек-листа TB-21 против кода и прод-конфигурации; статусы ✅ (подтверждено) / ❓ (требует проверки в проде) / ❌ (не соответствует).
- Зафиксировать фактическое поведение в дельте `tamir-chat` (готовится в этом change; синхронизация в main spec — на архивации).
- Зафиксировать текущий UI чата в Figma как базовую линию аудита.
- Построить матрицу покрытия тестами и дописать недостающие тесты по `docs/TESTING-RULES.md`.
- Отчёт о дефектах; исправления — только подтверждённых дефектов, в последнем этапе.

**Non-Goals:**

- Редизайн чата, новые фичи, изменения схемы БД без подтверждённого дефекта.
- Изменение поведения «под спеку» (спека описывает факт; расхождение с продуктовых замыслом — дефект в отчёт).
- Секреты: в любые артефакты и отчёты попадают только имена переменных (`CHAT_ENCRYPTION_KEY`, `GOOGLE_TRANSLATE_API_KEY`, `MEDUSA_PUBLIC_BACKEND_URL`, `CHAT_ADMIN_EMAILS`) — никогда значения.

## Decisions

1. **Источник истины — код.** Чек-лист сверяется по файлам из раздела Context; документы (`docs/TAMIR-CHAT.md`, Figma, TB-21) — hypothesis, код — факт. Альтернатива (сверять по документации) отклонена: ТЗ прямо требует фактическое поведение.
2. **Дельта = фактическое поведение.** Дефекты не «зашиваются» в спеку как норма и не оправдываются ею: если аудит подтвердит дефект, требование правится в этом же change на этапе исправлений. Альтернатива (специфицировать «как должно быть») отклонена ТЗ.
3. **Заголовки требований — на английском** (идентичаторы для сопоставления MODIFIED в main spec), тело и сценарии — на русском. Альтернатива (полностью русские заголовки) сломала бы сопоставление с существующими требованиями.
4. **Тестовая инфраструктура и существующие чат-наборы не меняются**: новые проверки добавляются в существующие файлы (`frontend/tests/tamir-chat.test.mjs`, `backend/tests/tamir-chat*.test.cjs`, `backend/tests/tamir-chat.integration.cjs`, `backend/integration-tests/http/tamir-chat.spec.ts`) и в зоны из `docs/TESTING-RULES.md` — `frontend/tests/*.test.mjs` (`node --test`), `backend/tests/*.test.cjs` (unit/handler), `backend/tests/*.integration.cjs` (SQL против PostgreSQL через `TEST_REVIEWS_DB_URL`), `backend/integration-tests/http/*.spec.ts` (Jest); новые фреймворки (vitest, playwright) не добавляем — внешнего e2e нет в этом репозитории.
5. **Фиксация Figma = слепок текущего UI** (состояния: кнопка/виджет, гостевая форма, диалог, статусы, мобильная раскладка), без редизайна; ссылки на ноды — в этот файл после этапа фиксации. **Выполнено 2026-11-16**: `https://www.figma.com/design/2u9V1x7faa2yieZqRP0KaF/TAMIR?node-id=302-3754` (фрейм `302:3754`, изображения `301:3754–301:3757`, страница `79:1215` «04 · TAMIR / Responsive v2» — отдельную страницу «TB-21» создать нельзя: файл на тарифе Starter, лимит 3 страницы, в файле уже 4). Запечатлены 4 состояния живого прода (кнопка EN, гостевая форма EN, гостевая форма SR `/rs`, панель 380×710 целиком); интерактивные состояния (статусы доставки, история, мобильный `/chat`, выключенный/недоступный чат) помечены в том же фрейме текстом — их съёмка означала бы отправку реальных сообщений в Telegram-группу TAMIR.

## Risks / Trade-offs

- [Док-драйф: `docs/TAMIR-CHAT.md` расходится с кодом] → этап аудита фиксирует расхождения списком; обновление доков — в этапе «обновление документации», не «на глаз».
- [Фиксация Figma будет воспринята как целевой дизайн] → явная пометка «baseline аудита» + дата снимка.
- [Спека заморозит дефект как норму] → правило: сначала отчёт дефектов, правка требований только вместе с фиксом подтверждённого дефекта.
- [e2e-тесты чата хрупкие (SSE, время, Telegram)] → для Telegram — подмена транспорта (параметр `transport` уже есть в `providers.ts`/`delivery.ts`), детерминированные фикстуры по TESTING-RULES; не гонять реальный Telegram в тестах.
- [Прод-состояние (вебхук, группа, топики) не видно из кода] → проверки через админ-действия `telegram-check` (getWebhookInfo/getChat) на стейдже/проде без записи секретов в отчёт.

## Migration Plan

Кодовых миграций нет. Порядок артефактов: аудит (✅/❓/❌ по чек-листу) → фиксация Figma → сверка дельты-спеки и `docs/TAMIR-CHAT.md` с итогами аудита → матрица тестов → недостающие тесты → отчёт дефектов → фиксы подтверждённых дефектов (PR с тестами). Откат — git revert; спека и доки живут в репозитории.

## Open Questions

- **Google Cloud project `tamir-493911`** — **закрыт 2026-11-16 решением владельца («всё работает»)**: отдельная сверка способа оплаты/квот в GCP не требуется; фактический перевод идёт по API-ключу (`X-Goog-Api-Key`, Translation v2), `projectId` используется только для валидации настроек. На спеку не влияет.
- **«Две серые галочки» (TB-21, issue #842154)** — **закрыт 2026-11-16, транспорт статуса уточнён на этапе 1 аудита**: клиенту показываются **две фуксиевые галочки доставки** (`#842154`, `ChatWidget`), они означают **доставку в Telegram** (статус `delivered`), а не прочтение; «Прочитано» клиенту не отдаётся нигде, `seen_at` — только админский атрибут. Это соответствует shipped‑докам `docs/TAMIR-CHAT.md` (после PR #114) — правятся только устаревшие формулировки Development‑плана (§1.6), поведения и кодовых фиксов нет.
- **Figma** — **закрыт 2026-11-16**: свежего макета чата в Figma нет; владелец поручил создать слепок текущего UI чата по проду (этап фиксации Figma в tasks.md).
- **Удаление отдельного сообщения** — **закрыт 2026-11-16 решением владельца**: штучное удаление сообщений не планируется, каноническое поведение — полное удаление переписки (admin delete). Дельта-спека фиксирует удаление на уровне переписки как ожидаемое; вопрос к продукту снимается.

## Assumptions (recorded instead of asking the user)

- Название change — `tamir-chat-production-audit` (указание родителя, несмотря на иное название в самом TB-21).
- Сценарий «Send from the message composer» в main spec сейчас висит под требованием «Honest status and retention» — в дельте он сохранён под этим же требованием (MODIFIED-блок заменяет требование целиком, все существующие сценарии перенесены в переводной версии, новые расширяют блок).
- Прод‑инстанс = tamir.rs; **все live‑проверки аудита выполняются только на staging‑стенде** (`test.tamir.rs` / `test-api.tamir.rs`, БД `tamir_staging`, Telegram‑группа стенда) — решение владельца; боевой прод для проб не используется, наблюдения на проде только визуальные после выкатки.
