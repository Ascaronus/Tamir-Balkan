# Spec Delta

## Purpose

Возможность импорта карточек товаров из Rozetka YAML-фида (tamir.ua) в Medusa: предпросмотр источника, настройка URL фида, проверка лимитов и дубликатов, атомарный импорт в черновик с ценами в RSD, локальным копированием изображений и автопереводами.

## ADDED Requirements

### Requirement: Rozetka import page in the admin panel
Система обязана (MUST) предоставлять страницу `/rozetka` кастомного Dashboard-режима с меткой «Импорт Rozetka» (`defineRouteConfig`), которая показывает предпросмотр фида, позволяет выбирать товары для импорта, сохранять черновики выбора в `localStorage` и вычислять итоговую цену продажи из цены в UAH по курсу и наценке.

#### Scenario: Opening the import page
- **WHEN** администратор открывает `/rozetka` в Dashboard
- **THEN** отображается предпросмотр фида с полями курса UAH→RSD и наценки, а сохранённый ранее черновик выбора товаров восстанавливается из `localStorage`

### Requirement: Guards and limits of the import HTTP endpoints
Все эндпоинты `/admin/rozetka*` обязаны (MUST) требовать аутентификацию пользователя-администратора, отвечать `Cache-Control: no-store` и принимать тело запроса до 25 МБ (лимит в `middlewares.ts`).

#### Scenario: Unauthenticated request
- **WHEN** запрос к `/admin/rozetka`, `/admin/rozetka/settings`, `/admin/rozetka/import` или `/admin/rozetka/translate` приходит без активной сессии администратора
- **THEN** система отвечает `401` с сообщением «Войдите в админку»

### Requirement: XML source preview with a 60-second cache
Система обязана (MUST) поддерживать GET и POST `/admin/rozetka` для предпросмотра фида: GET принимает параметр `refresh`, POST всегда перечитывает источник; снимок кэшируется на 60 секунд по ключу источника, а параллельные загрузки одного ключа совмещаются в один запрос (`pending`).

#### Scenario: Repeat GET within the cache window
- **WHEN** GET `/admin/rozetka` без `refresh=true` приходит в пределах 60 секунд после загрузки того же источника
- **THEN** система отдаёт сохранённый снимок без повторного обращения к источнику

#### Scenario: POST always reloads the source
- **WHEN** отправлен POST `/admin/rozetka` с телом источника
- **THEN** предпросмотр выполняется заново, независимо от свежего кэша

### Requirement: Import source URL configuration
Система обязана (MUST) хранить настроенный URL фида Rozetka в метаданных магазина (`metadata.rozetka_source_url`) и отдавать его через GET `/admin/rozetka/settings` в поле `source_url`, подставляя при отсутствии настройки значение по умолчанию `https://tamir.ua/ua/rozetka/`; POST сохраняет новое значение.

#### Scenario: Empty configuration
- **WHEN** в метаданных магазина нет `rozetka_source_url`
- **THEN** GET `/admin/rozetka/settings` возвращает `source_url` со значением по умолчанию `https://tamir.ua/ua/rozetka/`
- **AND** иных полей (в том числе признака значения по умолчанию) в ответе нет

### Requirement: Limits on the allowed feed source
Разрешённый источник импорта обязан (MUST) быть HTTPS-URL без порта и учётных данных, с хостом `tamir.ua` или `www.tamir.ua`; загрузка выполняется с таймаутом 25 секунд и максимум тремя редиректами, а превышение лимита 10 МБ (по `content-length` или по факту потока) обязано приводить к ошибке `413`.

#### Scenario: Foreign host
- **WHEN** в настройках указан URL с хостом, отличным от `tamir.ua`/`www.tamir.ua` (или не-HTTPS)
- **THEN** система отвечает `400` с текстом «Для этого импорта разрешены только HTTPS-ссылки tamir.ua» и не выполняет запрос

#### Scenario: Response larger than 10 MB
- **WHEN** источник отдаёт тело длиннее 10 485 760 байт
- **THEN** загрузка прерывается с ошибкой `413` с текстом «Файл источника превышает допустимый размер»

### Requirement: Strict YAML feed parsing without external DTDs and entities
Парсер фида обязан (MUST) вырезать объявление `<!DOCTYPE yml_catalog SYSTEM "shops.dtd">` (регистронезависимое совпадение) и отвечать `422` «Источник вернул некорректный XML» на любые оставшиеся `<!DOCTYPE` или `<!ENTITY` и на невалидный XML. С `422` также отклоняются фиды без предложений и с более чем 10 000 предложений, пустые или повторяющиеся `offer_id`, более 100 вариантов у товара. Свыше 30 изображений у товара молча усекаются (`slice(0, 30)`) без ошибки.

#### Scenario: Feed with an external entity declaration
- **WHEN** XML содержит `<!DOCTYPE` (кроме разрешённого объявления `yml_catalog`) или `<!ENTITY`
- **THEN** предпросмотр отвечает `422` с текстом «Источник вернул некорректный XML» и ни один товар не импортируется

#### Scenario: Duplicate offer_id values
- **WHEN** в фиде два предложения с одинаковым `offer_id` или предложение без `offer_id`
- **THEN** предпросмотр отвечает `422` с текстом «Отсутствует или повторяется ID предложения: …»

#### Scenario: More than 30 images in the feed
- **WHEN** у товара в фиде больше 30 разных фотографий
- **THEN** в предпросмотр попадают только первые 30, ошибка не возникает
- **AND** черновик импорта более чем с 30 изображениями отклоняется валидацией тела с `400`

