# TAMIR Chat

Feature-ветка: `feat/tamir-telegram-chat`. Production не изменён. Чат и Telegram по умолчанию выключены.

## Архитектура

За reverse proxy frontend проверяет Origin POST-запросов чата. Разрешены два набора:
https-origin наших публичных хостов (`tamir.rs`, `www.tamir.rs`) и точный origin из
`NEXT_PUBLIC_SITE_URL`. На stage задайте `NEXT_PUBLIC_SITE_URL=https://test.tamir.rs`,
на production — публичный URL соответствующего storefront (`https://tamir.rs`).
Переменная уже задаётся `scripts/staging-bootstrap.sh`.
При её изменении пересоберите и перезапустите frontend: Next.js встраивает `NEXT_PUBLIC_*`
при сборке. Внутренний URL Next.js (`http://localhost:3000`) не должен заменять публичный URL:
если значение указывает на локальный хост, frontend пишет предупреждение в лог, но чат
продолжает работать на публичных хостах. Без переменной (или если значение неразбираемо)
используется origin запроса — локальная разработка. Произвольные Host и X-Forwarded-*
не расширяют список разрешённых источников; `http`-origin публичных хостов, другой порт,
`null` и отсутствующий Origin отклоняются.

До реализации изучены существующие Customer module, AuthProvider/HttpOnly customer-cookie/BFF,
SR/EN LocaleProvider, ProductDetails, native Medusa Homepage Banners, Google Translation helper,
Knex/PG registration, middleware, deployment setup и test discovery. Используются эти механизмы;
авторизация, заказы, checkout и почта не заменены. Новых production-зависимостей нет.

| Слой | Реализация |
| --- | --- |
| Frontend | Отложенно загружаемый React-виджет внутри StoreProviders, существующие CSS-токены/шрифт, SR/EN |
| BFF | Next `/api/chat/*`, same-origin, серверная customer-cookie и HttpOnly guest-cookie, Origin-check на запись |
| Backend | Medusa file routes, Customer module, штатное authenticate middleware и PostgreSQL Knex |
| Очередь | Message + outbox в одной транзакции до внешних вызовов; быстрый запуск и Medusa job каждые 10 сек |
| Real time | SSE через BFF, проверка БД раз в 2 сек, соединение до 20 сек, автоматический reconnect |
| Telegram | Приватная группа/Topics, отдельная тема диалога, webhook с secret header и проверкой оператора |
| Переводы | Google Cloud Translation Basic v2, autodetection, существующий SR Latin helper |
| Admin | Medusa Container/Tabs/Table/Drawer/Input/Textarea/Select/Switch/Alert/Button/usePrompt |

Источник истины — PostgreSQL. Блокировки строк и SKIP LOCKED защищают очередь между workers;
сначала блокируется диалог, затем outbox. Redis остаётся в существующей инфраструктуре Medusa;
новая отдельная Redis-очередь не создаётся. Требуется работающий Medusa scheduler.

SSE использует стабильные message IDs и Last-Event-ID, передаваемый BFF. После разрыва все новые
сообщения возвращаются страницами по 100, включая очередь больше 100 строк. Недавние прежние
сообщения повторяются для обновления статусов; UI объединяет их по ID. После перезагрузки
показываются последние 100, более ранние доступны кнопкой. Список собственных диалогов ограничен 50.

## Покупатели, права и секреты

Customer ID и профиль берутся сервером из проверенной Medusa-сессии. При открытии/отправке профиль
обновляется; admin dialog также получает актуальные имя/email/телефон. Гость вводит имя 2–100 символов;
email и телефон независимо необязательны и валидируются. Guest proof — случайные 32 байта: SHA-256
в БД, HttpOnly/SameSite=Lax cookie `tb_chat_guest` (Secure в production), срок 30 дней.

