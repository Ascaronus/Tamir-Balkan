# localization Specification

## Purpose
Фиксирует текущую двухъязыковую маршрутизацию tamir.rs: префиксы `/rs` (сербский по умолчанию) и `/en`, определение языка на корневом `/` с редиректом 307, фиксацию выбора в cookie `store_locale`, сербские слаги служебных страниц через rewrite/redirect, юридические страницы вне префиксов, словари UI SR/EN и переводы контента товаров из Medusa.

## Requirements

### Requirement: Страницы магазина доступны под префиксами /rs и /en

Публичные пути магазина (каталог, товары, корзина, оформление, кабинет, заказ) обслуживаются под префиксом `/rs` (сербский) и `/en` (английский). Сегмент `[countryCode]` обязан (MUST) допускать только `rs` и `en` — сравнение регистронезависимо (`countryCode.toLowerCase()`), иначе страница отвечает `notFound()`. Локаль прокси обязан (MUST) вычислять из префикса пути: `/en` и `/en/...` дают `en`, любой другой путь — `sr`.

#### Scenario: Недопустимый префикс

- **WHEN** запрашивается `/de/catalog`
- **THEN** страница возвращает 404 (`notFound()`)

#### Scenario: Английский префикс задаёт локаль

- **WHEN** запрашивается `/en/products/{handle}`
- **THEN** сервер выбирает локаль `en`
- **AND** запросы контента идут с `x-medusa-locale: en`

### Requirement: Корневой путь определяет язык и выполняет временный редирект 307

Прокси обязан (MUST) для пути `/` выбрать язык: сначала cookie `store_locale`, затем заголовок `Accept-Language` (с поддержкой `q`-параметров и усечением подтегов), иначе дефолт `sr`, и ответить `307` на `/rs` или `/en` с заголовками `Cache-Control: private, no-store` и `Vary: Accept-Language, Cookie`.

#### Scenario: Первый визит с английским браузером

- **WHEN** запрос `/` не содержит `store_locale` и имеет `Accept-Language: en-US`
- **THEN** ответ возвращает статус `307` на `/en`

#### Scenario: Язык зафиксирован cookie

- **WHEN** запрос `/` содержит `store_locale=sr`, а `Accept-Language` английский
- **THEN** ответ возвращает статус `307` на `/rs`
- **AND** ответ содержит `Vary: Accept-Language, Cookie`

#### Scenario: Неподдерживаемый язык браузера

- **WHEN** запрос `/` не имеет cookie и содержит `Accept-Language: ru-RU,ru;q=0.9,en;q=0.8`
- **THEN** ответ возвращает статус `307` на `/rs`
- **AND** `Cache-Control: private, no-store` запрещает кеширование выбора

### Requirement: Переключатель языка фиксирует выбор cookie store_locale на год

Кнопки `sr` и `en` сохраняют выбор через `POST /api/locale`, который обязан (MUST) установить cookie `store_locale` c `path=/`, `maxAge` 365 дней, `SameSite=Lax` и `httpOnly: false`. Не-JSON тело обязано (MUST) давать `400 invalid_json`, неизвестная локаль — `400 invalid_locale` без изменения cookie. После успеха frontend обязан (MUST) обновить локаль js-sdk (`sdk.client.setLocale`) и выполнить полную навигацию на эквивалентный путь с сохранением query и hash.

#### Scenario: Переключение на английский из корзины

- **WHEN** пользователь на `/rs/korpa` нажимает кнопку `en`
- **THEN** `POST /api/locale` устанавливает `store_locale=en` на 365 дней
- **AND** браузер выполняет полную навигацию на `/en/cart`

#### Scenario: Неизвестная локаль в запросе

- **WHEN** тело `POST /api/locale` содержит `locale` вне `sr`/`en`
- **THEN** API отвечает `400` с кодом `invalid_locale`
- **AND** cookie не изменяется

#### Scenario: Некорректное тело запроса

- **WHEN** тело `POST /api/locale` не парсится как JSON
- **THEN** API отвечает `400` с кодом `invalid_json`
- **AND** cookie не изменяется

### Requirement: Сербские слаги служебных страниц работают через rewrite с каноническим redirect

В `frontend/next.config.ts` обязаны (MUST) быть объявлены 5 внутренних rewrite сербских слогов (`korpa`, `nalog`, `nalog/prijava`, `nalog/registracija`, `nalog/zaboravljena-lozinka`) на `/rs/cart`, `/rs/account` и их подстраницы; адрес в браузере сохраняется сербский. Прокси обязан (MUST) вернуть `308` только для пути с точным префиксом `/rs/`, если `localizedPath(path, "sr")` отличается от запрошенного; английские пути остаются без переименования.

#### Scenario: Открытие по сербскому слагу

- **WHEN** браузер запрашивает `/rs/nalog/prijava`
- **THEN** rewrite отдаёт реализацию страницы `/rs/account/login`
- **AND** адрес в браузере остаётся `/rs/nalog/prijava`

#### Scenario: Обращение к английскому слагу на сербском префиксе

- **WHEN** браузер запрашивает `/rs/cart`
- **THEN** прокси возвращает `308` на `/rs/korpa`

