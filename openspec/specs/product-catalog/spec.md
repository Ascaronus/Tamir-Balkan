# product-catalog Specification

## Purpose
Эта возможность описывает витрину товаров `tamir.rs`: как устроен публичный эндпоинт
`GET /store/catalog/products`, как фильтруются и проверяются параметры запроса, как работают
поиск, сортировка, популярность и фасеты, и как формируются публичные адреса товаров и категорий
в двух локалях. Документируется фактическое поведение кода `backend/src/utils/catalog*.ts`,
`backend/src/utils/product-urls.ts` и слоя каталога фронтенда `frontend/src/lib/store` и
`frontend/src/lib/i18n`.

## Requirements

### Requirement: Парсинг и проверка параметров каталога

Слой каталога обязан (MUST) принимать только параметры из белого списка `region_id`,
`country_code`, `province`, `category_id`, `q`, `size`, `color`, `min_price`, `max_price`, `sort`,
`limit`, `offset`: функция `parseCatalogInput` из `backend/src/utils/catalog.ts` обязана (MUST)
бросать `CatalogInputError` при неизвестном ключе или недопустимом значении, а обработчик
`prepareCatalogQuery` из `backend/src/utils/catalog-http.ts` обязан (MUST) возвращать ответ `400`
с кодом `INVALID_CATALOG_QUERY`.

#### Scenario: Неизвестный параметр отклоняется

- **WHEN** запрос приходит на `GET /store/catalog/products` с параметром, которого нет в списке
- **THEN** `parseCatalogInput` бросает `CatalogInputError` с сообщением `Invalid catalog parameter: <ключ>`
- **THEN** ответ имеет статус `400` и тело с `"code": "INVALID_CATALOG_QUERY"`

#### Scenario: Диапазоны и формат значений

- **WHEN** параметры разбираются `parseCatalogInput`
- **THEN** `limit` по умолчанию равен `24` и допускается только в диапазоне `1..100`, а `offset` — `0..10000`
- **THEN** `q` ограничен 200 символами, список значений `size` или `color` — 20 значениями по 80 символов
- **THEN** `min_price` и `max_price` проходят только по регулярному выражению `^\d+(?:[.,]\d{1,4})?$`, причём запятая трактуется как десятичная точка
- **THEN** `country_code` приводится к нижнему регистру и должен соответствовать `^[a-z]{2}$`, а `province` без `country_code` отклоняется

#### Scenario: Регион обязателен

- **WHEN** в запросе каталога отсутствует непустой `region_id`
- **THEN** `parseCatalogInput` отклоняет параметр `region_id`, и клиент получает `400` с кодом `INVALID_CATALOG_QUERY`

### Requirement: Медиа-цепочка эндпоинта каталога

Эндпоинт каталога обязан (MUST) обрабатываться цепочкой `catalogMiddlewares` из
`backend/src/utils/catalog-http.ts`, зарегистрированной в `backend/src/api/middlewares.ts` для
`GET /store/catalog/products`; цепочка обязана (MUST) пропускать нативные middleware Medusa и
ограничивать выдачу только опубликованными товарами из разрешённых каналов продаж.

#### Scenario: Состав цепочки

- **WHEN** запрос проходит обработку `GET /store/catalog/products`
- **THEN** применяются последовательно `prepareCatalogQuery`, `authenticate("customer", ["session", "bearer"], { allowUnauthenticated: true })`, `validateAndTransformQuery`, `filterByValidSalesChannels()`, `maybeApplyLinkFilter` с `entryPoint: "product_sales_channel"`, `applyDefaultFilters`, `normalizeDataForContext()`, `setPricingContext()`, `setTaxContext()` и `clearFiltersByKey(["region_id", "country_code", "province", "cart_id"])`
- **THEN** в `applyDefaultFilters` задан `status: ProductStatus.PUBLISHED`, а фильтр по категориям дополнительно требует `is_internal: false` и `is_active: true`

#### Scenario: Пользовательские фильтры не попадают в селектор Medusa

- **WHEN** `prepareCatalogQuery` формирует `req.query` перед `validateAndTransformQuery`
- **THEN** в `req.query` остаются только `region_id`, `country_code`, `province` и `category_id`
- **THEN** `q`, `size`, `color`, `min_price`, `max_price`, `sort`, `limit` и `offset` сохраняются в `req.catalogInput` и применяются на уровне приложения

### Requirement: Формат ответа каталога

Ответ `GET /store/catalog/products` обязан (MUST) содержать поля `products`, `count`, `offset`,
`limit`, `sort`, `currency_code`, `sort_options`, `filters` и `applied_filters`; каждый товар обязан
(MUST) получать блок `catalog` с итоговой ценой и идентификаторами подходящих вариантов, а сам ответ
обязан (MUST) сопровождаться заголовком `Cache-Control: private, no-store`.

