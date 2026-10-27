# Tasks

Реализация этой задачи = вычитка и подтверждение уже написанных дельт-спецификаций по коду/тестам + финальная валидация. Изменений кода, тестов и CI нет.

## 1. Инфраструктура и безопасность (backend-контур)

- [x] 1.1 Вычитать `specs/platform-architecture/spec.md` по `docker-compose.yml`, `package.json` (root scripts), `backend/medusa-config.ts`, `backend/src/api/middlewares.ts`, `.github/workflows/deploy.yml` и исправить расхождения формулировок; проверка: каждое требование цитирует факт из перечисленных файлов, `openspec validate document-current-behavior --strict` остаётся зелёным
- [x] 1.2 Вычитать `specs/security-access-control/spec.md` по `middlewares.ts`, `docs/SECRETS.md`, `scripts/check-review-config.cjs`, тестам `auth-secrets.test.cjs`, `login-rate-limit.integration.cjs` и регистрации/сброса; проверка: список лимитов/маршрутов совпадает с кодом, валидация `--strict` зелёная
- [x] 1.3 Вычитать `specs/customer-auth/spec.md` по тестам `registration-code`, `password-reset`, `deleted-customer-registration`, `registration-email` и utils-хелперам; проверка: коды ответов и коды ошибок (`verifiedRegistrationRequired`, `*_UNAVAILABLE`) в спеке совпадают с тестовыми утверждениями

## 2. Каталог, корзина, заказы, отзывы (витрина)

- [x] 2.1 Вычитать `specs/product-catalog/spec.md` по `catalog.test.cjs`, `catalog-http.test.cjs`, `catalog-popularity.integration.cjs`, `decimal-attributes.integration.cjs`, `product-urls.integration.cjs`, `category-localization.integration.cjs` и `frontend/tests/catalog-*`; проверка: параметры поиска/сортировки/фильтров/пагинации в сценариях соответствуют тестам
- [x] 2.2 Вычитать `specs/cart-checkout/spec.md` и `specs/customer-orders/spec.md` по `frontend/tests/cart-client.test.mjs`, `cart-confirmation.test.mjs`, `localized-cart.test.mjs`, `checkout-fields.test.mjs`, `commerce.test.mjs`, `order-history.test.mjs`, `account-recovery.test.mjs` и маршрутам `frontend/src/app/[countryCode]/**`; проверка: слаги (`korpa`, `nalog`, `checkout`), шаги оформления и доступ к заказам соответствуют тестам/маршрутам
- [x] 2.3 Вычитать `specs/product-reviews/spec.md` по `backend/tests/reviews.integration.cjs`, `frontend/tests/product-reviews.test.mjs`, `review-collapse.test.mjs`, `frontend/src/components/reviews/ProductReviews.tsx`, `frontend/src/lib/reviews/**` и API-review-роутам; проверка: требования модерации/троттлинга/повторных отзывов подтверждены тестами (`review-regressions.test.mjs` к отзывам не относится — проверен профиль, логин, checkout и order confirmation)

## 3. Локализация, SEO, Rozetka, админка

- [x] 3.1 Вычитать `specs/localization/spec.md` и `specs/seo-routing/spec.md` по `frontend/src/proxy.ts`, `frontend/next.config.ts`, `frontend/src/lib/i18n/paths.ts`, тестам `browser-locale.test.mjs`, `english-routing.test.mjs`, `catalog-translations.test.mjs`, `seo.test.mjs`, `product-schema.test.mjs` и sitemap/robots-маршрутам; проверка: слаги служебных страниц, правила определения локали и sitemap/robots в спеках совпадают с кодом
- [x] 3.2 Вычитать `specs/rozetka-import/spec.md` и `specs/administration/spec.md` по `backend/tests/rozetka-admin.test.cjs`, `admin-decimals.test.cjs`, `option-autotranslate.test.cjs`, `frontend/tests/admin-option-translations.test.mjs`, `reorder-import.test.mjs`, `backend/src/admin/**` и admin-роутам; проверка: контракт валидации фида, лимит тела `25mb` и наличие админ-страниц подтверждены файлами репозитория

## 4. Тесты и CI

- [x] 4.1 Вычитать `specs/testing-ci-cd/spec.md` по `.github/workflows/verify.yml`, `.github/workflows/deploy.yml`, `docs/TESTING.md` и root-скриптам `test:*`; проверка: список обязательных CI-проверок и правил тестовой БД (`_import_test`) в спеке совпадает с workflow-файлами; дрейф `docs/TESTING.md` не перенесён в спеку (спека следует за кодом)

## 5. Финальная целостность

- [x] 5.1 Прогнать `openspec validate document-current-behavior --strict --json` и убедиться, что итог `valid: true`, `issues: []`; проверка: вывод команды
- [x] 5.2 Прогнать `git status --short` и убедиться, что изменены только файлы внутри `openspec/changes/document-current-behavior/` (плюс не нашего `docs/02_EXISTING_TESTS_AUDIT.md` он не касается); проверка: вывод команды
- [x] 5.3 Убедиться, что ни одно требование не опирается на неподтверждённый факт (сверка со списком «Неподтверждённые факты» в `design.md`); проверка: в спеках нет формулировок из этого списка, все они остались только в `design.md`

## Workflow follow-up

- Выполнить apply (`/opsx-apply`), когда придёт отдельное распоряжение — он перенесёт дельты в `openspec/specs/**`.
- После применения и проверки — заархивировать чейндж (`openspec archive document-current-behavior`) и проверить результат архивации.
- Коммит/пуш файлов `openspec/**` — только по отдельному решению пользователя.