### Requirement: Stable product key and protection against source changes
Система обязана (MUST) вычислять ключ товара как `sha256` нормализованного URL карточки из `offer.url` (hostname приводится к `tamir.ua`, query, hash и хвостовой слэш отбрасываются), handle вида `rozetka-<20 символов ключа>`, и отпечаток `fingerprint` карточки; некорректные поля запроса импорта отклоняются `400`, а расхождение ключа/отпечатка с текущим фидом — `409`.

#### Scenario: Replay of the same request
- **WHEN** импорт повторяет запрос с тем же хэшем запроса, для которого в `metadata.rozetka_admin_import` товара стоит `state: "complete"`
- **THEN** ответ содержит `action: "replayed"` и существующий `product_id`, новый товар не создаётся

#### Scenario: Source has changed
- **WHEN** отпечаток карточки в текущем фиде не совпадает с отпечатком из черновика
- **THEN** импорт отвечает `409` с текстом «Товар в XML изменился. Обновите предпросмотр и проверьте изменения перед импортом.»

### Requirement: Control of updates to a previously imported product
Обновление ранее импортированного товара обязано (MUST) выполняться только при `mode: "update"` с совпадением `existing_id` (иначе `409` «Товар уже существует. Обновите предпросмотр и явно разрешите обновление.») и при совпадении `existing_updated_at` с текущим `updated_at` (иначе `409` «Товар изменён в админке после предпросмотра. Обновите список перед импортом.»); схема опций существующего товара обязана быть совместимой (Size/Color).

#### Scenario: Stale product version
- **WHEN** клиент передаёт `existing_updated_at`, не совпадающий с текущим `updated_at` товара
- **THEN** импорт отвечает `409` и товар не изменяется

#### Scenario: Incompatible options on an existing product
- **WHEN** у найденного по ключу товара опции отличаются от Size/Color
- **THEN** импорт отвечает `409` с текстом «Схема опций существующего товара отличается…» и товар не изменяется

### Requirement: Parallel import protection via an advisory lock
Система обязана (MUST) сериализовать импорт advisory-блокировкой PostgreSQL (`pg_try_advisory_lock(18760430, 1)`, снятие `pg_advisory_unlock`) и отвечать `409` «Другой товар уже импортируется. Дождитесь завершения и повторите попытку.», если блокировка занята.

#### Scenario: Simultaneous import
- **WHEN** второй запрос импорта приходит, пока первый удерживает advisory-блокировку
- **THEN** второй запрос получает `409` и не создаёт товаров

### Requirement: Creating a product draft with RSD prices and stock levels
Импорт обязан (MUST) создавать товар со статусом `draft` (итоговый статус берётся из `draft.status` запроса) и опциями Size/Color; варианты получают цены `{currency_code: "rsd", amount: numberInput(price)}`, `manage_inventory: true`, `allow_backorder: false` и метаданные `rozetka_offer_id`/`rozetka_product_key`; остатки записываются в уровни склада, `reserved_quantity > запрошенного остатка` отклоняется `409`, как и конфликт SKU и занятый handle.

#### Scenario: Imported variant
- **WHEN** карточка с параметрами «Размер/Цвет» импортируется
- **THEN** товар создан как `draft`, его вариант имеет цену в `rsd`, инвентарь включён, backorder выключен, а `sku` нормализован из `offer_id`

#### Scenario: SKU conflict
- **WHEN** `sku` предложения уже занят другим вариантом
- **THEN** импорт отвечает `409` с текстом «SKU <sku> уже используется другим вариантом»

#### Scenario: Stock lower than reserved quantity
- **WHEN** у варианта уже есть `reserved_quantity` больше запрошенного остатка
- **THEN** импорт отвечает `409` с текстом «Остаток меньше уже зарезервированного количества…»

### Requirement: Image copying with disk-space control
При режиме `image_mode: "copy"` (по умолчанию) импорт обязан (MUST) перед каждой загрузкой проверять свободное место (`statfs`) и отвечать `507` при запасе меньше 512 МБ, скачивать не более 8 МБ на изображение, отклонять формат вне jpeg/png/webp/gif как `422`, сохранять файл через файловый модуль Medusa с доступом `public` и накапливать соответствия URL в `metadata.rozetka_media` после каждой записи; режим `remote` использует внешние URL без копирования.

#### Scenario: Not enough disk space
- **WHEN** свободное место на томе процесса меньше 512 МБ перед копированием изображения
- **THEN** импорт отвечает `507` и импорт останавливается

#### Scenario: Successful copy
- **WHEN** изображение успешно загружено и записано через файловый модуль
- **THEN** файл сохранён с именем `rozetka-<sha256(url).slice(0,24)>.<расширение>`, в `metadata.rozetka_media` появилось соответствие исходного URL на URL хранилища, а товар получает локальное изображение

### Requirement: Automatic translation of descriptions from the import panel
Система обязана (MUST) принимать POST `/admin/rozetka/translate` с заголовком (1–255) и описанием (до 15 000), отвечать `400` на невалидное тело, `503` при незаполненном `GOOGLE_TRANSLATE_API_KEY` (включая заглушку `YOUR_GOOGLE_KEY`) и `502` при ошибке сервиса, возвращая поля `title_sr`, `description_sr`, `title_en`, `description_en`.

#### Scenario: Translation not configured
- **WHEN** `GOOGLE_TRANSLATE_API_KEY` не задан или равен заглушке `YOUR_GOOGLE_KEY`
- **THEN** эндпоинт отвечает `503` с текстом «Автоперевод не настроен. Заполните SR/EN вручную или настройте GOOGLE_TRANSLATE_API_KEY на сервере.»
