# Аудит кода и CI/CD: 23 октября 2026

Черновик для работы. Все пункты сверены вручную с кодом в `main` на коммите
`768426f` (после мержей #18, #19, #20). Это не отчёт «про голоса» — каждый пункт
подтверждён чтением конкретных файлов; в конце есть список того, что проверено и
признано чистым, чтобы не перефлагать завтра. Вечером 23.10 весь аудит перечитан
второй раз построчно — внутри пунктов исправлены неточности (rate-limit в H1,
посылка M10, путь `collection.jpg`, версия Node, несколько абзацев про QA).
Утром 24.10 пересмотрён объём H1 после решения владельца: телефонного логина в
UI нет — неиспользуемый роут `phone-login` предлагается удалить, а rate-limit
поставить на реальный логин `/auth/customer/emailpass` (подробности в пункте H1).
Вечером 24.10 все четыре HIGH-пункта (H1–H4) исправлены, влиты в `main` и выложены
на прод: HEAD `main` — `0f29429`, релиз на VPS `20261024T161211Z-0f294291568c`.

Статус: **готовы H1, H2, H3, H4** (PR #22, #23, #24, #26) — весь раздел HIGH закрыт.
Попутно закрыты две поломки, которые обнаружили сами деплои: #27 (пустой
`VERIFIED_RUN`) и #28 (гонка в тесте H1). **Открыты: все M1–M10 и LOW-список.**
Работа продолжается по одному маленькому PR на исправление.

---

## Как продолжить работу

1. `git fetch origin && git checkout main && git pull --ff-only` — убедиться, что
   локальный `main` совпадает с `origin/main` (на вечер 24.10 это `0f29429`, в нём
   уже есть H1–H4). Ветки `fix/audit-m1` и `fix/audit-h1` так и не создавались:
   H1–H4 шли в отдельных ветках — `fix/auth-rate-limit`, `fix/deploy-verified-sha`,
   `fix/deploy-dispatch-guard`, `fix/customer-auth-cookies`.
2. Открыть таблицу «Порядок PR» ниже и взять первый незакрытый номер. Нумерация
   плановых PR сдвинулась: карточка #25 так и не создана, а **#26, #27 и #28 заняты**
   H-исправлениями 24.10 — следующая свободная карточка **#29** (см. таблицу).
3. Ветка `fix/<slug>`, один коммит, PR, ждать `verify` (обязательные проверки
   `verify (20.20.2)` и `verify (24)`, строгие).
4. **Мерж = прод.** Перед `gh pr merge` всегда спрашивать разрешение.
5. Обновить статусы в этом файле и прислать его же в PR, чтобы файл оставался
   актуальным списком.

Правила, принятые ранее и не пересматриваемые без явной команды:

- Токены GitHub PAT остаются как есть («токены оставляем») — не предлагать перевыпуск.
- Любые изменения на VPS (`tamir.rs`) — только после явного «да».
- Мерж-коммиты, не squash.

---

## Готово (замереть, не переделывать)

| # | Что | Коммит |
|---|-----|--------|
| #18 | `deploy.yml` запускается через `workflow_run` на `Verify`, а не параллельно push'у | `87b43b4` |
| #19 | Secure-флаги cookie в проде (`cookieSecure`) | `686d738` |
| #20 | Метаданные `backend/package.json` | `768426f` |
| #22 | **H1**: удалён `phone-login`, throttle на `/auth/customer/emailpass` (только неудачи, email+IP) | `5f82714` |
| #23 | **H2**: деплой ровно проверенного SHA + пин `VERIFIED_SHA`/`VERIFIED_RUN` в `deploy-vps.sh` | `e6fdefc` |
| #24 | **H3**: `workflow_dispatch` только из `main` + `environment: production` | `8e88d8e` |
| #26 | **H4**: `httpOnly`-cookie + серверный прокси только к `/api/medusa/store/*` | `5f8320e` |
| #27 | CI: `VERIFIED_RUN` брать из `workflow_run.id` (в payload нет `run_id`) | `09c470d` |
| #28 | Тест H1: закрыта гонка записи счётчиков в forged-XFF кейсе | `0f29429` |
| — | Защита ветки `main`: обязательные проверки `verify (20.20.2)` / `verify (24)`, строгие, обязателен PR (0 ревью), запрещены force-push и удаление ветки, `enforce_admins: true` (с 24.10; раньше было `false` — админы могли мержить в обход проверок) | — |

Прод `tamir.rs` здоров, деплои проходят через гейт. На вечер 24.10 на проде крутится
`0f29429` (H1–H4 + #27 + #28): релиз и резервная копия `20261024T161211Z-0f294291568c`,
Verify-прогон `40110204794` зелёный, деплой-прогон `40110446245` успешный, оба
pm2-процесса онлайн. Ручная проверка приватного прокси (с ноутбука, 24.10): товары
отдаются со `x-publishable-api-key`, без ключа — `400` от Medusa; не-store пути
(`admin`, `health`, путь с `..`) — `404 {"error":"not_found"}` от самого прокси; во всех
проксируемых ответах есть `cache-control: no-store` и нет `set-cookie`. Живая проба логина
(24.10 18:04 UTC, ноутбук → `https://tamir.rs/api/auth/login`, несуществующий e-mail):
5×`401` («Invalid email or password», без `set-cookie` и токена в теле), 6-й запрос тем же
e-mail — `429 {"retry_after":3600}`, другой e-mail с того же IP — `401` (блок покадровый,
по e-mail+IP). Сверка на VPS: cwd обоих pm2-процессов — релиз
`20261024T161211Z-0f294291568c`, `MEDUSA_PROXY_BACKEND_URL=http://127.0.0.1:9000`,
обращений nginx к `/auth/customer/emailpass` с `127.0.0.1` — **0** (бэкенд не зовёт сам
себя через `api.tamir.rs`), в JSON-логе бэкенда `client_ip` — реальный адрес клиента
(правый `x-forwarded-for` от nginx).

---

## HIGH — делать в первую очередь

### H1. Подбор пароля: неиспользуемый `phone-login` удалить, реальному логину `/auth/customer/emailpass` нужен rate-limit

**✅ Готово — PR #22 (ветка `fix/auth-rate-limit`, коммиты `b7139e2` + `b1806e0`,
мерж `5f82714`, на проде с 24.10).** Реализовано по плану пункта: `phone-login` удалён
(роут, строка в `src/api/README.md`, тест в `review-regressions.test.mjs`); добавлен
`backend/src/utils/login-rate-limit.ts` — считает **только неудачи** (`res.on("finish")`
при 400/401), ключ `login-email:HMAC(email|ip)` с лимитом 5/час и `login-ip:HMAC(ip)`
с лимитом 30/час, ответы `429 {"code":"TOO_MANY_REQUESTS","retry_after":N}`, при отказе
самого троттла — fail-open; matcher `/auth/customer/emailpass` в `src/api/middlewares.ts`;
`LoginForm` показывает локализованную строку на 429 (`sr.json`/`en.json`). Интеграционный
тест `backend/tests/login-rate-limit.integration.cjs` **добавлен в `verify.yml`** (частично
закрывает M7). Turnstile на логине не делали — остался опциональным polish. Клиента
определяет `clientIp()`: если TCP-пир loopback (nginx рядом) — берётся
**правый** элемент `x-forwarded-for`, иначе XFF игнорируется и берётся сам пир, поэтому
поддельная цепочка не даёт свежую квоту. Важно для H4: ветка логина в прокси обязана
ходить на `127.0.0.1:9000` (`MEDUSA_PROXY_BACKEND_URL`), иначе nginx допишет адрес VPS
в правый XFF и все покупатели окажутся в одном ключе `login-ip`.

Ниже — исходный текст пункта, оставлен как обоснование решения.

Переформулировано 24.10 после разговора с владельцем («телефонного логина в UI нет,
это заготовка»). Первая редакция предлагала навесить rate-limit + Turnstile на
`phone-login` — это оказалась лишняя работа: роут не вызывается из UI нигде
(`LoginForm` → `auth-client.ts:40` → `sdk.auth.login("customer", "emailpass")`).
Но сам пункт остаётся HIGH, потому что:

- «заготовка» уже живая: Medusa регистрирует всё под `src/api/store/`, поэтому
  `POST /store/auth/phone-login` отвечает на tamir.rs прямо сейчас; `phone`
  сохраняется каждому покупателю (`activate-registration.ts:47`), так что роут
  полностью функционален против реальных аккаунтов — это не будущий риск, а
  открытая лишняя дверь сегодня (grep по `phone-login` во фронтенде: только
  `src/api/README.md:13` и тест `review-regressions.test.mjs:27-31`);
- роут коллует сам себя через loopback `http://127.0.0.1:${PORT}` (`route.ts:42-57`) —
  любой прокси-side rate-limit его бы обходил;
- главное, чего не досказывала первая редакция: настоящий логин витрины,
  встроенный `POST /auth/customer/emailpass`, тоже без rate-limit — в
  `src/api/middlewares.ts` для него ничего нет, в Medusa v2 лимита из коробки нет.
  Угроза подбора пароля в нём полностью сохраняется, что бы ни делалось с phone-login.

Что делать (PR #22, пересмотренный объём):

1. Удалить `backend/src/api/store/auth/phone-login/route.ts` вместе с записью
   `src/api/README.md:13` и тестом `review-regressions.test.mjs:27-31`. Код
   «заготовки» остаётся в истории git; когда телефонный логин станет фичей,
   он вернётся сразу с защитой.
2. Rate-limit на логин: matcher `/auth/customer/emailpass` в `defineMiddlewares`
   (можно тем же хелпером `rateLimit`, `review-http.ts:30-38`). Лимит считать по
   паре `IP + email` (например, ~5 неудач/час на email + ~30/час на голый IP):
   сербские мобильные операторы на CGNAT, десятки покупателей выходят с одного
   IP оператора, голый IP-лимит даст ложные блокировки. Хелпер сейчас считает
   **все** запросы, для логина нужно считать только неудачи (`401`), чтобы
   успешные входы не расходовали квоту, — то есть считать после ответа, а до.
3. Фронтенд: замапить `429` в `LoginForm` на локализованное сообщение — сейчас
   форма показала бы сырой код ошибки.
4. Turnstile на логине — понизить до опционального polish (в логине его никогда
   не было; серверного 429 достаточно). Если делать: добавить action (например
   `"login"`) в union `captcha.ts`, завести его в облачном Turnstile, подключить
   `Captcha.tsx` к `LoginForm`.
5. Пункт «`PORT` в `backend/.env.example`» отпадает вместе с удалением роута.

Что при этом НЕ меняется: Turnstile регистрации, восстановления пароля и отзывов
работает как раньше; удалением phone-login никто из пользователей не пользуется;
при щедром лимите живые покупатели 429 не видят.

Уточнения, сохранённые из первой редакции (остались фактами об коде):

- хелпер `rateLimit` вызывается в 6 store-маршрутах — `reviews/route.ts:38`,
  `reviews/[id]/vote/route.ts:10`, `registration/start/route.ts:12,14`,
  `registration/verify/route.ts:10`, `password-reset/start/route.ts:13,15`,
  `password-reset/verify/route.ts:11`; из mutation-роутов без него оставались
  phone-login и встроенный emailpass;
- токен Turnstile приходит в теле запроса (не в заголовке `X-Turnstile-Token`,
  как утверждал внешний QA-отчёт — в коде таких заголовков нет).

Тест: интеграционный тест на 429 на emailpass (N неудач → 429, успешный вход
квоту не расходует) и проверка, что `/store/auth/phone-login` после удаления
возвращает 404.

### H2. Деплой берёт HEAD `origin/main`, а не проверенный коммит (гонка)

**✅ Готово — PR #23 (коммит `55a9ad2`, мерж `e6fdefc`, на проде с 24.10).** В
`deploy.yml` SHA проверенного запуска собран в переменную `VERIFIED_SHA`
(`github.event.workflow_run.head_sha || github.sha`) и передаётся в `deploy-vps.sh`
аргументом; при ручном запуске пинится HEAD `main` на момент создания запуска. В скрипте
пин держится жёстко: неизвестный коммит (`git rev-parse --verify`) — выход, коммит вне
истории `origin/main` (`git merge-base --is-ancestor`) — выход; дерево релиза берётся
из `git archive "$target"`, а не из рабочего дерева. Добавлена проверка
`test-support/verify-deploy-pin.mjs`. Попутно выяснилось, что `VERIFIED_RUN` нельзя
брать из `github.event.workflow_run.run_id` — такого поля в payload события нет,
переменная была пустой и в журнале каждый автоматический деплой печатался как
«verified by this manual dispatch» (на пин по SHA это не влияло, но сбивало аудит).
Починено PR #27 (`f18d977`, мерж `09c470d`) через `workflow_run.id`.

Файлы: `.github/workflows/deploy.yml:30-33`, `scripts/deploy-vps.sh:17`.

- Шаг «Record the verified commit» только **печатает** SHA проверенного запуска.
- `deploy-vps.sh` берёт `git rev-parse --verify "${1:-origin/main}^{commit}"`,
  то есть свежий HEAD `main`. Если между `Verify` и `Deploy` в `main` попал второй
  push — на прод уедет непроверенный коммит.

Что делать (PR #23): `workflow_run.head_sha` → `GITHUB_SHA` →
`bash scripts/deploy-vps.sh "$SHA"` (или отдельный аргумент), плюс в скрипте
жёсткая проверка, что SHA существует на `origin/main` и что это тот самый коммит,
который прошёл `Verify`.

### H3. `workflow_dispatch` в `deploy.yml` без guard'а и без `environment`

**✅ Готово — PR #24 (коммит `c952a10`, мерж `8e88d8e`, на проде с 24.10).** В job'е
`deploy` стоят `if` с разбором двух событий: `workflow_dispatch` допускается только
с `github.ref == 'refs/heads/main'`, автоматический запуск — только как `workflow_run`
на успешный Verify с `event == 'push'` и `head_branch == 'main'`; добавлено
`environment: production` (появилось правило окружения и отдельный approval).
При dispatch SHA пинится на HEAD `main` в момент создания запуска (`github.sha`),
а не на HEAD ветки, с которой нажали кнопку.

Файл: `.github/workflows/deploy.yml:5-6`, `:21-25`.

- У `workflow_dispatch` нет условия `github.ref == 'refs/heads/main'`: запуск с
  любой ветки выполняет деплой с секретами `VPS_*`.
- Job'ы без `environment: production`, поэтому правила окружения и отдельный
  approval не работают.

Что делать (PR #24): добавить `environment: production` и условие на `refs/heads/main`
для `workflow_dispatch`; при dispatch — брать HEAD `main`, а не HEAD ветки запуска.

### H4. Токен покупателя в `localStorage` (XSS = угон аккаунта)

**✅ Готово — PR #26 (коммит `c32b337`, мерж `5f8320e`, на проде с 24.10).** JWT
покупателя больше не лежит в браузере: логин идёт на `POST /api/auth/login`
(Next-роут), который на сервере обращается к `${MEDUSA_PROXY_BACKEND_URL}/auth/customer/emailpass`
в обход nginx, и ставит куку `tb_customer_session` — `httpOnly`, `sameSite: lax`,
`secure` в проде, `path: /`, `maxAge` из `exp` JWT (fallback — константа).
 Logout чистит куку; ответ upstream с `401` в прокси тоже снимает её. `auth-storage.ts`
оставлен только как чистильщик старых `tb_customer_token`/`medusa_auth_token`
из `localStorage` у вернувшихся посетителей. CSRF закрыт `sameSite: lax` + JSON-only
контентом Medusa.

Прокси `frontend/src/app/api/medusa/[...path]/route.ts` пропускает **только** пути
`/api/medusa/store/*` (первый сегмент обязан быть `store`; `SAFE_PATH`-редекc плюс отсев
`%2e`/`%2f`/`%5c` и `..`-сегментов). Всё остальное — `/auth`, `/admin`, `/health`, пустой
путь — `404 {"error":"not_found"}` от самого прокси; невалидный путь — `400`, слишком
большое тело — `413`, недоступный backend — `502` (везде JSON, без HTML-страниц). Во всех ответах `cache-control: no-store`,
`authorization` подставляется на сервере из куки, ключ publishable подставляется тоже
на сервере. `MEDUSA_PROXY_BACKEND_URL=http://127.0.0.1:9000` задан в pm2-окружении
`tamir-frontend` на VPS (в `deploy-vps.sh` живое pm2-окружение переносится в каждый
новый релиз); без него fallback — `NEXT_PUBLIC_MEDUSA_BACKEND_URL`, поэтому в проде
его держать обязательно: прямые вызовы к `api.tamir.rs` заставили бы nginx дописать
адрес VPS в правый `x-forwarded-for` и все покупатели попали бы в один ключ `login-ip`
(см. H1).

Ручная проверка на проде (24.10, с ноутбука): товары через прокси — `200` с подставленным
`x-publishable-api-key`; без ключа — `400` от Medusa; `admin`/`health`/путь с `..` —
`404` от прокси; `set-cookie` в ответах нет.

Файлы: `frontend/src/app/api/medusa/[...path]/route.ts`,
`frontend/src/app/api/auth/login/route.ts`, `frontend/src/lib/auth/session.ts`,
`frontend/src/lib/medusa.ts:25`.

Было (обоснование, оставлено):

Файлы: `frontend/src/lib/auth/auth-storage.ts`, `frontend/src/lib/medusa.ts:25`.

- JWT клиента лежит в `localStorage` под ключом `tb_customer_token` и
  пересылается заголовком `Authorization`. Любой XSS забирает аккаунт.
- Исправление — не «маленький PR»: нужен переход на `httpOnly`-cookie сессии
  (медуса умеет) и удаление ручного хранения токена из фронтенда.

Так и сделали: это была отдельная дизайн-задача (PR #26), а до неё H1 (rate-limit на
`/auth/customer/emailpass`) снижал риск подбора пароля.

---

## MEDIUM

### M1. Прод-сборка содержит тестовую заглушку `test_test`

Файлы: `backend/medusa-config.ts:58-62`, `test-fulfillment-provider.ts`,
`src/api/store/custom/route.ts` (`void testFulfillmentModule` — держит модуль в бандле),
`backend/src/scripts/seed.ts:176-183`.

В проде зарегистрирован fulfillment-провайдер-заглушка с id `test_test`.

### M2. `backend/src/scripts/seed.ts` без guard'а

Скрипт сидирует демо-товары и `pp_system_default` и может быть запущен на проде
случайно (`npm run seed` — `backend/package.json:17`). Нужен явный guard по
`NODE_ENV`/переменной окружения.

PR #29 (M1 + M2 вместе): убрать `test_test` из прод-конфига + guard на seed.

### M3. Фантомные зависимости в backend

Перепроверено на `main` (`git grep` + чтение `backend/package.json`):

- `zod` импортируется в 5 файлах (`src/admin/decimal/number.ts`, два админ-роута
  `translate`, `src/utils/rozetka-admin.ts`, `src/utils/rozetka-preview.ts`) —
  в `dependencies` его **нет**;
- `knex` импортируется **только по типам** (`import type { Knex }`) в 3 файлах
  (`catalog-popularity.ts`, `password-reset.ts`, `registration-code.ts`) — тоже
  отсутствует в зависимостях.

Сейчас работает только за счёт транзитивной установки из `@medusajs/*`. PR #30:
добавить `zod` в `dependencies`, `knex` в `devDependencies` (или убрать импорт
типов), и зафиксировать версии.

### M4. Неатомарный cutover и простой

Файлы: `scripts/deploy-vps.sh:157-159`, `scripts/activate-release.sh`.

- `git merge --ff-only "$target"` выполняется **до** активации релиза, поэтому при
  откате рабочее дерево `main` на VPS остаётся ff-слитым с тем, что откатили.
- Активация = `pm2 delete` + `pm2 start` → короткий простой витрины.

PR: менять порядок (активация → затем ff-merge), рассмотреть `pm2 reload`.

### M5. Публичный IP VPS в репозитории и в клиентском бандле

Места (перепроверено grep'ом по `main`): `DEPLOY.md:36` (`ssh root@178.104.108.200`),
`frontend/src/lib/product-image.ts:9` (значение `178.104.108.200` попадает в
браузерный бандл), `frontend/tests/commerce.test.mjs:39-40,76` (тот же IP в
тестовых моках).

Внешний QA-отчёт называл другой адрес (`188.121.137.67`) — в коде его нет;
видимо, это устаревший/сторонний адрес. Актуальный — `178.104.108.200`.

PR #31: вынести в переменную окружения / заменить на список «локальные хосты» без
публичного адреса; в `DEPLOY.md` — плейсхолдер вместо IP.

### M6. `.gitignore` не закрывает загруженные медиа

`.gitignore:30-35` игнорирует только `backend/uploads/`, а реальное хранилище
медиа — `backend/static/` и `backend/private-static/` (см.
`scripts/deploy-vps.sh:77-87`, `backend/medusa-config.ts:41`).

PR #32: добавить `backend/static/` и `backend/private-static/`.

### M7. Тесты разъезжаются с CI

Перепроверено на `main`: в `backend/tests/` 15 `.cjs`-тестов, `verify.yml` явными
списками запускает 14 — **`registration-email.test.cjs` не запускается никогда**;
- `backend/jest.config.js:21-27`: при `TEST_TYPE=integration:http` testMatch реально
  находит `integration-tests/http/health.spec.ts` — но этот тест CI не запускает;
  паттерны `integration:modules` и `unit` (`src/modules/*/__tests__/`,
  `**/__tests__/**/*.unit.spec.*`) не находят ничего — таких каталогов в `backend/src`
  нет (grep пуст);
- в `backend/package.json` нет скрипта `test` (только jest-скрипты Medusa).

PR #33: сделать glob-список (или единый скрипт `npm test` в backend) и добавить
пропущенный тест; обновить `docs/TESTING.md`.

### M8. Фронтенд: лишние сетевые запросы и build-зависимость от сети

- `src/lib/store/*` — RSC-фетчи без таймаутов (единственный
  `AbortSignal.timeout` — `src/lib/reviews/server.ts:17`);
- везде `cache: "no-store"` → регионы и категории переfetch'иваются на каждый хит;
- `unoptimized` у баннера каталога: `src/app/[countryCode]/catalog/page.tsx:51`;
- `next/font/google` (`src/app/layout.tsx:3`) — сборка падает без доступа к Google Fonts.

Блок задач (несколько отдельных PR, не микроскопических).

### M9. Документация отстаёт от кода

- `DEPLOY.md`: дата «11 октября», публичный IP, `root@` в командах;
- в `docs/SECRETS.md` есть раздел «Существующий VPS: порядок до объединения PR»
  (`:31-43`) — он описывает миграционный PR, но по номеру его не называет
  (прямой ссылки на PR #15 в файле нет);
- `docs/DOCKER-EXIT-PLAN.md` существует только в открытой ветке PR #15 (в `main`
  файла нет) и исходит из «любой push в main деплоит» — после #18 неверно;
- `HostKeyAlias=tamir-vps` (`.github/workflows/deploy.yml:63`) — генерацию записи
  known_hosts для алиаса нигде не описали;
- `TAMIR_PRIVACY_EMAIL` используется в `src/app/privacy/page.tsx:17`, но его нет в
  `frontend/.env.example`;
- `admin@tamir.local` зашит в `backend/src/utils/review-validation.ts:28`.

### M10. Локаль `sr` — только латиница (решение, а не дефект кода)

Посылка первой редакции этого пункта была **неверной** (файла `sr-LAT.json` в
репозитории никогда не было, а кириллических строк в `sr.json` нет). Перепроверено
чтением `main`:

- в `frontend/src/messages/` ровно два файла — `en.json` и `sr.json`;
- весь `sr.json` набран латиницей, grep по кириллице `[а-яА-Я]` — ноль совпадений
  (`header.cart` = «Korpa» :7, `addToCart` = «U korpu» :285, `cartPage.empty` =
  «Korpa je prazna.» :29);
- `<html lang={locale}>` на месте — корневой `frontend/src/app/layout.tsx:33-34`
  (отдельного `app/[countryCode]/layout.tsx` в репозитории нет), у шрифта `Manrope`
  подключён и подмножество `cyrillic` (`layout.tsx:11`).

То есть код консистентен: сербская локаль сознательно латиничная (сербский так
умеет). Претензии внешнего QA про «смешанные алфавиты» объясняются только тем, что
часть SR-покупателей привыкла к кириллице. Если кириллица нужна — задача уровня
продукта: завести отдельную локаль `sr-Cyrl` (новый файл сообщений,
`frontend/src/lib/i18n/config.ts`, маршруты и `proxy.ts`), а не «переписывать
кириллизацию», которой сейчас нет вовсе.

---

## LOW

- Плавучие теи actions: `actions/checkout@v4`, `actions/setup-node@v4`
  (`.github/workflows/verify.yml:40-41`) → пин на SHA.
- Нет `.gitattributes` (`*.sh text eol=lf`) — риск CRLF для bash-скриптов на Windows.
- Нет `LICENSE` в корне (backend помечен `UNLICENSED`).
- Бэкапы `/root/tamir-backups/<id>` без политики хранения
  (`scripts/deploy-vps.sh:24`) — каталог растёт бесконечно.
- `bash -n` проверяет только `deploy-vps.sh` (`verify.yml:75`);
  `activate-release.sh` и остальные скрипты CI не проверяет.
- `backend/.yarnrc.yml` битый: `yarnPath: .yarn/releases/yarn-4.12.0.cjs`, файла нет,
  проект живёт на npm (`packageManager: npm@11.6.2`).
- Мёртвые ассеты: `frontend/public/{vercel,next,file,window,globe}.svg`,
  `frontend/public/tamir-logo.png`, `frontend/public/design/collection.jpg`
  (в git, 15 466 байт ≈ 15 КБ; в `src` не используется — grep по `/design/` его не находит).
- `@medusajs/types` в `dependencies` фронтенда, используется только как типы → `devDependencies`.
- ID GA `G-0L34ZN3ZB6` захардкожен в `frontend/src/lib/privacy/consent.ts:5`
  (перепроверено 23.10 — также упомянут в `src/lib/legal/content.ts:85,91`).
  Не секрет, но выносился бы в env при переезде на другой аккаунт аналитики.
- Гостевая receipt формируется из `sessionStorage` (`src/lib/checkout/receipt.ts`) —
  пользователь может показать сам себе любые данные заказа; LOW UX, не уязвимость.
- `frontend/AGENTS.md` в репозитории — это намеренное предупреждение про Next 16
  («this is NOT the Next.js you know»). Не удалять; обсуждать отдельно.

---

## Проверено и чисто (не флагать повторно)

- Next закрепплён на `16.2.2`, react `19.2.4` — претензии про CVE из Next 15.x **не**
  применимы.
- `proxy.ts` — соглашение Next 16, корректно перезаписывает `x-tamir-locale`.
- В `NEXT_PUBLIC_*` секретов нет.
- Turnstile проверется на сервере для регистрации, восстановления пароля и отзывов
  (`backend/src/utils/captcha.ts`).
- Guard'ы `authSecret` / `cookieSecure` в `backend/medusa-config.ts` на месте.
- Лок-файлы валидны, `npm ci` в CI проходит.
- `[countryCode]`-страницы валидируют локаль; JSON-LD экранирован.

### Внешний QA-отчёт: что из него не подтвердилось

Внешний отчёт (P0/P1/P2/SR-LAT/EN) сверен с кодом `main` — часть пунктов уже учтена
исправлениями HIGH (#22–#24, #26), остальные разобраны:

- «Пользователь `test_test` — админ с доступом к управлению» — **неверно**.
  `test_test` — fulfillment-провайдер-заглушка (`backend/src/scripts/test-fulfillment-provider.ts`,
  `identifier: "test"`), регистрируется в прод-конфиге (`medusa-config.ts:58-62`) и вяжется
  в `seed.ts:181`; это не юзер вообще. Претензия уже учтена в M1. В коде `main` админ-юзеры
  не создаются (grep по `backend/src` — только SMTP-конфиг и e-mail клиентов), поэтому
  реальный e-mail администратора можно проверить только на VPS, в таблице `admin_user` —
  в предыдущей редакции этого пункта стоял конкретный адрес, взявшийся неизвестно откуда;
  он удалён как непроверяемый из репозитория.
- «Turnstile токен уходит заголовком `X-Turnstile-Token`» — в коде таких
  заголовков нет, токен в теле запроса.
- IP `188.121.137.67` — в репозитории такого адреса нет (см. M5, там `178.104.108.200`).
- «Конфликт версий Node: `engines: 22.22.0` vs CI 20.20.2/24» — **конфликта нет**:
  `backend/package.json` объявляет `engines.node: ">=20"` (`:50-52`), CI-матрица 20.20.2/24 ей
  удовлетворяет. Строка `22.22.0` во всём `main` встречается ровно один раз — внутри
  зависимостного ranges в `backend/package-lock.json:19224` (`"^20.20.0 || >=22.22.0"`),
  откуда QA-отчёт, видимо, её и вычитал. `deploy-vps.sh` Node не устанавливает (там только
  проверка команды, `:7-9`, `:17`) — версия Node на VPS проверяется только на самом сервере.
  Файла `.node-version` в `main` нет.
- «Add to Cart показывается как Dodaj u korpu» — такой строки в репозитории нет:
  «Dodaj u korpu» grep по `frontend/src` не нашёл, а SR-локаль латиничная —
  `frontend/src/messages/sr.json:285` `addToCart: "U korpu"` (`sr-LAT.json` не существовал
  никогда, см. M10). «Dodaj» — это хорватский/боснийский вариант, его в сообщениях тоже нет.
  Жалоба проверяется только живым браузером на tamir.rs; кода-дефекта в репозитории нет.
- «В каталоге не хватает звёзд рейтинга/бейджей/второго фото» — `ProductCard` берёт
  локализованный заголовок (`src/components/store/ProductCard.tsx:19`,
  `localizedText(product, "title", …)`) и изображения товара; такого идентификатора,
  как `title_snapshot`, в коде нет. Дефекта в коде нет — это вопрос к наполнению
  конкретных товаров в проде, проверяется браузером.
- «checkout показывает пустую корзину при бейдже =1» — строка пустой корзины одна
  (`checkout.emptyCart`, `CheckoutPageClient.tsx:157`), код корректен; жалоба SR-LAT
  правдоподобна из-за M10 (SR-локаль латиничная, к смешению алфавитов приводит только
  восприятие покупателей) или гонки корзины — проверить в
  браузере, кода-дефекта не найдено.
- «Каталог: `PRODUCT_PAGINATION` в seed» — в seed на `main` такого маркера нет.

---

## Порядок PR

Номера ниже — фактические (PR уже созданы и смержены) либо плановые, продолжение
нумерации. Этот аудит-PR занял **#21**; HIGH-исправления шли отдельными PR:
**#22** (H1), **#23** (H2), **#24** (H3), **#26** (H4); попутно закрыты поломки,
найденные самими деплоями, — **#27** (пустой `VERIFIED_RUN`) и **#28** (гонка в
тесте H1). Карточка **#25** так и не создавалась, а #26–#28 заняты, поэтому плановые
номера сдвинуты: следующая свободная карточка **#29** (номер всё равно уточнить при
создании PR — нумерация общая для репозитория).

| PR | Предмет | Приоритет | Статус |
|----|---------|-----------|--------|
| #22 | Удалить phone-login + rate-limit на `/auth/customer/emailpass` (IP+email, только неудачи) + friendly-429 в `LoginForm` | HIGH | ✅ в проде (`5f82714`) |
| #23 | Деплой по проверенному SHA (`workflow_run.head_sha`) | HIGH | ✅ в проде (`e6fdefc`) |
| #24 | Guard `workflow_dispatch` + `environment: production` | HIGH | ✅ в проде (`8e88d8e`) |
| #26 | H4: `httpOnly`-сессии вместо `localStorage` + прокси только `/api/medusa/store/*` | HIGH | ✅ в проде (`5f8320e`) |
| #27 | CI: `VERIFIED_RUN` из `workflow_run.id` (в payload нет `run_id`) | HIGH | ✅ в проде (`09c470d`) |
| #28 | H1: тест на гонку счётчиков и forged-`x-forwarded-for` | HIGH | ✅ в проде (`0f29429`) |
| #29 | M1 + M2: убрать `test_test` из прод-конфига + guard на `seed.ts` | MED | открыто |
| #30 | M3: зависимости `zod` / `knex` в `backend/package.json` | MED | открыто |
| #31 | M5: убрать публичный IP из `DEPLOY.md` и бандла | MED | открыто |
| #32 | M6: `.gitignore` — `backend/static/`, `backend/private-static/` | MED | открыто |
| #33 | M7: тесты — glob/единый скрипт + пропущенный тест + `docs/TESTING.md` | MED | открыто |
| — | M4: атомарный cutover (активация → ff-merge) и `pm2 reload` вместо delete+start | MED | открыто |
| — | M10: решение по письму `sr` (сейчас латиница; при желании — отдельная локаль `sr-Cyrl`) + браузер-проверка алфавитов | MED, продукт | открыто |
| — | M8: пакет фронтенда — таймауты, `no-store`, баннер, `next/font` | MED | открыто |
| — | M9: документация — `DEPLOY.md`, `SECRETS.md`, `DOCKER-EXIT-PLAN.md`, `.env.example` | MED | открыто |
| — | LOW-микроправки (теги actions, `.gitattributes`, бэкапы, мёртвые ассеты) | LOW | открыто |

---

## Открытые вопросы (ждут решения владельца)

1. PR #15 (`docs/native-services-migration-plan`, открыт) — мержить или закрыть?
   Раздел «Существующий VPS: порядок до объединения PR» в `docs/SECRETS.md:31-43`
   описывает именно этот миграционный PR, но номер не называет — прямых ссылок
   на PR #15 в файле нет. После решения здесь появится запись, что с ним сделано.

## Решённые вопросы

1. Доступ к VPS для диагностики (закрыто 24.10): выбран вариант **A** — отдельный
   SSH-ключ `~/.ssh/tamir_vps_key` (комментарий `tamir-audit-agent-2026`, в
   `authorized_keys` добавлен с ограничениями `no-port-forwarding,
   no-agent-forwarding,no-X11-forwarding`). Проверен: диагностика работает, все
   проверки выше (cwd релизов, env прокси, nginx-логи, Redis) выполнены им.
   Политика: запись на VPS — только по явному решению владельца. Отзыв доступа —
   удалить строку с комментарием `tamir-audit-agent-2026` из
   `/root/.ssh/authorized_keys` на VPS.
2. Шум `[ioredis] Unhandled error event: AggregateError` в error-логе бэкенда —
   неактуален: лог не обновлялся с 20.10 09:37 (12 881 запись — все до этой
   отметки, старый сбой Redis). На 24.10 Redis жив: TCP к порту 6379 — OK,
   established-соединение от бэкенда есть, лимитер логина на живом хранилище.
   `Failed to find Server Action` во фронтенд-логе — ожидаемые обращения старых
   браузерных бандлов после деплоя, наблюдения ведутся.

## Примечание: Figma MCP

Настроены оба варианта (в `~/.config/opencode/opencode.json`): официальный remote
`figma` (`https://mcp.figma.com/mcp`, OAuth, бесплатный тариф seat View, лимит
~20 read-вызовов в месяц — беречь) и запасной `figma-rest`
(`npx -y figma-developer-mcp --stdio` + PAT в `FIGMA_API_KEY`,
~5000 REST-запросов/мес). Массовое чтение гонять через `figma-rest`, remote беречь.
