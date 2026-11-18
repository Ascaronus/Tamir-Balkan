# Tasks

Реализация выполнена в этом же change (TB-24); чекбоксы отмечает ведущий сессии по мере
подтверждения пунктов.

## 1. Вспомогательные функции и тесты (`backend/src/utils/rozetka.ts`)

- [x] 1.1 `skuToken(value)`: NFKD, снятие диакритики, всё кроме `[A-Za-z0-9]` → `-`, сжатие и
  обрезка дефисов, верхний регистр. Проверка: юнит-тесты (`baf-tmr-1black.html`-подобные входы,
  кириллица, дефисы).
- [x] 1.2 `articleFromOfferUrl(url)`: последний сегмент пути без `.html`/`.htm` (URL или голый
  путь, `decodeURIComponent`), через `skuToken`; не-латиница (кириллица) или пусто → `""`.
  Проверка: тесты `https://tamir.ua/aksessuary/sharfy/baf-tmr-1black.html` → `BAF-TMR-1BLACK`,
  кириллический путь → `""`.
- [x] 1.3 `isOneSize(size)`: пусто, `One size`, `one_size`, `OS`, `edini`, `univer`, «без размера»,
  «один размер» и т. п. — `true`. Проверка: табличные тесты на русском/украинском/сербских вариантах.
- [x] 1.4 `legacySkuFromOffer(offer)`: прежняя формула `skuToken(offer.id)` — сохранена как
  fallback и для мет. Проверка: тест совпадения с прежним поведением.
- [x] 1.5 `rozetkaSku(offer, size)`: `АРТИКУЛ-РАЗМЕР` (верхний регистр); One Size → только
  артикул; нет артикула/суффикса → прежний SKU из `offer_id`. Проверка: тесты
  `shtani-tmr-2211m43021-siri.html` + `48` → `SHTANI-TMR-2211M43021-SIRI-48`;
  `baf-tmr-1black.html` + «нет размера» → `BAF-TMR-1BLACK`; оффер без `<url>` → legacy SKU.

## 2. Путь админского импорта (`POST /admin/rozetka/import`)

- [x] 2.1 `src/utils/rozetka-preview.ts`: `SourceVariant.sku` считается через `rozetkaSku(offer, size)`,
  в снимок добавлены `article`/`legacy_sku`. Проверка: предпросмотр кириллического фида показывает
  SKU вида `АРТИКУЛ-РАЗМЕР`, а не цифры из UUID.
- [x] 2.2 `src/utils/rozetka-admin.ts`: запись варианта использует SKU из снимка; конфликты SKU
  отсекаются до записи (`draftErrors` + проверка занятости SKU с `409`). Проверка: тест
  `tests/rozetka-admin.test.cjs` на коллизию → `409` «SKU … уже используется другим вариантом».
- [x] 2.3 Повторяемость SKU в черновике/предпросмотре не создаёт дублей карточек. Проверка:
  существующие тесты `tests/rozetka-admin.test.cjs` (`action: "replayed"`) проходят с новой формулой.

## 3. CLI-импорт (`npm --prefix backend run import:rozetka:xml`)

- [x] 3.1 `src/scripts/import-rozetka-xml.ts`: SKU через тот же `rozetkaSku(o, size)`;
  кириллические/битые `<url>` дают fallback на `legacySkuFromOffer`. Проверка: формула сверена на
  живом фиде (821 оффер → 821 SKU из артикулов, см. 7.3).
- [x] 3.2 Решение по внутренним коллизиям фида: отдельный стопор в CLI не добавлен — карта остатков
  `skuToStock` (`src/scripts/import-rozetka-xml.ts:571`) и так ключуется SKU, а живые данные дают ноль
  коллизий; риск зафиксирован в design.md. Проверка: тест на отсутствие коллизий в снимке
  (`tests/rozetka-admin.test.cjs`, два товара с размером 58).

## 4. Мета варианта

- [x] 4.1 В `metadata` варианта оба пути пишут `rozetka_offer_id`, `rozetka_article`,
  `rozetka_legacy_sku`; при отсутствии артикула `rozetka_article` — пустая строка.
  Проверка: тесты путей импорта читают мету созданных вариантов.
- [x] 4.2 Тип `SourceVariant` (`backend/src/shared/rozetka-import.ts`) несёт `article?`/`legacy_sku?`
  и они доступны админке/CLI без повторного парсинга фида. Проверка: типы компилируются, снимок
  содержит поля.

## 5. Скрипт ретро-фиксации (`npm --prefix backend run fix:rozetka:sku`)

