# Spec Delta

## Purpose

Фиксирует текущее SEO-поведение витрины `tamir.rs`: временный входной редирект 307, канонизацию сербских путей через 308, canonical/hreflang, индексируемость английских версий товаров, алиасы старых адресов, правила `sitemap.xml`, `robots.txt` и `noindex` для приватных разделов.

## ADDED Requirements

### Requirement: The entry redirect for / performs language selection and responds 307 without caching

Прокси обязан (MUST) для пути `/` выбрать язык сначала из cookie `store_locale`, иначе из заголовка `Accept-Language` (с дефолтом `sr`) и ответить `307` на `/rs` или `/en` с сохранением query-строки. Ответ обязан (MUST) содержать `Cache-Control: private, no-store` и `Vary: Accept-Language, Cookie`, чтобы персональный выбор языка не кешировался.

#### Scenario: First visit without a cookie

- **WHEN** запрос `/` не имеет `store_locale` и содержит `Accept-Language: en-US`
- **THEN** ответ возвращает `307` на `/en` с исходной query-строкой
- **AND** в ответе есть `Cache-Control: private, no-store` и `Vary: Accept-Language, Cookie`

### Requirement: Non-canonical Serbian paths receive a permanent 308 redirect

Прокси обязан (MUST) для любого неканонического пути под `/rs/` (например `/rs/cart`, `/rs/nalog/prijava`) вернуть `308` на сербский слаг из `localizedPath`. Matcher прокси обязан (MUST) исключать `api`, `_next/static`, `_next/image`, `favicon.ico`, `robots.txt`, `sitemap.xml`, а заголовок `x-tamir-locale` обязан (MUST) всегда перезаписываться значением, вычисленным из пути.

#### Scenario: An English slug on the Serbian prefix

- **WHEN** браузер запрашивает `/rs/cart`
- **THEN** прокси отвечает `308` на `/rs/korpa`

#### Scenario: A canonical Serbian path gets no redirect

- **WHEN** браузер запрашивает `/rs/korpa?next=checkout`
- **THEN** прокси пропускает запрос дальше
- **AND** в запросе стоит `x-tamir-locale: sr`

#### Scenario: Utility files are excluded

