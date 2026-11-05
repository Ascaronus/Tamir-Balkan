# Design

## Контекст

Прод живёт на VPS (Германия) и выкладывается из GitHub Actions по SSH (`tamir-deploy@$VPS_HOST`).
Staging-машина — домашний HP Mini (`tamir-staging`, 192.168.1.143, Ubuntu 24.04, ~14 GiB RAM) за
домашним NAT: снаружи к нему нельзя подключиться, поэтому прод-механика «GitHub сам приходит по SSH»
неприменима. Ограничения, задающие дизайн:

- на self-hosted runner с доступом к стенду (deploy key, docker, pm2) нельзя исполнять
  непроверенный код из PR;
- записи `tamir.rs` / `api.tamir.rs` и сеть VPS менять нельзя;
- продуктовый SMTP-код требует `requireTLS` и порт ∈ {587, 465} — править продукт под стенд нельзя;
- прод-секреты и прод-данные не должны попасть на стенд в открытом виде.

## Решения

### 1. Исполнение кода стенда: `workflow_run` + гейт в job `gate`

`deploy-staging.yml` не имеет `pull_request`/`push`-триггеров. `workflow_run` берёт файл workflow из
default branch, а `head_sha` — из уже завершившегося `Verify`, то есть на машине исполняется только
код, слитый в `main`. Дополнительно:

- job `gate` (GitHub-hosted, `permissions: contents: read, actions: read`) через API проверяет
  `compare main...sha` → `behind`/`identical` и прогоны `verify.yml` на этом SHA
  (`actions/workflows/verify.yml/runs?head_sha=<sha>`, фильтр `head_branch == "main"` и
  `event` ∈ {`push`, `workflow_dispatch`}) → `completed` +
  `success`/`neutral`/`skipped`; иначе job падает и `deploy` не запускается. Пути API собираются
  из `github.repository` (шагская переменная `GH_REPO_PATH`): в `gate` нет `actions/checkout`,
  поэтому собственные плейсхолдеры gh владельца/репозитория там не разворачиваются
  (на этом упал первый автодеплой — run 42062901425). Источником истины специально не являются
  `check-suites`: в них попадают прогоны и других workflow того же SHA, включая сам staging-деплой,
  поэтому гейт сначала блокировался собственным `queued`-прогоном, а после первого неудачного
  деплоя SHA «отравлялся» чужим `failure` (run 42067443192);
- job `deploy` (`needs: gate`, labels `self-hosted, linux, x64, tamir-staging`,
  `environment: staging`) не делает `actions/checkout`, а вызывает уже лежащий на машине
  `scripts/deploy-staging.sh <sha>`;
- второй уровень защиты — на самой машине: `deploy-staging.sh` после `git fetch origin main`
  (12 попыток с паузой 15 с, см. инцидент 04.11) требует `git merge-base --is-ancestor <sha>
  origin/main`. Обход — только ручной запуск по SSH с `TAMIR_ALLOW_NON_MAIN=1`.

Принятый компромисс: self-hosted runner работает под выделенным пользователем `actions-runner`
(GitHub `config.sh` запрещает регистрацию от root), включённым в группу `docker` и владеющим
`/opt/tamir-staging`; pm2 живёт в `PM2_HOME=/home/actions-runner/.pm2`, git — под своим deploy key.
Ручные команды обслуживания — `sudo -u actions-runner …`; root остаётся только за apt, systemd
(runner-сервис, `pm2-resurrect.service`, cloudflared-юнит) и туннельными операциями. Стенд —
единственный контур на машине, поэтому компрометация раннера опасна только потерей стенда:
она возможна лишь кодом, уже прошедшим Verify и слитым в `main`, и не даёт доступа к проду
(прод-секретов на машине нет).

### 2. Прод: только ручной `workflow_dispatch` по SHA

`deploy.yml` теряет `workflow_run`. Вход `sha` обязателен, `VERIFIED_SHA = inputs.sha`, job
обязателен `if: github.event_name == 'workflow_dispatch' && github.ref == 'refs/heads/main'`,
`environment: production`, SSH-контракт (`tamir-deploy`, `HostKeyAlias=tamir-vps`,
`VPS_KNOWN_HOSTS`) не меняется. Тот же API-гейт, что и на staging, не даёт выпустить коммит,
который не входит в `main` или где Verify не зелёный.

Почему не автодеплой прода после стенда: стенд проверяет миграции и конфигурацию, но не замену
платежного провайдера и не контент; решение «когда» остаётся за человеком.

### 3. Изоляция данных и инфраструктуры

