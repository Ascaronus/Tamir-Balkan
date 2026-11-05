# Tasks: staging-environment-pipeline

## 1. Контракт и проверки (P0)

- [x] 1.1 `backend/tests/staging-contract.test.cjs` — контракт стенда: нет прод-URL, нет `VPS_*`,
      БД/Redis только на `127.0.0.1`. Доказательство: `node --test tests/staging-contract.test.cjs`
      → 7/7 pass; `node test-support/run-tests.mjs --no-db` → 83/83 pass.
- [x] 1.2 `test-support/verify-deploy-staging.mjs` — гейт staging-workflow (нет `push`/`pull_request`,
      обязательный `sha`, `environment: staging`, `needs: gate`, ancestry-гейт в скрипте).
      Доказательство: прямой прогон `node test-support/verify-deploy-staging.mjs` → exit 0.
- [x] 1.3 `test-support/verify-deploy-pin.mjs` обновлён под прод-`workflow_dispatch` и staging-контур.
      Доказательство: прямой прогон → exit 0.
- [x] 1.4 Шаг `bash -n` по `scripts/*.sh` и `scripts/lib/*.sh` + шаг staging-guard в `verify.yml`.
      Доказательство: `bash -n` по всем 9 скриптам + либе через git-bash → без ошибок.

## 2. Workflow-слой (P0)

- [x] 2.1 `deploy.yml`: `workflow_run` убран, только `workflow_dispatch` с обязательным `sha`,
      API-гейт `compare main...sha` + прогоны `verify.yml` в `main`, `environment: production`.
- [x] 2.2 `.github/workflows/deploy-staging.yml`: `workflow_run` от зелёного Verify на push в `main`
      + ручной `dispatch`, job `gate` (ubuntu-latest) → job `deploy` (self-hosted, `staging`,
      concurrency, timeout 90) без `actions/checkout`, шаг `Staging health snapshot` при `always()`.
- [x] 2.3 Комментарии `paths-ignore` в `verify.yml` приведены в соответствие (staging вместо прода).

## 3. Скрипты стенда (P0)

- [x] 3.1 `docker-compose.staging.yml` — Postgres 16, Redis 7, Mailpit v1.33, тома и healthcheck,
      порты только на `127.0.0.1` (5432/6379/587/8025).
- [x] 3.2 `scripts/staging-bootstrap.sh` — генерация секретов, self-signed CA + leaf для STARTTLS,
      требовательность к sitekey Turnstile, проверка loopback-портов, `ALTER USER` для роли БД.
- [x] 3.3 `scripts/deploy-staging.sh` — flock, 12 попыток `git fetch origin main`, ancestry-гейт с
      исключением `TAMIR_ALLOW_NON_MAIN=1`, `staging_assert_config_safe`, сборка, миграции всегда,
      `setup-reviews.ts` + `setup-decimal-attributes.ts`, сид по флагу, создание админа при отсутствии
      staging-адреса в `"user"`, генерация pm2-экосистемы через плейсхолдеры, симлинки `current*`.
- [x] 3.4 `scripts/activate-staging-release.sh` + `scripts/lib/staging-release.sh` — переключение
      PM2, health/robots/sitemap, откат на предыдущую экосистему из `backups/`, хелпер `staging_run`.
- [x] 3.5 `scripts/staging-smoke.sh` — loopback- и (при маркере `.tunnel-enabled`) публичные
      HTTPS-проверки, Mailpit API, `medusa exec ./src/scripts/staging-mail-check.ts`.
- [x] 3.6 `backend/src/scripts/staging-mail-check.ts` — отправка кода через продуктовую
      `sendRegistrationCode()`. Доказательство: standalone `npx tsc --noEmit` → exit 0.
- [x] 3.7 `scripts/staging-tunnel.sh` — `login`/`create`/`dns`, ingress только `localhost:3000` и
      `localhost:9000`, жёсткая проверка имён `test`/`test-api`, маркер `.tunnel-enabled`.
