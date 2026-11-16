# Proposal

YouTrack: **TB-11 — OpenSpec: Обновление документации в TAMIR** (написание новой документации по TAMIR Chat).

## Why

Документация по TAMIR Chat (`docs/TAMIR-CHAT.md`, раздел в `docs/TESTING.md`) писалась во время реализации PR #96 и с тех пор обновлялась частичными вставками от PR #97, #110, #111 и не влитых PR #112–#114. В коде чата уже есть компоненты, которых нет в документах (например `backend/src/utils/chat/images.ts`, `http-errors.ts`, тесты `tamir-chat-http-errors.test.cjs`, `tamir-chat-images.test.cjs`, `frontend/tests/tamir-chat.test.mjs` не каталогизированы в `docs/TESTING.md`), а часть утверждений устарела. Нужен аудит и единый актуальный документ, синхронный с текущим кодом и спекой `openspec/specs/tamir-chat/spec.md`.

## What Changes

- Аудит фактического состояния кода чата: git-история PR #96 (базовая реализация), #97, #110–#114 (исправления composer/изображений, HTTP 413, Telegram settings/webhook, Origin BFF), список файлов чата, тесты и их слои.
- Обновление `docs/TAMIR-CHAT.md` до статуса «единый актуальный документ по TAMIR Chat»: покрытие всех компонентов чата (backend-модули, API-маршруты, job, Medusa Admin, BFF-прокси, виджет), таблиц, переменных окружения, эндпоинтов, проверок и ограничений — по фактическому коду, без устаревших утверждений.
- Новая редакция/новые разделы документации там, где текущий документ не покрывает компоненты и исправления после #96 (изображения, composer, 413, webhook-повторы, Origin-политика BFF).
- Дополнение `docs/TESTING.md`: каталог чат-тестов (`tamir-chat.test.cjs`, `tamir-chat-images.test.cjs`, `tamir-chat-http-errors.test.cjs`, `tamir-chat.integration.cjs`, `http/tamir-chat.spec.ts`, `tamir-chat.test.mjs`) со слоями и границами.
- Сверка результатов с `openspec/specs/tamir-chat/spec.md`: документация обязана описывать поведение, соответствующее спеке; расхождения spec↔код выносятся отдельно (не правятся молча).
- БЕЗ изменений кода, миграций, конфигурации и главных спек `openspec/specs/` (они обновляются только sync/archive).

## Capabilities

### New Capabilities

(нет — capability чата уже существует)

### Modified Capabilities

- `tamir-chat`: добавляются требования об актуальности и полноте документации чата (единый актуальный документ, покрытие всех компонентов чата, сверка фактов с текущим кодом, включение чат-тестов в каталог `docs/TESTING.md`). Поведенческие требования спек (изоляция истории, доставка, webhook, admin, виджет, retention) не меняются — дельта содержит только ADDED Requirements о документации как артефакте сопровождения capability.

## Impact

- Затрагиваемые файлы (будущая реализация): `docs/TAMIR-CHAT.md`, `docs/TESTING.md`; возможно `docs/README.md` (индекс документации).
- Источник истины для аудита: `backend/src/utils/chat/*`, `backend/src/jobs/tamir-chat.ts`, `backend/src/api/{admin/tamir-chat,store/chat,hooks/tamir-chat}/*`, `backend/src/admin/routes/tamir-chat/*`, `frontend/src/components/chat/*`, `frontend/src/app/api/chat/*`, тесты чата; git-история `aeca346` (#96), `d2e6aa3` (#97), `6a84f6c` (#110), `739ae26` (#111) и PR #112–#114 на GitHub (локально видна ветка `fix/chat-bff-public-origin`, её merge ожидается в main).
- Соседнее изменение `openspec/changes/tamir-chat-production-audit/` (аудит боевого окружения чата) не затрагивается; при пересечении находок этот документ ссылается на него, а не дублирует.
- Код, схема БД, секреты и деплой не затрагиваются; токены и ключи в документацию не попадают (фиксируется только факт наличия секретов, как сейчас).

## Assumptions

- «Новая документация» = обновлённый единый `docs/TAMIR-CHAT.md` (plus разделы в `docs/TESTING.md`), а не новый набор разрозненных файлов; при аудите допускается вынос крупных справочников в дочерние файлы `docs/` с сохранением единой точки входа.
- PR #112–#114 на момент планирования ещё не влиты в `main` (локально есть только `fix/chat-bff-public-origin`); аудит обязан учесть их состояние как «открытые/ожидающие слияния» и обновить документ по факту слияния.
- Реальные Telegram/Google credentials не проверяются и в документах не появляются; границы «live E2E не выполнялся» сохраняются как честная маркировка.
