# Staging: test.tamir.rs / test-api.tamir.rs

Стенд проверяет следующий релиз **до** прода: тот же код, что в `main`, та же сборка и те же
скрипты подготовки, но своя база, свой SMTP, свой CAPTCHA и своя админка. Прод при этом не
трогается ни деплоем стенда, ни данными.

Стенд поднят на машине владельца (HP Mini, `tamir-staging` → 192.168.1.143, хост `tamir-server`,
Ubuntu 24.04). Публичный вход — только через Cloudflare Tunnel: ни проброса портов, ни nginx.

## Как устроен конвейер

```
PR → Verify (GitHub-hosted) → merge в main → Verify на push в main
                                                 ├─► Deploy to Staging (авто, self-hosted runner на HP Mini)
                                                 └─► Deploy TAMIR (прод, только ручной workflow_dispatch по SHA)
```

- Push в `main` запускает `Verify storefront and backend` (`.github/workflows/verify.yml`).
- После зелёного Verify на push в `main` автоматически стартует **Deploy to Staging**
  (`.github/workflows/deploy-staging.yml`): job `gate` на GitHub-раннере проверяет через API, что
  коммит входит в `main` и что прогоны `verify.yml` на нём (в `main`, события `push`/`workflow_dispatch`)
  завершены успешно, затем job `deploy`
  на self-hosted runner вызывает `scripts/deploy-staging.sh <sha>`.
- Прод (`deploy.yml`) автоматически не запускается никогда: только `workflow_dispatch`
  с обязательным вводом `sha` (40 hex), который прошёл Verify в `main`.
  Подробности — [DEPLOY.md](../DEPLOY.md).

Триггеры `pull_request`/`push` у deploy-workflow нет намеренно: код из PR не должен попадать
на self-hosted runner, у которого есть доступ к стенду (deploy key, docker, pm2). Сам раннер
работает под выделенным непривилегированным пользователем `actions-runner` — GitHub `config.sh`
запрещает регистрацию от root. `workflow_run` берёт файл workflow из default branch,
поэтому на машине исполняется только уже слитый в `main` код.

Дополнительная защита на самой машине: `deploy-staging.sh` требует, чтобы целевой коммит был
предком `origin/main` (`git merge-base --is-ancestor`). Обход — только ручным запуском по SSH
с `TAMIR_ALLOW_NON_MAIN=1`.

## Подключение к машине

Алиас в `~/.ssh/config` машины владельца:

```
Host tamir-staging
    HostName 192.168.1.143
    User giper
    IdentityFile ~/.ssh/tamir_staging
    IdentitiesOnly yes
```

```powershell
ssh tamir-staging hostname        # tamir-server
ssh tamir-staging "uname -a"
```

Ключ `~/.ssh/tamir_staging` (ed25519) защищён кодовой фразой; для неинтерактивных подключений
её нужно загружать в `ssh-agent` (задача входа `Tamir-Staging-SSH-Add`). Кодовая фраза в Git не
хранится. Всем стендом обслуживает выделенный пользователь `actions-runner` — под ним работают
self-hosted runner GitHub Actions, pm2 и docker (вход в группу `docker`); `root` нужен только для
`apt`, systemd-юнитов и `staging-tunnel.sh`. Ручные команды на машине — `sudo -u actions-runner …`.

## Расположение на машине

Всё стенда — в одном каталоге, прод его не видит:

| Путь | Назначение |
| --- | --- |
| `/opt/tamir-staging/repo` | постоянный клон (deploy key только на чтение); деплой переключает его на целевой коммит и перезапускает свои скрипты из него |
| `/opt/tamir-staging/releases/<UTC>-<sha>` | каталоги релизов, как на проде |
| `/opt/tamir-staging/current`, `current-backend`, `current-frontend` | ссылки на активный релиз |
| `/opt/tamir-staging/backups/<release id>` | `pg_dump` staging-БД, env-снимок, экосистема предыдущего релиза, `pm2 jlist` |
| `/opt/tamir-staging/logs` | логи pm2 (`backend.log`, `backend.error.log`, `frontend.*`) |
| `/opt/tamir-staging/shared/uploads` | загруженные медиа (`static`, `private-static`) — вне релизов |
| `/opt/tamir-staging/secrets` | секреты стенда, режим `700`, вне Git |
| `/opt/tamir-staging/deploy.lock` | `flock`: параллельные деплои запрещены |