Привязка гостя требует явного действия и обеих сессий. Старый proof отзывается. Проверка владельца
выполняется под блокировкой внутри чтения/мутации, поэтому запрос, начавшийся до claim, не получает
последующий доступ. Logout размонтирует приватный виджет и SSE; следующие запросы без customer-cookie
не имеют доступа. Вторая вкладка обновляет auth при возвращении фокуса/ошибке SSE. Открытый поток
ограничен 20 секундами; собственный механизм отзыва stateless JWT Medusa не добавляется.

Текст ограничен 1500 символами, не вставляется как HTML. PostgreSQL rate limit использует существующий
доверенный proxy-IP helper; не выставляйте внутренний backend-порт наружу в обход reverse proxy.
Webhook проверяет секрет, группу, тему/reply reference, enabled-оператора и роль; bots, forwarded/channel
messages игнорируются. Технические ошибки и журнал не содержат токенов, SQL или текстов сообщений.

Обычные настройки — JSONB с revision. Secrets — отдельная таблица AES-256-GCM с отдельным серверным
master key. Сохранённый token не возвращается API: UI показывает только факт наличия и поле замены.

| Роль | Доступ |
| --- | --- |
| viewer | Диалоги, история и показатели |
| operator | Плюс ответ, статус, отметка просмотренного, retry |
| manager | Плюс настройки, secrets, операторы и удаление |

Роли проверяются сервером на каждый запрос. Telegram ID разрешает ответы в группе, но сам по себе
не даёт Medusa-сессию. Доступность устанавливается вручную у enabled-оператора, не по подключению бота.
`delivered` не означает `read`. Непрочитанные в обзоре — customer messages, не отмеченные в админке.

## Таблицы и миграция

`backend/src/utils/chat/schema.ts` подключён к существующему `setup-reviews.ts`, как reviews/wishlist/banners.
CREATE TABLE/INDEX IF NOT EXISTS выполняется в общей транзакции с advisory lock. Повтор сохраняет
настройки. Отдельной ORM-миграции Medusa нет; `db:migrate` не заменяет этот setup.

| Таблица | Данные |
| --- | --- |
| tamir_chat_settings | JSONB config, revision, updated_at |
| tamir_chat_secret | Зашифрованные Telegram/Google/webhook secrets |
| tamir_chat_operator | Medusa/Telegram IDs, роль, enabled, available |
| tamir_chat_guest | Hash proof, контакты, expiry |
| tamir_chat_conversation | Владелец, номер, профиль, локаль/статус, товар, topic mapping |
| tamir_chat_message | Original/translation, языки, sender, timestamp, seq, status, idempotency key |
| tamir_chat_image | Приватный JPEG (bytea), размер; FK message_id, каскадное удаление |
| tamir_chat_outbox | attempts, next_at, done, безопасный error_code |
| tamir_chat_telegram_ref | Telegram ID каждого фрагмента → message |
| tamir_chat_update | Дедупликация update_id в пространстве бота |
| tamir_chat_event | Audit/ошибки без текста сообщений |
| tamir_chat_connection | Безопасные результаты проверок API |
| tamir_chat_rate | Rate-limit счётчики |

Удаление диалога каскадно удаляет messages/outbox/references/events. По умолчанию история удаляется
после 90 дней без активности; admin диапазон 7–730. Истечение 30-дневной guest session удаляет её
непривязанную историю через FK, даже при большем общем сроке. Покупатель и manager могут удалить
историю раньше. Telegram-копии и backups обслуживаются отдельно; UI предупреждает об этом.
Удаление Customer в другом разделе Medusa не запускает отдельный chat hook: при запросе удаления
персональных данных manager должен удалить и историю чата/Telegram; автоматический retention остаётся.

После отдельного разрешения на deploy, с проверенным окружением и резервной копией:

```bash
# backend
npx medusa db:migrate
npx medusa exec ./src/scripts/setup-reviews.ts
npm run build
```

Существующий deploy уже вызывает setup-reviews. При rollback кода сохраняйте таблицы/историю;
чат можно выключить. Бэкап БД без master key не восстанавливает provider secrets.

