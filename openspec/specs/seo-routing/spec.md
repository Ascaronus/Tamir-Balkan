# seo-routing Specification

## Purpose
Фиксирует текущее SEO-поведение витрины `tamir.rs`: постоянный входной редирект 308 на `/rs`, канонизацию сербских путей через 308, canonical/hreflang, индексируемость английских версий товаров, алиасы старых адресов, правила `sitemap.xml`, `robots.txt` и `noindex` для приватных разделов.

## Requirements

### Requirement: Входной редирект на / постоянно ведёт на /rs

Прокси обязан (MUST) для пути `/` ответить `308` на `/rs` с сохранением query-строки, независимо от cookie `store_locale` и заголовка `Accept-Language`. Ответ сохраняет `Cache-Control: private, no-store`, но не публикует `Vary: Accept-Language, Cookie`: назначения больше не зависят от пользователя. Постоянный статус усиливает canonical `/rs`; английская версия доступна по `/en` и через переключатель языка.

#### Scenario: Английский браузер и сохранённый английский язык

- **WHEN** запрос `/?q=hat` содержит `store_locale=en` и `Accept-Language: en-US`
- **THEN** ответ возвращает `308` на `/rs?q=hat`
- **AND** прямой запрос `/en` остаётся доступным с HTTP 200 и canonical `/en`

### Requirement: Неканонические сербские пути получают постоянный редирект 308

Прокси обязан (MUST) для любого неканонического пути под `/rs/` (например `/rs/cart`, `/rs/nalog/prijava`) вернуть `308` на сербский слаг из `localizedPath`. Matcher прокси обязан (MUST) исключать `api`, `_next/static`, `_next/image`, `favicon.ico`, `robots.txt`, `sitemap.xml`, а заголовок `x-tamir-locale` обязан (MUST) всегда перезаписываться значением, вычисленным из пути.

#### Scenario: Английский слаг на сербском префиксе

- **WHEN** браузер запрашивает `/rs/cart`
- **THEN** прокси отвечает `308` на `/rs/korpa`

#### Scenario: Канонический сербский путь не получает редиректа

- **WHEN** браузер запрашивает `/rs/korpa?next=checkout`
- **THEN** прокси пропускает запрос дальше
- **AND** в запросе стоит `x-tamir-locale: sr`

#### Scenario: Обход служебных файлов