- **WHEN** робот запрашивает `/robots.txt` или `/sitemap.xml`
- **THEN** прокси не обрабатывает запрос (исключён matcher'ом)

### Requirement: The legacy /me prefix receives a permanent redirect to /rs

Конфигурация Next обязана (MUST) постоянно (`permanent: true`) перенаправлять `/me` на `/rs` и `/me/:path*` на `/rs/:path*`, чтобы исторические ссылки не оставались битыми.

#### Scenario: An old external link

- **WHEN** запрашивается `/me/catalog`
- **THEN** следует постоянный редирект (`permanent: true`) на `/rs/catalog`

### Requirement: Public pages publish a canonical and an sr/en hreflang pair

Каждая публичная страница (включая юридические `/privacy`, `/terms`, `/cookies` вне `[countryCode]`) обязана (MUST) строить мета-данные через `languageAlternates`: `canonical` обязан (MUST) соответствовать локали страницы, а `languages` обязан (MUST) содержать обе абсолютные ссылки `sr` и `en`. Абсолютные URL обязана (MUST) строить функция `siteUrl` от `NEXT_PUBLIC_SITE_URL` (дефолт `https://tamir.rs`); canonical обязан (MUST) описывать публичные URL, а не цели внутренних rewrite.

#### Scenario: The Serbian category page

- **WHEN** рендерится `/rs/catalog`
- **THEN** в мета-данных canonical ведёт на сербский URL
- **AND** hreflang-пары ссылаются на сербский и английский варианты

#### Scenario: The English legal page

- **WHEN** рендерится `/en/privacy`
- **THEN** canonical равен `siteUrl("/en/privacy")`
- **AND** мета-данные содержат `robots.index: true`

### Requirement: The indexability of the English product page depends on englishReady

`englishReady` обязан (MUST) требовать `metadata.en_content_ready === true` и непустой `metadata.en_handle`; английской адрес страницы товара обязан (MUST) браться из `en_handle`, а при его отсутствии — из сербского `handle`. Пока товар не готов по-английски, страница `/en/products/...` обязана (MUST) публиковать `robots.index: false` и canonical без hreflang-пары.

#### Scenario: A product without English content

- **WHEN** запрашивается `/en/products/stara-adresa` для товара без `en_content_ready`
- **THEN** страница отвечает `robots: { index: false }` с одиночным canonical
- **AND** пара hreflang `sr`/`en` отсутствует

### Requirement: An old product URL resolves through the current alias

Для неизвестного handle витрина обязана (MUST) обратиться к `GET /store/product-redirects/:handle` (ответ `Cache-Control: no-store`; handle длиннее 255 символов — `404`). Бэкенд обязан (MUST) вернуть handle только для текущей записи `tamir_product_url` (`is_current = true`) unpublished-safe: неудалённого товара со статусом `published`; страница обязана (MUST) открыться, лишь когда запрошенный handle совпадает с текущим адресом для языка запроса.

#### Scenario: A product moves to a new EN URL

- **WHEN** робот открывает прежний адрес, сохранённый в `tamir_product_url` как не `is_current`
- **THEN** бэкенд отвечает `404`, страница товара возвращает `notFound()`

#### Scenario: The current alias

- **WHEN** запрошенный handle совпадает с текущей алиас-записью опубликованного товара
- **THEN** витрина отдаёт страницу товара по этому адресу

### Requirement: Catalog and categories are canonicalized and junk pages are removed from the index

`generateMetadata` каталога обязан (MUST) публиковать canonical `/rs` для главной коллекции, `/rs/catalog?page=N` для пагинации и путь категории для категории; обращение к категории не по её слагу обязано (MUST) давать `permanentRedirect`. Страница пагинации за концом фактической выдачи обязана (MUST) возвращать `notFound()` (только при успешном ответе бэкенда), а выдача с `q` и пустые категории обязаны (MUST) получать `robots.index: false`.

#### Scenario: An outdated pagination page

- **WHEN** запрашивается `/rs/catalog?page=99`, где товаров хватает лишь на 3 страницы
- **THEN** страница возвращает `notFound()` вместо пустого 200

#### Scenario: Search results

- **WHEN** открыт `/rs/catalog?q=куртка`
- **THEN** canonical указывает на `/rs`, а `robots.index: false` исключает выдачу из индекса

### Requirement: The sitemap is built dynamically as sr/en pairs with escaping

`GET /sitemap.xml` обязана (MUST) генерироваться при каждом запросе (`dynamic = "force-dynamic"`): служебные страницы `/rs`, `/cookies`, `/privacy`, `/terms` парами sr/en; товары пачками по 100 с `lastModified` из `updated_at`, при `englishReady` — парой URL, иначе только сербский URL; пагинация каталога и непустые категории с пагинацией. Значения обязана (MUST) экранировать (`&`, `"`, `<`) перед записью в XML.

#### Scenario: A product not ready for EN

- **WHEN** товар не проходит `englishReady`
- **THEN** в sitemap попадает только его сербский URL без alternates

### Requirement: Robots allows crawling except the API and sets noindex for private sections

`GET /robots.txt` обязан (MUST) публиковать правила `userAgent: "*", allow: "/"`, `disallow: ["/api/"]` и ссылку на `sitemap.xml`. Layout'ы разделов `cart`, `checkout`, `order` и `account` обязаны (MUST) публиковать `robots: { index: false, follow: false }`, чтобы приватные страницы не попадали в индекс и ссылки с них не переходились роботом.

#### Scenario: A crawler reads robots.txt

- **WHEN** поисковый робот запрашивает `/robots.txt`
- **THEN** ответ разрешает всё кроме `/api/` и указывает адрес sitemap

#### Scenario: The account area

- **WHEN** робот добирается до `/rs/nalog`
- **THEN** страница содержит `robots: { index: false, follow: false }` из layout