PM2-процессы называются так же, как на проде (`tamir-backend`, `tamir-frontend`) — это требование
`scripts/check-review-config.cjs`, но работают они из каталога релиза стенда и с портами,
заданными в экосистеме релиза.

## Инфраструктура: `docker-compose.staging.yml`

Отдельный Compose-файл с проектом `tamir-staging` (не путать с прод-`docker-compose.yml`):

- `postgres:16`, `redis:7-alpine`, `axllent/mailpit:v1.33`;
- тома `tamir-staging-pg` и `tamir-staging-mailpit` — свои, прод-тома не используются;
- порты базы, Redis и SMTP проброшены **только на loopback**: `127.0.0.1:5432`, `127.0.0.1:6379`,
  `127.0.0.1:587`. Наружу из приложения смотрит исключительно cloudflared;
- одно исключение — веб-интерфейс Mailpit (`8025:8025`): он открыт на интерфейсы домашней сети,
  чтобы тестовые письма были видны с рабочего компьютера, и закрыт HTTP Basic (`MP_UI_AUTH`);
- у всех сервисов `healthcheck`, БД и Redis изолированы именем проекта и ролью `tamir_staging`.

База и Redis доступны приложениям по `127.0.0.1`. Проверка «ничего лишнего не торчит наружу»
встроена в bootstrap и smoke (`staging_ports_are_loopback`): она разбирает каждую публикацию
(порт + адрес) и допускает непро-loopback-адрес только для `8025`, и только если в секретах задан
`MP_UI_AUTH`.

## Секреты и конфигурация

Секреты генерирует `scripts/staging-bootstrap.sh` и складывает в `/opt/tamir-staging/secrets`
(права `600`/`700`, вне Git, в отчётах и логах не публикуются):

| Файл | Что внутри |
| --- | --- |
| `docker.env` | пароли Postgres/Redis для Compose + `MP_UI_AUTH` — HTTP Basic веб-почты Mailpit |
| `backend.env` | копия кладётся в `backend/.env` релиза: `DATABASE_URL`, `REDIS_URL`, секреты JWT/COOKIE/reviews, SMTP |
| `frontend.env` | копия в `frontend/.env.production.local`: `NEXT_PUBLIC_*` (печатаются в бандл — обязана быть до сборки) |
| `mail/mailpit-ca.crt`, `mail/mailpit-ca.key`, `mail/mailpit-tls.crt`, `mail/mailpit-tls.key` | self-signed CA + сертификат Mailpit для STARTTLS |
| `turnstile-site-key`, `turnstile-secret-key` | виджет Turnstile для `test.tamir.rs` и его secret |
| `publishable-key` | publishable key **staging**-магазина (кэш из БД, сбрасывается при пересоздании БД) |
| `staging-admin.txt` | креды админки стенда (вход на `https://test-api.tamir.rs/app`) |

Отдельные значения (не секреты): `MEDUSA_BACKEND_HOST=127.0.0.1`,
`MEDUSA_BACKEND_URL=https://test-api.tamir.rs`, `MEDUSA_PUBLIC_BACKEND_URL=https://test-api.tamir.rs`,
`COOKIE_SECURE=true`, `STORE_CORS_ORIGINS`/`ADMIN_CORS_ORIGINS` на `test.tamir.rs`,
`TURNSTILE_HOSTNAMES=test.tamir.rs`, `NODE_ENV=production`.

