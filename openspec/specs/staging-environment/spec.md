# staging-environment Specification

## Purpose
Изолированный staging-контур tamir.rs (`test.tamir.rs` / `test-api.tamir.rs`) на машине владельца:
своя инфраструктура, секреты, обезличенная копия данных прода, почта через Mailpit и публичный вход
через Cloudflare Tunnel. Release-конвейер с миграциями, health-проверками и откатом; каждый зелёный
коммит `main` автодеплоится на стенд, а выпуск на прод принимает человек тем же проверенным SHA.

## Requirements

### Requirement: Full isolation of staging from prod
Staging-контур обязан (MUST) иметь собственную инфраструктуру (Compose-проект `tamir-staging`:
Postgres 16, Redis 7, Mailpit), свои тома, свою роль БД и свои секреты; порты Postgres, Redis и
SMTP обязаны (MUST) публиковаться только на `127.0.0.1`. Единственное исключение — веб-интерфейс
Mailpit: он публикуется в локальную сеть под паролем (см. требование про HTTP Basic). Стенд не
должен (MUST NOT) обращаться к прод-БД, прод-Redis, прод-почтовому серверу, прод-платежам или
прод-хранилищу медиа.

#### Scenario: Prod address in the staging configuration
- **WHEN** в staging env-файле встречается `DATABASE_URL` или `REDIS_URL` не на `127.0.0.1`, либо
  `MEDUSA_BACKEND_URL` указывает на `https://api.tamir.rs`
- **THEN** `scripts/deploy-staging.sh` падает в `staging_assert_config_safe` до сборки, живые
  процессы и база не изменены

#### Scenario: Staging infrastructure reachable from outside
- **WHEN** в Compose-файле порт Postgres, Redis или SMTP публикуется без адреса `127.0.0.1`, либо
  порт Mailpit UI опубликован наружу, а `MP_UI_AUTH` в `secrets/docker.env` не задан
- **THEN** `scripts/staging-bootstrap.sh` завершается ошибкой и контейнеры не поднимаются

### Requirement: Staging release pipeline with rollback
`scripts/deploy-staging.sh` обязан (MUST) собрать релиз в каталог `/opt/tamir-staging/releases/<id>`
и активировать его симлинками `current`, `current-backend`, `current-frontend` только после
проверок здоровья. При провале любой проверки активация обязана (MUST) вернуть оба процесса на
предыдущий релиз, а экосистему предыдущего релиза — сохранить в `backups/<id>/`.

#### Scenario: Storefront not responding after the switch
- **WHEN** `scripts/activate-staging-release.sh` не дожидается `200` на `http://127.0.0.1:3000/robots.txt`
- **THEN** стенд обязан остаться на предыдущем релизе, а в `backups/` сохраняется экосистема,
  из которой процессы подняты заново

#### Scenario: Redeploying the same commit
- **WHEN** на стенд повторно выпускают SHA, который уже активен
- **THEN** fast-forward checkout пропускается с предупреждением, релиз остаётся рабочим

#### Scenario: Images stop being served after the build
- **WHEN** `medusa build` пересоздаёт `.medusa/server` и симлинк `static`, созданный до сборки,
  оказывается удалён вместе с каталогом
- **THEN** `scripts/deploy-staging.sh` обязан создавать симлинки `static`/`private-static` после
  обеих сборок (backend и витрины), а машинный тест `test-support/verify-deploy-staging.mjs` —
  проверять этот порядок

### Requirement: Migrations always run on staging
Staging-деплой обязан (MUST) каждый раз выполнять `medusa db:migrate`, а также
`setup-reviews.ts` и `setup-decimal-attributes.ts`; сид обязан (MUST) запускаться только при явном
`TAMIR_ALLOW_SEED=1`. Прод-`scripts/deploy-vps.sh` общей миграции не выполняет, поэтому коммит с
новой Medusa-миграцией обязан (MUST) сначала успешно отработаться на стенде.

#### Scenario: Commit with a new migration
- **WHEN** в `main` попадает коммит с новым файлом Medusa-миграции
- **THEN** стенд применяет её автоматически, а прод — нет; ошибка миграции останавливает деплой и
  процессы остаются на предыдущем релизе

#### Scenario: Seed without an explicit flag
- **WHEN** деплой выполняется без `TAMIR_ALLOW_SEED=1`
- **THEN** `seed.ts` не запускается и обезличенные данные не затираются