- [x] 3.8 `scripts/staging-db-refresh.sh` + `scripts/sql/staging-anonymize.sql` — схема-agnostic
      маскирование по `information_schema`, обнуление таблиц кодов/rate limit, учёт в
      `tamir_staging.anonymized_column`, assert об оставшихся email, guard имён баз `$guard$`,
      сброс кэша publishable key.

## 4. Документация (P1)

- [x] 4.1 `docs/STAGING.md` переписан под новый конвейер (пути, compose, секреты, Mailpit +
      STARTTLS, туннель, анонимизация, шаги деплоя, smoke, таблица сбоев, ограничения).
- [x] 4.2 `DEPLOY.md`: прод только вручную по `sha` с API-гейтом, подраздел «Staging перед продом»
      с нюансом `paths-ignore`.

## 5. Машина `tamir-staging` (P0, выполняется на HP Mini)

- [x] 5.1 Архитектура и пакеты: `uname -m`, `apt install git build-essential openssl`, Node
      20.20.2 из tarball в `/usr/local`, `npm -g pm2`, `cloudflared`.
- [x] 5.2 Клон `/opt/tamir-staging/repo` + deploy key (регистрация
      `gh api repos/Ascaronus/Tamir-Balkan/keys`); владелец каталога — `actions-runner`.
- [x] 5.3 self-hosted runner под выделенным пользователем `actions-runner` (группа `docker`) как
      systemd-сервис с labels `self-hosted, linux, x64, tamir-staging`; environment `staging`
      в репозитории; pm2-автозапуск юнитом `pm2-resurrect.service`.
- [x] 5.4 `scripts/staging-bootstrap.sh --allow-missing-turnstile` (под `actions-runner`) → секреты
      `0600`, CA+leaf Mailpit, self-signed `turnstile-*`; `docker compose up -d` →
      `tamir-staging-{postgres,redis,mailpit}-1` healthy, слушают только `127.0.0.1`
      (5432/6379/587/8025).
- [x] 5.5 Дамп прода (`pg_dump -Fc`, 798 978 Б) → `scripts/staging-db-refresh.sh` → exit 0:
      замаскировано 58 колонок / 921 строка, TRUNCATE 4 сервистаблиц, assert об email чистый,
      снятые bcrypt-хеши `provider_identity` — 4 строки; publishable ключей в БД — 2.
      Дамп удалён со стенда и с прода, точка отката в `backups/pre-db-refresh-*.dump`.
- [ ] 5.6 Первый деплой по SHA: миграции прошли, админ создан (`secrets/staging-admin.txt`),
      health `127.0.0.1:9000/health` и `127.0.0.1:3000/robots.txt` зелёные.
- [ ] 5.7 Подтвердить на машине поведение `npx medusa user` и `NODE_EXTRA_CA_CERTS` в собранном
      релизе при `NODE_ENV=production`.

## 6. Публичный вход (P0, требует участия владельца)

- [ ] 6.1 Sitekey Turnstile для `test.tamir.rs` + секрет в `secrets/turnstile-secret-key`
      (blocked: ждём sitekey от владельца).
- [ ] 6.2 `scripts/staging-tunnel.sh login` — владелец открывает ссылку и выбирает зону `tamir.rs`.
- [ ] 6.3 `staging-tunnel.sh create` и `dns` — добавлены только `test.*`; `tamir.rs` /
      `api.tamir.rs` не изменены (проверить в дашборде Cloudflare).
- [ ] 6.4 `scripts/staging-smoke.sh` — зелёный прогон с публичными URL и письмом в Mailpit UI
      (`http://127.0.0.1:8025`).

## 7. Проверка потока целиком (P0)

- [ ] 7.1 PR → зелёный Verify на PR → merge → Verify на push → автозапуск `Deploy to Staging` →
      стенд на SHA merge-коммита.
- [ ] 7.2 Ручной `Deploy to Staging` с более старым SHA `main` → ff-merge пропущен, откат стенда
      удался.
- [ ] 7.3 Ручной `Deploy TAMIR` с непроверенным/чужим SHA → job падает на гейте, на VPS ничего не
      отправлено.
- [ ] 7.4 Итоговый отчёт по формату `stage.txt` (что сделано, что проверено, что осталось
      незакрытым: 404 медиа-дампа, CAPTCHA до sitekey).