Важно: `medusa-config.ts` в `NODE_ENV=production` по умолчанию подставляет прод
`https://api.tamir.rs`, поэтому staging обязан задавать `MEDUSA_PUBLIC_BACKEND_URL` сам —
иначе cookie и запросы витрины уйдут на прод. Guard `staging_assert_config_safe` в
`scripts/lib/staging-release.sh` не даёт деплою пройти, если в env-файлах встречается
прод-домен, прод-строка БД/Redis или адрес, не указывающий на `test.*`/loopback.

## Почта: Mailpit вместо реального SMTP

Продуктовый код почты (`backend/src/utils/registration-email.ts`) требует `requireTLS` и порт
из `{587, 465}` — менять продукт под стенд нельзя, поэтому:

- Mailpit слушает `MP_SMTP_BIND_ADDR=0.0.0.0:587` с `MP_SMTP_REQUIRE_STARTTLS=true`
  (по умолчанию он слушает `0.0.0.0:1025`, поэтому переменная обязательна);
- bootstrap генерирует **self-signed CA и leaf-сертификат** с SAN
  `localhost`, `mailpit`, `host.docker.internal`, `127.0.0.1` и монтирует их в Mailpit;
- доверие к сертификату даёт только `NODE_EXTRA_CA_CERTS=<secrets>/mail/mailpit-ca.crt`
  в экосистеме релиза — без него Node отклонит STARTTLS, а продукты-тесты не отключаются;
- `SMTP_HOST=127.0.0.1`, `SMTP_PORT=587`, `SMTP_USER=staging@tamir.local`,
  `MP_SMTP_AUTH_ACCEPT_ANY=true`.

Почта стенда никуда наружу не уходит: письма видны в веб-интерфейсе Mailpit
`http://<IP стенда>:8025` (например `http://192.168.1.143:8025`) — он открыт на интерфейсы
домашней сети и закрыт HTTP Basic: логин `mailpit`, пароль — `MP_UI_AUTH` из `secrets/docker.env`
(туда же он попадает через `env_file`). Публичного адреса у почты нет, и в Cloudflare-туннеле её
нет: с ноутбука вне домашней сети ящик недоступен — так намеренно, потому что в нём коды
регистрации. Пароль закрывает и API, поэтому `staging-smoke.sh` читает `MP_UI_AUTH` и отдаёт его
проверке тракта в `STAGING_MAILPIT_AUTH`.

Проверка идёт через продуктовый тракт: `backend/src/scripts/staging-mail-check.ts` вызывает
`sendRegistrationCode()` и затем ищет письмо в API Mailpit (с `Authorization: Basic`).
Если пароль нужен руками, в отчётах его не печатают: bootstrap только говорит, где он лежит.
Посмотреть значение может только владелец секретов:

```bash
sudo -u actions-runner grep '^MP_UI_AUTH=' /opt/tamir-staging/secrets/docker.env
```

Как включить веб-почту на машине (порядок важен: смоук требует и опубликованного `8025`, и
пароля, поэтому контейнер и секрет меняются до проверки):

```bash
# 1. клон обязан содержать свежий docker-compose.staging.yml (его читает bootstrap/smoke).
#    Штатно это делает деплой: `TAMIR_ALLOW_NON_MAIN=1 bash scripts/deploy-staging.sh <40-hex SHA>`
#    (обход нужен, пока коммит не в main). Ниже — тот же результат вручную, без сборки релиза:
sudo -u actions-runner bash -c 'cd /opt/tamir-staging/repo && git fetch origin main && git checkout -q --force --detach origin/main'
# 2. bootstrap идемпотентен: допишет MP_UI_AUTH в существующий docker.env и пересоздаст mailpit.
#    Без --force-secrets, иначе пересоздались бы пароли Postgres живой базы.
sudo -u actions-runner bash scripts/staging-bootstrap.sh
# 3. проверка: наружу слушает 0.0.0.0, без пароля — 401
sudo -u actions-runner bash -c 'ss -ltn | grep :8025; curl -s -o /dev/null -w "%{http_code}\n" http://127.0.0.1:8025/'
sudo -u actions-runner bash scripts/staging-smoke.sh
```