### Requirement: Staging mail path goes through the production SMTP code
Стенд обязан (MUST) принимать письма через Mailpit на порту `587` с обязательным STARTTLS и
self-signed CA, доверие к которому приложение получает только через `NODE_EXTRA_CA_CERTS` в
pm2-экосистеме релиза. Проверка тракта обязана (MUST) вызываться из `scripts/staging-smoke.sh` через
продуктовую `sendRegistrationCode()` и подтверждаться записью в Mailpit API. Правки продуктового
кода отправки почты не требуются.

#### Scenario: CA certificate missing
- **WHEN** `secrets/mail/mailpit-ca.crt` не выпущен `scripts/staging-bootstrap.sh`, либо Mailpit
  слушает `0.0.0.0:1025` вместо `0.0.0.0:587` и не держит `MP_SMTP_REQUIRE_STARTTLS=true`
- **THEN** bootstrap завершается ошибкой до старта приложения, потому что `mailConfig()` требует
  `requireTLS` и порт ∈ {587, 465}

#### Scenario: Mail does not reach Mailpit
- **WHEN** `npx medusa exec ./src/scripts/staging-mail-check.ts` отправил код, а Mailpit API
  `http://127.0.0.1:8025/api/v1/info` не показывает сообщение
- **THEN** шаг smoke завершается неуспешно и деплой считается неудачным

### Requirement: Staging web mail reachable from the LAN only under HTTP Basic
Веб-интерфейс и API Mailpit обязаны (MUST) быть опубликованы на интерфейсы локальной сети под
паролем `MP_UI_AUTH=user:pass` из `secrets/docker.env`, чтобы тестовые письма были видны с рабочего
компьютера без публичного адреса. Публикация Mailpit UI без `MP_UI_AUTH` запрещена (MUST NOT):
в ящике лежат коды регистрации. Публичный хост для почты не создаётся (MUST NOT); SMTP, Postgres
и Redis наружу не публикуются.

#### Scenario: Inbox open without a password
- **WHEN** `MP_UI_AUTH` в `secrets/docker.env` отсутствует, а порт `8025` опубликован не на
  `127.0.0.1`
- **THEN** bootstrap и smoke (`staging_ports_are_loopback`) завершаются ошибкой, контейнер не
  поднимается с открытым интерфейсом

#### Scenario: Request without a token
- **WHEN** к `http://<IP стенда>:8025/` обращаются без HTTP Basic
- **THEN** Mailpit отвечает `401`, и smoke фиксирует это как признак закрытого доступа

#### Scenario: Mail-path check reads the Mailpit API
- **WHEN** `scripts/staging-smoke.sh` запускает `staging-mail-check.ts`
- **THEN** в окружение процесса передаётся `STAGING_MAILPIT_AUTH` из `secrets/docker.env`, и запросы
  к Mailpit API идут с заголовком `Authorization`, иначе проверка упала бы на `401`

### Requirement: Public access via Cloudflare Tunnel without port forwarding
Доступ наружу обязан (MUST) осуществляться Cloudflare-туннелем `tamir-staging` с ingress только на
`localhost:3000` и `localhost:9000`; проброс портов роутером и nginx на машине не используются.
Скрипт `scripts/staging-tunnel.sh` обязан (MUST) создавать DNS-записи строго для имён `test` и
`test-api` и не должен (MUST NOT) изменять `tamir.rs` и `api.tamir.rs`. Публичные HTTPS-проверки
обязаны (MUST) выполняться только при наличии маркера `/opt/tamir-staging/.tunnel-enabled`.

#### Scenario: Attempt to create a prod-zone DNS record
- **WHEN** `staging-tunnel.sh dns` получают имя `tamir` или `api`
- **THEN** скрипт падает до обращения к Cloudflare API

#### Scenario: Tunnel not connected yet
- **WHEN** маркера `.tunnel-enabled` нет
- **THEN** smoke и деплой не обращаются к публичным HTTPS-адресам и не падают из-за отсутствия DNS

### Requirement: Staging data is an anonymized copy of prod
Загрузка дампа прода обязана (MUST) сопровождаться `scripts/sql/staging-anonymize.sql`, который
маскирует персональные колонки по `information_schema` и завершается assert'ом «оригинальных email
не осталось». Скрипт обязан (MUST) содержать guard имён баз, отказывающий при запуске против
прод-базы, и не должен (MUST NOT) маскировать staging-собственные адреса `@tamir.local`: их создаёт
деплой, а маскирование лишил бы стенд входа в админку.

#### Scenario: Anonymization skipped
- **WHEN** `scripts/staging-db-refresh.sh` завершается, а в копии остаются оригинальные email,
  имя/фамилия/телефон/адрес, трекинг-номер, IP или `user_agent` либо непустые таблицы кодов
  подтверждения и rate limit
