# Проверка изменений

Команды запускаются из указанного каталога. CI-конфигурация — [verify.yml](../.github/workflows/verify.yml); это источник точного списка обязательных проверок. Матрица Node: 20.20.2 и 24.

## Baseline CI (состояние до change modernize-existing-tests)

Снято 2026-10-26 через `gh run list --workflow=verify.yml --limit 3` и GitHub API (`/actions/runs/{id}/jobs`). Все три последних прогона — `success`; длительность джоба `verify` от старта до завершения:

| Прогон | Событие / ветка | Node 20.20.2 | Node 24 |
|---|---|---|---|
| #143 | PR `chore/setup-openspec` | 3 мин 38 с | 2 мин 47 с |
| #142 | push `main` (merge PR #33) | 3 мин 56 с | 3 мин 59 с |
| #141 | PR `fix/dialog-backdrop-reviews` | 2 мин 51 с | 3 мин 05 с |

Типичный диапазон — 3–4 минуты на джоб. Эти числа — ориентир для сравнения после перевода CI на discovery-helper; они не являются SLA.

## Frontend

```bash
cd frontend
npm ci
npm test
npm run lint -- --quiet
npm run build
node test-support/verify-localized-routes.mjs
```

`npm test` подключает TypeScript loader и запускает `tests/*.test.mjs`. Последний проход для изменения главных/служебных URL: 141 тест; число не является контрактом и меняется с набором тестов.

Production-route script поднимает собранный Next на `127.0.0.1:3137` и проверяет языковые заголовки, `/rs`/`/en`, корень с браузерным языком и cookie, private noindex, новые сербские служебные URL, старые 308-переходы и публичный origin за reverse proxy. Он завершает свой процесс после проверки. Не запускайте его поверх другого процесса на том же порту.

## Backend

```bash
cd backend
npm ci
node --test tests/rozetka-admin.test.cjs tests/option-autotranslate.test.cjs tests/registration-email.test.cjs tests/catalog.test.cjs tests/catalog-http.test.cjs tests/admin-decimals.test.cjs
npm run build
```

SQL-интеграции требуют **отдельную тестовую PostgreSQL-базу**, переданную как `TEST_REVIEWS_DB_URL`:

```bash
# Из backend/, TEST_REVIEWS_DB_URL уже экспортирован для отдельной тестовой БД.
node --test tests/reviews.integration.cjs tests/deleted-customer-registration.integration.cjs tests/registration-code.integration.cjs tests/password-reset.integration.cjs tests/decimal-attributes.integration.cjs tests/product-urls.integration.cjs tests/category-localization.integration.cjs tests/catalog-popularity.integration.cjs
```

Не используйте production DATABASE_URL: тесты готовят и изменяют свои данные/схемы. CI создаёт отдельный PostgreSQL service. `npm run test:integration:http` — отдельный Jest health-тест, не замена регрессиям из `tests/`.

Нативный import workflow проверяется `tests/rozetka-native.ts` только в специальной базе с суффиксом `_import_test`; порядок — в [ROZETKA-ADMIN-IMPORT.md](ROZETKA-ADMIN-IMPORT.md).

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
| catalog-translations.test.mjs ⚠ | unit | API-клиент | Сопоставление переводов при поиске; утверждения на абстрактных маркерах, не на строках `messages/` |
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

### Backend unit (`backend/tests/*.test.cjs`, 7 файлов)

Среда: `node --test` + ts-node; PostgreSQL не требуется (мок SMTP/Google/`fetch` там, где указано).

