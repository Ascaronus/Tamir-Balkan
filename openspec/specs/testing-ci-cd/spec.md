# testing-ci-cd Specification

## Purpose
Непрерывная проверка и выпуск tamir.rs: workflow Verify (фронтенд + бэкенд на двух Node с Postgres-сервисом), guards целостности релиза и workflow Deploy, публикующий на VPS ровно проверенный коммит с дампом БД, health-проверками и автоматическим откатом.

## Requirements

### Requirement: The Verify workflow runs on pushes and pull requests
Workflow `Verify storefront and backend` обязан (MUST) запускаться на push в ветки `main` и `fix/store-reliability` и на pull request в `main`, с матрицей Node `["20.20.2", "24"]`, `fail-fast: false`, таймаутом 20 минут и сервисом `postgres:16` (БД `review_test` с health-командой `pg_isready`), доступным через `TEST_REVIEWS_DB_URL`.

#### Scenario: A pull request into main
- **WHEN** открывается pull request в `main`
- **THEN** job `verify` выполняется на обеих версиях Node из матрицы, и падение одной из них не отменяет вторую

### Requirement: One-off build secrets in CI
Verify обязан (MUST) генерировать `JWT_SECRET` и `COOKIE_SECRET` как случайные hex-значения из `randomBytes(32)` в `GITHUB_ENV` на время запуска, а не хранить постоянные секреты в репозитории.

#### Scenario: Job start
- **WHEN** job `verify` начинает работу
- **THEN** в окружение записываются два свежих 64-символьных hex-секрета, уникальных для запуска

### Requirement: A full frontend check with localized route verification
Verify обязан (MUST) выполнить во `frontend/` цепочку `npm ci`, `npm test`, `npm run lint -- --quiet`, `npm run build`, затем `node test-support/verify-localized-routes.mjs`, который поднимает реальный `next start` и проверяет `lang` страниц, canonical, `noindex` на `cart`/`account`, переговор 307 на `/` и постоянные 308 с внутренних путей `/rs/cart`/`/rs/account` на публичные слаги `korpa`/`nalog`.

#### Scenario: A localization regression at build time
- **WHEN** после продакшн-сборки `verify-localized-routes.mjs` получает `/` с `Accept-Language: en-GB` без cookie
- **THEN** ожидается `307` на `/en?q=hat` с `cache-control: no-store`, иначе job падает

### Requirement: Backend tests and build
Verify обязан (MUST) выполнить в `backend/` `npm ci`, ровно два вызова `node --test` и `npm run build`. Первый: `rozetka-admin`, `option-autotranslate`, `auth-secrets`. Второй: 12 файлов из `tests/` — `reviews`, `deleted-customer-registration`, `registration-code`, `password-reset`, `admin-decimals`, `decimal-attributes`, `product-urls`, `category-localization`, `catalog`, `catalog-http`, `catalog-popularity`, `login-rate-limit`.

#### Scenario: Integration with the Postgres service
- **WHEN** второй вызов `node --test` выполняется в job с сервисом `postgres:16`
- **THEN** тесты подключаются к БД `review_test` через `TEST_REVIEWS_DB_URL` и проверяют таблицы отзывов и `tamir_product_url` на реальной БД

### Requirement: Integration tests run only against isolated databases
Интеграционные тесты бэкенда обязаны (MUST) отказываться от запуска без изолированной базы: без `TEST_REVIEWS_DB_URL` они падают («Set TEST_REVIEWS_DB_URL to an isolated test database»), `catalog-popularity` допускает вместо этого `CATALOG_TEST_PGLITE_PATH`, а `tests/rozetka-native.ts` требует, чтобы `DATABASE_URL` оканчивался на `_import_test`.

#### Scenario: Integration without a test database
- **WHEN** `node --test tests/reviews.integration.cjs` запускается без `TEST_REVIEWS_DB_URL`
- **THEN** тест сразу падает с ошибкой «Set TEST_REVIEWS_DB_URL to an isolated test PostgreSQL database» и не подключается к `DATABASE_URL`