#### Scenario: Ключи ответа

- **WHEN** запрос каталога выполнен успешно
- **THEN** тело содержит `products`, `count`, `offset`, `limit`, `sort`, `currency_code`, `sort_options`, `filters` и `applied_filters`
- **THEN** `sort_options` равно константе `catalogSorts`, то есть `newest`, `price_asc`, `price_desc`, `popularity`
- **THEN** `applied_filters` содержит `size`, `color`, `min_price` и `max_price` (отсутствующие значения сериализуются как `null`)

#### Scenario: Блок catalog у товара и фасеты

- **WHEN** сервер собирает страницу выдачи
- **THEN** каждый товар дополняется полем `catalog` с ключами `price`, `currency_code`, `matching_variant_ids` и `preferred_variant_id`
- **THEN** `filters` содержит массивы `sizes` и `colors` с полями `value`, `label`, `count`, а также объект `price` с `min`, `max` и `currency_code`

### Requirement: Поиск по каталогу в двух локалях

Поиск по каталогу обязан (MUST) выполняться функцией `searchCatalogProducts` из
`backend/src/utils/catalog-search.ts` (MUST): сопоставлять все слова запроса, нормализованные
`normalizeCatalogSearch`, по полю товара, его вариантам и переводу на локаль витрины, а не по
произвольным ключам `metadata`.

#### Scenario: Нормализация запроса

- **WHEN** строка запроса обрабатывается `normalizeCatalogSearch`
- **THEN** текст приводится к нижнему регистру, `đ` заменяется на `dj`, диакритические знаки снимаются через `NFD`, а повторяющиеся пробелы схлопываются

#### Scenario: Поиск по переводам

- **WHEN** у товара есть перевод, опубликованный Medusa Translation API
- **THEN** `searchCatalogProducts` забирает переводы через `listTranslations` пачками по 200 записей и учитывает только локали, удовлетворяющие `storefrontLocale`, то есть начинающиеся с `sr` или `en`
- **THEN** в поиске участвуют поля `title`, `subtitle` и `description` товара, варианты по полям `title`, `sku`, `ean`, `upc`, а также `handle`
- **THEN** из `metadata` учитывается только ключ `i18n` по локалям, удовлетворяющим `storefrontLocale`, остальные значения `metadata` в поиске не участвуют

#### Scenario: Все слова должны совпасть

- **WHEN** поисковый запрос содержит несколько слов
- **THEN** товар остаётся в результатах только если каждое слово входит в нормализованный набор текста этого товара

### Requirement: Сопоставление вариантов и ценовой фильтр

Отбор товаров в каталоге обязан (MUST) выполняться функцией `selectCatalog` из
`backend/src/utils/catalog.ts` (MUST): требования по размеру, цвету и цене проверяться должны (MUST)
по одному варианту целиком, а значения размера и цвета определяться (MUST) по заголовкам опций из
набора алиасов `aliases`.

#### Scenario: Все признаки должны быть у одного варианта

- **WHEN** у товара один вариант красного размера `M`, а другой — синего размера `L`
- **THEN** при фильтрах `size=L` и `color=red` товар не попадает в выдачу, потому что ни один вариант не удовлетворяет обоим условиям

#### Scenario: Многоязычные заголовки опций

- **WHEN** `variantOptions` определяет, какие опции относятся к размеру или цвету
- **THEN** заголовок опции нормализуется `normalizeOption` и сравнивается с множеством `aliases.size`, куда входят `size`, `sizes`, `размер`, `розмір`, `veličina`, `velicina`, `величина`
- **THEN** для цвета используется множество `aliases.color` со значениями `color`, `colour`, `цвет`, `колір`, `boja`, `боја`

#### Scenario: Цена учитывается только в валюте региона

- **WHEN** `variantPrice` читает `calculated_price` варианта
- **THEN** цена принимается только если `currency_code` совпал с валютой региона, иначе вариант считается без цены и не проходит ценовой фильтр

### Requirement: Сортировка, популярность и предел объёма сканирования

Эндпоинт каталога обязан (MUST) сканировать кандидатов пачками по `BATCH_SIZE = 200` и прекращать
обработку с ответом `503` и кодом `CATALOG_SCOPE_TOO_LARGE`, если число кандидатов превышает
`MAX_CATALOG_CANDIDATES = 10000`; сортировка `popularity` обязана (MUST) считаться запросом
`popularityQuery` из `backend/src/utils/catalog-popularity.ts` (MUST) только по завершённым заказам.

#### Scenario: Слишком большая выборка

- **WHEN** подсчёт кандидатов в цикле сканирования превышает `MAX_CATALOG_CANDIDATES`
- **THEN** ответ имеет статус `503` и тело с `"code": "CATALOG_SCOPE_TOO_LARGE"` и сообщением `Narrow the catalog by category or search`