## Серверные параметры

Обычные настройки меняются через UI без перезапуска. Только инфраструктура/первичная установка:

| Переменная | Назначение |
| --- | --- |
| CHAT_ENCRYPTION_KEY | Backend, 64 hex, случайные 32 байта AES-256-GCM; необходим для записи secrets |
| CHAT_ADMIN_EMAILS | Bootstrap manager emails через запятую; fallback BANNER_ADMIN_EMAILS, затем admin@tamir.local |
| MEDUSA_PUBLIC_BACKEND_URL | Публичный HTTPS origin для webhook `/hooks/tamir-chat` |
| GOOGLE_TRANSLATE_API_KEY | Существующий backend fallback; зашифрованный ключ из UI приоритетнее |
| DATABASE_URL, REDIS_URL, JWT/COOKIE secrets, CORS | Существующая Medusa инфраструктура |
| MEDUSA_PROXY_BACKEND_URL | Существующий внутренний origin backend для Next BFF |
| NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY | Существующий публичный Store API key, не provider secret |

Master key можно создать на сервере через `openssl rand -hex 32`; хранить закрыто отдельно от БД,
с резервной копией, не в Git/PR. Замена требует перешифрования или повторного ввода provider keys.
Bootstrap manager сохраняет доступ независимо от operator row; отзыв bootstrap-прав требует изменения
серверного allowlist. Обычные операторы управляются полностью через UI.

## Telegram: установка

1. Создайте бота через официальный `@BotFather` (`/newbot`). Token введите только в
   **TAMIR Chat → Telegram → Bot Token → Сохранить / заменить токен**.
2. Создайте приватную supergroup, включите Topics. Добавьте бота администратором с правами отправки
   сообщений и управления темами. Оператор должен быть участником группы.
3. Укажите numeric Chat ID группы и Telegram User IDs операторов. Если ID неизвестны, получите их
   из Bot API update доверенным серверным инструментом до установки webhook. Не помещайте token
   в браузерный URL/логи/публичные ID-сервисы. `getUpdates` несовместим с активным webhook.
4. Сохраните Chat ID (обычно `-100…`), Topics и уведомления. **Проверить соединение** выполняет
   getMe/getChat/getChatMember/getWebhookInfo и проверяет приватность, форум и права.
   UI показывает bot name/ID, group name/ID, результат и время проверки.
5. Нажмите **Установить webhook**, затем **Тестовое сообщение**. Публичный HTTPS endpoint должен
   быть доступен Telegram без Cloudflare Access/логина. Секрет webhook генерируется сервером.
6. В **Операторы** добавьте имя, Telegram User ID, роль operator/manager и enabled. Для Medusa-доступа
   привяжите существующий Medusa User ID. Доступность поддержки задайте отдельно.
7. Включите Telegram и чат. На staging проверьте два покупателя и две независимые темы.

Тема: `#номер — имя — SR/EN`. Ответ — обычный текст внутри темы. Без Topics принимается только reply
на конкретное сообщение бота. После замены token установите webhook повторно. Смена бота/группы
сбрасывает mappings; новые темы создаются при следующей доставке, старые автоматически не удаляются.
Редактирование/удаление Telegram-сообщений и вложения не синхронизируются.

Первичный API: https://core.telegram.org/bots/api

## Google Cloud Translation

Реализация переиспользует Basic v2 API-key подход проекта. В **tamir-493911** администратор должен
включить Cloud Translation API, подключить Billing и выдать серверный API key, ограниченный
Cloud Translation API (и IP backend, если применимо). Введите его в **Переводы → Новый Google
Translation API key** либо используйте существующий серверный ключ. Service account JSON в UI не
загружается и для выбранного Basic v2 не нужен.

Выберите RU как язык оператора и SR/EN обслуживания. Кнопка **Проверить API / перевести** вызывает
реальный API и сохраняет состояние. Проверьте SR→RU, EN→RU, RU→SR, RU→EN. Исходный язык определяется
независимо от локали; операторский ответ использует текущую локаль диалога при обработке, SR — латиница.
При выключенном переводе оператор видит AUTO TRANSLATION DISABLED, клиент получает оригинал.

