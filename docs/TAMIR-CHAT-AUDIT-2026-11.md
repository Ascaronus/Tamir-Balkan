# TAMIR Chat — Production Audit (November 2026)

**Задача:** TB-21 (YouTrack) · change `tamir-chat-production-audit` (OpenSpec)
**Базовая версия кода:** `origin/main` @ `218d8fb` (merge PR #117; чат-контур включён PR #96, #110, #111, #112, #113, #114)
**Стенд для живых проверок:** `test.tamir.rs` / `test-api.tamir.rs` (release = `main`, compose `tamir-test-*`, БД `tamir_balkan_test`)
**Дата проверок:** 16.11.2026

Источником истины являются текущий код и подтверждения на стенде; документация и старый
Development-план могли устареть — все расхождения зафиксированы ниже. Секреты (токен бота,
API-ключи, cookie, chatId группы) в отчёт не попадают — только имена переменных и таблиц.

## 0. What Was Done and How It Was Assessed

1. Инвентарь кода `218d8fb` (маршруты BFF, API-роуты, модули `src/lib/tamir-chat/*`, admin-вкладки,
   миграции, фоны, тесты).
2. Аудит staging: схема БД, строки настроек, секреты (только наличие/тип), секции `tamir-chat-jobs.json`.
3. Живые пробы на стенде: API-пробы `F-01…F-13` (curl/HTTPS) и админ-пробы `A-01…A-10` (browser + curl).
4. Прогон существующих тестов чата (§5.1–5.4) и ручные сценарии — **выполнены пользователем вручную
   16.11.2026**, вердикт: «всё работает согласно реализации». Сырые логи прогонов в отчёт не
   передавались; вердикт фиксируется с явной пометкой источника.
5. Фиксация текущего UI в Figma и актуализация документации/OpenSpec.

Шкала статусов (по TB-21 §9): **Implemented** (подтверждено кодом) · **Tested** (есть автотест в репо) ·
**Verified on Staging** (подтверждено живой пробой на стенде) · **Verified manually** (ручной прогон
пользователя 16.11.2026) · **Not Verified** (доказательств нет) · **Issue Found** (подтверждённое расхождение).

## 1. Actual Architecture (Inventory)

Схема движения сообщения подтверждается кодом и пробами:

```
Storefront → BFF (/chat/*) → Medusa API → PostgreSQL (+outbox) → Translation → Telegram
Telegram → Webhook → Medusa → Translation → PostgreSQL → SSE/poll → Storefront
```

- **BFF (Next.js)**: `frontend/src/app/chat/*` — session, context, messages, stream (SSE), images,
  guest-info, conversations; origin-валидация, cookie `tb_chat_guest` (hash identity), проксирование
  на `TAMIR_CHAT_API_BASE_URL` (`internal-tamir-chat-guard.mjs` + `check-chat-origin.mjs`).
- **Backend (Medusa)**: `api/tamir-chat/*` (customer), `admin/tamir-chat/*` (access/settings/
  connections/templates/telegram/conversations/history/operators), `POST /chat/telegram-webhook`.
  Модули: `src/lib/tamir-chat/*` (guards, schema, session, product-context, transport,
  telegram-sync, telegram-webhook, translations, images, templates, overview),
  `src/api/chat/telegram-webhook`, `src/jobs/tamir-chat-delivery*` (интервал 10 с, секции
  `tamir-chat-jobs.json`).
- **БД**: 13 таблиц `tamir_chat_*` (settings, secret, guest_session, conversation, message,
  message_image, message_delivery, telegram_thread, telegram_update, outbound_update, event,
  operator, template).
- **Настройки**: одна строка `tamir_chat_settings` (config jsonb + revision). Провайдеры — через
  admin-настройки; секреты — в `tamir_chat_secret` (AES-256-GCM, `CHAT_ENCRYPTION_KEY`).
  **ENV-переменных `TELEGRAM_*`/`GOOGLE_*` на стенде нет** — это норма текущей архитектуры.
- **Realtime**: SSE `GET /chat/stream` (`retry: 1500`, snapshot-кадр, replay по `Last-Event-ID`) +
  fallback-поллинг (`?limit=30`).

Статус: **Implemented + Verified on Staging** (обе цепочки подтверждены пробами F-03, F-04, F-09).

## 2. Expectations vs Actual Behavior

Детальный чек-лист с построчными вердиктами — `openspec/changes/tamir-chat-production-audit/tasks.md`
(§0–§3). Сводка по доменам:

| Домен | Вердикт | Примечание |
|---|---|---|
| Гостевые сессии (name 2–80, email/phone, hash-identity, cookie httpOnly/sameSite=lax) | Implemented + Tested + Verified on Staging | F-01; session 90d, idle-cleanup 30d |
| Claim гостевого диалога при входе (`customer/claim`, `merge_customer_id`, `operator_notes`) | Implemented + Tested | Live claim на стенде не выполнялся (нет тестового аккаунта) — Not Verified live |
| Отправка сообщений (schema 1..1500, UUID `clientId`, POST требует поля `id`) | Implemented + Tested + Verified on Staging | F-01b, F-13 (идемпотентность по clientId) |
| Product context (`/products/*`, draft отклоняется) | Implemented + Tested + Verified on Staging | F-02, F-06: `400 INVALID_PRODUCT_CONTEXT` |
| Delivery outbox + retry (`attempts`, `error_code`, backoff) | Implemented + Tested + Verified manually | F-03: 25 с (<120); retry-мутация в админке проверена пользователем |
| Telegram Topics (по одной теме на диалог, reply-ref fallback) | Implemented + Verified manually | A-05: threadReplies true; ручной ответ в теме 16.11.2026 |
| Ответ оператора webhooks → перевод → SSE | Implemented + Tested + Verified on Staging | F-04: 3 ответа ru→en/ru→sr/en→sr |
| Переводы (Google, sr-Latn, направления sr/en→ru, ru→sr/en) | Implemented + Tested + Verified on Staging | F-12: translation/test ok при `googleEnvironmentConfigured:false` (настройка через UI) |
| Статусы доставки (две фуксиевые галочки `#842154`, «Прочитано» нет) | Implemented (main) + Tested (frontend) | ожидание плана «галочка прочтения» устарело — см. §9 отчёта |
| Auto-шаблоны (welcome_back, out_of_hours, closed; sr/en) | Implemented + Verified on Staging | F-11: 12 строк (6 ключей × sr/en), guard `sr-Latn|en` |
| SSE + Last-Event-ID replay + fallback polling | Implemented + Verified on Staging | F-09: replay seq 52; автотеста SSE-replay нет — gap |
| Images (5 MiB, 20 MP, jpeg/png/webp→jpeg ≤5 MiB, 1 на сообщение) | Implemented + Tested (unit/HTTP) | live-доставки изображений на стенде не проверяли (0 изображений в БД) — Not Verified live |
| История/пагинация/CSV (100/стр., админ-списки 30) | Implemented + Verified on Staging | F-10; фильтры по оператору/товару — частичные, визуально не сверялись |
| Retention (`DELETE_DAYS` 30, `MAX_ACTIVE_GUESTS`, idle 30d) | Implemented + Verified on Staging (config) | live-цикл очистки не наблюдался |
| Rate limits (40/120/15/10/20 за мин) | Implemented + Verified on Staging | F-07: 429 `CHAT_RATE_LIMIT` на 41-м запросе |
| Админ-контур (обзор/чаты/история/настройки/операторы) | Implemented + Verified on Staging | A-01…A-08; мутации (send/delete/retry/status/seen) — Verified manually 16.11.2026 |
| Операторы/роли (viewer/operator/manager, backend-контроль) | Implemented + Tested | Telegram User ID оператора: 1 запись — Not Verified live |
| Безопасность (auth, webhook-секрет, секреты в БД, origin) | Implemented + Tested + Verified on Staging | F-08: admin API 401 без auth; `check-chat-origin.mjs` в build |

## 3. Live-Probe Log (Staging, 16.11.2026)

### API Probes (curl/HTTPS, No Destructive Actions)

| # | Проба | Факт | Вердикт |
|---|---|---|---|
| F-01 | Сессия гостя | `POST /chat/session` guest{name,phone,email} → cookie `tb_chat_guest`, id=hash-identity; synthetic-гость `tb21-audit-…@tamir.local` | ✅ |
| F-01b | Диалог | `POST /chat/context` (product + locale sr) → conversation 30; `POST /chat/messages` требует `"id"` в теле | ✅ |
| F-02 | Негативы | 1501 симв. → `INVALID_MESSAGE`; locale `de` → `INVALID_LOCALE`; мусорный productId/draft → `INVALID_PRODUCT_CONTEXT`; мёртвый guest-hash → `200 {conversations:[]}` / `404 CHAT_NOT_FOUND` (не 401 — коды отличаются от плана) | ⚠️ |
| F-03 | Сквозной цикл | seq 52 en→ru delivered/translated, tg msg 59 / thread 58, **25 с** (<120) | ✅ |
| F-04 | Ответ оператора | 3 operator-сообщения delivered/translated (ru→en, ru→sr, en→sr); гостевой GET показал sr-ответ | ✅ |
| F-05 | Правки/удаление в Telegram | ✅ **выполнено пользователем вручную 16.11.2026** — синхронизация работает согласно реализации | ✅ |
| F-06 | Невидимый товар | draft + fabricated id → `400 INVALID_PRODUCT_CONTEXT` (не `PRODUCT_NOT_FOUND`) | ⚠️ |
| F-07 | Rate limit | 41-й `POST /chat/context` за минуту → `429 CHAT_RATE_LIMIT` (лимит 40/min, ключ `chat-context`) | ✅ |
| F-08 | Админ API без auth | `401 Unauthorized` | ✅ |
| F-09 | SSE replay | `Last-Event-ID: 50` → кадр id 52 (snapshot + cursor "52") | ✅ |
| F-10 | История | 100/страница, кнопки CSV; фильтры — частичные | ⚠️ |
| F-11 | Настройки+шаблоны | 12 строк шаблонов (6 ключей × sr/en), locale guard `sr-Latn|en` | ✅ |
| F-12 | Connections | google ok, telegram ok; `telegram/check` ok group; `telegram/test` ok (сообщение в группу стенда); `translation/test` ok | ✅ |
| F-13 | Идемпотентность | повтор POST с тем же `clientId` → **тот же** message id, без дублей | ✅ |

### Admin Probes (browser + curl with a Cookie-Jar, Non-Destructive Only)

| # | Проверка | Факт |
|---|---|---|
| A-01 | `/app/tamir-chat` рендерится (как admin) | ✅ страница, вкладки Настройки/История, карточки чатов, поле ответа |
| A-02 | overview API | openCount 12, unanswered 12, today_* счётчики |
| A-03 | access API | `isAdmin:true`, operators: Tamir |
| A-04 | settings API | 12 шаблонов (6×sr/en), telegramCfg topics+notifications, `googleEnvironmentConfigured` **false**, `webhookConfigured` **true** |
| A-05 | connections API | google ok + translationUsage; telegram ok (threadReplies true, deliveryUpdates true) |
| A-06 | conversations API | 12 чатов, пагинация 30 |
| A-07 | dialog API (conv 30) | seq 52: delivered/translated en→ru, tg_msg 59 |
| A-08 | history API | 47 событий: connection_updated, provider_updated, settings_updated, message_delivered, history_deleted…; **нет** first_reply/sla_breach |
| A-09 | reply API (GET) | 405 → маршрутизация live; мутации админки (create/send/delete/retry/status/seen) **проверены пользователем вручную 16.11.2026** |
| A-10 | telegram check/test + translation test | все ok (тестовое сообщение ушло в группу стенда) |

## 4. Findings and Defects

Исправления **не выполнялись** (аудит документирует; правки — отдельными согласованными change).

| # | Находка | Severity | Статус/рекомендация |
|---|---|---|---|
| 1 | `https://tamir.rs` жёстко зашит в `context.url` (`route.ts:102` BFF) — на стенде контекстные ссылки ведут на прод | Medium | Issue Found. Отдельный change: брать origin из env (аналогично фиксу origin из PR #113) |
| 2 | Коды ошибок API отличаются от описаний Development-плана (`INVALID_PRODUCT_CONTEXT`, `INVALID_LOCALE`, `GUEST_SESSION_EXPIRED`, `LOGIN_REQUIRED`, `CHAT_RATE_LIMIT`; мёртвый hash → `404 CHAT_NOT_FOUND`, а не 401 `CHAT_SESSION_EXPIRED`) | Low | Ожидание плана устарело; shipped-доки соответствуют коду — ничего не чиним |
| 3 | Нет метрик first reply / SLA / стоимости перевода / P95 и нет кэша переводов (события несут per-event время/язык/attempts, overview — только counters) | Medium | Feature gap, не дефект. Пункты плана §11 не реализованы; при необходимости — отдельный change |
| 4 | `googleEnvironmentConfigured:false` при рабочем переводе — Google настроен через UI, env не задан | Low | Это штатное поведение текущей архитектуры; раздел §ENV в документации не должен вводить в заблуждение (в TAMIR-CHAT.md отмечено) |
| 5 | Development-план §1.6 обещает «галочку прочтения» — фактически **две фуксиевые галочки доставки** (PR #114); в shipped-доках семантика уже корректна | Low | Устаревшее ожидание плана (см. §9); «Delivered ≠ Read» соблюдается |
| 6 | Пагинация истории/списков (100/30) не совпадает с планом (500/100) | Info | Факт зафиксирован; план устарел |
| 7 | `POST /chat/telegram-webhook` доступен извне **без rate limit** (в отличие от `/chat/*`) | Medium | Issue Found (риск). Рекомендация: лимит/защита на маршруте — отдельный change, с согласованием |
| 8 | В логах Next-контейнера стенда периодический `ioredis read ECONNRESET` (шум, на чат не влияет) | Info | Наблюдение по инфраструктуре стенда |
| 9 | Удаление диалога из админки (роут `delete` + каскад) — сверено только по коду | Info | Дефекта нет: **подтверждено пользователем вручную 16.11.2026** |

## 5. Test Coverage Matrix (TB-21 §8.5)

Тесты чата в репо на `218d8fb` (каталог — `docs/TESTING.md`):

| Функциональность | Существующий тест | Уровень | Пробел | Новый тест |
|---|---|---|---|---|
| Гостевая сессия | `tamir-chat.test.cjs` (session/claim/hash), `tamir-chat-http-errors.test.cjs` | Unit + HTTP | Живой цикл claim после login; истечение 90d | не добавляли (рекомендация) |
| Авторизация customer | `tamir-chat-http-errors` (`LOGIN_REQUIRED`), `frontend/tests/tamir-chat.test.mjs` | Unit + frontend | Мульти-вкладки/logout live | не добавляли |
| Отправка сообщений | `tamir-chat.test.cjs` (schema 1..1500, UUID clientId), `integration-tests/http/tamir-chat.spec.ts`, `tamir-chat.integration.cjs` | Unit + HTTP + DB | Идемпотентность по `clientId` в HTTP-спеке | не добавляли (рекомендация) |
| Telegram delivery | `tamir-chat.integration.cjs` (outbox/attempts/`error_code`), unit transport (mock) | DB + Unit | Реальный Telegram — только live-пробы/ручные | live покрыто (F-03/F-04, A-10) |
| Переводы | `tamir-chat.test.cjs`, integration (update translation), frontend locale sr-Latn | Unit + DB | Ошибки/лимиты Google API (внешний сервис) | live `translation/test` (F-12) |
| SSE | frontend BFF-тесты (статусы/cookies) | frontend | **Нет автотеста `Last-Event-ID` replay** | не добавляли (рекомендация) |
| Изображения | `tamir-chat-images.test.cjs` (mime/размеры/`images/owned`), HTTP-спека | Unit + HTTP | Live-доставка изображения в Telegram на стенде | не добавляли |
| Rate limits | юнит-тесты `rateLimit` | Unit | HTTP-429 на живом маршруте (например `chat-context`) | live F-07 |
| Админка | автотестов нет | — | UI-регрессий нет | вне объёма (QA-репо) |
| Origin/security | `scripts/check-chat-origin.mjs` (build-guard), frontend BFF-allowlist | guard + frontend | — | уже есть |
| БД-схема | `staging-contract.test.cjs`, `tamir-chat.integration.cjs` (`assertTamirChatSchema`) | DB | — | уже есть |

**Новых тестов в этом аудите не добавляли** (решение design.md: аудит документирует, без new zones);
список дописывания (SSE replay, 429 на live-маршруте, идемпотентность) вынесен в отдельный change.

### Test Run Results (per docs/TESTING-RULES.md)

| Прогон | Команда | Результат |
|---|---|---|
| §5.1 unit бэкенда | `cd backend && node --test tests/tamir-chat.test.cjs tests/tamir-chat-http-errors.test.cjs tests/tamir-chat-images.test.cjs` | **Пройден** (пользователь, 16.11.2026: «всё работает согласно реализации») |
| §5.2 интеграционная БД-спека | `TEST_REVIEWS_DB_URL=<staging DB> node --test tests/tamir-chat.integration.cjs` (read-safe, стендовая БД) | **Пройден** (пользователь, 16.11.2026) |
| §5.3 HTTP-спека Jest | `npx jest integration-tests/http/tamir-chat.spec.ts` | **Пройден** (пользователь, 16.11.2026) |
| §5.4 фронт-тесты | `cd frontend && node --test tests/tamir-chat.test.mjs` | **Пройден** (пользователь, 16.11.2026) |

Сырые логи прогонов не передавались; вердикт пользователя фиксируется как источник. TypeScript/ESLint/
production build в этом аудите не перезапускались — код не менялся, релизный контур `218d8fb` собран CI
(GitHub Actions) и выкачен на стенд/прод деплой-пайплайном.

## 6. Figma — Capturing the Existing UI (TB-21 §7)

Файл `2u9V1x7faa2yieZqRP0KaF`, страница **«05 TAMIR Chat (audit)»** (`79:1215`), фрейм-слепок
**`TB-21 · TAMIR Chat — production snapshot` (`302:3754`)** — добавлен 16.11.2026 (до этого дизайнов
чата в файле не было):

- `TB-21-01` — закрытый виджет, EN (кнопка «Chat with us»);
- `TB-21-02` — открытая панель, гостевая форма Name / Contact / Message, EN;
- `TB-21-03` — открытая панель, SR (`/rs`, «Razgovarajte sa nama»);
- `TB-21-04` — панель целиком 380×710, root `.tamir-chat.tamir-chat-right`, SR;
- рамка «Не запечатлено» — состояния отправки/статусов/ошибок намеренно не снимались: их получение
  требует отправки реальных сообщений в рабочую Telegram-группу (деструктивно для прода).

Скриншоты сделаны с production-сайта tamir.rs **только как эталон текущего внешнего вида**
(наблюдение, без сообщений); функциональные проверки — только на стенде.
Макеты Medusa Admin (TB-21 §7.2) в Figma **не зафиксированы** — админка рендерится под UI Medusa,
отдельные макеты не создавались (чтобы не противоречить существующему design code); зафиксировано
фактическое состояние пробами A-01…A-08. UX-предложений не внедряли.

В той же странице 16.11.2026 приведены в соответствие shipped-коду макеты других задач спринта:
избранное TB‑14 (страница `/wishlist` `207:3561`, сердца `209:3591`…`209:3794` — 10 заливок перекрашены
с `#EAB308` на accent `#842154`, аккаунт-меню `203:3611`, заметка `209:3822`), предпросмотр корзины
TB‑15 (фрейм `216:3701`, подпись `218:3702` — hover для мыши + закреплённый предпросмотр по тапу),
авторизация TB‑13 (фрейм `202:3521` — сверен с `HeaderAccount.tsx`/`LoginDialog.tsx`, перерисовка не
потребовалась).

Ссылки на макеты зафиксированы в артефактах OpenSpec (страница `79:1215`). По решению владельца
от 16.11.2026 комментарии в YouTrack не публикуются.

## 7. Impact on OpenSpec

- Change аудита: `openspec/changes/tamir-chat-production-audit/` (proposal/design/specs/tasks) —
  behavioral-delta к `openspec/specs/tamir-chat/spec.md` (6 ADDED требований: identity-first session,
  guest claim, rate limits, product context guard, templates, error codes — всё по факту кода).
- Параллельные change по остальным задачам спринта: `header-auth-ux-login-modal` (TB-13),
  `wishlist-favorites-system` (TB-14), `mini-cart-hover-preview` (TB-15),
  `tamir-chat-documentation-update` (TB-11).
- Валидация: `npx openspec validate --changes --strict` — 6/6 passed.
- `openspec/specs/tamir-chat/spec.md` (--all, --strict): остаются **3 чат-требования без сценариев**
  («Authenticate Telegram replies», «Native administrative control», «Localized and recoverable
  widget») — решение design.md: не расширять спеку ради формального green; исправление — при
  синхронизации change. Остальные падения `--all` (`localization`, `order-confirmation-email`, `security-access-control`,
`cart-checkout`) к чату не относятся и в этом аудите не менялись.
- Синхронизация спеков и архивация change — только после явного одобрения (tasks.md §7.3).

## 8. What Could Not Be Verified (Not Verified)

- Живой claim гостевого диалога после login на стенде (нет тестового customer-аккаунта на стенде) —
  только unit-покрытие.
- Live-доставка изображения покупателя в Telegram (в БД стенда 0 сообщений с изображениями) —
  только unit/HTTP.
- Визуальный индикатор «онлайн» и состояния загрузки/ошибок виджета в браузере стенда.
- Фильтры истории по оператору/товару (частичные — визуально не сверялись).
- Live-цикл retention (фактическое удаление записей старше `DELETE_DAYS`) — подтверждён только конфиг.
- Поведение при отказе Telegram/Google (бот удалён из группы, невалидный токен, лимиты API) —
  destructive-эксперименты над интеграциями не проводились; retry/degradation подтверждены кодом и
  unit/DB-тестами.
- `INVALID_ORIGIN` для `www.tamir.rs` на стенде (стенд — `test.tamir.rs`; origin-гард подтверждён
  guard-скриптом и BFF-тестами).
- Production-проверки (§9 TB-21 «Verified on Production») — не выполнялись намеренно: все живые
  пробы только на стенде; прод наблюдён лишь визуально для Figma-слепка.

## 9. Outdated Items of the Development Plan

`docs/TAMIR-CHAT-DEVELOPMENT-PLAN.md` **отсутствует в репозитории** (нет в рабочем дереве, в
`218d8fb`, ни в одной истории git). Его пункты существовали только как ожидания постановки TB-21;
аннотация файла невозможна — устаревшие позиции фиксируются здесь:

| Пункт плана | Ожидание | Факт (код/стенд) |
|---|---|---|
| §1.6 «галочка прочтения» | индикатор прочтения | **две фуксиевые галочки доставки** `#842154` (PR #114); «Прочитано» нет; Delivered ≠ Read |
| §2.5 SSE | SSE без деталей | подтверждён: snapshot + `Last-Event-ID` replay + `retry:1500` + fallback polling (F-09) |
| §6 ENV (`TELEGRAM_*`/`GOOGLE_*`) | провайдеры через env | ENV не используется; настройки/секреты — через admin UI и `tamir_chat_secret` |
| §7.1 webhook | webhook live | подтверждён: `POST /chat/telegram-webhook`, секрет, дедуп по update_id, `message_delivery` (F/A-пробы, вручную) |
| §11 кэш переводов, метрики first reply/SLA/P95/стоимость | есть | **не реализованы** (feature-gap, находка 3) |
| §12 лимиты | иные значения | факт: 40/120/15/10/20 за мин; гостевые сессии 90d; idle 30d; история 100/30 (не 500/100) |
| коды ошибок (`CHAT_SESSION_EXPIRED`, `PRODUCT_NOT_FOUND`) | см. план | факт: `GUEST_SESSION_EXPIRED`, `INVALID_PRODUCT_CONTEXT`, `INVALID_LOCALE`, `LOGIN_REQUIRED`, `CHAT_RATE_LIMIT`, `404 CHAT_NOT_FOUND` |

## 10. Final Statuses by TB-21 Requirement Groups

| Группа TB-21 | Статус |
|---|---|
| 2.1 Виджет (render, состояния, layout) | Implemented + Verified on Staging (F-01/F-04 GET) + Figma-слепок |
| 2.2 Гость (форма, сессия, изоляция) | Tested + Verified on Staging (F-01, F-02) |
| 2.3 Авторизованный customer + claim | Implemented + Tested; claim live — Not Verified |
| 2.4 Отправка (schema, дубли, XSS) | Tested + Verified on Staging (F-13, F-02); XSS — sanitize по коду/юнитам |
| 2.5 Изображения | Tested (unit/HTTP); live Not Verified |
| 2.6 История/пагинация/удаление | Implemented + Verified on Staging (F-10); удаление диалога — Verified manually |
| 3.1–3.3 Telegram (topics, ответ оператора, webhook) | Implemented + Verified on Staging + Verified manually |
| 3.4 Ошибки Telegram (отказы, права, группы) | Implemented + Tested (mock/retry); live-отказы Not Verified |
| 4 Переводы (направления, sr-Latn, fallback) | Tested + Verified on Staging (F-03/F-04/F-12) |
| 5.1 Статусы доставки (галочки `#842154`) | Implemented (main) + Tested (frontend) |
| 5.2 Авто-шаблоны SR/EN | Implemented + Verified on Staging (F-11) |
| 6.1–6.5 Medusa Admin (обзор/диалоги/настройки/telegram/переводы) | Verified on Staging (A-01…A-08, A-10); мутации — Verified manually |
| 6.6 Операторы/роли | Implemented + Tested; live — частично Not Verified |
| 8.1 Архитектура/схема сообщения | Implemented + Verified on Staging |
| 8.2 Realtime SSE/replay/poll | Verified on Staging (F-09); автотест-пробел отмечен |
| 8.3 Безопасность (auth, secret, origin, rate limit, секреты) | Tested + Verified on Staging; находка 7 (webhook без лимита) — Issue Found |
| 8.4 Retention/удаление | Implemented + config-verified; live-цикл Not Verified |
| 8.5 Автотесты | аудит выполнен; новых тестов не добавляли; прогоны §5.1–5.4 —Passed (пользователь) |
| 9 «Verified on Production» | не выполнялось намеренно (только стенд) |

## 11. Recommendations (No Code Changes in This Audit)

1. Вынести hardcoded `https://tamir.rs` из `context.url` BFF в env (находка 1) — отдельный change.
2. Рассмотреть rate limit / защиту `POST /chat/telegram-webhook` (находка 7) — с проверкой, что
   Telegram не упирается в лимит.
3. При появлении продуктовой потребности: метрики first reply/SLA и кэш переводов (находка 3).
4. Дописть автотесты: SSE `Last-Event-ID` replay, HTTP-429 live-маршрута, идемпотентность `clientId`
   — в существующих зонах (`tests/*.cjs`, `integration-tests/http`), без новых фреймворков.
5. E2E-сценарии чата (виджет в браузере) — в `Tamir-QA-Automation`, не в этом репо.
6. Синхронизация макетов Figma с shipped-кодом по остальным задачам спринта — **выполнено 16.11.2026**
   (TB-14: сердца `209:3591`…`209:3794` → accent `#842154`, заметки `209:3822`/`218:3702`; TB-15:
   подпись `218:3702` под pinned-toggle; TB-13: макет `202:3521` сверен, перерисовка не потребовалась).

## 12. Files Changed by the Audit (Documentation)

- `docs/TAMIR-CHAT.md` — актуализация по факту `218d8fb` (PR #96–#117; точные лимиты и коды ошибок;
  «галочки = доставка»; ссылка на этот отчёт) — правки поверх baseline `218d8fb`.
- `docs/TESTING.md` — каталог тестов приведён к `218d8fb` (новые файлы тестов, tamir-chat строки,
  guard `check-chat-origin.mjs`); исторические замеры сохранены, добавлено дополнение 16.11.2026.
- `docs/TAMIR-CHAT-AUDIT-2026-11.md` — этот отчёт.
- `openspec/changes/*` — 5 change-спринта 215-8 (артефакты, не архивированы).
- Figma-файл `2u9V1x7faa2yieZqRP0KaF`, страница `79:1215`: слепок чата `302:3754` (TB‑21); правки
  макетов TB‑14 (`209:3591`…`209:3794`, `209:3822`), TB‑15 (`218:3702`); сверка TB‑13 (`202:3521`).

Код приложения этот аудит **не менял**. Выкатка (tasks.md §6) не выполнялась: staging и prod уже
содержат релиз `218d8fb`; новых изменений для деплоя нет. Commit — только по явному «go» пользователя.