| Файл | Слой | Границы (изолировано) | Что доказывает |
|---|---|---|---|
| admin-decimals.test.cjs | unit | — (проверка сборки патчей через esbuild) | Десятичные в админке: валидация, pinned-патчи дашборда |
| auth-secrets.test.cjs | unit | — | Отказ weak/template-секретов; Secure-cookie в production |
| catalog-http.test.cjs ⚠ | handler | Фейковые `req/res`, container/graph (audit p.46) | Реальный Medusa-middleware и правила маршрута: скоуп канала, сортировка, счётчики; сетевого HTTP нет |
| catalog.test.cjs | unit | — | Утилиты каталога: фасеты, связи «размер+цвет+цена», поиск с диакритикой |
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
| backend/integration-tests/http/health.spec.ts ⚠ | http-integration (Jest, `medusaIntegrationTestRunner`) | Только `/health` (audit p.52) | Medusa-приложение поднимается и отвечает по HTTP; магазин/БД/почта — нет. В CI не запускался до этого change |
| backend/tests/rozetka-native.ts | scenario (`medusa exec`, база `*_import_test`) | Только эта база | Реальные import-workflow создают товары/варианты/переводы; отказ дубль-handles. В CI не запускался до этого change |
| frontend/test-support/verify-localized-routes.mjs | http-integration (собранный `next start` на 127.0.0.1:3137) | Реальный production-сбор Next | Парность `/rs`/`/en` и headers на реальном сервере; уже в CI |

### Отметки и план усиления

Находки зафиксированы **без удаления тестов** (правило аудита §3): тест остаётся, граница маркируется, пробел закрывается тестом высшего слоя.

| Находка | План усиления |
|---|---|
| `catalog-http.test.cjs`: имя обещает HTTP, слой — фейковые `req/res` | Новый `integration-tests/http/catalog.spec.ts` — реальный `GET /api/store/catalog/products` in-app (задача 3.1 change) |
| `login-rate-limit.integration.cjs`: реальный PG, но фейковый HTTP | Негатив авторизации на реальном HTTP: `auth-negative.spec.ts` (задача 3.2); троттлинг остаётся закрыт на своём слое |
| `registration-email.test.cjs`: SMTP-мок при имени «email» | Граница задокументирована; живая доставка — вне этого репозитория (внешний E2E с Mailpit в Tamir-QA-Automation), в CI шаг запускает тест как unit с мок-границей |
| `catalog-translations.test.mjs`: абстрактные маркеры вместо строк `messages/` | Assert'ы реальных en/sr-строк (задача 5.1) |
| `catalog-popularity.integration.cjs`: редкие утверждения | Сценарий сортировки по популярности через реальный HTTP в `catalog.spec.ts` (задача 3.1) |
| `cart-client.test.mjs`, `catalog-ui.test.mjs`, `seo.test.mjs`, `registration-code-ui.test.mjs`: мок-границы ключевых внешних слоёв | Классификация сохранена; реальный браузерный journey вне этого репозитория (Tamir-QA-Automation); в репозитории граница закрыта `verify-localized-routes.mjs` (реальный HTTP) и Jest-smoke |
| Jest-суита и `rozetka-native.ts` не исполнялись в CI | Шаги CI: `test:integration:http`, `rozetka-native` на базе `_import_test` (задачи 2.4/2.5) |

## Проверка на сайте

- `/rs` и `/en` открываются без редиректа в каталог; root корректно выбирает язык при отсутствии cookie.
- Логотип, категории и переключатель языка ведут на нужные адреса, старые ссылки сохраняют параметры.
- SR корзина/кабинет имеют локализованные URL; английские остаются EN. Неприватные страницы индексируемы по правилам SEO, private — noindex.
- Импорт: сначала preview/черновик, проверка native переводов, RSD, склада, профиля доставки и копирования фото.
- Нет отзывов: пустые звёзды, без нулевого счётчика. Остаток 1: количество не редактируется, покупка доступна.
- Для изменений checkout/auth отдельно проверяйте профиль, CAPTCHA/email и доставку. Автотест с fixture не доказывает реальную доставку письма или оплату.

Создание реальных аккаунтов, отправка писем и оформление заказов не являются побочным действием обычного smoke test: используйте согласованные тестовые данные и среду. Датированные исторические проверки интерфейса находятся в RESPONSIVE-V2/FRONTEND-REDESIGN и не означают повторную проверку на каждой версии.
