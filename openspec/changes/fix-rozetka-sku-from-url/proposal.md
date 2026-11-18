# Fix Rozetka SKU to follow the article from the feed URL

Задача трекера: **TB-24 «Исправить SKU в Rozetka»**.

## Why

Сейчас при импорте YAML-фида Rozetka SKU варианта строится из технического `id` оффера
(`slugify(offer.id)`), то есть из пары UUID вида `5c73d4b3-9f98-11eb-ab3c-8a74aeb6a5b6_3a3db20e-...`.
В кириллических фидах (`/ua/rozetka/`) `slugify` вырезает не-ASCII и SKU превращается в набор цифр
(например `04960A8E-3945-11EB-AB3C-8A74AEB6A5B6-3A3DB20E-B477-11EB-AB3C-8A74AEB6A5B6`). Такой SKU
бессмысленен для человека в админке и не совпадает с артикулом, по которому товар уже учтён в Rozetka:
карточка там живёт по артикулу из `<url>` (`https://tamir.ua/aksessuary/sharfy/baf-tmr-1black.html` →
`baf-tmr-1black`), а не по UUID из `id`. Из-за этого импорт создаёт дубли карточек вместо сопоставления
с существующими.

Проверка на живом фиде `https://tamir.ua/ua/rozetka/` (2 444 681 Б, 821 оффер): у 821 из 821 офферов
есть `<url>` с `.html`-артикулом, 322 уникальных артикула, дублей артикулов нет, артикул всегда содержит
цвет (`...-siri`, `...-pisochni`), а размеры лежат только в `<param name="Размер">`. Формула
`АРТИКУЛ-РАЗМЕР` даёт **821 уникальный SKU из 821 оффера**, чистый артикул — только 322 (конфликт у
многоразмерных товаров).

## What Changes

- **Формула SKU при импорте фида** (админка `/admin/rozetka/import` и CLI `import-rozetka-xml`):
  `АРТИКУЛ[-РАЗМЕР]` в верхнем регистре, где артикул — последний сегмент `<url>` без `.html`,
  а размер берётся из `<param name="Размер">`; для `One Size` суффикс размера не добавляется.
  Если `<url>` нет/артикул не извлекается — прежнее поведение (`slugify(offer.id)`).
- Новые общие хелперы `rozetkaSku` / `articleFromOfferUrl` / `skuToken` / `isOneSize` /
  `legacySkuFromOffer` в `src/utils/rozetka.ts`, чтобы оба пути импорта не разъезжались.
- В `metadata` варианта сохраняются артикул (`rozetka_article`) и прежний SKU
  (`rozetka_legacy_sku`) — для трассировки и повторных прогонов.
- **Новый скрипт ретро-правки** `fix-rozetka-sku` для уже импортированных карточек в стиле
  `normalize-rozetka-products`: dry-run по умолчанию, `ROZETKA_SKU_FIX_APPLY=true` применяет,
  `withImportLock`, идемпотентность, перенос инвентарного элемента и остатков на новый SKU.
- Обновление документации (`docs/ROZETKA-ADMIN-IMPORT.md`, `docs/IMPORT-MODES.md`) и тестов.

## Out of scope

- Фиды других поставщиков и ручной импорт товаров.
- Изменение `handle`/URL товара, заголовков, цен, картинок — только SKU.
- Сопоставление карточек по `model`/`vendor` (артикул уже в `<url>`, отдельной задачи не требует).

## Impact

- Affected specs: `rozetka-import` (MODIFIED «Creating a product draft with RSD prices and stock
  levels», ADDED «Variant metadata tracing the Rozetka source» и «Retrospective SKU fix for
  previously imported variants»).
- Affected code: `src/utils/rozetka.ts`, `src/utils/rozetka-preview.ts`,
  `src/scripts/import-rozetka-xml.ts`, `src/utils/rozetka-admin.ts`, `src/shared/rozetka-import.ts`,
  новый `src/scripts/fix-rozetka-sku.ts`, тесты `tests/rozetka-sku.test.cjs` и
  `tests/rozetka-admin.test.cjs`.
- Affected data: SKU уже импортированных вариантов Rozetka и `sku` их инвентарных элементов
  (миграция остатков — внутри скрипта, без потери стоков).
- Риск: SKU — ключ сопоставления вариантов и ключ поиска инвентарного элемента при повторном
  импорте; без ретро-скрипта старый импорт и новый импорт перестают узнавать друг друга.
