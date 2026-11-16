# Задачи: тамир‑чат — production audit

> Все проверки — только на staging‑стенде `test.tamir.rs` (фронт `test.tamir.rs`, бэкенд `test-api.tamir.rs`, контейнеры `tamir-staging-*`, БД `tamir_staging`). **Никаких изменений в проде**; боевые хосты не используются.
> Live‑код стенда = `origin/main` (`218d8fb`); локальный `main` (`1f9de9a`) отстает. Фронтенд‑проверки (§2) сверять через `git show origin/main:<путь>`.
> Вердикты: ✅ соответствует / GAP = ожидаемое описание расходится с реализацией (правим ожидания/доки) / ❓ не проверено.
> **Статус этапа 1–2 (2026-11-16): code‑инвентаризация (4 параллельных агента), БД‑аудит staging и live‑пробы F‑01…F‑13 + admin‑пробы A‑01…A‑10 выполнены.** Деструктивные/интерактивные пробы (F‑05, ответ оператора в Telegram, медиа, CSV‑файл, webhook‑POST, admin‑мутации) и прогоны тестов §5.1–5.4 **верифицированы пользователем вручную 2026‑11‑16: «всё работает согласно реализации»**.

## 0. Инвентаризация кода и данных

- [x] 0.1 Перечислить файлы тамир‑чата. **13 таблиц `tamir_chat_*`** — сверено дважды (DDL `218d8fb:schema.ts` и прямой запрос `information_schema` на staging, список идентичен): settings, secret, operator, guest, conversation, message, image, outbox, telegram_ref, update, event, connection, rate. Отдельных таблиц product_context/template/delivery_event **нет** — контекст в `conversation.context` (jsonb), шаблоны в `settings.config->templates` (jsonb), дедуп обновлений в `update(key)`. API: `backend/src/api/store/chat/[action]/route.ts`, `backend/src/api/store/chat/stream/route.ts` (SSE), `backend/src/api/admin/tamir-chat/[action]/route.ts`, `backend/src/api/hooks/tamir-chat/route.ts` (webhook), job `backend/src/jobs/tamir-chat.ts` (`tamir-chat-delivery`, интервал 10 с), утилиты `utils/chat/*.ts`, `shared/chat-config.ts`. Фронт (origin/main): `frontend/src/components/chat/*`, `app/api/chat/[...path]/route.ts` (BFF), `app/layout.tsx`.
- [x] 0.2 Конфиг: настройки чата — один ряд `tamir_chat_settings` (config jsonb + revision); в staging‑конфиге telegram chatId `-1003977063535`, topics+notifications = true. Секреты провайдеров — в `tamir_chat_secret` (AES‑256‑GCM, `CHAT_ENCRYPTION_KEY`). **ENV‑переменных `TELEGRAM_*`/`GOOGLE_*` в staging env нет** — провайдеры настраиваются через admin‑настройки (`connections` → google=ok, telegram=ok). 🔴 Пересмотреть §6 плана: ENV‑таблица плана не соответствует факту.
- [x] 0.3 БД staging: все 13 таблиц из `schema.ts` присутствуют (information_schema‑запрос чистый прогон); колонок `retry_count`/`delivery_error_code`/`translation_cache` **нет** — вместо них `tamir_chat_outbox.attempts/error_code` и `tamir_chat_message.translation_state/source_language/target_language`. Ключи шифрования чата — 3 (`google`,`telegram`,`webhook`) в `tamir_chat_secret`.
- [x] 0.4 Live‑запись: сообщения только `delivered/translated`; outbox `done=true, attempts=0`; `tamir_chat_update` — 23 уникальных ключей (дедуп Telegram‑обновлений); `telegram_ref` chat `-1003977063535` msg `59` (conv 30); `event` включает `history_deleted=15, message_delivered=8`.

## 1. Проверка бэкенда (ожидания из docs/TAMIR-CHAT-DEVELOPMENT-PLAN.md §1–§7, §11, §12)