#### Scenario: Двойная локализация сохраняет query и hash

- **WHEN** `localizedPath("/en/cart?next=checkout#form", "sr")`
- **THEN** получается `/rs/korpa?next=checkout#form`
- **AND** `localizedPath` этого пути с `"en"` возвращает `/en/cart?next=checkout#form`

### Requirement: Тексты интерфейса берутся из словарей SR/EN во frontend

Сервер обязан (MUST) выбирать локаль в порядке: заголовок `x-tamir-locale` (прокси всегда перезаписывает его по пути запроса, не доверяя входящему значению), затем cookie `store_locale`, затем `Accept-Language`, иначе `sr`. Детектор браузерного языка обязан (MUST) учитывать приоритеты `q` (значения `q=0` и некорректные дают дефолт) и отбрасывать подтеги тега. Тексты UI обязан (MUST) рендерить из словарей `frontend/src/messages/sr.json` и `frontend/src/messages/en.json`.

#### Scenario: Сербский интерфейс для /rs

- **WHEN** запрашивается страница с префиксом `/rs`
- **THEN** сервер выбирает локаль `sr`
- **AND** интерфейс отрендерен из `sr.json`

#### Scenario: Клиент пытается подделать заголовок локали

- **WHEN** входящий запрос содержит собственный заголовок `x-tamir-locale`
- **THEN** прокси перезаписывает его значением, вычисленным из пути
- **AND** страница рендерится по префиксу пути, а не по заголовку клиента

#### Scenario: Заголовок маршрутизации приоритетнее cookie

- **WHEN** сервер получает `x-tamir-locale: en` вместе с cookie `store_locale=sr`
- **THEN** выбирается локаль `en`

#### Scenario: Приоритеты Accept-Language

- **WHEN** cookie и `x-tamir-locale` отсутствуют, а заголовок равен `sr;q=0.5,en;q=0.9`
- **THEN** выбирается локаль `en`
- **AND** для `en;q=bad` или `en;q=2` выбирается `sr`

### Requirement: Контент товаров локализуется через Medusa translations и заголовок x-medusa-locale

Запросы контента (каталог, товар, категории, корзина) обязаны (MUST) отправлять в Medusa Store API заголовок `x-medusa-locale` (`sr-RS` или `en`, `medusaStoreLocale`); маршрут `/api/medusa/[...path]` обязан (MUST) держать его в allowlist пробрасываемых заголовков. Английский адрес карточки строится из `en_handle` с фолбэком на сербский `handle`.

#### Scenario: Английская карточка переведённого товара

- **WHEN** пользователь открывает `/en/products/{en_handle}` товара с `en_content_ready`
- **THEN** frontend запрашивает товар с заголовком `x-medusa-locale: en`
- **AND** показывает английские название и описание из переводов Medusa

#### Scenario: Товар без английского слага

- **WHEN** у товара нет `metadata.en_handle`
- **THEN** `productPath(product, "en")` даёт `/en/products/{handle}` с сербским слагом
- **AND** `productPath(product, "sr")` остаётся `/rs/products/{handle}`

### Requirement: Индексируемость английской карточки зависит от englishReady

Готовность английского контента обязан (MUST) определять признак `englishReady` (`metadata.en_content_ready === true` и непустой `metadata.en_handle`); он обязан (MUST) влиять только на `robots.index`, hreflang-пару и состав sitemap, а не на доступность страницы. Пока товар не готов, англоязычная карточка обязана (MUST) публиковать `robots: { index: false }` с одиночным canonical, а в sitemap обязан (MUST) попадать только её сербский URL.

#### Scenario: Карточка без подтверждённого перевода

- **WHEN** англоязычный адрес открывается для товара с `en_handle`, но без `en_content_ready`
- **THEN** его мета-данные содержат `robots: { index: false }` и одиночный canonical
- **AND** пара hreflang `sr`/`en` отсутствует

#### Scenario: Готовый перевод публикуется полностью

- **WHEN** товар проходит `englishReady`
- **THEN** мета-данные содержат canonical и `languages` для `sr` и `en`
- **AND** `robots.index` равен `true`, в sitemap добавлена английская ссылка

### Requirement: Юридические страницы расположены вне префиксов [countryCode]

Страницы приватности, условий и cookies обслуживаются маршрутами вне `[countryCode]` (`/privacy` и так далее для `sr`, `/en/privacy` и так далее для `en`); английский маршрут обязан (MUST) переэкспортировать компонент и `generateMetadata` сербского. `localizedPath` обязан (MUST) выбирать для этих путей префикс по локали.

#### Scenario: Английская страница приватности

- **WHEN** запрашивается `/en/privacy`
- **THEN** рендерится компонент `app/privacy/page.tsx`, переэкспортированный маршрутом `app/en/privacy/page.tsx`
- **AND** canonical равен `siteUrl("/en/privacy")`, `robots.index` равен `true`

#### Scenario: Ссылка на условия в английском интерфейсе

- **WHEN** `localizedPath("/terms", "en")`
- **THEN** получается `/en/terms`
- **AND** `localizedPath("/en/terms", "sr")` возвращает `/terms`