Отдельный Compose-проект `tamir-staging` с собственными томами, ролью БД `tamir_staging` и
секретами из `/opt/tamir-staging/secrets` (вне Git). Все порты (5432, 6379, 587, 8025) публикуются
только на `127.0.0.1`; проверка `staging_ports_are_loopback` есть и в bootstrap, и в smoke. Guard
`staging_assert_config_safe` отказывает деплою, если в env встречается прод-домен, прод-адрес или
строка БД/Redis не на loopback — это защита от «стенд начал писать в прод».

Staging-контракт отделён от прод-гвардов: staging-скрипты не используют
`backend/test-support/guard-env.mjs`, у них свой guard, потому что набор допустимых значений разный
(`test.tamir.rs`, `127.0.0.1`, Mailpit).

### 4. Почта без правки продукта: Mailpit + STARTTLS + self-signed CA

`mailConfig()` (`backend/src/utils/registration-email.ts`) жёстко требует `requireTLS` и
`SMTP_PORT` ∈ {587, 465}, а `check-review-config.cjs` не пропускает env без `SMTP_USER`/
`SMTP_PASSWORD`. Поэтому bootstrap генерирует **self-signed CA и leaf-сертификат** (SAN
`localhost`, `mailpit`, `host.docker.internal`, `127.0.0.1`), монтирует их в Mailpit, а приложение
доверяет CA только через `NODE_EXTRA_CA_CERTS` в pm2-экосистеме релиза. Mailpit обязан слушать
`MP_SMTP_BIND_ADDR=0.0.0.0:587` (по умолчанию — `0.0.0.0:1025`) и держать
`MP_SMTP_REQUIRE_STARTTLS=true`. Проверка тракта идёт через продуктовую функцию
`sendRegistrationCode()` (`backend/src/scripts/staging-mail-check.ts`) и API Mailpit, то есть
тестируется реальный путь письма, а не подмена.

### 5. Данные: обезличивание по `information_schema`

Стенд стартует на копии прода, но `scripts/sql/staging-anonymize.sql` не знает конкретную схему:
он проходит по `information_schema.columns` и маскирует колонки по имени (`email`, `first_name`,
`phone`, `address_1`, `postal_code`, `tracking_number`, `ip`, `fingerprint`, `user_agent` и т. п.),
исключая справочники и каталог, иначе магазин перестаёт работать. Почты →
`staging-<md5(email)>@anon.invalid`, сервисные таблицы кодов и rate limit обнуляются, факт маски
пишется в `tamir_staging.anonymized_column`, а в конце стоит assert «оригинальных писем не осталось»
(`EXCEPTION`). Guard имён баз в блоке `$guard$` не даёт запустить скрипт на прод-базе.

Медиа прода на стенд не копируются (объём + личные файлы), поэтому картинки могут отдавать 404 —
это фиксируется как известное ограничение, а загруженное на стенде живёт в `shared/uploads`.

### 6. Публичный вход: Cloudflare Tunnel вместо проброса портов

`scripts/staging-tunnel.sh` создаёт туннель `tamir-staging`, systemd-сервис и ingress только на
`localhost:3000` / `localhost:9000`. DNS создаётся строго для `test` и `test-api`; имена проверяются
жёстко, чтобы скрипт не мог задеть `tamir.rs` / `api.tamir.rs`. `login` принципиально интерактивен
(человек открывает ссылку и выбирает зону). После `dns` появляется маркер
`/opt/tamir-staging/.tunnel-enabled`, и только с него smoke и деплой начинают проверять публичные
HTTPS-адреса — иначе локальный стенд падает из-за отсутствия DNS.

### 7. Миграции: стенд всегда впереди прода

`deploy-staging.sh` всегда выполняет `medusa db:migrate`, `setup-reviews.ts` и
`setup-decimal-attributes.ts`; прод-`deploy-vps.sh` общую миграцию не запускает. Отсюда требование
порядка: коммит с миграцией обязан отработаться на стенде до прод-выпуска. Сид — только по явному
`TAMIR_ALLOW_SEED=1`, чтобы случайно не затереть обезличенные данные.

## Риски и открытые вопросы

- GitHub периодически отвергает deploy key при `git fetch` (измерено на проде 04.11) — в стенде это
  снято 12 попытками; при регулярных отказах нужен перевыпуск ключа.
- Sitekey Turnstile для `test.tamir.rs` отдельный: прод-виджет Cloudflare отклоняет hostname. Без
  него bootstrap пишет placeholder, гейт его пропускает, но CAPTCHA в регистрации не работает —
  это отражается в отчёте как незакрытое.
- Runner от root (см. §1) — осознанный компромисс; ужесточение возможно при переносе pm2/Docker под
  отдельного пользователя.
- Поведение `npx medusa user` и `NODE_EXTRA_CA_CERTS` в собранном релизе (`NODE_ENV=production`)
  подтверждается только фактическим прогоном на машине.
