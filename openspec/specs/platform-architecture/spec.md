# platform-architecture Specification

## Purpose
Фиксирует устройство монорепо tamir.rs: скрипты корня, инфраструктура в `docker-compose.yml`, команды сборки и запуска backend и frontend, конфигурация Medusa и Next.js, реестр HTTP-middleware, а также пайплайны GitHub Actions и выпуск релиза на VPS — так, как это реализовано в коде сейчас.

## Requirements

### Requirement: Локальная инфраструктура поднимается через Docker Compose

`docker-compose.yml` (MUST) описывать сервис `postgres` на образце `postgres:16` с `POSTGRES_USER: medusa`, `POSTGRES_DB: medusa-v2` и `POSTGRES_PASSWORD: ${POSTGRES_PASSWORD:?Set POSTGRES_PASSWORD in the local root .env}`, пробросом `127.0.0.1:5432:5432` и томом `postgres_data`, а также сервис `redis` на образце `redis:7` с `restart: unless-stopped` и портом `127.0.0.1:6379:6379`.

#### Scenario: База доступна только с локальной машины

- **WHEN** сервис `postgres` поднят этим Compose-файлом
- **THEN** порт опубликован как `127.0.0.1:5432:5432`
- **AND** данные лежат в томе `postgres_data`

#### Scenario: Пароль базы обязателен

- **WHEN** в `.env` в корне репозитория не задан `POSTGRES_PASSWORD`
- **THEN** подъём Compose падает с сообщением `Set POSTGRES_PASSWORD in the local root .env`

### Requirement: Корневые скрипты координируют работу монорепо

Корневой `package.json` (MUST) определять скрипты `deps` (`npm --prefix backend ci && npm --prefix frontend ci`), `infra:up` (`docker compose up -d --remove-orphans`), `infra:down` (`docker compose down`), `stop` (`npm run infra:down`), `kill:devports` (`kill-port 3000 9000`), `build` (сборка backend и frontend через `npm --prefix`) и `dev`/`dev:nodocker`/`start`, запускающие backend и frontend через `npx concurrently -k -n "backend,frontend"`.

#### Scenario: Общий запуск разработки

- **WHEN** выполнена команда `npm run dev`
- **THEN** сначала выполнен `npm run infra:up`
- **AND** `npm --prefix backend run dev` и `npm --prefix frontend run dev` запущены параллельно через `concurrently -k`

#### Scenario: Без Docker

- **WHEN** выполнена команда `npm run dev:nodocker`
- **THEN** инфраструктура не поднимается
- **AND** backend и frontend запускаются тем же составом `concurrently`

### Requirement: Backend собирается и запускается только из каталога `.medusa/server`

`backend/package.json` (MUST) задавать `build` как `medusa build` с пост-шагом `postbuild` (`node ./scripts/postbuild-server.mjs`), `start` как `node ./scripts/start-server.mjs` и `dev` как `medusa develop`; `start-server.mjs` обязан (MUST) работать только из `.medusa/server` и завершаться ошибкой, если `.medusa/server/package.json` отсутствует.

#### Scenario: Запуск без сборки

- **WHEN** `npm run start` вызвана при отсутствии `backend/.medusa/server/package.json`
- **THEN** процесс завершается ошибкой с подсказкой `npm run build`

#### Scenario: Шаг postbuild подготавливает серверный каталог

- **WHEN** `node ./scripts/postbuild-server.mjs` выполнен после `medusa build`
- **THEN** внутри `.medusa/server` выполнена `npm install --omit=dev`
- **AND** файл `backend/.env` скопирован в `.medusa/server/.env.production`

#### Scenario: Прод-старт

- **WHEN** сборка выполнена и `npm run start` запущена
- **THEN** сервер поднят из `.medusa/server` с флагом `-H 0.0.0.0`
- **AND** в окружении установлен `NODE_ENV=production`

### Requirement: Frontend собирается и тестируется средствами Next.js и `node --test`

