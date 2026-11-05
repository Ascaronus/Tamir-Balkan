# Tasks: staging-environment-pipeline

## 1. Контракт и проверки (P0)

- [x] 1.1 `backend/tests/staging-contract.test.cjs` — контракт стенда: нет прод-URL, нет `VPS_*`,
      БД/Redis/SMTP только на `127.0.0.1`, веб-почта Mailpit опубликована в LAN только под
      `MP_UI_AUTH`. Доказательство: `node --test tests/staging-contract.test.cjs`
      → 8/8 pass; `node test-support/run-tests.mjs --no-db` → 84/84 pass (замер 05.11).
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
      порты `5432`/`6379`/`587` только на `127.0.0.1`, веб-интерфейс Mailpit `8025` — на интерфейсы
      локальной сети под HTTP Basic (`env_file` с `secrets/docker.env`).
- [x] 3.2 `scripts/staging-bootstrap.sh` — генерация секретов (в том числе `MP_UI_AUTH` для
      веб-почты), self-signed CA + leaf для STARTTLS, требовательность к sitekey Turnstile,
      проверка портов по паре «порт + адрес», `ALTER USER` для роли БД.
- [x] 3.3 `scripts/deploy-staging.sh` — flock, 12 попыток `git fetch origin main`, ancestry-гейт с
      исключением `TAMIR_ALLOW_NON_MAIN=1`, `staging_assert_config_safe`, сборка, миграции всегда,
      `setup-reviews.ts` + `setup-decimal-attributes.ts`, сид по флагу, создание админа при отсутствии
      staging-адреса в `"user"`, генерация pm2-экосистемы через плейсхолдеры, симлинки `current*`.
- [x] 3.4 `scripts/activate-staging-release.sh` + `scripts/lib/staging-release.sh` — переключение
      PM2, health/robots/sitemap, откат на предыдущую экосистему из `backups/`, хелпер `staging_run`.
- [x] 3.5 `scripts/staging-smoke.sh` — loopback- и (при маркере `.tunnel-enabled`) публичные
      HTTPS-проверки, Mailpit API под `MP_UI_AUTH` (`STAGING_MAILPIT_AUTH`), доступность веб-почты
      с адреса локальной сети, `401` без токена, `medusa exec ./src/scripts/staging-mail-check.ts`.
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
- [x] 5.6 Первый деплой по SHA: миграции прошли, админ создан (`secrets/staging-admin.txt`),
      health `127.0.0.1:9000/health` и `127.0.0.1:3000/robots.txt` зелёные.
      (измерено: релиз `20261105T175313Z-19c7dd5632e4`, `/health` 200, `robots.txt`/`sitemap.xml` 200,
      в `"user"` есть `staging-admin@tamir.local`)
- [x] 5.7 Подтвердить на машине поведение `npx medusa user` и `NODE_EXTRA_CA_CERTS` в собранном
      релизе при `NODE_ENV=production`. (измерено 05.11: у `staging-admin@tamir.local` есть хеш в
      `provider_identity.provider_metadata` — из 5 emailpass-строк хеш сохранён только у него;
      `medusa exec ./src/scripts/staging-mail-check.ts` с `NODE_EXTRA_CA_CERTS` из экосистемы релиза
      принимает письмо Mailpit, без переменной та же команда падает с `CODE_SEND_FAILED`)
- [ ] 5.8 Открыть веб-почту Mailpit на интерфейс локальной сети под HTTP Basic (по запросу
      владельца: ящик должен быть виден с рабочего компьютера). Порядок на машине (только под
      `actions-runner`, см. `docs/STAGING.md`): сначала обновить клон `/opt/tamir-staging/repo` на
      `origin/main` (иначе bootstrap/smoke читают старый Compose-файл), затем
      `bash scripts/staging-bootstrap.sh` — он идемпотентно допишет `MP_UI_AUTH` в
      `secrets/docker.env` и пересоздаст `mailpit` с публикацией `8025` в LAN; далее
      `ss -ltn | grep :8025` (ожидается `0.0.0.0`), `curl` без пароля → `401`,
      `bash scripts/staging-smoke.sh` и вход с ноутбука на `http://<IP стенда>:8025`. Замечено при
      диагностике: `.git` клона принадлежит `actions-runner`, а `HEAD`/`index` имеют права `0600`,
      поэтому из-под `giper` там `fatal: not a git repository` — клон рабочий, читать его должен
      владелец. Код и контрактный тест в репозитории
      (`node --test backend/tests/staging-contract.test.cjs` — 8/8), на машине нужен `actions-runner`.

## 6. Публичный вход (P0, требует участия владельца)

- [ ] 6.1 Sitekey Turnstile для `test.tamir.rs` + секрет в `secrets/turnstile-secret-key`
      (blocked: ждём sitekey от владельца).
- [x] 6.2 `scripts/staging-tunnel.sh login` — владелец открывает ссылку и выбирает зону `tamir.rs`.
      (туннель `tamir-staging` прикреплён к зоне, id `5470a703-691e-4e21-a721-39fdbad109de`)
- [x] 6.3 `staging-tunnel.sh create` и `dns` — добавлены только `test.*`; `tamir.rs` /
      `api.tamir.rs` не изменены (проверить в дашборде Cloudflare).
      (измерено: DNS-записи `test` и `test-api` — CNAME на `<id>.cfargotunnel.com`, прокси; прод-записи не тронуты;
      `https://test.tamir.rs` 200, `https://test-api.tamir.rs/health` 200)
- [x] 6.4 `scripts/staging-smoke.sh` — зелёный прогон с публичными URL и письмом в Mailpit UI
      (`http://127.0.0.1:8025`). (измерено 05.11: смоук на `/health`, `/robots.txt`, `/sitemap.xml`,
      `/store/products?limit=2` с publishable key — все проверки зелёные; тестовое письмо с кодом
      доставлено в Mailpit)

## 7. Проверка потока целиком (P0)

- [x] 7.1 PR → зелёный Verify на PR → merge → Verify на push → автозапуск `Deploy to Staging` →
      стенд на SHA merge-коммита. (измерено 05.11 на PR #88: Verify на PR #274 зелёный → merge
      `96c205f` → Verify на push #275 зелёный → автозапуск `Deploy TAMIR Staging` #4 (`workflow_run`,
      тот же SHA) зелёный → `current` = релиз `20261105T181854Z-96c205f65cf9`, pm2-процессы работают
      из него, `/health`, `robots.txt`, `sitemap.xml` и публичные URL — 200)
- [ ] 7.2 Ручной `Deploy to Staging` с более старым SHA `main` → ff-merge пропущен, откат стенда
      удался.
- [x] 7.3 Ручной `Deploy TAMIR` с непроверенным/чужим SHA → job падает на гейте, на VPS ничего не
      отправлено. (измерено 05.11: ручной `workflow_dispatch` прогона `deploy.yml` со SHA `19c7dd5`,
      у которого нет зелёного Verify-push в `main` → run `Deploy TAMIR` #97: job `deploy` красный на
      шаге `Confirm the commit passed Verify on main`, шаг `Deploy the verified commit to VPS` —
      skipped; на VPS команда не уходила)
- [ ] 7.4 Итоговый отчёт по формату `stage.txt` (что сделано, что проверено, что осталось
      незакрытым: 404 медиа-дампа, CAPTCHA до sitekey).