Реальные credentials/Billing в этой среде не предоставлены; их работоспособность не подтверждена.
API перевода не возвращает Project ID ключа: принадлежность ключа tamir-493911 проверяется в Google
Cloud, надпись в UI её не доказывает. Ошибки доступа/квоты/сети выдаются безопасными кодами. При сбое
ответ остаётся сохранённым; неподтверждённый перевод/русский оригинал скрыт от покупателя до обработки.

Первичный API: https://docs.cloud.google.com/translate/docs/reference/rest/v2/translate

## Medusa Admin

| Раздел | Функции |
| --- | --- |
| Обзор | Реальные total/today/active/closed/unread, SR/EN и ошибки; today по Белграду |
| Диалоги | Поиск имени/email/телефона, status/locale фильтры, пагинация, оригиналы/переводы, customer/product ссылки, reply/status/retry |
| Настройки чата | Enabled, гости, SR/EN title/button, положение, статус/контекст/уведомления, retention, preview |
| Telegram | Token, группа, Topics, уведомления, check/test/webhook |
| Автоматические сообщения | 6 текстовых шаблонов SR/EN и переключатель галочек доставки |
| Переводы | Включение, язык оператора, обслуживаемые языки, ключ, тест, API status |
| Операторы | Добавить/изменить/отключить, IDs, роли и доступность |
| История и статистика | Реальные события/ошибки, пагинация, переход к диалогу |

Backend читает актуальные настройки на запрос/обработку сообщения. Виджет обновляет config раз в
60 сек, доступность также по SSE. Конфликт revision отклоняется CHAT_SETTINGS_CHANGED; форма сохраняет
правки, загрузка сохранённого состояния требует подтверждения их потери. Произвольный CSS/HTML
не разрешён: title/button до 120, template до 1000 символов на язык.

Welcome/returning — обычные приветственные пузыри; returning выбирается при наличии прежнего
диалога. Offline/closed/reopened — компактные события с иконкой робота и подписью автоматического
уведомления, без оформления сообщения человека. Ошибка доставки — небольшая системная пометка
у сообщения. Closed/reopened сохраняются как system rows без outbox.