#### Scenario: Регион без валюты

- **WHEN** у запроса не удалось определить `req.pricingContext.currency_code`
- **THEN** ответ имеет статус `400` и тело с `"code": "CATALOG_REGION_REQUIRED"` и сообщением `A region with a currency is required`

#### Scenario: Формула популярности

- **WHEN** `sort=popularity` и список кандидатов не пуст
- **THEN** `catalogPopularity` считает `SUM(GREATEST(oi.quantity - oi.return_received_quantity - oi.written_off_quantity, 0))` по заказам со статусом `completed`, где `is_draft_order` равно `false`
- **THEN** учёт ведут только по заказам текущего `region_id` и каналов продаж публикуемого ключа, а при пустом списке товаров или каналов возвращается пустая таблица популярности

### Requirement: Адрес английской версии товара

Хранилище адресов товара обязано (MUST) использовать таблицу `tamir_product_url`, создаваемую SQL из
экспорта `productUrlSchema` в `backend/src/utils/product-urls.ts`; функция `syncProductUrl` обязана
(MUST) в одной транзакции менять текущий адрес, сохранять прежние алиасы и записывать в `metadata`
товара только ключи `en_handle` и `en_content_ready`.

#### Scenario: Смена адреса сохраняет историю

- **WHEN** `syncProductUrl` вызывается с новым значением `requested`
- **THEN** прежняя строка с `is_current: true` для этого товара получает `is_current: false`, а новый адрес вставляется со значением `is_current: true`
- **THEN** частичный уникальный индекс `tamir_product_url_current` гарантирует, что у товара остаётся ровно один текущий адрес

#### Scenario: Недопустимый адрес отклоняется

- **WHEN** запрошенный адрес не проходит проверку `^[a-z0-9]+(?:-[a-z0-9]+)*$` или длиннее 150 символов
- **THEN** `syncProductUrl` бросает `ProductUrlError`, у которого `status` равно `409`
- **THEN** маршрут `/admin/products/:id/localized-url` отвечает `409` с сообщением `Используйте латинские буквы a–z, цифры и дефисы, до 150 символов.`

#### Scenario: Признак готовности английского контента

- **WHEN** `englishProductText` оценивает перевод товара с `locale_code: "en"`
- **THEN** `ready` равно `true` только при непустых `title` и `description`, в которых нет символов кириллицы (`[\u0400-\u04ff]`)
- **THEN** пересчёт запускает подписчик `tamir-product-localized-url`, зарегистрированный на события `product.created`, `product.updated`, `translation.created`, `translation.updated` и `translation.deleted`

### Requirement: Публичные адреса витрины

Фронтенд обязан (MUST) строить адреса категорий и товаров по активной локали с помощью
`frontend/src/lib/i18n/paths.ts` и `frontend/src/lib/store/category-url.ts`, а устаревший адрес
обязан (MUST) разрешать через эндпоинт `GET /store/product-redirects/:handle` (MUST) и возвращать
`notFound()`, когда итоговый адрес не совпадает с запрошенным.

#### Scenario: Адрес категории

- **WHEN** вызывается `categoryPath(category, locale)`
- **THEN** используется значение `metadata.category_handles[locale]`, иначе собственный `handle` категории, и адрес получается вида `/{rs|en}/catalog/{handle}`
- **THEN** если идентификатор адреса нет, генерируется адрес `/{rs|en}/catalog?category_id={id}`
- **THEN** функция `matchesCategoryHandle` сопоставляет адрес с `handle`, английским и сербским вариантом и списком `metadata.category_handle_aliases`

#### Scenario: Разрешение устаревшего адреса

- **WHEN** браузер запрашивает `GET /store/product-redirects/:handle`
- **THEN** ответ всегда содержит `Cache-Control: no-store`, а при длине `handle` больше 255 символов возвращается `404` с телом `{ "handle": null }`
- **THEN** строка таблицы `tamir_product_url` учитывается только при `is_current: true` и при товаре без `deleted_at` со статусом `published`, иначе ответ — `404` с `{ "handle": null }`

#### Scenario: Страница товара принимает только текущий адрес

- **WHEN** Next.js рендерит `frontend/src/app/[countryCode]/products/[handle]/page.tsx`
- **THEN** `countryCode` в нижнем регистре должен входить в список `rs`, `en`, иначе вызывается `notFound()`
- **THEN** товар принимается, только если `productHandle(product, locale)` равно запрошенному `handle`; иначе выполняется запрос к `/store/product-redirects/{handle}`, и при отсутствии подходящего адреса вызывается `notFound()`
- **THEN** флаг `englishReady(product)` требует `metadata.en_content_ready === true` и непустой строки `metadata.en_handle`, и только при нём или при сербской локали товар разрешено индексировать