Письма не теряются: ящик лежит в томе `tamir-staging-mailpit` (`MP_DATABASE=/data/mailpit.db`),
пересоздание контейнера его не затрагивает.

## Публичный вход: Cloudflare Tunnel

`scripts/staging-tunnel.sh` (подкоманды `login` / `create` / `dns` / `status` / `remove`):

- устанавливает `cloudflared`, создаёт туннель с именем `tamir-staging`, конфиг
  `/etc/cloudflared/tamir-staging.yml` и systemd-сервис `tamir-staging-tunnel.service`;
- ingress только два: `https://test.tamir.rs → http://localhost:3000`,
  `https://test-api.tamir.rs → http://localhost:9000`;
- DNS-записи создаются **только** `test` и `test-api`; записи `tamir.rs` и `api.tamir.rs`
  скрипт не создаёт, не меняет и не удаляет — имена проверяются жёстко;
- вход в Cloudflare (`login`) интерактивный: скрипт печатает ссылку, её открывает человек
  и выбирает зону. Автоматизировать этот шаг нельзя намеренно;
- сертификат зоны cloudflared кладёт в `$HOME/.cloudflared/cert.pem` (для root это
  `/root/.cloudflared/cert.pem`); все вызовы `cloudflared` в скрипте идут с правильным `HOME`
  и `TUNNEL_ORIGIN_CERT`, поэтому `create`/`dns`/`status` видят тот же сертификат. Учётные
  данные туннеля и ingress-конфиг лежат в `/etc/cloudflared` (права `600`, каталог `700`);
- после успешного `dns` появляется маркер `/opt/tamir-staging/.tunnel-enabled` — с него
  smoke и деплой начинают проверять публичные HTTPS-адреса.

## Данные: анонимизированный дамп с прода

Стенд стартует на копии прода, но обезличенной. Порядок: с прода снимается `pg_dump`, затем на
машине владельца `scripts/staging-db-refresh.sh` пересоздаёт базу `tamir_staging`, загружает дамп
и прогоняет `scripts/sql/staging-anonymize.sql`.

Анонимизация работает по `information_schema` (не зависит от конкретной схемы): маскируются
колонки писем, имён, фамилий, телефонов, адресов, городов, индексов, получателей, трекинг-номеров,
IP, fingerprint и user-agent. Почты заменяются на
`'staging-' || md5(email) || '@anon.invalid'`. Таблица администраторов Medusa — `"user"` —
маскируется на общих основаниях, а сохранённые bcrypt-пароли прода удаляются из
`provider_identity.provider_metadata` (email `staging-<md5>@anon.invalid` восстановим перебором,
и оставленный хеш позволил бы подобрать прода-пароль на стенде). Справочники и каталог (`store`,
`region`, `product`, `collection`, `price_list`, `shipping_option`, `sales_channel`, `api_key`
и т. п.) не маскируются, иначе магазин перестанет работать. Сервисные таблицы кодов регистрации, сброса пароля
и rate limit обнуляются (`%registration_code%`, `%password_reset%`, `%login_rate%`,
`%review_rate%`, `%one_time_password%`).

Учёт выполненных масок — таблица `tamir_staging.anonymized_column`; в конце скрипт проверяет, что
оригинальных писем не осталось, и иначе завершается с `EXCEPTION`. Имена баз в guard-блоке
обязаны быть staging — прод-базу скрипт не тронет.

Дампы прода на стенде не хранятся: после загрузки промежуточный файл удаляется.

Медиа с прода на стенд переносится один раз вручную (архив `backend/static` →
`shared/uploads/static`, на стенде 05.11 — 919 файлов / 194 МБ) и дальше между релизами не теряется,
потому что лежит вне релизов. Но в дампе адреса остаются продными, поэтому тот же
`scripts/sql/staging-anonymize.sql` переписывает префиксы `api.tamir.rs/static/`, `tamir.rs/static/`,
`localhost:9000/static/` и `127.0.0.1:9000/static/` на `https://test-api.tamir.rs/static/`
(блок `DO $media$`, колонки `url`/`thumbnail`/`thumbnail_url`/`image_url`). Иначе витрина стенда
тянула бы картинки с прода — нарушение изоляции из ТЗ. Чужие префиксы (`tamir.ua/images/uploads`,
S3-демо Medusa) не трогаются: соответствующих файлов нет ни на проде, ни на стенде, а сами строки
помечены `deleted_at`.