### 1.1 Админка
- [x] 1.1.1 Три раздела — ✅ (страницы `/app/tamir-chat` с вкладками Настройки / История; API access/overview/settings/connections; на вкладке Настройки «Язык и переводы» показывает usage переводов). Примечание: метрик стоимости/SLA в Истории нет — события несут per‑event атрибуты (перевод, attempts, время доставки).
- [x] 1.1.2 Раздел операторов — ✅ (код operators.tsx add/remove; staging: 1 оператор `Tamir`/tg `6590880329`/role operator).
- [x] 1.1.3 История — ✅ страница есть; ⚠️ пагинация: Истории **100/страница** (не 500), список чатов 30 (не 100); фильтров товара/оператора не видно (диапазон дат есть — проверить визуально на стенде); кнопка CSV есть.
- [x] 1.1.4 Read receipts → **GAP (устаревшее ожидание)**: «прочитано» клиенту не показывается нигде; `seen_at` только админский. Реальная семантика (код + доки origin/main после `70b8d95`): две тёмно‑фуксиевые галочки = **доставка в Telegram**, не прочтение. → правим ожидания плана.

### 1.2 Сессия гостя
- [x] 1.2.1 Гость продолжает чат после логина — ✅ код (`claim`, POST /chat/session); live: гостевая сессия создана, cookie `tb_chat_guest`.
- [x] 1.2.2 Guest session expiry 90 дней — ✅ (`conversations.ts:84`).
- [x] 1.2.3 Claim — ✅ код.

### 1.3 Диалог и товарный контекст
- [x] 1.3.1 Диалог по первому сообщению — ✅ live (F‑01: диалог №30 от guest‑hash; контекст сохранён до сообщения).
- [x] 1.3.2 Контекст в бэкенде/админке — ✅ (POST /chat/context; в админ‑диалоге карточка товара).
- [x] 1.3.3 Контекст в Telegram — ✅ live: thread 58 в группе `-1003977063535`, `useThread: true`, context title/productId в SSE/DB. ⚠️ **Находка:** `context.url` жёстко `https://tamir.rs/...` (`store/chat/[action]/route.ts:102`) — на staging ссылка ведёт на прод; для staging это не критично, но отметим как feature‑gap (нет env‑домена).

### 1.4 Доставка двусторонняя
- [x] 1.4.1 Клиент→Telegram <120с — ✅ **live F‑03: 25 сек** (msg seq 52, tg_msg 59, delivered/translated, attempts=0).
- [x] 1.4.2 Оператор→клиент — ✅ live (DB: 3 operator‑ответа delivered/translated: conv28 ru→en «Hello», conv26 ru→sr «Zdravo», conv29 en→sr «Provera revizije…»; гостевой GET seq 51 показал sr‑ответ клиенту).
- [x] 1.4.3 Товарный контекст в Telegram — ✅ thread‑карточка есть; изображения в UI replies (`Attach`) — доставка медиа в Telegram **подтверждена пользователем вручную 2026‑11‑16** (работает согласно реализации).
- [x] 1.4.4 Outbox — ✅ (job `backend/src/jobs/tamir-chat.ts` — `tamir-chat-delivery`, интервал 10 с + kick при новом сообщении; live: запись done=true, attempts=0).

### 1.5 Язык и перевод
- [x] 1.5.1 Правила sr-Latn/ru/en — ✅.
- [x] 1.5.2 Переводы в обе стороны + `source_language/target_language/translation_state` — ✅ live: en→ru (seq52), ru→en, ru→sr, en→sr.
- [x] 1.5.3 «Кэш переводов 24ч» → **GAP (устаревшее ожидание)**: отдельного кэша нет; есть `translation_state` на сообщение + идемпотентность по `client_message_id` (live F‑13: повтор = тот же id `093be075…`) и дедуп Telegram‑обновлений.

### 1.6 Автоматические сообщения
- [x] 1.6.1 Welcome/returning/offline/closed/reopened — ✅ (templates: 12 строк = 6 ключей × sr-Latn/en, все enabled).
- [x] 1.6.2 Семантика Sent (галочки) — ✅ на `origin/main`: `docs/TAMIR-CHAT.md` уже описывает «6 текстовых шаблонов SR/EN и переключатель галочек доставки», `ChatWidget` рендерит **две** галочки `#842154` при delivered, `statusText()` не возвращает «Прочитано» → ожидания плана (одна галочка) и §2.2 устарели.
- [x] 1.6.3 Разделение человек/автоматика — ✅ (`template_key`, system rows с enabled‑фильтром по шаблону).
- [x] 1.6.4 Лимит одновременных гостей (cap) — ✅ код (`MAX_ACTIVE_GUESTS`, cleanup); live: 9 активных гостей (cap не достигнут).
- [x] 1.6.5 Idle‑cleanup 30 дней — ✅ (30d, не 24ч; гостевые сессии 90d).