### Requirement: CI release-integrity guard checks
Verify обязан (MUST) после тестов выполнить `node test-support/verify-deploy-dispatch.mjs` (ручной
запуск прод-Deploy разрешён только из `refs/heads/main`, job обязан стоять за окружением
`production`), `bash -n scripts/deploy-vps.sh` (синтаксис), `node test-support/verify-deploy-pin.mjs`
(пиннинг SHA в прод-workflow и скрипте), `node test-support/verify-deploy-staging.mjs` (staging-контур:
у `deploy-staging.yml` нет триггеров `pull_request`/`push`, есть обязательный `sha` и environment
`staging`, job `deploy` ждёт job `gate`, а `scripts/deploy-staging.sh` требует ancestry-гейт по
`origin/main`) и `node test-support/verify-perimeter-bind.mjs` (прод-старты биндятся только на
loopback, контроль аудита HIGH-1), иначе job обязан (MUST) упасть.

#### Scenario: A guard weakened in the diff
- **WHEN** pull request меняет `deploy.yml` так, что `workflow_dispatch` больше не ограничен `main`,
  или снимает environment
- **THEN** `verify-deploy-dispatch.mjs` падает с assert-ошибкой, и job `verify` завершается неуспешно

#### Scenario: Staging-workflow gained a push trigger
- **WHEN** pull request добавляет в `.github/workflows/deploy-staging.yml` триггер `push` или
  `pull_request`, либо снимает `needs: gate` с job `deploy`
- **THEN** `verify-deploy-staging.mjs` падает с assert-ошибкой, и job `verify` завершается неуспешно

#### Scenario: Syntax error in a shell script
- **WHEN** в pull request испорчен синтаксис любого `scripts/*.sh` или `scripts/lib/*.sh`
- **THEN** шаг `bash -n` завершается неуспешно, и ни один deploy не стартует

### Requirement: Deploy run gating
Прод-Deploy обязан (MUST) запускаться только вручную: `workflow_dispatch` с `refs/heads/main` и
обязательным вводом `sha`; автоматический запуск по `workflow_run` запрещён (MUST NOT). Job обязан
(MUST) использовать окружение `production` и единственную `concurrency`-группу
`tamir-production-deploy` без отмены промежуточных запусков. Автоматическим после `Verify storefront
and backend` на push в `main` обязан (MUST) быть только Deploy to Staging.

#### Scenario: Push to main does not release prod
- **WHEN** коммит слит в `main` и `Verify storefront and backend` на push завершился успешно
- **THEN** `Deploy TAMIR` не запускается, а запускается `Deploy to Staging`; прод ожидает ручного
  запуска

#### Scenario: Dispatch not from main
- **WHEN** `Deploy TAMIR` запущен через `workflow_dispatch` из ветки, отличной от `main`
- **THEN** job `deploy` не выполняется (условие `github.ref == 'refs/heads/main'`)

#### Scenario: Concurrent releases
- **WHEN** второй запуск Deploy стартует, когда первый ещё выполняется
- **THEN** второй ждёт освобождения группы `tamir-production-deploy` и не перекрывает живой релиз

### Requirement: Publishing exactly the verified commit
Прод-Deploy обязан (MUST) взять `VERIFIED_SHA` из обязательного ввода `sha` (`github.event.inputs.sha`)
и отказать при несоответствии формата `^[0-9a-f]{40}$`. Перед подключением к VPS workflow обязан
(MUST) проверить тот SHA через GitHub API: `compare main...sha` обязан вернуть статус `behind` или
`identical`, а все завершённые прогоны verify-workflow на этом SHA в `main` (события `push` или
`workflow_dispatch`) обязаны иметь conclusion `success`, `neutral` или `skipped`. Читать
`check-suites` гейт не обязан (SHOULD NOT): в них попадают прогоны других workflow того же SHA.
После проверки SHA обязан (MUST) быть передан удалённой команде `deploy` по
SSH с усиленными опциями (`BatchMode`, `IdentitiesOnly`, `StrictHostKeyChecking=yes`,
`HostKeyAlias=tamir-vps`, `UserKnownHostsFile` из секрета `VPS_KNOWN_HOSTS`, ключ во временном
каталоге с `umask 077`).

#### Scenario: An empty SHA in the event context
- **WHEN** в контексте запуска нет 40-символьного hex-SHA (обязательный ввод `sha` не заполнен)
- **THEN** workflow не создаётся (поле обязательное), а step завершается ошибкой «Refusing to
  deploy», и на сервер ничего не отправляется