## Деплой стенда: `scripts/deploy-staging.sh`

```bash
sudo -u actions-runner bash scripts/deploy-staging.sh <40-hex SHA из origin/main>
```

Шаги (всё под `flock`, при падении до активации живые процессы не тронуты):

1. Guard секретов и конфигурации (`staging_require_secrets`, `staging_assert_config_safe`).
2. `git fetch origin main` (12 попыток — GitHub периодически отвергает deploy key), затем
   проверка, что SHA — предок `origin/main`.
3. Снимок `pm2 jlist`, `pg_dump` staging-БД, экосистема предыдущего релиза — в `backups/<id>`.
4. `git archive <sha>` в `releases/<id>`, копирование env-файлов, генерация
   `ecosystem.config.cjs`, каталоги `shared/uploads/{static,private-static}`.
5. `npm ci`, `scripts/check-review-config.cjs`, сборка backend, lint/тесты и сборка витрины.
   Затем — симлинки `static`/`private-static` на `shared/uploads` в `backend/` и
   `backend/.medusa/server`. Порядок важен: `medusa build` пересоздаёт `.medusa/server`, поэтому
   симлинк, созданный до сборки, стирается и `/static` отдаёт 404 (`start-server.mjs` запускает
   `medusa start` именно из `.medusa/server`). Тот же порядок в `deploy-vps.sh`.
6. **Миграции всегда**: `medusa db:migrate`, `setup-reviews.ts`, `setup-decimal-attributes.ts`.
   Прод их не запускает — стенд обязан идти впереди прода. Сид только по `TAMIR_ALLOW_SEED=1`.
7. `check-email.ts` (STARTTLS + auth к Mailpit), затем создание staging-администратора,
   если в `"user"` нет адреса `staging-admin@tamir.local` (пароли прода анонимизация сняла,
   так что вход в админку с прода не работает; креды в `secrets/staging-admin.txt`).
8. `activate-staging-release.sh`: переключение pm2 на релиз, health-проверки
   (`http://127.0.0.1:9000/health`, `http://127.0.0.1:3000/robots.txt`, `/sitemap.xml`),
   публичные `https://test-api.tamir.rs/health` и `https://test.tamir.rs/robots.txt` — только
   при наличии маркера туннеля. При сбое — откат на экосистему из `backups/<id>` и `pm2 save`.
9. `scripts/staging-smoke.sh` как финальная проверка выпуска.

Turnstile: bootstrap требует sitekey (`--turnstile-site-key <key>` или env
`TAMIR_TURNSTILE_SITE_KEY`). Ключ должен быть создан для `test.tamir.rs` — прод-виджет не
подойдёт, Cloudflare отклоняет hostname. Если виджета ещё нет, `--allow-missing-turnstile`
пишет `staging-placeholder-sitekey-00000000`; гейт `check-review-config.cjs` такой placeholder
пропускает, но CAPTCHA в регистрации/логине с ним работать не будет — это фиксируется в отчёте.
Сменить sitekey «на живой» нельзя: `NEXT_PUBLIC_TURNSTILE_SITE_KEY` впекается в бандл витрины при
сборке, поэтому после записи настоящего ключа в `secrets/turnstile-site-key` и `secrets/frontend.env`
нужен новый деплой. Секретный ключ читается в рантайме — его достаточно положить в
`secrets/turnstile-secret-key` и `secrets/backend.env`.

## Проверки и диагностика