### 1.7 История и экспорт
- [x] 1.7.1 `tamir_chat_event` + события — ⚠️ таблица и события есть; точный набор `first_reply/sla_breach` не найден — см. 1.8.1.
- [x] 1.7.2 Фильтрация истории — ⚠️ частичная (по чату/диапазону; оператор/товар — под вопросом, сверить визуально).
- [x] 1.7.3 CSV‑экспорт — ✅ кнопка есть; выгрузка файла **подтверждена пользователем вручную 2026‑11‑16**.
- [x] 1.7.4 Оператор в Telegram отвечает в теме — ✅ **подтверждено пользователем вручную 2026‑11‑16** (ручной тест в Telegram‑группе стенда).
- [x] 1.7.5 Редактирование/удаление операторских сообщений в Telegram → синхронизация — ✅ **подтверждено пользователем вручную 2026‑11‑16** (probe F‑05 выполнен на ручном прогоне, синхронизация работает согласно реализации).

### 1.8 Метрики и производительность
- [x] 1.8.1 Метрики first reply/SLA/cost/P95 — **GAP (частично)**: overview API отдаёт counters (open/unanswered/today_*), события несут per‑event время/язык/attempts; **нет** агрегатов first reply, SLA, стоимости перевода, P95. → фиксировать как feature‑gap в отчёте.
- [x] 1.8.2 Метрики переводов по языкам — ✅ live (`/settings` возвращает usage; в settings API `updates.google`).
- [x] 1.8.3 Кэш переводов — GAP (см. 1.5.3).
- [x] 1.8.4 Языковые лимиты — ✅ live: 1501‑символьный текст → 400 `INVALID_MESSAGE`; тексты ≤1500 проходят (F‑02).

### 1.9 Отказоустойчивость
- [x] 1.9.1 Повторы с backoff, `attempts`+`error_code` — ✅ (мутация `retry` в админке **проверена пользователем вручную 2026‑11‑16** — работает согласно реализации).
- [x] 1.9.2 Дедуп Telegram‑обновлений по update_id — ✅ (23 уникальных ключа, `ON CONFLICT DO NOTHING`).
- [x] 1.9.3 «Отметить доставленным» (webhook `message_delivery`) — ✅ **подтверждено пользователем вручную 2026‑11‑16** (webhook‑POST работает согласно реализации, `delivery_updates` включён).
- [x] 1.9.4 Ротация webhook‑секрета — ✅ (POST /telegram-webhook; POST **выполнен пользователем вручную 2026‑11‑16** — работает).
- [x] 1.9.5 Ключи шифрования — ✅ (3 записи `google`,`telegram`,`webhook` в `tamir_chat_secret`, AES‑256‑GCM с `CHAT_ENCRYPTION_KEY`; таблицы `tamir_settings_keys` в схеме чата нет).

## 2. Проверка фронтенда (сверка с `origin/main`)

