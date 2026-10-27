# Spec Delta

## Purpose

Непрерывная проверка и выпуск tamir.rs: workflow Verify (фронтенд + бэкенд на двух Node с Postgres-сервисом), guards целостности релиза и workflow Deploy, публикующий на VPS ровно проверенный коммит с дампом БД, health-проверками и автоматическим откатом.

## ADDED Requirements

### Requirement: Workflow Verify на пушах и pull request
Workflow `Verify storefront and backend` обязан (MUST) запускаться на push в ветки `main` и `fix/store-reliability` и на pull request в `main`, с матрицей Node `["20.20.2", "24"]`, `fail-fast: false`, таймаутом 20 минут и сервисом `postgres:16` (БД `review_test` с health-командой `pg_isready`), доступным через `TEST_REVIEWS_DB_URL`.

#### Scenario: Pull request в main
- **WHEN** открывается pull request в `main`
- **THEN** job `verify` выполняется на обеих версиях Node из матрицы, и падение одной из них не отменяет вторую

### Requirement: Одноразовые секреты сборки в CI
Verify обязан (MUST) генерировать `JWT_SECRET` и `COOKIE_SECRET` как случайные hex-значения из `randomBytes(32)` в `GITHUB_ENV` на время запуска, а не хранить постоянные секреты в репозитории.

#### Scenario: Старт job
- **WHEN** job `verify` начинает работу
- **THEN** в окружение записываются два свежих 64-символьных hex-секрета, уникальных для запуска

### Requirement: Полная проверка фронтенда с прогоном локальных маршрутов
Verify обязан (MUST) выполнить во `frontend/` цепочку `npm ci`, `npm test`, `npm run lint -- --quiet`, `npm run build`, затем `node test-support/verify-localized-routes.mjs`, который поднимает реальный `next start` и проверяет `lang` страниц, canonical, `noindex` на `cart`/`account`, переговор 307 на `/` и постоянные 308 с внутренних путей `/rs/cart`/`/rs/account` на публичные слаги `korpa`/`nalog`.

#### Scenario: Регрессия локализации при сборке
- **WHEN** после продакшн-сборки `verify-localized-routes.mjs` получает `/` с `Accept-Language: en-GB` без cookie
- **THEN** ожидается `307` на `/en?q=hat` с `cache-control: no-store`, иначе job падает

### Requirement: Тесты и сборка бэкенда
Verify обязан (MUST) выполнить в `backend/` `npm ci`, ровно два вызова `node --test` и `npm run build`. Первый: `rozetka-admin`, `option-autotranslate`, `auth-secrets`. Второй: 12 файлов из `tests/` — `reviews`, `deleted-customer-registration`, `registration-code`, `password-reset`, `admin-decimals`, `decimal-attributes`, `product-urls`, `category-localization`, `catalog`, `catalog-http`, `catalog-popularity`, `login-rate-limit`.

#### Scenario: Интеграция с Postgres-сервисом
- **WHEN** второй вызов `node --test` выполняется в job с сервисом `postgres:16`
- **THEN** тесты подключаются к БД `review_test` через `TEST_REVIEWS_DB_URL` и проверяют таблицы отзывов и `tamir_product_url` на реальной БД

### Requirement: Интеграционные тесты работают только на изолированных базах
Интеграционные тесты бэкенда обязаны (MUST) отказываться от запуска без изолированной базы: без `TEST_REVIEWS_DB_URL` они падают («Set TEST_REVIEWS_DB_URL to an isolated test database»), `catalog-popularity` допускает вместо этого `CATALOG_TEST_PGLITE_PATH`, а `tests/rozetka-native.ts` требует, чтобы `DATABASE_URL` оканчивался на `_import_test`.

#### Scenario: Интеграция без тестовой БД
- **WHEN** `node --test tests/reviews.integration.cjs` запускается без `TEST_REVIEWS_DB_URL`
- **THEN** тест сразу падает с ошибкой «Set TEST_REVIEWS_DB_URL to an isolated test PostgreSQL database» и не подключается к `DATABASE_URL`

### Requirement: Защитные проверки CI целостности выпуска
Verify обязан (MUST) после тестов выполнить `node test-support/verify-deploy-dispatch.mjs` (ручной запуск Deploy разрешён только из `refs/heads/main`, job обязан стоять за окружением `production`), `bash -n scripts/deploy-vps.sh` (синтаксис) и `node test-support/verify-deploy-pin.mjs` (пиннинг SHA в workflow и скрипте), иначе job обязан (MUST) упасть.

#### Scenario: Ослабление guard'а в diff
- **WHEN** pull request меняет `deploy.yml` так, что `workflow_dispatch` больше не ограничен `main`, или снимает environment
- **THEN** `verify-deploy-dispatch.mjs` падает с assert-ошибкой, и job `verify` завершается неуспешно

### Requirement: Гейтинг запуска Deploy
Deploy обязан (MUST) запускаться автоматически только после успешного завершения `Verify storefront and backend` на push в `main` (`workflow_run` с `event == 'push'` и `head_branch == 'main'`), ручной запуск — только с `refs/heads/main`; job обязан (MUST) использовать окружение `production`, единственный `concurrency`-группой `tamir-production-deploy` без отмены промежуточных запусков.