#### Scenario: SHA in a wrong format
- **WHEN** значение `sha` не проходит `^[0-9a-f]{40}$`
- **THEN** step «Confirm the commit passed Verify on main» завершается ошибкой, SSH-шаг не выполняется

#### Scenario: Commit outside main's history
- **WHEN** введён SHA, для которого `compare main...sha` возвращает `ahead` или `diverged`
- **THEN** step «Confirm the commit passed Verify on main» завершается ошибкой, SSH-шаг не выполняется

#### Scenario: Incomplete set of checks on the commit
- **WHEN** хотя бы один check-suite целевого коммита не имеет статуса `completed` или имеет
  conclusion `failure`
- **THEN** step «Confirm the commit passed Verify on main» завершается ошибкой, SSH-шаг не выполняется

### Requirement: Verifying the target commit ancestry on the VPS
`scripts/deploy-vps.sh` обязан (MUST) отказать в выпуске, если переданный SHA не разрешается в коммит («is unknown to this repository»), если цель не является предком `origin/main` («is not part of the current origin/main») или если текущий коммит checkout не является предком цели («Target does not include the source checkout's current commit.»).

#### Scenario: A stale checkout on the VPS
- **WHEN** целевой коммит входит в `origin/main`, но исходный checkout ещё не содержит его
- **THEN** скрипт завершается с ошибкой про исходный checkout и не создаёт каталог релиза

### Requirement: Building the release on the VPS without stopping live processes
`scripts/deploy-vps.sh` обязан (MUST) работать под non-blocking `flock` («Another deployment is running.» при занятой блокировке), требовать чистого дерева отслеживаемых файлов, ровно один 40-hex SHA-аргумент, и обязательно делать снимок `pm2 jlist`, резервные копии env-файлов и `pg_dump --format=custom` до любых изменений; сборка и публикация обязана (MUST) выполняться без остановки живых PM2-процессов.

#### Scenario: A run without an explicit SHA
- **WHEN** `deploy-vps.sh` вызывают без аргумента или с не-40-hex значением
- **THEN** скрипт немедленно завершается с ошибкой использования и не трогает `origin/main` head

#### Scenario: A release build failure
- **WHEN** сборка или подготовка падает до переключения процессов
- **THEN** живые PM2-процессы не останавливаются, а сообщение указывает каталог бэкапа
- **AND** исходный checkout продвигается вперёд командой `git merge --ff-only` только после успешных сборок backend и frontend в каталоге релиза

### Requirement: Release activation with health checks and rollback
`scripts/activate-release.sh` обязан (MUST) проверить наличие артефактов сборки и корректность `ecosystem.config.cjs` (ровно два приложения с cwd релиза), переключить PM2 на релиз, дождаться health-эндпоинтов (`127.0.0.1:9000/health`, локальные и боевые `robots.txt`/`sitemap.xml`, `https://api.tamir.rs/health`) и при любой ошибке выполнить откат: удалить новые процессы, поднять прежний `ecosystem.config.cjs` из бэкапа и выполнить `pm2 save`.

#### Scenario: A backend that never becomes healthy
- **WHEN** `http://127.0.0.1:9000/health` не отвечает 200 после ретраев
- **THEN** срабатывает `rollback`, прежние процессы восстановлены из бэкапа, запуск считается неуспешным

#### Scenario: A process started from outside the release directory
- **WHEN** после `pm2 start` в `pm2 jlist` у `tamir-backend` или `tamir-frontend` рабочий каталог не равен каталогу релиза
- **THEN** проверка падает с «Wrong working directory», срабатывает `rollback`, и выпуск завершается ошибкой

### Requirement: Pre-release configuration check and schema preparation
Перед активацией релиза деплой обязан (MUST) выполнить `scripts/check-review-config.cjs` и остановить выпуск при недостаточной конфигурации, затем идемпотентно подготовить схемы `setup-reviews.ts`, `check-email.ts` и `setup-decimal-attributes.ts`, не запуская общую `medusa db:migrate`; нормализация импортированных товаров выполняется только после переключения процессов.

#### Scenario: A placeholder secret in production
- **WHEN** в `backend/.env` стоит `JWT_SECRET` короче 32 символов или с подстрокой вида `replace`/`changeme`
- **THEN** `check-review-config.cjs` печатает список проблем и завершается `1`, выпуск не доходит до активации
- **AND** теми же проверками отклоняются тестовые Turnstile-ключи, отсутствие `SMTP_USER`/`SMTP_PASSWORD` и `SMTP_PORT` вне `{587, 465}`

#### Scenario: Re-running normalization of imported products
- **WHEN** `normalize-rozetka-products.ts` с `ROZETKA_NORMALIZE_APPLY=true` запускается повторно после переключения релиза
- **THEN** данные товаров остаются идентичными первому прогону (повторная нормализация не меняет результат)

### Requirement: Auto-deploy of the verified commit to staging
После успешного `Verify storefront and backend` на push в `main` обязан (MUST) запускаться workflow
`Deploy to Staging` (`.github/workflows/deploy-staging.yml`) с тем же `head_sha`. Он обязан (MUST)
состоять из job `gate` на GitHub-hosted раннере и job `deploy` с `needs: gate` на self-hosted
раннере машины staging. Триггеры `pull_request` и `push` у этого workflow запрещены (MUST NOT).

#### Scenario: Merge to main brings staging up
- **WHEN** pull request слит в `main` и Verify на push завершился успешно
- **THEN** `Deploy to Staging` запускается автоматически и разворачивает именно `head_sha` этого
  Verify; job `gate` имеет права `contents: read` и `checks: read`, а job `deploy` стоит за
  `environment: staging`, единственной `concurrency`-группой и заданным `timeout-minutes`

#### Scenario: Failing Verify blocks the deploy
- **WHEN** `Verify storefront and backend` на push в `main` завершился неуспешно
- **THEN** `Deploy to Staging` не запускается, стенд остаётся на предыдущем релизе

#### Scenario: Docs-only push to main
- **WHEN** в `main` слит push, в котором менялись только `docs/**`, `openspec/**` или `**.md`
- **THEN** Verify не запускается и автоматический staging-деплой тоже не запускается; для выпуска
  такого коммита на стенд используется ручной `workflow_dispatch` с этим SHA

### Requirement: Manual staging deploy by SHA
`Deploy to Staging` обязан (MUST) поддерживать `workflow_dispatch` с обязательным вводом `sha`
(40 hex) и обязан (MUST) выполнять тот же API-гейт происхождения коммита (`compare main...sha` ∈
{`behind`, `identical`}, прогоны verify-workflow в `main` — `completed` с conclusion
`success`/`neutral`/`skipped`), что и прод-Deploy. Job `deploy` обязан (MUST) вызывать `scripts/deploy-staging.sh <sha>` без
собственного `actions/checkout`.

#### Scenario: Rolling staging back to a previous commit of main
- **WHEN** оператор запускает `Deploy to Staging` вручную с SHA более старого коммита `main`
- **THEN** гейт пропускает такой SHA (статус `behind`), и стенд разворачивается на него

#### Scenario: SHA from a branch not merged into main
- **WHEN** оператор запускает staging-деплой вручную с SHA, которого нет в истории `main`
- **THEN** job `gate` завершается ошибкой и job `deploy` не запускается

### Requirement: Self-check of commit provenance on the machine
`scripts/deploy-staging.sh` обязан (MUST) принять ровно один аргумент — 40-hex SHA, получить
`origin/main` (с повторными попытками при сетевом отказе) и отказать в выпуске, если целевой коммит
не является предком `origin/main`. Работа обязана (MUST) вестись под non-blocking `flock`, а
исключение — только при явном `TAMIR_ALLOW_NON_MAIN=1` в окружении интерактивного запуска.

#### Scenario: Runner received a foreign SHA
- **WHEN** в `deploy-staging.sh` передан SHA, отсутствующий в истории `origin/main`
- **THEN** скрипт прекращает работу до создания каталога релиза, живые процессы не тронуты

#### Scenario: Concurrent deploys to staging
- **WHEN** второй запуск `deploy-staging.sh` стартует, когда блокировка ещё занята
- **THEN** второй процесс немедленно завершается сообщением о занятой блокировке
