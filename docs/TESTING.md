# Проверка изменений

Команды запускаются из указанного каталога. CI-конфигурация — [verify.yml](../.github/workflows/verify.yml); это источник точного списка обязательных проверок. Матрица Node: 20.20.2 и 24.

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

## Проверка на сайте

- `/rs` и `/en` открываются без редиректа в каталог; root корректно выбирает язык при отсутствии cookie.
- Логотип, категории и переключатель языка ведут на нужные адреса, старые ссылки сохраняют параметры.
- SR корзина/кабинет имеют локализованные URL; английские остаются EN. Неприватные страницы индексируемы по правилам SEO, private — noindex.
- Импорт: сначала preview/черновик, проверка native переводов, RSD, склада, профиля доставки и копирования фото.
- Нет отзывов: пустые звёзды, без нулевого счётчика. Остаток 1: количество не редактируется, покупка доступна.
- Для изменений checkout/auth отдельно проверяйте профиль, CAPTCHA/email и доставку. Автотест с fixture не доказывает реальную доставку письма или оплату.

Создание реальных аккаунтов, отправка писем и оформление заказов не являются побочным действием обычного smoke test: используйте согласованные тестовые данные и среду. Датированные исторические проверки интерфейса находятся в RESPONSIVE-V2/FRONTEND-REDESIGN и не означают повторную проверку на каждой версии.
