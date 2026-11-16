# Spec Delta

## Purpose

Кастомные расширения панели администратора Medusa (`/app`): страницы импорта Rozetka и модерации отзывов, виджеты переводов опций и локализованного URL товара, а также поддерж десятичных значений в штатных формах Dashboard через Vite-преобразование.

## ADDED Requirements

### Requirement: Custom Dashboard pages for import and moderation
Система обязана (MUST) регистрировать в Dashboard две кастомные страницы через `defineRouteConfig`: `/rozetka` с меткой «Импорт Rozetka» и `/reviews` с меткой «Reviews / Recenzije»; серверная авторизация при этом обязана (MUST) выполняться отдельными API-эндпоинтами, а не видимостью кнопок в интерфейсе.

#### Scenario: Dashboard navigation
- **WHEN** администратор открывает `/app` и смотрит меню кастомных страниц
- **THEN** доступны пункты «Импорт Rozetka» (`/app/rozetka`) и «Reviews / Recenzije» (`/app/reviews`)

### Requirement: Review moderation restricted to the configured moderator
Сервер обязан (MUST) допускать к административным операциям отзывов только аутентифицированного пользователя Medusa с e-mail `admin@tamir.local` (`isReviewModerator`: сравнение `trim()` и нижнего регистра); любой другой агент получает `403` с кодом `FORBIDDEN`, а страница модерации показывает двуязычное сообщение «Only admin@tamir.local can moderate reviews. / Samo admin@tamir.local može moderirati recenzije.».

#### Scenario: Administrator without moderation rights
- **WHEN** запрос к эндпоинту модерации отзывов приходит от пользователя, чей e-mail отличен от `admin@tamir.local`
- **THEN** сервер отвечает `403` `FORBIDDEN`, и страница `/app/reviews` показывает запрет вместо списка отзывов

### Requirement: Product option translation widget
Система обязана (MUST) показывать на странице товара виджет `product-option-translations` в зоне `product.details.after` для редактирования нативных переводов названий опций и значений на `sr-RS` и `en` через модуль translations Medusa: ручное сохранение выбранных полей и запуск автоперевода пустых полей.

#### Scenario: Manual translation save
- **WHEN** администратор вводит перевод значения опции и нажимает сохранение
- **THEN** перевод записывается через модуль translations и отображается на витрине без отдельного скрытого словаря

### Requirement: Option auto-translation endpoint (preview)
POST `/admin/products/:id/option-translations/translate` обязан (MUST) требовать пользователя-администратора (`401`), принимать строгую схему `cells` из 1–400 элементов `{id, locale}` где `locale` — `sr-RS` или `en` (иначе `400`, тело до 64 КБ), отвечать `503` при незаполненном `GOOGLE_TRANSLATE_API_KEY` и `502` при сбое сервиса; ответ обязан (MUST) быть только предпросмотром — сохранение выполняет штатное действие редактирования.

#### Scenario: Options changed during operation
- **WHEN** среди `cells` приходит `id`, которого больше нет среди опций/значений товара
- **THEN** эндпоинт отвечает `409` с текстом «Опции товара изменились. Обновите переводы и повторите попытку.»

#### Scenario: Successful preview
- **WHEN** валидные `cells` приходят при настроенном ключе Google Translate
- **THEN** ответ содержит карту `values` вида `<id>:<locale>`, а поля товара остаются несохранёнными до явного сохранения в редакторе

### Requirement: Incomplete option translation indicator in the product list
Система обязана (MUST) показывать в списке товаров виджет `product-option-translation-status` в зоне `product.list.before`, помечающий товары с неполными SR/EN-переводами опций, чтобы администратор видел, какие карточки требуют перевода.

#### Scenario: Product without option translations
- **WHEN** в списке товаров отображается товар, у которого переводы названий опций или значений не заполнены
- **THEN** у такого товара виден индикатор неполного перевода

### Requirement: Localized EN product URL and aliases
Система обязана (MUST) хранить актуальный и прежние английские адреса товара в таблице `tamir_product_url` (по одному `is_current: true` на товар) и управлять ими через виджет `product-localized-url` (зона `product.details.after`) с эндпоинтом GET/POST `/admin/products/:id/localized-url` (тело до 8 КБ), выполняя запись под блокировкой `pg_advisory_xact_lock(67195052, 1)`.

#### Scenario: Changing the product URL
- **WHEN** администратор сохраняет новый валидный handle, не занятый другим товаром или его алиасом
- **THEN** прежний handle остаётся в `tamir_product_url` с `is_current: false` (старые ссылки продолжают работать), новый становится текущим, а в метаданные товара записываются `en_handle` и `en_content_ready`
- **AND** при сохранении проверяются формат `^[a-z0-9]+(?:-[a-z0-9]+)*$` (до 150 символов) и занятость: любой адрес в `tamir_product_url` другого товара (без фильтра `is_current`, считаются и исторические алиасы), `handle` другого непросроченного товара и его `metadata->>'rozetka_legacy_handle'`
- **AND** занятый адрес даёт `409` «Этот адрес уже используется другим товаром или его старой ссылкой.»

#### Scenario: Invalid URL
- **WHEN** в POST приходит handle с кириллицей, символом вне `a-z0-9-` или длиннее 150 символов
- **THEN** эндпоинт отвечает `409` с текстом «Используйте латинские буквы a–z, цифры и дефисы, до 150 символов.»

### Requirement: English product content readiness
Система обязана (MUST) считать английский контент товара готовым только при наличии нативного EN-перевода с непустыми `title` и `description`, не содержащими кириллицы (`englishProductText`), и обязана (MUST) отказываться генерировать EN-адрес из заголовка с кириллицей — автогенерация handle выполняется только из латинского EN-заголовка с добавлением числовых суффиксов `-2`, `-3`… при занятости.

#### Scenario: Empty EN translation
- **WHEN** у товара нет EN-перевода или он содержит кириллицу
- **THEN** ответ эндпоинта содержит `ready: false`, автогенерация адреса не выполняется, виджет предлагает заполнить перевод

### Requirement: Decimal fields in stock Dashboard forms
Система обязана (MUST) подключать к Dashboard Vite-конфигурацию `decimalAdminConfig` (`admin.vite` в `medusa-config.ts`), которая подменяет `react-currency-input-field` на локальный компонент, понимающий запятую и точку, и трансформирует проаудированные секции собранного `@medusajs/dashboard` (числовые схемы и поля — в десятильные), без ручного изменения `node_modules`; сборка обязана (MUST) останавливаться при несовместимости патчей с установленной версией dashboard.

#### Scenario: Incompatible Medusa update
- **WHEN** версия `@medusajs/dashboard` не равна `2.13.1` или ожидаемый фрагмент кода не найден/число замен не совпало
- **THEN** `npm run build` (`medusa build`) завершается ошибкой, а не собирает панель с молча пропущенными заменами

#### Scenario: Entering a fractional size
- **WHEN** администратор вводит габарит или вес в штатной форме товара в виде `12,5`
- **THEN** значение принимается и сохраняется как десятичное число через хелперы `optionalDecimal`/`nullableDecimal`/`parseDecimal`