- [x] 5.1 Новый `src/scripts/fix-rozetka-sku.ts` + npm-script: загрузка свежего фида, сопоставление
  импортированных вариантов по `rozetka_offer_id` (вторично — `rozetka_legacy_sku` и текущий `sku`).
- [x] 5.2 Dry-run по умолчанию: отчёт «старый SKU → новый SKU», база не меняется; применение только
  при `ROZETKA_SKU_FIX_APPLY=true`; работа под `withImportLock`. Проверка на живой БД: прогон на
  стейдже (7.4).
- [x] 5.3 Офферы вне свежего фида не трогаются; новый занятый SKU — конфликт, не применяется,
  попадает в отчёт (`conflicts`, `stale`). Проверка на живой БД: прогон на стейдже (7.4).
- [x] 5.4 Перенос инвентарного элемента на новый SKU без потери остатков/резервов
  (`sku` инвентарного элемента обновляется, уровни склада не пересоздаются). Проверка на живой БД:
  до/после на стейдже (7.4).
- [x] 5.5 Идемпотентность: повторный прогон с применением — ноль изменений (`unchanged`).
  Проверка на живой БД: второй прогон на стейдже (7.4).

## 6. Документация

- [x] 6.1 `docs/ROZETKA-ADMIN-IMPORT.md`: новая формула SKU, fallback, мета варианта, поведение при
  коллизии. Проверка: документ сверен с кодом `rozetka.ts`/`rozetka-admin.ts` (матчинг варианта по
  `rozetka_offer_id` + fallback по SKU, `409` на занятый SKU, предупреждение предпросмотра при
  отсутствии латиницы в `<url>`, разовый `409` fingerprint для старых черновиков).
- [x] 6.2 `docs/IMPORT-MODES.md`: та же формула для CLI-импорта, запуск и флаги `fix:rozetka:sku`
  (`ROZETKA_SKU_FIX_APPLY`) и обязательный порядок «ретро-фиксация → импорт». Проверка: команды из
  документа совпадают с `backend/package.json` (`fix:rozetka:sku`), сопоставление варианта в CLI
  описано по SKU с fallback по `Size` (`import-rozetka-xml.ts:747`).

## 7. Проверки

- [x] 7.1 `npm --prefix backend run test:cjs -- --no-db` — 121 тест, 119 pass; 2 фейла
      предсуществующие и к задаче не относятся (`Cannot find module 'sharp'` в
      `tests/tamir-chat-images.test.cjs`, регулярка `/0,00/` в `tests/order-email.test.cjs`).
      До правок база была 108/106/2.
- [x] 7.2 `npx openspec validate fix-rozetka-sku-from-url --strict` — без ошибок.
- [x] 7.3 Сверка формулы по украинскоязычной выгрузке старого каталога (2 444 681 Б, 821 оффер,
      322 уникальных артикула): хелперы из `src/utils/rozetka.ts` дают 821 уникальный SKU из 821,
      0 коллизий, 0 офферов без артикула, `One Size` — 194, максимальная длина SKU 49 символов;
      примеры из таски совпали (`BAF-TMR-1BLACK`, `SHTANI-TMR-2211M43021-SIRI-48`).
- [x] 7.4 `fix:rozetka:sku` (dry-run, затем применение) на стейдж-БД: 821 строка сопоставлений,
      ноль конфликтов, `reserved_quantity` и уровни склада не меняются, второй прогон — ноль
      изменений. Делается вместе с выкаткой на стейдж.
      Прогон 18.11.2026 на релизе `20261118T120557Z-c43437c11af7`: фид отдал 322 товара / 821 оффер,
      dry-run — `16 SKU rewrites, 0 conflicts, 805 feed offers without a stored variant,
      0 offers gone from the feed, 16 inventory items to sync`; применение
      (`ROZETKA_SKU_FIX_APPLY=true`) — те же 16 переписываний и 0 коллизий; повторный dry-run — `0 SKU rewrites,
      16 already correct, 0 inventory items to sync`. Проверка БД после применения: 16 вариантов с
      SKU из `<url>` (`SHAPKA-TMR-43BLACK`, `SHAPKA-BAF-TMR-77BLUE`, ...), дублей нет,
      `metadata.rozetka_article` и `rozetka_legacy_sku` проставлены у всех 16, расхождение
      `inventory_item.sku` с вариантом — 0, уровней склада 16, `sum(stocked_quantity)` = 30 и
      `sum(reserved_quantity)` = 0 — как до прогона.