```bash
sudo -u actions-runner bash scripts/staging-smoke.sh   # полная проверка стенда
cd /opt/tamir-staging/repo && sudo -u actions-runner docker compose -f docker-compose.staging.yml ps
sudo -u actions-runner pm2 list && sudo -u actions-runner pm2 logs tamir-backend --lines 100 --nostream
curl -fsS http://127.0.0.1:9000/health
curl -I http://127.0.0.1:3000/robots.txt
curl -fsS https://test-api.tamir.rs/health    # только когда поднят туннель
```

pm2 — демон пользователя `actions-runner` (`PM2_HOME=/home/actions-runner/.pm2`); команды вида
`sudo pm2 …` показывают пустой root-набор и правильную картину не дают. Autostart после перезагрузки
обеспечивает systemd-юнит `pm2-resurrect.service`.

Smoke проверяет контейнеры и их healthcheck, «порты инфраструктуры только на loopback» (с
исключением закрытого паролем `8025`), pm2-процессы и их рабочие каталоги, локальные
health/robots/sitemap, витринный API с publishable key из staging-БД, почтовый тракт (отправка +
приём в Mailpit под `MP_UI_AUTH`, `401` без токена и доступность веб-почты с адреса домашней сети)
и публичные HTTPS при выпущенном туннеле.

## Что стенд не делает

- Не трогает прод: ни БД, ни Redis, ни почту, ни платежи, ни DNS `tamir.rs`/`api.tamir.rs`.
- Не деплоит прод и не запускает прод-скрипты; прод-деплой — отдельный ручной workflow.
- Не публикует SMTP, базу, Redis или админку наружу (доступ к ним — только с машины или туннеля).
  Веб-почта Mailpit — единственное сетевое исключение: она видна только из домашней сети и только
  под HTTP Basic; публичного адреса у неё нет.
- Не хранит прод-дампы и секреты в Git.

## Типовые сбои

