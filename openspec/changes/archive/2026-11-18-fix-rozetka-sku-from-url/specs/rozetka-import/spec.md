# Spec Delta: rozetka-import

## MODIFIED Requirements

### Requirement: Creating a product draft with RSD prices and stock levels
Импорт обязан (MUST) создавать товар со статусом `draft` (итоговый статус берётся из `draft.status` запроса) и опциями Size/Color; идентификация варианта — `sku` — строится из артикула товара, а не из технического `offer_id`: артикул — последний сегмент пути `<url>` без расширения `.html`/`.htm`, нормализованный к `[A-Z0-9-]` в верхнем регистре (`skuToken`), к нему добавляется размер из `<param name="Размер">`: итоговая форма `АРТИКУЛ-РАЗМЕР` в верхнем регистре; для «единственного размера» (пустое значение, `One size`, `one_size`, `OS`, `edini`, `univer`, «без размера», «один размер» и т. п.) суффикс размера не добавляется — остаётся только артикул; если у источника нет пригодного латинского артикула (нет `<url>` либо сегмент с не-латиницей, например кириллицей), сохраняется прежний SKU из `offer_id` (`skuToken(offer.id)`). Одна и та же формула обязана (MUST) применяться в обоих путях импорта — `POST /admin/rozetka/import` (SKU приходит из снимка предпросмотра) и CLI `import-rozetka-xml`. Варианты получают цены `{currency_code: "rsd", amount: numberInput(price)}`, `manage_inventory: true`, `allow_backorder: false` и метаданные `rozetka_offer_id`/`rozetka_product_key`; остатки записываются в уровни склада, `reserved_quantity > запрошенного остатка` отклоняется `409`, как и конфликт SKU и занятый handle.

#### Scenario: Imported variant
- **WHEN** карточка с параметрами «Размер/Цвет» импортируется
- **THEN** товар создан как `draft`, его вариант имеет цену в `rsd`, инвентарь включён, backorder выключен, а `sku` построен из артикула `offer.url` и размера, а не из `offer_id`

#### Scenario: Product with several sizes
- **WHEN** импортируется оффер с `<url> https://tamir.ua/shtani/.../shtani-tmr-2211m43021-siri.html` и параметром «Размер» = `48`
- **THEN** `sku` варианта равен `SHTANI-TMR-2211M43021-SIRI-48`

#### Scenario: One Size product
- **WHEN** импортируется оффер с `<url> https://tamir.ua/aksessuary/sharfy/baf-tmr-1black.html` и без параметра «Размер» (либо со значением `One size`/`edini`/«один размер»)
- **THEN** `sku` варианта равен `BAF-TMR-1BLACK`, без суффикса размера

#### Scenario: Source without a Latin article
- **WHEN** у предложения нет `<url>` или последний сегмент пути содержит не-латиницу (кириллицу)
- **THEN** `sku` остаётся прежней нормализацией `offer_id` (`skuToken(offer.id)`), не-латинский артикул не транслитерируется

#### Scenario: SKU conflict
- **WHEN** `sku` предложения уже занят другим вариантом
- **THEN** импорт отвечает `409` с текстом «SKU <sku> уже используется другим вариантом» и не переписывает SKU молча
- **AND** SKU разных товаров различаются артикулом из `<url>`, поэтому такой конфликт — сигнал проблемы фида, а не следствие формулы

#### Scenario: Stock lower than reserved quantity
- **WHEN** у варианта уже есть `reserved_quantity` больше запрошенного остатка
- **THEN** импорт отвечает `409` с текстом «Остаток меньше уже зарезервированного количества…»

## ADDED Requirements

### Requirement: Variant metadata tracing the Rozetka source
Система обязана (MUST) сохранять в `metadata` импортированного варианта наряду с `rozetka_offer_id` поля `rozetka_article` — артикул, извлечённый из `<url>` (пустая строка при отсутствии пригодного артикула) — и `rozetka_legacy_sku` — прежний SKU, вычисленный из `offer_id` (`skuToken(offer.id)`), чтобы повторные импорты и ретро-фиксация сверяли созданные карточки без повторного разбора фида.

#### Scenario: Variant metadata after import
- **WHEN** импортирован оффер с `<url> https://tamir.ua/aksessuary/sharfy/baf-tmr-1black.html`
- **THEN** в `metadata` варианта есть `rozetka_offer_id` = `offer_id` оффера, `rozetka_article` = `BAF-TMR-1BLACK` и `rozetka_legacy_sku` = прежний SKU из `offer_id`

#### Scenario: Source without an article
- **WHEN** у предложения нет `<url>` либо артикул не латиницей, и импорт выполнен с fallback на SKU из `offer_id`
- **THEN** `rozetka_article` в `metadata` варианта пуст, а `rozetka_legacy_sku` совпадает с фактическим `sku` варианта

#### Scenario: Preview snapshot carries the same fields
- **WHEN** строится снимок фида для предпросмотра
- **THEN** каждый `SourceVariant` несёт `article` и `legacy_sku` с теми же значениями, что попадут в `metadata` варианта при импорте

### Requirement: Retrospective SKU fix for previously imported variants
Система обязана (MUST) предоставлять скрипт `npm --prefix backend run fix:rozetka:sku` перестройки `sku` уже импортированных карточек Rozetka по формуле `АРТИКУЛ[-РАЗМЕР]`: dry-run по умолчанию, применение только по явному флагу окружения, только офферы из свежего фида, конфликты занятых SKU не применяются, остатки не теряются.

#### Scenario: Dry-run by default
- **WHEN** `npm --prefix backend run fix:rozetka:sku` запущен без `ROZETKA_SKU_FIX_APPLY=true`
- **THEN** скрипт выводит список планируемых изменений (старый SKU → новый SKU) и не изменяет базу данных

#### Scenario: Explicit apply
- **WHEN** скрипт запущен с `ROZETKA_SKU_FIX_APPLY=true` и новый SKU свободен
- **THEN** скрипт выполняется под advisory-блокировкой импорта (`withImportLock`), `sku` варианта и `sku` его инвентарного элемента становятся `АРТИКУЛ[-РАЗМЕР]`, а остаток и зарезервированное количество варианта сохраняются

#### Scenario: Conflicts are not applied
- **WHEN** новый `sku` уже используется другим вариантом
- **THEN** скрипт помечает оффер как конфликт и не меняет ни один SKU

#### Scenario: Offer missing from the fresh feed
- **WHEN** у импортированной карточки `rozetka_offer_id` не находится в свежем фиде
- **THEN** её SKU остаётся нетронутым
- **AND** сопоставление вариантов скрипт ведёт по `rozetka_offer_id` и `rozetka_legacy_sku`

#### Scenario: Idempotent re-run
- **WHEN** после успешного применения скрипт запускается снова с `ROZETKA_SKU_FIX_APPLY=true`
- **THEN** изменений не происходит: SKU уже соответствуют формуле