Sent никогда не выводится текстом в переписке. Его enabled управляет только двумя маленькими
галочками тёмной фуксии (#842154) рядом со временем исходящего сообщения при status=delivered,
включая изображения. Это доставка в Telegram, не прочтение оператором. Ожидающие и ошибочные
сообщения не получают галочки; входящие ответы оператора также без них. Старые поля текста sent
сохраняются для совместимости настроек, но редактор и виджет их не используют. Распознанные
system rows также учитывают enabled (по template_key или совпадению старого текста).
Настройки сохраняются общей кнопкой и приходят в открытый виджет с очередным обновлением config.

## API endpoints

Store API использует штатный publishable key и customer auth либо guest proof, серверно переданный
BFF. ID диалога не является доказательством доступа. Витрина обращается к `/api/chat/<action>` на
своём origin; BFF имеет allowlist, не проксирует произвольный путь.

| Метод | Путь | Назначение |
| --- | --- | --- |
| GET | /store/chat/config | Безопасная конфигурация |
| POST | /store/chat/session | Создать/восстановить, locale + optional guest |
| GET | /store/chat/conversations | Собственные диалоги |
| GET | /store/chat/messages?id=&before= | До 100 сообщений |
| POST | /store/chat/messages | id, text, UUID clientId |
| POST | /store/chat/image-message | id, text (может быть пустым), UUID clientId, image (data URL) |
| GET | /store/chat/image?id=&image= | Приватное изображение по ID диалога и сообщения; только владелец |
| GET | /admin/tamir-chat/image?id=&image= | Изображение для авторизованного участника поддержки |
| POST | /store/chat/context | id, locale, optional productId/variantId/path, серверная валидация товара |
| POST | /store/chat/claim | Явная привязка гостя к аккаунту |
| POST | /store/chat/reopen | Возобновление |
| POST | /store/chat/delete | Удаление своей истории |
| GET | /store/chat/stream?id= | SSE + Last-Event-ID |
| POST | /hooks/tamir-chat | Telegram secret-header webhook |
| GET | /admin/tamir-chat/access | Права |
| GET/POST | /admin/tamir-chat/settings | Config/revision; manager |
| POST | /admin/tamir-chat/secrets | Write-only replacement; manager |
| POST | /admin/tamir-chat/telegram-check, telegram-test, telegram-webhook | Проверки/подключение; manager |
| POST | /admin/tamir-chat/translation-test | text/target; manager |
| GET/POST | /admin/tamir-chat/operators | Операторы; manager |
| GET | /admin/tamir-chat/conversations | search/status/locale/offset, до 30 |
| GET | /admin/tamir-chat/dialog?id=&before= | Профиль и история |
| POST | /admin/tamir-chat/status, seen, reply, retry | Рабочие действия; operator+ |
| POST | /admin/tamir-chat/delete | Удаление; manager |
| GET | /admin/tamir-chat/overview, history?offset= | Агрегаты/события |

## Проверки и ограничения

Подтверждённый прогон реализации 7 ноября 2026:

- Node 20.20.2/24.22.1: 308 frontend и 91 backend no-db тест прошли.
- 14 SQL/provider-boundary сценариев на PGlite (PostgreSQL WASM), обе Node: isolation/claim,
  idempotency, translation/Telegram failure+retry, webhook/roles, retention и replay >100 сообщений.
- TypeScript backend, ESLint frontend, Next production build через `--webpack` (node_modules вне
  worktree), Medusa backend/admin build прошли.
- Новый `integration-tests/http/tamir-chat.spec.ts` включён в discovery, но локально не запускался:
  нет native PostgreSQL 16/Redis test stack. PGlite не заменяет проверку нескольких PostgreSQL workers.
- Chromium: SR/EN на 390/1440 px, имя без контактов, восстановление истории, SSE reconnect/dedup,
  контекст товара, XSS как текст, авторизованный вход без формы и очистка после logout — прошли.
  В админке прошли сохранение, форма оператора, просмотр оригинала/перевода, закрытие и ошибки
  Telegram/Google; горизонтального переполнения страницы нет. Проверены настоящие компоненты
  React/Medusa с подменёнными API/auth boundaries; это не live E2E Telegram/Google.
  Светлый вид проверен визуально. Отдельная проверка dark theme остаётся для staging.

```bash
# frontend
npm test
npm run lint -- --quiet
# backend
npm run test:cjs -- --list
npm run test:cjs -- --no-db --junit-dir=reports
# Только изолированная *_test БД и Redis:
npm run test:cjs -- --db-only --junit-dir=reports
npm run test:integration:http -- --runTestsByPath integration-tests/http/tamir-chat.spec.ts
```

Перед включением остаются: реальный bot/private group/Topics, Google credentials/Billing,
native PostgreSQL multiworker и HTTP-suite, SSE через staging Nginx/Cloudflare без buffering,
два независимых покупателя в браузерах и действующий Medusa scheduler. Production не разворачивался.

Известные ограничения:

- Telegram sendMessage/createForumTopic не имеют idempotency key: внешняя доставка **at least once**.
  При обрыве после принятия Telegram возможен дубль сообщения/темы. Внутри сайта clientId/update_id
  дедуплицируются; exactly once не заявляется.
- 8 попыток с exponential backoff от 10 сек; затем manual retry из админки. При выключенной
  интеграции сообщения остаются в очереди. Перевод сохраняется и переиспользуется при retry Telegram.
- Только текст до 1500 символов; нет typing, вложений, автоматического Online и read receipts.
- История/статистика ограничены retention. Telegram-копии и backups удаляются отдельно.
- Заголовок существующей темы автоматически не переименовывается; актуальные locale/profile
  указываются в следующих сообщениях.

## Изменённые файлы

Новые: `backend/src/utils/chat/{schema,security,settings,conversations,providers,delivery,http}.ts`,
`backend/src/shared/chat-config.ts`, `backend/src/jobs/tamir-chat.ts`,
`backend/src/api/admin/tamir-chat/[action]/route.ts`, `backend/src/api/store/chat/[action]/route.ts`,
`backend/src/api/store/chat/stream/route.ts`, `backend/src/api/hooks/tamir-chat/route.ts`,
`backend/src/admin/routes/tamir-chat/{page.tsx,settings.tsx,chat-admin.css}`,
`frontend/src/app/api/chat/[...path]/route.ts`, `frontend/src/components/chat/{ChatWidget.tsx,chat-client.ts,chat.css}`,
`backend/tests/tamir-chat.test.cjs`, `backend/tests/tamir-chat.integration.cjs`,
`backend/integration-tests/http/tamir-chat.spec.ts`, `frontend/tests/tamir-chat.test.mjs`,
этот документ и `openspec/specs/tamir-chat/spec.md`.

Изменены: backend middlewares/setup-reviews и README jobs/scripts;
frontend StoreProviders/ProductDetails, SR/EN dictionaries; docs index/TESTING.


## Ввод, автоматические сообщения и изображения

Enter отправляет, Shift+Enter добавляет строку; ввод через IME и удержание Enter не создают повторных отправок.
Форма использует отдельные строки для статуса, вложения и ввода. Автоматические сообщения отображаются
в пузырях; шаблон выбирается по ключу на текущей SR/EN локали, без обращения к Google.
Новые закрытия/возобновления сохраняют `template_key`; старые записи восстанавливают ключ при совпадении
с текущим шаблоном. Исторический вручную изменённый текст, который уже не совпадает с шаблоном, сохраняется.

Покупатель может приложить одну статичную JPG/PNG/WebP картинку, с текстом или без него. Лимит исходного
файла 5 MiB, 20 мегапикселей, соотношение сторон не более 20:1. SVG, GIF, анимация и другие файлы запрещены.
Сервер декодирует изображение через sharp, удаляет метаданные, учитывает ориентацию и сохраняет JPEG
до 1600×1600 и 2 MiB. Ограничение: 10 запросов загрузки/минуту и 50 изображений на диалог.

Изображение, сообщение и outbox сохраняются одной транзакцией. Повтор с тем же clientId не создаёт копию.
Telegram получает файл через multipart sendPhoto в тему диалога; изображение не отправляется на перевод.
Текстовая подпись переводится обычным путём. Сбой Telegram оставляет вложение в очереди для повторной доставки.
Как и текстовая доставка, Telegram имеет семантику at-least-once: таймаут после принятия фото Telegram может
привести к повтору. При подтверждённой отправке служебного текста он не повторяется при повторе фото.

Файлы хранятся в PostgreSQL отдельно от строк сообщений: SSE и списки не содержат бинарные данные.
GET изображения проверяет владельца либо права поддержки; ответы private/no-store, nosniff.
Удаление истории и retention удаляют файлы каскадно. Резервные копии БД и Telegram-копии обслуживаются отдельно.
Загрузка в этой версии идёт с сайта в Telegram; ответы оператора из Telegram остаются текстовыми.

Для обновления установить backend зависимости (`npm ci`) и выполнить существующий `setup-reviews.ts`
перед запуском приложения. Он идемпотентно добавляет `has_image`, `template_key` и `tamir_chat_image`.
Новых секретов или переменных окружения не требуется. Если перед приложениями стоит nginx/иной proxy,
разрешить тело запроса не менее 7 MiB для `/api/chat/image-message` и `/store/chat/image-message`;
остальные chat API сохраняют ограничение 8 KiB. Увеличение размера БД нужно учитывать в резервных копиях.