| Симптом | Причина / что делать |
| --- | --- |
| `git fetch origin main не вышел ни разу` | GitHub отклонил deploy key (измерено на проде 04.11). Повтор запуска позже; при регулярных отказах — перевыпустить deploy key |
| `Коммит <sha> не входит в origin/main` | так и должно быть: runner принимает только код из `main`. Для разового эксперимента — ручной запуск с `TAMIR_ALLOW_NON_MAIN=1` |
| `Нет sitekey Turnstile` | создать виджет для `test.tamir.rs` и перезапустить bootstrap с `--turnstile-site-key` |
| STARTTLS-ошибка при `check-email.ts` | в экосистеме релиза потерян `NODE_EXTRA_CA_CERTS`, или сертификат Mailpit пересоздан без `--force-secrets`-синхронизации |
| `staging-mail-check.ts` падает с `Mailpit API ответил 401` | пароля `MP_UI_AUTH` нет в окружении проверки: smoke читает его из `secrets/docker.env` и отдаёт в `STAGING_MAILPIT_AUTH`; при ручном запуске передать ту же пару `user:pass` |
| Веб-почта не открывается с ноутбука (`http://<IP>:8025`) | порт опубликован на `127.0.0.1` (проверить `ss -ltn \| grep 8025` — должен быть `0.0.0.0:8025`), пароль в `secrets/docker.env` отсутствует (bootstrap/smoke на этом и падают), или контейнер не пересоздан после правки Compose: `docker compose -f docker-compose.staging.yml up -d mailpit`. Если на машине включён файрвол, он обязан пускать `8025/tcp` из домашней подсети |
| Нет publishable key | в новой базе его ещё нет: `TAMIR_ALLOW_SEED=1 scripts/deploy-staging.sh <sha>` или файл `secrets/publishable-key` |
| `/sitemap.xml` отвечает 500, в логе витрины `SyntaxError: Unexpected token '<'` | витрина получает от API ошибку вместо JSON. Чаще всего в `NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY` попал `api_key.id` (`apk_...`) вместо токена `api_key.token` (`pk_...`). Проверка: `curl -H "x-publishable-api-key: pk_..." https://test-api.tamir.rs/store/regions`. Лечится повторным деплоем — ключ перечитывается из БД, но витрину нужно пересобрать (NEXT_PUBLIC_* впекаются в бандл) |
| Публичные URL падают, локальные живые | туннель не поднят/не прикреплён: `staging-tunnel.sh status`, `systemctl status tamir-staging-tunnel` |
| Cloudflare отдаёт 522 | в DNS у `test.*` оказалась A-запись вместо CNAME на `<id-туннеля>.cfargotunnel.com`. Починка: `sudo bash scripts/staging-tunnel.sh dns` (он всегда с `--overwrite-dns`) |
| `https://test-api.tamir.rs/` отдаёт 404 `Cannot GET /` | это не сбой: у Medusa нет корневой страницы, прод `https://api.tamir.rs/` ведёт себя так же. Живость API — `/health` (200), данные — `/store/products` с заголовком `x-publishable-api-key: pk_...`, админка — `/app` |
| `Процессы pm2 работают не в каталоге релиза` | pm2 поднят из другого релиза или `pm2 jlist` пуст: `pm2 jlist` глазами, затем повторный `scripts/deploy-staging.sh <sha>` |
| Картинки 404 на `https://test-api.tamir.rs/static/...` | медиа-симлинк создан до `medusa build` (тот пересоздаёт `.medusa/server`) или медиа не перенесены в `shared/uploads`. Проверка: `readlink -f <release>/backend/.medusa/server/static` → должен быть `/opt/tamir-staging/shared/uploads/static`; `ls shared/uploads/static | wc -l`. Если симлинк на месте, а 404 — в БД остались продные префиксы: прогнать `scripts/sql/staging-anonymize.sql` |
| Капча отвечает «Капча не удалась», ключи на стенде есть | `NEXT_PUBLIC_TURNSTILE_SITE_KEY` впекается в бандл витрины при сборке: если стенд собран до записи настоящего sitekey, в `.next` лежит `staging-placeholder-sitekey-00000000`. Проверка: `grep -rlF "$(cat /opt/tamir-staging/secrets/turnstile-site-key)" <release>/frontend/.next | wc -l` (0 = нужен новый деплой). Второе место: в Cloudflare у sitekey в Allowed domains обязан быть `test.tamir.rs` |

## Проверено локально и на машине

Локально (машина владельца): `node test-support/run-tests.mjs --no-db` — 84/84, включая
`backend/tests/staging-contract.test.cjs` (контракт стенда с продуктовым кодом: SMTP-контракт,
генерируемая экосистема, гейт конфигурации, запрет прод-адресов, периметр веб-почты — 8/8);
`bash -n` по всем
`scripts/*.sh` и `scripts/lib/*.sh`; `npx tsc --noEmit -p tsconfig.json` по `backend`;
гварды `test-support/verify-deploy-pin.mjs`, `verify-deploy-dispatch.mjs`, `verify-deploy-staging.mjs`.

На стенде подтверждено фактическим прогоном: `npx medusa user` в собранном релизе создаёт
администратора с хешем пароля (`provider_identity.provider_metadata`), вход в админку
`https://test-api.tamir.rs/app` работает; `NODE_EXTRA_CA_CERTS` действует в `NODE_ENV=production`
(без него `staging-mail-check.ts` падает с `CODE_SEND_FAILED`, с ним — письмо принимается Mailpit);
порт 587 доступен. Веб-почта: после дописи `MP_UI_AUTH` и пересоздания контейнера `ss -ltn` даёт
`0.0.0.0:8025`, UI и API без пароля отвечают `401`, с паролем — `200`, а `587`/`5432`/`6379`/`3000`/`9000`
остались на loopback; с рабочего компьютера вход в `http://<IP стенда>:8025` работает. Полный смоук
релиза (`scripts/staging-smoke.sh`) — все проверки зелёные. Осталось не проверенным: реактивация pm2 после перезагрузки машины (юнит
`pm2-resurrect.service` настроен, перезагрузку не выполняли).
