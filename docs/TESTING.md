# Проверка изменений

Команды запускаются из указанного каталога. CI-конфигурация — [verify.yml](../.github/workflows/verify.yml); это источник точного списка обязательных проверок. Матрица Node: 20.20.2 и 24.
Обязательные правила написания и изменения тестов (в том числе для AI-агентов) — [TESTING-RULES.md](TESTING-RULES.md).

## Baseline CI (состояние до change modernize-existing-tests)

Снято 2026-10-26 через `gh run list --workflow=verify.yml --limit 3` и GitHub API (`/actions/runs/{id}/jobs`). Все три последних прогона — `success`; длительность джоба `verify` от старта до завершения:

| Прогон | Событие / ветка | Node 20.20.2 | Node 24 |
|---|---|---|---|
| #143 | PR `chore/setup-openspec` | 3 мин 38 с | 2 мин 47 с |
| #142 | push `main` (merge PR #33) | 3 мин 56 с | 3 мин 59 с |
| #141 | PR `fix/dialog-backdrop-reviews` | 2 мин 51 с | 3 мин 05 с |

Типичный диапазон — 3–4 минуты на джоб. Эти числа — ориентир для сравнения после перевода CI на discovery-helper; они не являются SLA.

После перевода на discovery-helper (прогон #145, ветка `chore/modernize-existing-tests`, обе джобы `success`): Node 20.20.2 — 4 мин 19 с, Node 24 — 4 мин 12 с. Прирост ~30–40 с на джоб объясняется новыми шагами: изолированный `_import_test`-прогон `rozetka-native.ts` (создание БД, `db:migrate`, `setup-reviews`, exec) и Jest-шаг `test:integration:http`; артефакты отчётов — `test-reports-node-*` (junit XML + jest JSON, `retention-days: 14`).

## Frontend

```bash
cd frontend
npm ci
npm test
npm run lint -- --quiet
npm run build
node test-support/verify-localized-routes.mjs
```

`npm test` подключает TypeScript loader (нужен установленный dev-пакет `typescript`
из `npm ci`) и запускает `tests/*.test.mjs`. Последний проход на ветке `chore/modernize-existing-tests`: 166 тестов;
число не является контрактом и меняется вместе с набором тестов; точный список обязательных прогонов — в CI.

Production-route script поднимает собранный Next на `127.0.0.1:3137` и проверяет языковые заголовки, `/rs`/`/en`, корень с браузерным языком и cookie, private noindex, новые сербские служебные URL, старые 308-переходы и публичный origin за reverse proxy. Перед подъёмом сервера он выполняет статическую фазу — сверку симметрии дерева маршрутов `en/*` ↔ корневых (работает без сборки и падает на асимметрии). Он завершает свой процесс после проверки. Не запускайте его поверх другого процесса на том же порту.

## Backend

Тесты исполняет discovery-helper `test-support/run-tests.mjs` (`npm run test:cjs`). Он сам находит `tests/*.test.cjs`
и `tests/*.integration.cjs` и делит их на категории «нужна БД» и «без БД» — при добавлении нового тестового файла
команды и workflow править не нужно.

```bash
cd backend
npm ci
npm run test:cjs -- --list                       # полный список найденных файлов и категорий
npm run test:cjs -- --no-db                      # тесты без БД
npm run test:cjs -- --junit-dir=reports          # все тесты, JUnit XML в backend/reports/
npm run build
```

SQL-интеграции требуют **отдельную тестовую PostgreSQL-базу**, переданную как `TEST_REVIEWS_DB_URL`
(имя базы обязано заканчиваться на `_test`/`_tests`):

```bash
# Из backend/, TEST_REVIEWS_DB_URL уже экспортирован для отдельной тестовой БД.
npm run test:cjs -- --db-only --junit-dir=reports
```

`test-support/guard-env.cjs` отказывает в запуске БД-тестов, если любая строка подключения ведёт на базу с именем
без `_test` (`exit 2`, до первого запроса); тот же гард вызывается из Jest-setup (`integration-tests/setup.js`)
и отдельным CI-шагом. Не используйте production DATABASE_URL: тесты готовят и изменяют свои данные/схемы.
CI создаёт отдельный PostgreSQL service. Независимость порядка файлов проверена флагом `--reverse`:

```bash
npm run test:cjs -- --db-only --reverse --junit-dir=reports-rev
```

`npm run test:integration:http` — отдельная Jest HTTP-суита (`medusaIntegrationTestRunner`); ей нужны PostgreSQL-сервер
через `DB_HOST`/`DB_USERNAME`/`DB_PASSWORD`/`DB_PORT` (runner сам создаёт временные базы `medusa-*-integration-*`)
и Redis (`REDIS_URL`). Она не заменяет регрессии из `tests/`. `DB_HOST` должен быть `localhost`:
`@medusajs/test-utils` включает SSL для любого другого хоста, что не работает со стандартной локальной PostgreSQL.

Нативный import workflow проверяется `tests/rozetka-native.ts` только в специальной базе с суффиксом `_import_test`;
порядок — в [ROZETKA-ADMIN-IMPORT.md](ROZETKA-ADMIN-IMPORT.md) с дополнением для чистой базы: между
`npx medusa db:migrate` и `npx medusa exec ./tests/rozetka-native.ts` выполните
`npx medusa exec ./src/scripts/setup-reviews.ts` — схемы `tamir_product_url` и отзывов создаются этим скриптом,
а не миграциями.

### CI-шаги backend (`verify.yml`)

1. `node test-support/guard-env.cjs --require-env` — самопроверка: окружение содержит только тестовые базы (`review_test`).
2. `npm run test:cjs -- --no-db --junit-dir=reports` — unit/handler-тесты без БД.
3. `tests/rozetka-native.ts` на отдельной базе `tamir_balkan_import_test`: `createdb` → `npx medusa db:migrate` →
   `npx medusa exec ./src/scripts/setup-reviews.ts` → `npx medusa exec ./tests/rozetka-native.ts`.
4. `npm run test:cjs -- --db-only --junit-dir=reports` — SQL-интеграции против `review_test`.
5. `npm run test:integration:http -- --json --outputFile=reports/jest-http.json` — Jest HTTP-суита.
6. `actions/upload-artifact` — каталог `backend/reports/` (JUnit XML от `node --test` и JSON от Jest), `retention-days: 14`.

Все шаги идут на PostgreSQL- и Redis-service и на Node 20.20.2, и на Node 24.

## Каталог тестов

Слой: `unit` — чистые функции/модули; `handler` — обработчик маршрута без сетевого HTTP (фейковые `req/res` либо `NextResponse`); `component` — логика UI на harness; `db-integration` — реальная PostgreSQL; `http-integration` — реальный HTTP в процессе; `scenario` — скриптовый сценарий на одноразовой базе. Имя с ⚠ не означает сетевой/реальный слой — смотри колонку границ.

### Frontend (`frontend/tests/`, 29 файлов)

Среда: `node --test` + TypeScript loader (`test-support/register.mjs`); браузер, dev/live-сервер и реальная Medusa не участвуют.

| Файл | Слой | Границы (изолировано) | Что доказывает |
|---|---|---|---|
| account-recovery.test.mjs | unit | Medusa API, почта | Логика восстановления пароля (запросы, коды) |
| admin-option-translations.test.mjs | handler | Сеть, БД (через `next/server`) | Перевод опций в admin-маршруте |
| browser-locale.test.mjs | unit | — | Выбор локали по cookie/Accept-Language |
| cart-client.test.mjs ⚠ | unit | Medusa SDK, HTTP/fetch, storage | Добавление/замена/удаление позиций, гонки создания корзины; живое поведение корзины — нет |
| cart-confirmation.test.mjs | unit | Платёж/почта | Сборка receipt подтверждения, «Ukupno» |
| catalog-pagination.test.mjs | unit | API | Границы страниц и параметры URL |
| catalog-translations.test.mjs | unit + компонентный рендер (harness) | Реальные `src/messages/en.json`/`sr.json`; API-клиент подменён | Сопоставление переводов при поиске + рендер `CatalogFilters` с реальными en/sr-строками витрины (заголовок, legend, кнопки, labels диалога), параллельно `en`/`sr` (проверяемые ключи различаются в двух языках, sr-редакция латиницей без кириллицы); расхождение строк в `messages/` роняет тест |
| catalog-ui.test.mjs ⚠ | unit | API-клиент (подготовленные ответы) | Фильтры, аргументы URL, свотчи цветов; живые товары/цены — нет |
| checkout-fields.test.mjs | unit | — | Нормализация checkout/profile-полей |
| commerce.test.mjs | unit | — | Цены, product-mapper, схема, варианты, поля |
| cookie-consent.test.mjs | unit | — | Состояния согласия на cookie |
| dialog-backdrop.test.mjs | unit | DOM (фейковый `getBoundingClientRect`) | Закрытие необязательных диалогов кликом по подложке; контент/drag/клавиатура/правая кнопка — не закрывают |
| english-routing.test.mjs | unit | Сервер (только чистые URL) | Канонический вид `/en`/`rs`-ссылок |
| localized-cart.test.mjs | unit | API | Локализованные URL корзины |
| order-history.test.mjs | unit | API | Маппинг истории заказов |
| product-attributes.test.mjs | unit | — | Атрибуты + next-intl на реальных en/sr-сообщениях |
| product-card-colors.test.mjs | unit | — | Цвета карточки и фильтрация |
| product-reviews.test.mjs | unit | — | Отзывы, модерационные слова |
| product-schema.test.mjs | unit | — | Product JSON-LD/schema |
| profile-fields.test.mjs | unit | — | Валидация profile-полей |
| registration.test.mjs | unit | Почта, auth API | Логика flow регистрации |
| registration-activation.test.mjs | unit | `next/headers`, API | Активация и сессия после кода |
| registration-cleanup.test.mjs | unit | API | Очистка незавершённой регистрации |
| registration-code-ui.test.mjs ⚠ | component | React hooks/harness, CAPTCHA, auth API, роутер | Порядок OTP-flow, запрет входа до верификации; реальная доставка письма — нет |
| registration-fields.test.mjs | unit | — | Поля регистрации и кода |
| reorder-import.test.mjs | unit | API | Переупорядочивание импорта, native option values |
| review-collapse.test.mjs | unit | — | UI-складывание списка отзывов |
| review-regressions.test.mjs | unit | API | Регрессии: review-query, модерация, список, телефон, schema |
| seo.test.mjs ⚠ | unit | Данные-фикстуры (audit: без живого HTTP) | Sitemap, robots, canonical, metadata; фактически отдаваемый HTML — нет |

### Backend unit (`backend/tests/*.test.cjs`, 8 файлов)

Среда: `node --test` + ts-node; PostgreSQL не требуется (мок SMTP/Google/`fetch` там, где указано).

| Файл | Слой | Границы (изолировано) | Что доказывает |
|---|---|---|---|
| admin-decimals.test.cjs | unit | — (проверка сборки патчей через esbuild) | Десятичные в админке: валидация, pinned-патчи дашборда |
| auth-secrets.test.cjs | unit | — | Отказ weak/template-секретов; Secure-cookie в production |
| catalog-http.test.cjs ⚠ | handler | Фейковые `req/res`, container/graph (audit p.46) | Реальный Medusa-middleware и правила маршрута: скоуп канала, сортировка, счётчики; сетевого HTTP нет |
| catalog.test.cjs | unit | — | Утилиты каталога: фасеты, связи «размер+цвет+цена», поиск с диакритикой |
| guard-env.test.cjs | unit | Строки env (реального подключения к БД нет) | Гард изоляции: боевые строки подключения отвергаются, пропускаются только базы `_test`; helper относит файл к БД-категории по маркеру `postgres://` в содержимом |
| option-autotranslate.test.cjs | handler | Google Translate (заменён `fetch`), req/res | Preview до оплаты, отказ чужим option ID, пакетный перевод |
| registration-email.test.cjs ⚠ | unit | `nodemailer.createTransport` заменён (audit p.48) | Требования SMTP-конфига, двуязычное письмо welcome, retry subscriber; реальный SMTP — нет |
| rozetka-admin.test.cjs ⚠ | unit/orchestration | Medusa-workflow, внешний `fetch` (audit p.47) | XML-парсер, валидация импорта, workflow-оркестрация; реально сохранённых товаров — нет |

### Backend db-integration (`backend/tests/*.integration.cjs`, 9 файлов)

Все требуют отдельную PostgreSQL (`TEST_REVIEWS_DB_URL`). Имя `integration` = реальный SQL, а не реальный HTTP.

| Файл | Слой | Границы (изолировано) | Что доказывает |
|---|---|---|---|
| catalog-popularity.integration.cjs ⚠ | db-integration | HTTP не поднят; утверждения редкие | Счёт завершённых продаж, изоляция скоупов |
| category-localization.integration.cjs | db-integration | HTTP | Бэкфилл нативных переводов, уникальность адресов |
| decimal-attributes.integration.cjs | db-integration | HTTP | Идемпотентность миграции decimal-атрибутов |
| deleted-customer-registration.integration.cjs | db-integration | HTTP, emailpass-callback | Повторная регистрация удалённого клиента, конкурентный cleanup |
| login-rate-limit.integration.cjs ⚠ | db-integration + middleware | Фейковые HTTP req/res/logger (audit p.50) | Троттлинг login по email+IP, XFF за nginx; живого Nginx/HTTP — нет |
| password-reset.integration.cjs | db-integration | Отправка письма симулирована | Коды сброса: срок, lockout, повторный запрос, конкурентные подтверждения |
| product-urls.integration.cjs | db-integration | HTTP | Уникальные EN-URL при импорте, алиасы, redirect-маршрут |
| registration-code.integration.cjs ⚠ | db-integration | Обратный вызов письма симулирован (audit p.49) | OTP: хеш при хранении, срок, 5 попыток, конкурентные confirm |
| reviews.integration.cjs | db-integration + handler | Turnstile через подменный `global.fetch` (audit p.51) | Полный отзывный lifecycle на реальной схеме; живого Turnstile — нет |

### Backend http-integration и сценарии

| Файл | Слой | Границы | Что доказывает |
|---|---|---|---|
| backend/integration-tests/http/health.spec.ts | http-integration (Jest, `medusaIntegrationTestRunner`) | Только `/health` (audit p.52) | Medusa-приложение поднимается и отвечает по HTTP; магазин/БД/почта — нет. В CI не запускался до этого change |
| backend/integration-tests/http/catalog.spec.ts | http-integration (Jest, `medusaIntegrationTestRunner`, изолированная тестовая БД + гард) | Реальный in-app HTTP с `x-publishable-api-key`; моки/фейковые req/res отсутствуют; внешние сервисы не задействованы | `GET /api/store/catalog/products` на созданной схеме: опубликованные товары sales channel с ценой/налогом региона (со статусом 200); фильтр по размеру/цене, сортировка, `limit`; контракт `sort_options`; 7 негативов 400: 6 случаев `INVALID_CATALOG_QUERY` (`region_id`/`limit`×2/`sort`/`min_price > max_price`/`fields`) плюс отсутствующий в ценовом контексте регион |
| backend/integration-tests/http/auth-negative.spec.ts | http-integration (Jest, `medusaIntegrationTestRunner`) | Реальный in-app HTTP без сессии администратора | Граница аутентификации на реальном HTTP: списки товаров и заказов в admin отклоняются без сессии |
| backend/tests/rozetka-native.ts | scenario (`medusa exec`, база `*_import_test`) | Только эта база | Реальные import-workflow создают товары/варианты/переводы; отказ дубль-handles. В CI не запускался до этого change |
| frontend/test-support/verify-localized-routes.mjs | http-integration (собранный `next start` на 127.0.0.1:3137) + статическая фаза по дереву маршрутов | Реальный production-сбор Next; статическая фаза сервера не требует | Парность `/rs`/`/en` и headers на реальном сервере; до подъёма сервера сверяет симметрию дерева `en/*` ↔ корневых маршрутов (асимметрия падает без сборки/сервера); уже в CI |

### Отметки и план усиления

Находки зафиксированы **без удаления тестов** (правило аудита §3): тест остаётся, граница маркируется, пробел закрывается тестом высшего слоя.

| Находка | План усиления |
|---|---|
| `catalog-http.test.cjs`: имя обещает HTTP, слой — фейковые `req/res` | **Закрыто (задача 3.1):** `integration-tests/http/catalog.spec.ts` — 9 тестов реального `GET /api/store/catalog/products` in-app (`medusaIntegrationTestRunner`); старый тест сохранён |
| `login-rate-limit.integration.cjs`: реальный PG, но фейковый HTTP | **Закрыто частично (задача 3.2):** негатив авторизации на реальном HTTP — `auth-negative.spec.ts` (2 теста 401 без сессии); троттлинг остаётся закрыт на своём db-слое |
| `registration-email.test.cjs`: SMTP-мок при имени «email» | Граница задокументирована; живая доставка — вне этого репозитория (внешний E2E с Mailpit в Tamir-QA-Automation), в CI шаг запускает тест как unit с мок-границей |
| `catalog-translations.test.mjs`: абстрактные маркеры вместо строк `messages/` | **Закрыто (задача 5.1):** рендер `CatalogFilters` с реальными en/sr-строками из `src/messages/`; tripwire проверен правками `en.json`/`sr.json` — оба роняют тест |
| `catalog-popularity.integration.cjs`: редкие утверждения | **Закрыто частично (задача 3.1):** HTTP-контракт сортировки (набор `sort_options`, отказ неверного `sort`) закрыт в `catalog.spec.ts`; реальный ранжировочный сценарий по продажам остаётся в `catalog-popularity.integration.cjs` — его слой сохранён |
| `cart-client.test.mjs`, `catalog-ui.test.mjs`, `seo.test.mjs`, `registration-code-ui.test.mjs`: мок-границы ключевых внешних слоёв | Классификация сохранена; реальный браузерный journey вне этого репозитория (Tamir-QA-Automation); в репозитории граница закрыта `verify-localized-routes.mjs` (реальный HTTP) и Jest-smoke |
| Jest-суита и `rozetka-native.ts` не исполнялись в CI | **Закрыто (задачи 2.4/2.5):** шаги CI `test:integration:http` и `rozetka-native` на базе `_import_test`; подтверждено прогоном #145 с артефактами отчётов |
| `verify-localized-routes.mjs`: асимметрия маршрутов видна только когда сервер поднят | **Закрыто (задача 5.2):** статическая фаза сверяет пары `en/*` ↔ корневых маршрутов до подъёма сервера (падает без сборки), runtime-цикл проверяет статус и `<html lang>` каждой пары |

## Проверка на сайте

- `/rs` и `/en` открываются без редиректа в каталог; root корректно выбирает язык при отсутствии cookie.
- Логотип, категории и переключатель языка ведут на нужные адреса, старые ссылки сохраняют параметры.
- SR корзина/кабинет имеют локализованные URL; английские остаются EN. Неприватные страницы индексируемы по правилам SEO, private — noindex.
- Импорт: сначала preview/черновик, проверка native переводов, RSD, склада, профиля доставки и копирования фото.
- Нет отзывов: пустые звёзды, без нулевого счётчика. Остаток 1: количество не редактируется, покупка доступна.
- Для изменений checkout/auth отдельно проверяйте профиль, CAPTCHA/email и доставку. Автотест с fixture не доказывает реальную доставку письма или оплату.

Создание реальных аккаунтов, отправка писем и оформление заказов не являются побочным действием обычного smoke test: используйте согласованные тестовые данные и среду. Датированные исторические проверки интерфейса находятся в RESPONSIVE-V2/FRONTEND-REDESIGN и не означают повторную проверку на каждой версии.

## Header authentication / login modal

`frontend/tests/header-authentication.test.mjs` — unit/component/lifecycle проверки:
реальные SR/EN-строки; отдельная навигация регистрации и восстановления пароля;
успех/ошибка/повторная отправка входа; сохранение страницы; имя и fallback; меню
профиля/заказов; восстановление сессии; выход; вызовы native dialog, focus и scroll lock.
Auth API и DOM мокируются на границе. Эти проверки не являются браузерным E2E и
не доказывают фактический focus trap или поведение экранной клавиатуры.
`verify-localized-routes.mjs` дополнительно проверяет SSR-кнопку входа в обеих локалях.

Во внешнем Tamir-QA-Automation на изолированном окружении проверить Tab/Shift+Tab,
вход существующего тестового покупателя, reload сессии, выход, корзину до/после входа,
переходы регистрации/восстановления и мобильную клавиатуру. На production аккаунты
для этих проверок не создавать. Logout сохраняет действующее правило очистки локальной
привязки корзины после успешного снятия cookie; при ошибке выхода состояние не очищается.

### Custom product URL schema in HTTP catalog tests

The catalog suite installs the shared `productUrlSchema` in its nested `beforeEach`,
after the Medusa runner resets the database and before product workflows emit events.
Medusa migrations alone do not create `tamir_product_url`. Production deployment
already runs `src/scripts/setup-reviews.ts` (which installs the same schema) before
activating the release. A catalog integration case exercises `syncProductUrl` and
checks the persisted current alias and product metadata. Existing HTTP assertions
and hook timeouts remain intact. This fixes the missing-table error; it does not
by itself establish the cause of intermittent runner cleanup timeouts.

### Await event subscribers before catalog cleanup

Medusa 2.13.1's local event bus emits via EventEmitter without awaiting async
listeners. Its integration runner waits for workflow executions, then truncates
tables; workflow completion does not imply subscriber completion. The catalog
suite observes the **real** product-localized-url handler via a Jest module wrapper,
waits after product fixture creation and in nested afterEach (before runner cleanup),
and asserts that at least four fixture handlers completed. Subscriber failures are
re-thrown to Jest even if the event bus catches and logs them. No handler is skipped
or replaced with a no-op. The observer has a 10-second diagnostic deadline; the
existing 120-second Jest timeout is unchanged.

This prevents test cleanup from overlapping URL transactions. In particular, those
transactions lock product rows and query translations through another connection;
a concurrent multi-table TRUNCATE can leave application-level waits across those
connections. CI logs prove hook timeouts but do not include a live lock snapshot,
so this specific lock cycle remains a diagnosis from code, not a captured DB trace.

`backend/tests/subscriber-tracker.test.cjs` checks delayed completion, failures,
nested events, deadlines and the installed real local event bus without a database.
Run it with `node --test tests/subscriber-tracker.test.cjs` from backend. Full catalog
HTTP validation still requires isolated PostgreSQL and Redis.

### Избранное

Контракт и границы проверок: [WISHLIST.md](WISHLIST.md). `wishlist.test.cjs` — handler,
`wishlist.integration.cjs` — PostgreSQL с guard, `http/wishlist.spec.ts` — Medusa HTTP.
Фронтенд: `wishlist.test.mjs` и обе локализованные страницы в `verify-localized-routes.mjs`.

### Предварительный просмотр корзины в шапке

`frontend/tests/cart-preview.test.mjs` — unit/component на существующем harness: таймеры hover/focus,
Escape, touch, границы viewport, SR/EN, ссылки вариантов, серверные суммы, empty/loading/error.
`localized-cart.test.mjs` дополнен проверкой состояния ошибки и явного retry.
Контракт и границы проверок: [CART-PREVIEW.md](CART-PREVIEW.md).

### Карусель баннеров

Контракты и синхронизация renderer: [HOMEPAGE-BANNERS.md](HOMEPAGE-BANNERS.md).
`banner-carousel.test.mjs` и `banner-admin.test.mjs` — component/unit; `homepage-banners.test.cjs` — unit/handler;
`homepage-banners.integration.cjs` — PostgreSQL; `integration-tests/http/homepage-banners.spec.ts` — Medusa HTTP.