#### Scenario: Параллельные выпуски
- **WHEN** второй запуск Deploy стартует, когда первый ещё выполняется
- **THEN** второй ждёт освобождения группы `tamir-production-deploy` и не перекрывает живой релиз

### Requirement: Публикация ровно проверенного коммита
Deploy обязан (MUST) взять `VERIFIED_SHA` из `github.event.workflow_run.head_sha` (для dispatch — `github.sha`), отказать при несоответствии формата `^[0-9a-f]{40}$`, и передать его удалённой команде `deploy` по SSH с усиленными опциями (`BatchMode`, `IdentitiesOnly`, `StrictHostKeyChecking=yes`, `HostKeyAlias=tamir-vps`, `UserKnownHostsFile` из секрета `VPS_KNOWN_HOSTS`, ключ во временном каталоге с `umask 077`).

#### Scenario: Пустой SHA в контексте события
- **WHEN** в контексте запуска нет 40-символьного hex-SHA
- **THEN** step завершается ошибкой «Refusing to deploy», и на сервер ничего не отправляется

### Requirement: Проверка происхождения целевого коммита на VPS
`scripts/deploy-vps.sh` обязан (MUST) отказать в выпуске, если переданный SHA не разрешается в коммит («is unknown to this repository»), если цель не является предком `origin/main` («is not part of the current origin/main») или если текущий коммит checkout не является предком цели («Target does not include the source checkout's current commit.»).

#### Scenario: Отставший checkout на VPS
- **WHEN** целевой коммит входит в `origin/main`, но исходный checkout ещё не содержит его
- **THEN** скрипт завершается с ошибкой про исходный checkout и не создаёт каталог релиза

### Requirement: Сборка релиза на VPS без остановки живых процессов
`scripts/deploy-vps.sh` обязан (MUST) работать под non-blocking `flock` («Another deployment is running.» при занятой блокировке), требовать чистого дерева отслеживаемых файлов, ровно один 40-hex SHA-аргумент, и обязательно делать снимок `pm2 jlist`, резервные копии env-файлов и `pg_dump --format=custom` до любых изменений; сборка и публикация обязана (MUST) выполняться без остановки живых PM2-процессов.

#### Scenario: Запуск без явного SHA
- **WHEN** `deploy-vps.sh` вызывают без аргумента или с не-40-hex значением
- **THEN** скрипт немедленно завершается с ошибкой использования и не трогает `origin/main` head

#### Scenario: Сбой сборки релиза
- **WHEN** сборка или подготовка падает до переключения процессов
- **THEN** живые PM2-процессы не останавливаются, а сообщение указывает каталог бэкапа
- **AND** исходный checkout продвигается вперёд командой `git merge --ff-only` только после успешных сборок backend и frontend в каталоге релиза

### Requirement: Активация релиза с health-проверками и откатом
`scripts/activate-release.sh` обязан (MUST) проверить наличие артефактов сборки и корректность `ecosystem.config.cjs` (ровно два приложения с cwd релиза), переключить PM2 на релиз, дождаться health-эндпоинтов (`127.0.0.1:9000/health`, локальные и боевые `robots.txt`/`sitemap.xml`, `https://api.tamir.rs/health`) и при любой ошибке выполнить откат: удалить новые процессы, поднять прежний `ecosystem.config.cjs` из бэкапа и выполнить `pm2 save`.

#### Scenario: Непроработавший backend
- **WHEN** `http://127.0.0.1:9000/health` не отвечает 200 после ретраев
- **THEN** срабатывает `rollback`, прежние процессы восстановлены из бэкапа, запуск считается неуспешным

#### Scenario: Процесс поднялся не из каталога релиза
- **WHEN** после `pm2 start` в `pm2 jlist` у `tamir-backend` или `tamir-frontend` рабочий каталог не равен каталогу релиза
- **THEN** проверка падает с «Wrong working directory», срабатывает `rollback`, и выпуск завершается ошибкой

### Requirement: Предвыпускная проверка конфигурации и подготовка схем
Перед активацией релиза деплой обязан (MUST) выполнить `scripts/check-review-config.cjs` и остановить выпуск при недостаточной конфигурации, затем идемпотентно подготовить схемы `setup-reviews.ts`, `check-email.ts` и `setup-decimal-attributes.ts`, не запуская общую `medusa db:migrate`; нормализация импортированных товаров выполняется только после переключения процессов.

#### Scenario: Плейсхолдерный секрет на проде
- **WHEN** в `backend/.env` стоит `JWT_SECRET` короче 32 символов или с подстрокой вида `replace`/`changeme`
- **THEN** `check-review-config.cjs` печатает список проблем и завершается `1`, выпуск не доходит до активации
- **AND** теми же проверками отклоняются тестовые Turnstile-ключи, отсутствие `SMTP_USER`/`SMTP_PASSWORD` и `SMTP_PORT` вне `{587, 465}`

#### Scenario: Повторная нормализация импортированных товаров
- **WHEN** `normalize-rozetka-products.ts` с `ROZETKA_NORMALIZE_APPLY=true` запускается повторно после переключения релиза
- **THEN** данные товаров остаются идентичными первому прогону (повторная нормализация не меняет результат)