- **THEN** SQL-скрипт бросает `EXCEPTION`, обновление базы считается неудачным; корректный результат —
  email вида `staging-<md5(email)>@anon.invalid` и запись о замаскированной колонке в
  `tamir_staging.anonymized_column`

#### Scenario: Prod password hashes are not carried over
- **WHEN** `staging-anonymize.sql` завершается после загрузки дампа прода
- **THEN** в `provider_identity.provider_metadata` не остаётся ключа `password`, а число
  снятых сохранённых паролей публикуется в NOTICE

#### Scenario: Script pointed at the prod database
- **WHEN** `staging-anonymize.sql` запускают против базы, имя которой не проходит guard `$guard$`
- **THEN** выполнение прекращается сообщением о запрещённом имени базы

#### Scenario: Staging loses its administrator
- **WHEN** `staging-anonymize.sql` маскирует адрес вида `staging-admin@tamir.local` или считает его
  остатком прода-почты
- **THEN** это считается ошибкой анонимизации: адреса `@tamir.local` обязаны сохраняться и
  исключаться из проверки «оригинальных email не осталось»

### Requirement: Staging media lives on the staging domain
Файлы медиа прода переносятся на стенд один раз в `shared/uploads` и обязаны (MUST) переживать смену
релиза. Адреса медиа в копии обязана (MUST) переписывать анонимизация `staging-anonymize.sql`: продные
и локальные префиксы заменяются на staging-домен, чтобы витрина стенда не обращалась к проду.

#### Scenario: Media addresses left pointing at prod
- **WHEN** после `scripts/staging-db-refresh.sh` в копии остаются `https://api.tamir.rs/static/...`
  или `http://127.0.0.1:9000/static/...` в колонках `url`/`thumbnail`
- **THEN** блок `$media$` переписывает их на `https://test-api.tamir.rs/static/...` и публикует число
  изменённых строк в NOTICE; префиксы, файлов для которых нет (`tamir.ua/images/uploads`, S3-демо),
  не изменяются

### Requirement: Secrets outside Git and a required Turnstile sitekey
Все staging-секреты обязаны (MUST) жить в `/opt/tamir-staging/secrets` (права `0600`) и не должны
(MUST NOT) попадать в репозиторий. `scripts/staging-bootstrap.sh` обязан (MUST) потребовать sitekey
Turnstile для `test.tamir.rs` и не должен (MUST NOT) молча подставлять заглушку; пароль
администратора стенда обязан (MUST) генерироваться автоматически, если в таблице `"user"` нет
staging-адреса.

#### Scenario: Sitekey not passed
- **WHEN** `staging-bootstrap.sh` запускают без sitekey — нет ни `--turnstile-site-key`, ни
  `TAMIR_TURNSTILE_SITE_KEY`, ни файла `secrets/turnstile-site-key` — и без
  `--allow-missing-turnstile`
- **THEN** bootstrap останавливается с подсказкой, как передать sitekey, и секреты не создаёт; с
  `--allow-missing-turnstile` пишется `staging-placeholder-sitekey-00000000`, гейт конфигурации его
  пропускает, но CAPTCHA остаётся нерабочей

#### Scenario: Release configuration check
- **WHEN** `check-review-config.cjs` проверяет staging env
- **THEN** он проходит, и при этом стенд не использует ни один прод-секрет

#### Scenario: No staging administrator on staging
- **WHEN** `SELECT count(*) FROM "user" WHERE email = 'staging-admin@tamir.local'` возвращает 0
  после миграций (анонимизация снимает пароли прода, поэтому вход с прода не работает)
- **THEN** `scripts/deploy-staging.sh` создаёт `staging-admin@tamir.local` со случайным паролем и
  сохраняет креды в `secrets/staging-admin.txt` с правами `0600`

### Requirement: Machine test of the staging contract
В `backend/tests/staging-contract.test.cjs` обязан (MUST) существовать тест без базы данных,
проверяющий, что staging-скрипты и workflow не содержат прод-URL (`https?://(api\.)?tamir.rs`),
прод-секретов `VPS_*` и что строки БД и Redis в staging-конфигурации указывают только на
`127.0.0.1`. Упоминание зоны `tamir.rs` в комментариях и подсказках Cloudflare разрешено.

#### Scenario: Prod URL in a staging script
- **WHEN** в `scripts/deploy-staging.sh` появляется `https://api.tamir.rs`
- **THEN** тест падает, и job `verify` завершается неуспешно