- [x] 2.1 Виджет на всех страницах — ✅ (`app/layout.tsx`).
- [x] 2.2 Галочка доставки «Прочитано» — ✅ проверено на origin/main: **реализованы две фуксиевые галочки доставки** (PR #114 `70b8d95`), «Прочитано» нет — ожидание плана устарело (см. 1.1.4/1.6.2).
- [x] 2.3 Индикатор «онлайн» — ✅ код есть (`ChatWidget` online indicator) — ⚠️ визуальный факт на стенде не зафиксирован.
- [x] 2.4 Отправка текста/изображения — ✅ (POST message text 1..1500; images 0 в staging → изображения не тестировались live).
- [x] 2.5 SSE + fallback polling — ✅ live: `GET /chat/stream` → `retry: 1500` + snapshot‑кадр + `Last-Event-ID` replay (F‑09: с cursor 50 → replay seq 52, 3 кадра/6c).

## 3. Live‑пробы (staging‑стенд) — журнал

| # | Проба | Факт | Вердикт |
|---|---|---|---|
| F‑01 | Сессия гостя | `POST /chat/session` guest{name,phone,email} → `tb_chat_guest` cookie, id=hash‑identity; гость `tb21-audit-…@tamir.local` | ✅ |
| F‑01b | Диалог | POST /chat/context (product `prod_01M4R27XVYYNSWKG2H35FVXS88`, locale sr) → conversation 30 `5ca21576-8290-4250-a436-f3c0d0fdcd74`; POST /chat/messages требует `"id"` в теле | ✅ |
| F‑02 | Негативы | 1501 символов → `INVALID_MESSAGE`; locale `de` → `INVALID_LOCALE`; «мусорный» productId/draft‑product → `INVALID_PRODUCT_CONTEXT`; несуществующий guest‑hash → GET conversations `200 {conversations:[]}`, GET messages/stream → `404 CHAT_NOT_FOUND` (не 401 `CHAT_SESSION_EXPIRED` — коды отличаются от ожиданий плана) | ⚠️ |
| F‑03 | Сквозной цикл | seq 52 en→ru delivered/translated, tg msg 59 / thread 58, **25 сек** (<120) | ✅ |
| F‑04 | Ответ оператора | 3 operator‑сообщения delivered/translated (ru→en, ru→sr, en→sr); гостевой GET показал sr‑ответ | ✅ |
| F‑05 | Правк/удал в Telegram | ✅ **выполнено пользователем вручную 2026‑11‑16**: редактирование/удаление сообщений в группе стенда синхронизируется согласно реализации | ✅ |
| F‑06 | Невидимый товар | draft + fabricated id → `400 INVALID_PRODUCT_CONTEXT` (не `PRODUCT_NOT_FOUND`) | ⚠️ |
| F‑07 | Rate limit | 41‑й POST /chat/context за минуту → `429 {"code":"CHAT_RATE_LIMIT"}`; лимит 40/min, ключ `chat-context` | ✅ |
| F‑08 | Админ API без auth | `401 Unauthorized` | ✅ |
| F‑09 | SSE replay | `Last-Event-ID: 50` → кадр id 52 (snapshot+cursor "52") | ✅ |
| F‑10 | История | 100/страница, кнопки CSV; фильтры — частичные | ⚠️ |
| F‑11 | Настройки+шаблоны | 12 строк шаблонов (6 ключей × sr/en), locale guard `sr-Latn|en` | ✅ |
| F‑12 | Connections | google ok, telegram ok; `telegram/check` ok group; `telegram/test` ok (сообщение в группу стенда); `translation/test` ok | ✅ |
| F‑13 | Инкремпотентность | повтор POST с тем же `clientId` → **тот же** message id `093be075-…`, без дублей | ✅ |

### Админ‑пробы UI/API (browser + curl с cookie‑jar, только non‑destructive)

| # | Проверка | Факт |
|---|---|---|
| A‑01 | `/app/tamir-chat` рендерится (как admin) | ✅ страница, вкладки Настройки/История, карточки чатов, поле ответа |
| A‑02 | overview API | openCount 12, unanswered 12, today_* счётчики |
| A‑03 | access API | `isAdmin:true`, operators: Tamir |
| A‑04 | settings API | 12 шаблонов (6×sr/en), telegramCfg topics+notifications, googleEnvironmentConfigured **false**, webhookConfigured **true** |
| A‑05 | connections API | google ok + translationUsage; telegram ok (threadReplies true, deliveryUpdates true) |
| A‑06 | conversations API | 12, пагинация 30 |
| A‑07 | dialog API (conv 30) | seq52: delivered/translated en→ru, tg_msg 59 |
| A‑08 | history API | 47 событий, kinds: connection_updated, provider_updated, settings_updated, message_delivered, history_deleted…; **нет** first_reply/sla_breach |
| A‑09 | reply API (GET) | 405 → маршрутизация live; мутации админки (create conversation / send / delete / retry / status / seen) **проверены пользователем вручную 2026‑11‑16 — всё работает согласно реализации** |
| A‑10 | telegram check/test + translation test | все ok (безопасные, тестовое сообщение ушло в группу стенда) |

### Находки (для §6/§7 отчёта)
1. `https://tamir.rs` жёстко зашит в `context.url` — на staging контекст‑ссылки ведут на прод.
2. Коды ошибок в API отличаются от описаний плана: `GUEST_SESSION_EXPIRED`/`INVALID_GUEST`/`LOGIN_REQUIRED`/`INVALID_PRODUCT_CONTEXT`/`INVALID_LOCALE`/`CHAT_RATE_LIMIT` вместо `CHAT_SESSION_EXPIRED`/`PRODUCT_NOT_FOUND`. Мёртвый guest‑hash → пустой список/`404 CHAT_NOT_FOUND`, не 401.
3. Нет метрик first reply/SLA/стоимости/P95 и кэша переводов — пункты плана не реализованы (feature‑gap).
4. `googleEnvironmentConfigured:false` при рабочем переводе — Google настроен через UI, env не задан: док §6 про ENV ввести в заблуждение.
5. В shipped‑доках `docs/TAMIR-CHAT.md` (origin/main) семантика галочек уже корректна — расходится только формулировка Development‑план §1.6 «галочка прочтения».
6. Пагинация истории/списков (100/30) не совпадает с планом (500/100).
7. Webhook‑маршрут (`POST /chat/telegram-webhook`) доступен извне без rate limit (в отличие от /chat/*) — риск (отметить в отчёте).
8. Логи Next‑контейнера стенда: periodic `ioredis read ECONNRESET` (шум, не влияет на чат) — отметить как наблюдение по инфраструктуры.
9. Удаление диалога из админки — ✅ **подтверждено пользователем вручную 2026‑11‑16** (работает согласно реализации; ранее отмечалось только по коду).

## 4. Документация (результаты аудита)
- [x] 4.1 Создать `docs/TAMIR-CHAT-AUDIT-2026-11.md`: сверка ожиданий плана с reality (находки выше), версия кода `218d8fb`, снимки/запросы. **Создан**: методология+статусы (§0), архитектура (§1), сводка вердиктов (§2), журнал проб (§3), находки с severity (§4), матрица покрытия и прогоны (§5), Figma (§6), влияние на OpenSpec (§7), Not Verified (§8), устаревший план (§9), статусы по группам TB‑21 (§10), рекомендации (§11).
- [x] 4.2 В `docs/TAMIR-CHAT.md` добавить раздел «Реальные семантики vs план» (галочки=доставка; коды ошибок; лимиты 40/120/30d/90d). **Сделано** в рамках актуализации доков по baseline `218d8fb`: точные лимиты 40/120/15/10/20 + коды ошибок, семантика двух галочек доставки, ссылка на отчёт аудита.
- [x] 4.3 В Development‑план пометить устаревшие пункты (§1.6 «прочитано», §11 кэш переводов/метрики SLA, §12 лимиты) ссылкой на аудит. **Правка файла невозможна**: `docs/TAMIR-CHAT-DEVELOPMENT-PLAN.md` отсутствует в репозитории, в `218d8fb` и во всей истории git — устаревшие пункты зафиксированы отдельным разделом отчёта §9.
- [x] 4.4 Обновить §2.5 плана (SSE snapshot+replay подтверждён), §7.1 (webhook live). **Факт зафиксирован в отчёте §9** (файл плана вне репозитория): SSE — snapshot + `Last-Event-ID` replay + `retry:1500` + fallback‑polling (F‑09); webhook — live, секрет, дедуп по `update_id`, `message_delivery`.

## 5. Тесты (по docs/TESTING-RULES.md — существующие зоны, без новых фреймворков)

В репозитории **нет Playwright‑конфига** для чата (design.md, решение 4); используем только существующие зоны:

- [x] 5.0 Инвентарь чат‑тестов (origin/main): `backend/tests/tamir-chat.test.cjs`, `backend/tests/tamir-chat-http-errors.test.cjs`, `backend/tests/tamir-chat-images.test.cjs` (`node --test`); `backend/tests/tamir-chat.integration.cjs` (`node --test` + `TEST_REVIEWS_DB_URL`); `backend/integration-tests/http/tamir-chat.spec.ts` (Jest http‑спека); `frontend/tests/tamir-chat.test.mjs` (`node --test`).
- [x] 5.1 Прогнать unit‑тесты бэкенда: `cd backend && node --test tests/tamir-chat.test.cjs tests/tamir-chat-http-errors.test.cjs tests/tamir-chat-images.test.cjs` — покрытие: гостевая сессия/claim, схема сообщения (1..1500, UUID clientId), product context guard (draft → `INVALID_PRODUCT_CONTEXT`), коды ошибок, лимиты. **Пройдено пользователем 2026‑11‑16: «всё работает согласно реализации».**
- [x] 5.2 Прогнать интеграционную БД‑спеку: `cd backend && TEST_REVIEWS_DB_URL=<staging DB> node --test tests/tamir-chat.integration.cjs` (только read‑safe сценарии, на стендовой БД, не проде). **Пройдено пользователем 2026‑11‑16.**
- [x] 5.3 Прогнать HTTP‑спеку Jest: `cd backend && npx jest integration-tests/http/tamir-chat.spec.ts`. **Пройдено пользователем 2026‑11‑16.**
- [x] 5.4 Прогнать фронт‑тесты: `cd frontend && node --test tests/tamir-chat.test.mjs` (BFF allowlist, cookie‑обработка, статусы). **Пройдено пользователем 2026‑11‑16.**
- [x] 5.5 Сопоставить покрытие с живыми пробами F‑01…F‑13/A‑01…A‑10: матрица покрытия построена в отчёте `docs/TAMIR-CHAT-AUDIT-2026-11.md` §5 (подтверждена пользователем 2026‑11‑16); список дописывания тестов (SSE replay, rate limit `chat-context`, идемпотентность по client_id) вынесен в отдельный change, не в этот аудит.
- [x] 5.6 Логи прогонов: прогоны §5.1–5.4 выполнял пользователь, сырые логи не передавались; в отчёте §5 зафиксирован вердикт пользователя («все контуры зелёные, всё работает согласно реализации») с явной пометкой источника.

## 6. Выкатка (только после явного «go» пользователя)
- [ ] 6.1 Миграции (если нужны по итогам аудита) — staging→prod, smoke.
- [ ] 6.2 Бэкенд `gh workflow run deploy-backend.yml --ref main`, проверить `/health`, healthcheck‑чата (webhook getUpdates), `/admin/tamir-chat/overview`.
- [ ] 6.3 Фронтенд `gh workflow run deploy-frontend.yml --ref main`, проверить виджет на prod‑сайте (только наблюдение, без сообщений).
- [ ] 6.4 Post‑deploy: убедиться, что галочки/статусы соответствуют shipped‑докам; ничего не чинить молча.

## 7. Итог аудита
- [x] 7.1 Матрица покрытия: каждая проверка §1–§3 → вердикт → пункт отчёта; недопроверенное (F‑05, 1.7.4, медиа‑доставка, webhook наружу, CSV‑файл) — явным списком «не проверялось». **Сделано**: сводка вердиктов по доменам (отчёт §2), матрица покрытия (§5), итоговые статусы по группам TB‑21 (§10); live‑подтверждённые ручные пункты (F‑05, 1.7.3–1.7.5, мутации админки) помечены как «Verified manually 2026‑11‑16», остальное — список Not Verified (§8).
- [x] 7.2 Итоговый отчёт `docs/TAMIR-CHAT-AUDIT-2026-11.md` готов; выводы продублированы комментарием в YouTrack TB‑21 (без секретов). **Отчёт готов.** Дублирование комментарием в YouTrack **отменено решением владельца от 16.11.2026** («нет, не надо») — правки в YouTrack не вносим, ссылка на отчёт живёт в репозитории и в артефактах change.
- [x] 7.3 Решение по архивации change (после проверки `openspec validate --strict` и явного одобрения пользователя; не коммитить без «go»). **Решение пользователя получено 16.11.2026**: коммит выполнен, change архивируется с синхронизацией дельты в `openspec/specs/tamir-chat/spec.md` (`npx openspec archive tamir-chat-production-audit`). Валидация `--changes --strict` на момент архивации — 6/6 passed.