`frontend/package.json` (MUST) задавать `dev` как `next dev --webpack`, `build` как `next build`, `start` как `next start`, `lint` как `eslint` и `test` как `node --import ./test-support/register.mjs --test tests/*.test.mjs`; зависимости (MUST) включать `next` и `eslint-config-next` версии `16.2.2`, `react` и `react-dom` версии `19.2.4`, `@medusajs/js-sdk` и `@medusajs/types` версии `^2.13.5`.

#### Scenario: Тесты витрины в CI

- **WHEN** в workflow выполнена команда `npm test` в каталоге `frontend`
- **THEN** тесты запущены нативным раннером `node --test` с загрузчиком `test-support/register.mjs`

#### Scenario: Разработка через webpack

- **WHEN** выполнена команда `npm run dev` в каталоге `frontend`
- **THEN** Next.js запущен в режиме разработки с флагом `--webpack`

### Requirement: Конфигурация Next.js фиксирует корни сборки и локальные алиасы URL

`frontend/next.config.ts` (MUST) устанавливать `turbopack.root` и `outputFileTracingRoot` в
`path.resolve(process.cwd())`, постоянные редиректы `/me` → `/rs` и `/me/:path*` → `/rs/:path*`,
внутренние rewrite-алиасы сербских путей разделов корзины, личного кабинета и форм входа,
а `images.remotePatterns` (MUST) включать `medusa-public-images.s3.eu-west-1.amazonaws.com`,
`tamir.ua` и шаблон, построенный из `NEXT_PUBLIC_MEDUSA_BACKEND_URL`.

#### Scenario: Публичный адрес сохраняет сербскую форму

- **WHEN** браузер запрашивает `/rs/nalog/prijava`
- **THEN** Next.js отдаёт страницу `/rs/account/login` без изменения адреса в браузере

#### Scenario: Перечень алиасов зафиксирован в конфиге

- **WHEN** `rewrites()` возвращает список правил
- **THEN** в нём ровно `5` записей: `/rs/korpa` → `/rs/cart`, `/rs/nalog` → `/rs/account`, `/rs/nalog/prijava` → `/rs/account/login`, `/rs/nalog/registracija` → `/rs/account/register`, `/rs/nalog/zaboravljena-lozinka` → `/rs/account/forgot-password`
- **AND** у обеих записей `redirects()` стоит `permanent: true`

#### Scenario: Загрузка из админки проходит через next/image

- **WHEN** задан `NEXT_PUBLIC_MEDUSA_BACKEND_URL`
- **THEN** в `remotePatterns` добавлен шаблон с protocol/hostname/port этого URL и `pathname: "/**"`

### Requirement: Конфигурация Medusa отказывается от слабых секретов и внешних URL без переменных

`backend/medusa-config.ts` (MUST) вызывать `authSecret()` для `JWT_SECRET` и `COOKIE_SECRET`, которая обязана бросать ошибку при значении короче 32 символов либо совпадающей с `/replace|changeme|supersecret|placeholder/i`, брать `storeCors`, `adminCors` и `authCors` из `STORE_CORS`, `ADMIN_CORS` и `AUTH_CORS`, а `cookieOptions` задавать как `sameSite: "lax"` и `secure` по три-state-правилу `COOKIE_SECURE` с падением к `NODE_ENV === "production"`.

#### Scenario: Секрет-заглушка блокирует старт

- **WHEN** `JWT_SECRET` равен значению вида `changeme`
- **THEN** загрузка конфигурации завершается ошибкой `JWT_SECRET: set a private random value of at least 32 characters in the runtime environment`

#### Scenario: Локальный HTTP без флага Secure

- **WHEN** `COOKIE_SECURE=false` и `NODE_ENV=development`
- **THEN** auth-cookie выдаются без флага `Secure`
- **AND** `sameSite` остаётся `lax`

### Requirement: Реестр HTTP-middleware задаёт лимиты тела запроса

Единственный файл `backend/src/api/middlewares.ts` (MUST) регистрировать HTTP-middleware через
`defineMiddlewares` с ключом `routes`, и он обязан (MUST) ограничивать размер тела запроса
по каждому маршруту значениями `8kb`, `64kb` и `25mb` там, где ожидаются маленькие JSON-настройки,
машинный перевод опций и крупный импорт Rozetka.

#### Scenario: Лимиты тела админских маршрутов

