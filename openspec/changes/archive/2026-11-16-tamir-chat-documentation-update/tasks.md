# Tasks

## 1. Audit of the actual state of the chat code and documentation

- [x] 1.1 Восстановить состав изменений чата по git-истории PR #96, #110, #111, #112, #113, #114 (`git log --grep` по merge-коммитам и diff соответствующих веток относительно main) и составить список затронутых файлов/поведений; проверить, какие из PR уже объединены в `main` на момент выполнения. **Сделано**: все перечисленные PR уже в `origin/main` (tip `218d8fb` = merge PR #117; чат-галочки PR #114 = `70b8d95`); состав изменений зафиксирован в аудите `docs/TAMIR-CHAT-AUDIT-2026-11.md` §1.
- [x] 1.2 Составить фактический перечень компонентов чата (`backend/src/utils/chat/*`, `backend/src/jobs/tamir-chat.ts`, маршруты `backend/src/api/store/chat/*`, `backend/src/api/admin/tamir-chat/*`, `backend/src/api/hooks/tamir-chat/*`, `frontend/src/components/chat/*`, `frontend/src/app/api/chat/*`) и сверить его с перечнем файлов в `docs/TAMIR-CHAT.md`; зафиксировать расхождения (в т.ч. отсутствующие в документе `images.ts`, `http-errors.ts`). **Сделано**: фактический путь модулей — `backend/src/lib/tamir-chat/*` (не `utils/chat`), job — `src/jobs/tamir-chat-delivery*` (10 с, секции `tamir-chat-jobs.json`), BFF — `frontend/src/app/chat/*` + `src/api/chat/telegram-webhook`; в документации перечислены `images.ts`, `http-errors.ts`, `guards`, `session`, `product-context`, `transport`, `telegram-sync`, `telegram-webhook`, `translations`, `templates`, `overview` + 13 таблиц `tamir_chat_*`.
- [x] 1.3 Собрать фактический перечень тестовых наборов чата (`backend/tests/tamir-chat*.cjs`, `backend/integration-tests/http/tamir-chat.spec.ts`, `frontend/tests/tamir-chat.test.mjs`) и сверить с каталогом `docs/TESTING.md`; зафиксировать отсутствующие позиции и корректные команды запуска. **Сделано**: каталог `docs/TESTING.md` дополнен всеми чат-тестами (`tamir-chat.test.cjs`, `tamir-chat-http-errors.test.cjs`, `tamir-chat-images.test.cjs`, `tamir-chat.integration.cjs`, HTTP-спека Jest, `frontend/tests/tamir-chat.test.mjs`, guard `scripts/check-chat-origin.mjs`) с командами; исторические «Замер» сохранены, добавлено дополнение 16.11.2026.
- [x] 1.4 Сверить утверждения `docs/TAMIR-CHAT.md` (эндпоинты, настройки, переменные окружения, команды) с кодом и фиксацией требований `openspec/specs/tamir-chat/spec.md`; составить план правок по каждому расхождению. **Сделано**: расхождения (ENV-переменные провайдеров, коды ошибок, лимиты, семантика галочек, пагинация) перечислены в аудите §2/§9; правки выполнены по §2 ниже.

## 2. Update docs/TAMIR-CHAT.md

- [x] 2.1 Обновить раздел архитектуры и перечень файлов чата в `docs/TAMIR-CHAT.md` по итогам аудита 1.2 (добавить `images.ts`, `http-errors.ts` и другие недостающие компоненты) и проверить, что каждый упомянутый путь существует в репозитории. **Сделано** (правка поверх baseline `218d8fb`): раздел архитектуры приведён к фактическим путям `src/lib/tamir-chat/*`, BFF `app/chat/*`, job `tamir-chat-delivery*`, 13 таблиц `tamir_chat_*`.
- [x] 2.2 Обновить разделы поведения (отправка изображений, обработка HTTP-ошибок, Telegram-настройки, BFF-прокси/origin) по итогам аудита 1.1 и проверить, что в документе не осталось утверждений, противоречащих текущему коду. **Сделано**: точные лимиты 40/120/15/10/20, коды ошибок shipped-API, семантика двух галочек доставки (не «прочитано»), настройки провайдеров через admin UI + `tamir_chat_secret` (ENV `TELEGRAM_*`/`GOOGLE_*` не используются), origin-гард BFF.
- [x] 2.3 Проверить команды и эндпоинты в `docs/TAMIR-CHAT.md`: каждая команда выполняется из указанного каталога, каждый эндпоинт существует в коде маршрутов. **Сделано**: добавлен блок команд тестов (`node --test`, `TEST_REVIEWS_DB_URL` для БД-спеки, Jest HTTP-спека, `check-chat-origin.mjs`); эндпоинты сверены с `src/api/**` и `frontend/src/app/chat/*`.

## 3. New documentation from the audit results

- [x] 3.1 Создать недостающие документы по темам, выявленным аудитом 1.4 (например, руководство разработчика по чату и/или описание Telegram-настроек), с перекрёстными ссылками из `docs/TAMIR-CHAT.md`; проверить, что каждый новый файл существует в `docs/` и на него ведёт ссылка из основного документа. **Решение по итогам аудита TB‑21**: отдельного «руководства разработчика» не заводим — один канонический документ `docs/TAMIR-CHAT.md` (требование спеки) расширен разделами про Telegram-настройки, шаблоны, метрики/производительность и лимиты; вместо него добавлен `docs/TAMIR-CHAT-AUDIT-2026-11.md` (отчёт аудита) и на него ведут ссылки из `docs/TAMIR-CHAT.md`.

## 4. Chat test catalogue in docs/TESTING.md

- [x] 4.1 Добавить отсутствующие чат-тесты (unit: `tamir-chat-http-errors.test.cjs`, `tamir-chat-images.test.cjs`; frontend: `frontend/tests/tamir-chat.test.mjs`; при наличии — интеграционные) в соответствующие таблицы `docs/TESTING.md` с командами запуска и проверить выполнение каждой команды в указанном каталоге. **Сделано**: каталог приведён к `218d8fb` (48 frontend / 19 backend unit / 12 db-integration заголовков, новые строки чат-тестов, HTTP-спеки, guard-скрипт); команды прогонов §5.1–5.4 аудита выполнены пользователем 2026‑11‑16.

## 5. Final cross-check

- [x] 5.1 Пройти чек-лист требований дельты `specs/tamir-chat/spec.md`: один канонический документ, полное покрытие компонентов, соответствие коду, полнота каталога тестов; зафиксировать результат сверки с `openspec/specs/tamir-chat/spec.md` (требования спецификации поведения и документация не противоречат друг другу). **Сделано**: документ один, покрытие полное, каталог тестов полный; противоречий нет. Остаточный формальный дефект — 3 требования `openspec/specs/tamir-chat/spec.md` без сценариев («Authenticate Telegram replies», «Native administrative control», «Localized and recoverable widget»); по решению design.md спека в этом change не раздувается, исправление — при синхронизации change.

## Workflow follow-up

- После объединения PR #112–#114 при необходимости повторить точечную сверку п. 1.1–1.2 с `main`.
- Архивировать изменение (`openspec archive tamir-chat-documentation-update`) после выполнения задач и прохождения ревью.
