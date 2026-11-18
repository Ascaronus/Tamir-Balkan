# Tasks: fix-rozetka-feed-default-url

## 1. Код

- [x] 1.1 `src/shared/rozetka-import.ts`: `DEFAULT_XML_URL` → `https://tamir.ua/rozetka/`
- [x] 1.2 Проверить, что другие места адрес не дублируют: `src/admin/routes/rozetka/page.tsx`,
      `src/admin/routes/rozetka/settings/route.ts`, `src/utils/rozetka-preview.ts` и
      `src/scripts/fix-rozetka-sku.ts` наследуют константу
- [x] 1.3 `src/scripts/import-rozetka-xml.ts`: литерал fallback (`ROZETKA_XML_URL || "..."`)
      заменён на `DEFAULT_XML_URL`, второго места с адресом в коде не осталось
- [x] 1.4 `git grep -n "/ua/ro[e]tka/" -- backend` — пусто (в шаблоне `[e]`, чтобы строка самой
      команды не совпадала с шаблоном); `npx tsc --noEmit -p backend/tsconfig.json`
      — только предсуществующие ошибки (`sharp`, отсутствующие сгенерированные типы `.medusa`)

## 2. Тесты

- [x] 2.1 `tests/rozetka-admin.test.cjs`: ожидания дефолта (`ROZETKA_SOURCE`, GET settings без
      настройки) переведены на `https://tamir.ua/rozetka/`
- [x] 2.2 `tests/rozetka-admin.test.cjs`: POST-тесты сохраняют заведомо другой адрес
      (`https://www.tamir.ua/rozetka/`), иначе проверка записи обесценилась бы
- [x] 2.3 Тест «разные источники — разные снимки» переведён на `https://www.tamir.ua/rozetka/`
      вместо чужой выгрузки
- [x] 2.4 Список заведомо запрещённых URL (`http://127.0.0.1/feed`, `https://evil.test/xml`,
      `https://user:pass@tamir.ua/rozetka/`) не ослаблен
- [x] 2.5 `tests/rozetka-sku.test.cjs` и `tests/rozetka-native.ts`: упоминаний чужого адреса нет,
      менять нечего (отдельного теста предпросмотра в репозитории нет)
- [x] 2.6 Прогон `npm --prefix backend run test:cjs -- --no-db`: `rozetka-admin` и `rozetka-sku`
      вместе 34/34; весь прогон 121 тест, 119 проходят, 2 предсуществующих фейла (`sharp`,
      `/0,00/`) — как в baseline

## 3. Спека и артефакты OpenSpec

- [x] 3.1 Дельта `specs/rozetka-import/spec.md`: MODIFIED «Import source URL configuration» +
      сценарии «Empty configuration», «Defaults agree across the import paths»,
      «Saved address wins over the default»
- [x] 3.2 Живая спека `openspec/specs/rozetka-import/spec.md` синхронизирована с дельтой в этом же
      PR (иначе действующая спека останется с неверным MUST)
- [x] 3.3 Артефакты незаархивированного изменения `fix-rozetka-sku-from-url`: адрес чужой
      выгрузки убран из текста (`proposal.md`, `design.md`, `tasks.md`), «живой фид» заменён на
      украинскоязычную выгрузку, добавлен замер рабочего фида
- [x] 3.4 Архив `openspec/changes/archive/**` не изменён
- [x] 3.5 `npx openspec validate fix-rozetka-feed-default-url --strict` — проходит

## 4. Документация

- [x] 4.1 `docs/IMPORT-MODES.md`: примеры `ROZETKA_XML_URL` → рабочий адрес; убраны ложные
      утверждения, что дефолт CLI «старый» и что «нужно задавать украинский источник явно»
- [x] 4.2 `docs/IMPORT-MODES.md`: предупреждение про ключ `rozetka_product_key` переписано без
      адреса чужой выгрузки, но с фактом «разные выгрузки → разные ключи»
- [x] 4.3 `docs/IMPORT-MODES.md`: раздел ретро-скрипта — источник по умолчанию описан как
      `DEFAULT_XML_URL`, тот же, что у админки и CLI
- [x] 4.4 `docs/ROZETKA-ADMIN-IMPORT.md`: дефолт в админке описан как `https://tamir.ua/rozetka/`
- [x] 4.5 `git grep -n "/ua/ro[e]tka/" -- . ":!openspec/changes/archive"` — пусто; в архиве —
      3 упоминания (`2026-10-27-document-current-behavior`), они не правятся

## 5. Проверка на стейдже (без записи в БД)

- [x] 5.1 Подтверждено, что менять данные не нужно: в `store.metadata.rozetka_source_url` стейджа
      уже лежит `https://tamir.ua/rozetka/`
- [x] 5.2 Подтверждено, что живые карточки стейджа не относятся к чужой выгрузке: 15 из 16
      точных совпадений с рабочим фидом, 0 из 16 — с чужой
- [x] 5.3 Проверено глазами на стейдже 18.11.2026 (оператор): `/admin/settings/rozetka` показывает
      в поле источника `https://tamir.ua/rozetka/` — дефолт подействовал. Стенд к этому моменту
      стоял на релизе `20261118T151630Z-6a239a73b18e` (это мерж #122), и в его коде
      `DEFAULT_XML_URL = "https://tamir.ua/rozetka/"`, а чужого адреса в `backend/src` нет