- **WHEN** запрос приходит на `POST /admin/products/:id/option-translations/translate`
- **THEN** `bodyParser.sizeLimit` равен `64kb`
- **WHEN** запрос приходит на любой маршрут префикса `/admin/rozetka*`
- **THEN** `bodyParser.sizeLimit` равен `25mb`
- **WHEN** запрос приходит на `GET` или `POST /admin/products/:id/localized-url`
- **THEN** `bodyParser.sizeLimit` равен `8kb`

#### Scenario: Маршрут каталога подключается тем же реестром

- **WHEN** реестр описывает `GET /store/catalog/products`
- **THEN** в `middlewares` подставлен массив `catalogMiddlewares`, импортированный из `../utils/catalog-http`
- **AND** сам файл реестра не определяет цепочку каталога

#### Scenario: Только маршрутные записи

- **WHEN** модуль экспортирует конфигурацию по умолчанию
- **THEN** вызвана `defineMiddlewares({ routes: [...] })`, и глобальный массив `middlewares` не задан

### Requirement: Выпуск на VPS выполняется только проверенным коммитом и откатывается при сбое

Пайплайн сборки (MUST) состоит из workflow `Verify storefront and backend` и workflow `Deploy TAMIR`,
который обязан (MUST) начинаться только после успешного прогона проверки на `main` и передавать на VPS
ровно тот коммит, на котором она выполнялась; `scripts/deploy-vps.sh` обязан (MUST) подготовить
отдельный релиз и бэкап до переключения PM2-процессов, а `scripts/activate-release.sh` — вернуть
прежнюю конфигурацию при сбое включения.

#### Scenario: Проверка на двух версиях Node

- **WHEN** push в `main` или `fix/store-reliability`, либо pull request в `main` запускает Verify
- **THEN** job `verify` выполнен на матрице `node: ["20.20.2", "24"]` с `fail-fast: false` и сервисом `postgres:16`
- **AND** в окружении задан `TEST_REVIEWS_DB_URL`, секреты `JWT_SECRET` и `COOKIE_SECRET` генерируются `node:crypto`
- **THEN** frontend проходят `npm ci`, `npm test`, `npm run lint -- --quiet`, `npm run build` и `node test-support/verify-localized-routes.mjs`
- **THEN** backend проходят `npm ci`, ровно два вызова `node --test` по явным спискам файлов из workflow и `npm run build`
- **THEN** в корне выполняются `node test-support/verify-deploy-dispatch.mjs`, `bash -n scripts/deploy-vps.sh` и `node test-support/verify-deploy-pin.mjs`

#### Scenario: Коммит релиза зафиксирован

- **WHEN** `Deploy TAMIR` запущен из `workflow_run` завершившегося Verify для `branches: [main]`
- **THEN** `VERIFIED_SHA` берётся из `github.event.workflow_run.head_sha` и обязан пройти проверку `^[0-9a-f]{40}$`, иначе шаг завершается ошибкой
- **THEN** удалённая команда `deploy "$VERIFIED_SHA"` выполняется по ssh с `StrictHostKeyChecking=yes` и `HostKeyAlias=tamir-vps`
- **WHEN** ручной `workflow_dispatch` сделан не из `refs/heads/main`
- **THEN** job `deploy` не выполняется

#### Scenario: Бэкап до переключения и откат при сбое

- **WHEN** `scripts/deploy-vps.sh` получил один 40-hex аргумент, который является предком `origin/main` и самому содержит текущий коммит checkout
- **THEN** каталоги `/root/tamir-releases/<utc>-<sha12>` и `/root/tamir-backups/<utc>-<sha12>` созданы, а снимок БД сделан командой `pg_dump --format=custom --file database.dump`
- **THEN** прежние процессы `tamir-backend` и `tamir-frontend` сохранены в `ecosystem.config.cjs` внутри бэкапа
- **WHEN** `scripts/activate-release.sh` не дождался `http://127.0.0.1:9000/health` или `https://tamir.rs/robots.txt`
- **THEN** ловушка `ERR` удаляет новые процессы и запускает `pm2 start "$backup_dir/ecosystem.config.cjs"`