- **WHEN** робот запрашивает `/robots.txt` или `/sitemap.xml`
- **THEN** прокси не обрабатывает запрос (исключён matcher'ом)

### Requirement: Устаревший префикс /me получает постоянный редирект на /rs

Конфигурация Next обязана (MUST) постоянно (`permanent: true`) перенаправлять `/me` на `/rs` и `/me/:path*` на `/rs/:path*`, чтобы исторические ссылки не оставались битыми.

#### Scenario: Старая внешняя ссылка

- **WHEN** запрашивается `/me/catalog`
- **THEN** следует постоянный редирект (`permanent: true`) на `/rs/catalog`

### Requirement: Публичные страницы публикуют canonical и пару hreflang sr/en

Каждая публичная страница (включая юридические `/privacy`, `/terms`, `/cookies` вне `[countryCode]`) обязана (MUST) строить мета-данные через `languageAlternates`: `canonical` обязан (MUST) соответствовать локали страницы, а `languages` обязан (MUST) содержать обе абсолютные ссылки `sr` и `en`. Абсолютные SEO URL обязана (MUST) строить функция `siteUrl` от постоянного origin `https://tamir.rs` независимо от `NEXT_PUBLIC_SITE_URL`; canonical обязан (MUST) описывать публичные URL, а не цели внутренних rewrite. Переданный в `siteUrl` абсолютный URL другого origin обязан (MUST) отклоняться.

#### Scenario: Сербская страница категории

- **WHEN** рендерится `/rs/catalog`
- **THEN** в мета-данных canonical ведёт на сербский URL
- **AND** hreflang-пары ссылаются на сербский и английский варианты

#### Scenario: Английская юридическая страница

- **WHEN** на production-хосте рендерится `/en/privacy`
- **THEN** canonical равен `siteUrl("/en/privacy")`
- **AND** мета-данные содержат `robots.index: true`

### Requirement: Стенд запрещает индексацию на уровне HTTP и HTML

Индексируемые production-хосты витрины — `tamir.rs` и `www.tamir.rs`. Стенд и другие непубличные хосты обязаны (MUST) возвращать `X-Robots-Tag: noindex, nofollow, noarchive, nosnippet`; HTML metadata публичных страниц обязаны (MUST) сохранять запрет `noindex`, включая дочерние metadata каталога, товаров и юридических страниц. `robots.txt` обязан (MUST) разрешать обход для чтения noindex без объявления sitemap; sitemap стенда обязан (MUST) быть пустым. Локальная HTTP-разработка сохраняет исключение из ограничения хостов.

#### Scenario: Товар или юридическая страница на стенде

- **WHEN** запрос приходит на `test.tamir.rs`, в том числе при `NEXT_PUBLIC_SITE_URL=https://test.tamir.rs`
- **THEN** HTTP-заголовок и HTML robots запрещают индексацию
- **AND** canonical и hreflang используют `https://tamir.rs`
- **AND** изменение окружения не превращает стенд в индексируемый сайт

### Requirement: Индексируемость английской страницы товара зависит от englishReady

`englishReady` обязан (MUST) требовать `metadata.en_content_ready === true` и непустой `metadata.en_handle`; английской адрес страницы товара обязан (MUST) браться из `en_handle`, а при его отсутствии — из сербского `handle`. Пока товар не готов по-английски, страница `/en/products/...` обязана (MUST) публиковать `robots.index: false` и canonical без hreflang-пары.

#### Scenario: Товар без английского контента

- **WHEN** запрашивается `/en/products/stara-adresa` для товара без `en_content_ready`
- **THEN** страница отвечает `robots: { index: false }` с одиночным canonical
- **AND** пара hreflang `sr`/`en` отсутствует

### Requirement: Старый адрес товара разрешается через текущий алиас

Для неизвестного handle витрина обязана (MUST) обратиться к `GET /store/product-redirects/:handle` (ответ `Cache-Control: no-store`; handle длиннее 255 символов — `404`). Бэкенд обязан (MUST) вернуть handle только для текущей записи `tamir_product_url` (`is_current = true`) unpublished-safe: неудалённого товара со статусом `published`; страница обязана (MUST) открыться, лишь когда запрошенный handle совпадает с текущим адресом для языка запроса.

#### Scenario: Переезд товара на новый EN-адрес

- **WHEN** робот открывает прежний адрес, сохранённый в `tamir_product_url` как не `is_current`
- **THEN** бэкенд отвечает `404`, страница товара возвращает `notFound()`

#### Scenario: Актуальный алиас

- **WHEN** запрошенный handle совпадает с текущей алиас-записью опубликованного товара
- **THEN** витрина отдаёт страницу товара по этому адресу

### Requirement: Каталог и категории канонизируются и убирают мусорные страницы из индекса

`generateMetadata` каталога обязан (MUST) публиковать canonical `/rs` для главной коллекции, `/rs/catalog?page=N` для пагинации и путь категории для категории; обращение к категории не по её слагу обязано (MUST) давать `permanentRedirect`. Страница пагинации за концом фактической выдачи обязана (MUST) возвращать `notFound()` (только при успешном ответе бэкенда), а выдача с `q` и пустые категории обязаны (MUST) получать `robots.index: false`.

#### Scenario: Устаревшая страница пагинации

- **WHEN** запрашивается `/rs/catalog?page=99`, где товаров хватает лишь на 3 страницы
- **THEN** страница возвращает `notFound()` вместо пустого 200

#### Scenario: Выдача поиска

- **WHEN** открыт `/rs/catalog?q=куртка`
- **THEN** canonical указывает на `/rs`, а `robots.index: false` исключает выдачу из индекса

### Requirement: Sitemap строится динамически парами sr/en с экранированием

`GET /sitemap.xml` обязана (MUST) генерироваться при каждом запросе (`dynamic = "force-dynamic"`): служебные страницы `/rs`, `/cookies`, `/privacy`, `/terms` парами sr/en; товары пачками по 100 с `lastModified` из `updated_at`, при `englishReady` — парой URL, иначе только сербский URL; пагинация каталога и непустые категории с пагинацией. Значения обязана (MUST) экранировать (`&`, `"`, `<`) перед записью в XML.

#### Scenario: Неготовый к EN товар

- **WHEN** товар не проходит `englishReady`
- **THEN** в sitemap попадает только его сербский URL без alternates

### Requirement: Robots разрешает обход кроме API и noindex для приватных разделов

`GET /robots.txt` обязан (MUST) публиковать правила `userAgent: "*", allow: "/"`, `disallow: ["/api/"]` и ссылку на `sitemap.xml`. Layout'ы разделов `cart`, `checkout`, `order` и `account` обязаны (MUST) публиковать `robots: { index: false, follow: false }`, чтобы приватные страницы не попадали в индекс и ссылки с них не переходились роботом.

#### Scenario: Робот читает robots.txt

- **WHEN** поисковый робот запрашивает `/robots.txt`
- **THEN** ответ разрешает всё кроме `/api/` и указывает адрес sitemap

#### Scenario: Личный кабинет

- **WHEN** робот добирается до `/rs/nalog`
- **THEN** страница содержит `robots: { index: false, follow: false }` из layout
