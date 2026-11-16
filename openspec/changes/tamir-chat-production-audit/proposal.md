# Proposal

## Why

TAMIR Chat работает в проде (tamir.rs), но его поведение задокументировано лишь по частям — отдельными фиксами и коммитами; единого актуального описания всего функциона нет. Задача TB-21 (YouTrack) требует зафиксировать ФАКТИЧЕСКОЕ текущее поведение (источник истины — код) в OpenSpec-спецификации, провести аудит по чек-листу, зафиксировать текущий UI и только после этого чинить подтверждённые дефекты. Данный change — планирование этого аудита; код он пока не меняет.

## What Changes

- Полный аудит чата по чек-листу TB-21: виджет, гость/аккаунт, сообщения (лимит 1500 символов), изображения (вход ≤5 MiB, ≤20 Мп, нормализация в JPEG ≤2 MiB), история, Telegram (топики, webhook, ошибки), перевод (Google, проект `tamir-493911`, язык оператора `ru`), статусы доставки, Medusa Admin.
- Дельта-спека возможности `tamir-chat`: уточнение 7 существующих требований по фактам, подтверждённым кодом (гост-сессии и claim, outbox-доставка со статусами, webhook-проверки, admin-операции, SSE/виджет, статусы и retention, изображения), плюс 2 новых требования: витринный BFF-прокси `/api/chat/*` и rate-limit/контракт ошибок.
- Сверка `docs/TAMIR-CHAT.md` и смежных документов с кодом; расхождения — в отчёт аудита.
- Фиксация ТЕКУЩЕГО UI чата в Figma как базовой линии (ссылки/ноды — в design.md).
- Анализ покрытия чата тестами и дописывание недостающих тестов по `docs/TESTING-RULES.md` на существующей инфраструктуре (frontend: `node --test` в `frontend/tests/*.test.mjs`; backend: `backend/tests/*.test.cjs` / `*.integration.cjs`, Jest `integration-tests/http`).
- Отчёт о подтверждённых дефектах; исправления — ТОЛЬКО подтверждённых дефектов, отдельным финальным этапом.
- Плановых breaking-изменений нет; всё, что изменит поведение, — только дефекты, подтверждённые аудитом.

## Capabilities

### New Capabilities

- (нет — всё остаётся внутри существующей границы `tamir-chat`)

### Modified Capabilities

- `openspec/specs/tamir-chat/spec.md` (`tamir-chat`): уточнение требований «Isolate customer and guest history», «Durable delivery», «Authenticate Telegram replies», «Native administrative control», «Localized and recoverable widget», «Honest status and retention», «Private image attachments» по фактам из кода; добавлены требования «Storefront chat proxy» и «Chat rate limits and error contract».

## Impact

- Код (только на этапе исправлений, позже): `backend/src/utils/chat/*`, `backend/src/api/store/chat/*`, `backend/src/api/admin/tamir-chat/*`, `backend/src/api/hooks/tamir-chat/*`, `backend/src/jobs/tamir-chat.ts`, `backend/src/shared/chat-config.ts`, `backend/src/api/middlewares.ts`, `frontend/src/components/chat/*`, `frontend/src/app/api/chat/[...path]/route.ts`.
- Документация: `docs/TAMIR-CHAT.md`, отчёты в `docs/`.
- Тесты: `frontend/tests/**` (unit/handler/component, `node --test`), `backend/tests/**` + `backend/integration-tests/http/**`.
- Figma: фиксация текущего UI чата (без редизайна).
- Схема БД (`tamir_chat_*`) меняться не планируется; секреты (токен бота, ключи) в артефакты не попадают — только имена переменных окружения.
