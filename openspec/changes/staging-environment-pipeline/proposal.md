# Proposal

## Why

Сейчас путь выпуска один: зелёный `Verify` на push в `main` автоматически публикует прод через
`workflow_run` в `deploy.yml`. Промежуточной среды, где этот же коммит можно погонять на копии
прода (миграции, сборки, почта, CAPTCHA, админка), нет, поэтому любая ошибка схемы или конфигурации
видно уже на `tamir.rs`. При этом прод-деплой нельзя ни отложить, ни выбрать вручную по SHA:
решение о выпуске принимает CI.

Нужен отдельный staging-контур (`test.tamir.rs` / `test-api.tamir.rs`) на машине владельца и
изменённый порядок: PR → Verify → merge в `main` → Verify на push → **автодеплой на staging** →
человек решает, что и когда выпускать на прод **тем же проверенным SHA**.

## What Changes

- Новый workflow `Deploy to Staging` (`.github/workflows/deploy-staging.yml`): `workflow_run` от
  зелёного `Verify` на push в `main` плюс ручной `workflow_dispatch` с обязательным `sha`. Job
  `gate` на GitHub-раннере через API проверяет, что коммит входит в `main` и что его check-suites
  завершены успешно; job `deploy` на self-hosted runner машины вызывает
  `scripts/deploy-staging.sh <sha>`.
- **BREAKING** `Deploy TAMIR` (`deploy.yml`) больше не имеет `workflow_run`: прод запускается только
  вручную (`workflow_dispatch`) из `refs/heads/main` с обязательным вводом `sha`; перед SSH тот же
  API-гейт (`compare main...sha` ∈ {`behind`, `identical`} + `check-suites` completed/success).
- Новый staging-контур машины: `docker-compose.staging.yml` (Postgres 16, Redis 7, Mailpit, все
  порты только на `127.0.0.1`), `scripts/staging-bootstrap.sh` (секреты, CA и сертификат STARTTLS),
  `scripts/deploy-staging.sh` (свой release-layout, миграции всегда, откат при сбое health),
  `scripts/activate-staging-release.sh`, `scripts/staging-smoke.sh`, `scripts/staging-tunnel.sh`
  (Cloudflare Tunnel, DNS только `test.*`), `scripts/staging-db-refresh.sh` +
  `scripts/sql/staging-anonymize.sql` (обезличенная копия прода).
- Новые проверки: `backend/tests/staging-contract.test.cjs` (контракт стенда с продуктовым SMTP/env),
  `test-support/verify-deploy-staging.mjs` и обновлённый `test-support/verify-deploy-pin.mjs`
  (гейты обоих workflow), шаг `bash -n` по shell-скриптам в `verify.yml`.
- Обновлены `docs/STAGING.md` (переписан) и `DEPLOY.md` (ручной прод-выпуск по SHA).

## Capabilities

### New Capabilities

- `staging-environment`: изолированный стенд tamir.rs — своя инфраструктура, секреты, данные,
  почта и публичный вход; release-конвейер с миграциями, health-проверками и откатом.

### Modified Capabilities

- `testing-ci-cd`: прод-деплой перестаёт быть автоматическим (`workflow_run` убран) и становится
  ручным по явному SHA с API-гейтом; Verify обязан проверять guard'ами оба deploy-workflow и
  синтаксис shell-скриптов; добавляется автодеплой staging после Verify на `main`.

## Impact

- Workflows: `.github/workflows/deploy.yml` (MODIFIED), `.github/workflows/deploy-staging.yml`
  (NEW), `.github/workflows/verify.yml` (новые шаги проверок).
- Скрипты: `scripts/staging-*.sh`, `scripts/deploy-staging.sh`, `scripts/activate-staging-release.sh`,
  `scripts/lib/staging-release.sh`, `scripts/sql/staging-anonymize.sql`; `scripts/deploy-vps.sh`
  и `scripts/activate-release.sh` не меняются.
- Продуктовый код: только новый служебный скрипт `backend/src/scripts/staging-mail-check.ts`
  (проверка почтового тракта через `sendRegistrationCode()`); `backend/src/**` приложения не меняются.
- Инфраструктура: требуется self-hosted runner на машине `tamir-staging` (labels
  `self-hosted, linux, x64, tamir-staging`), environment `staging`, deploy key репозитория,
  `cloudflared` и DNS-записи `test` / `test-api` в зоне `tamir.rs`.
- Продакшен: VPS, его systemd/pm2/Docker и записи `tamir.rs` / `api.tamir.rs` не затрагиваются;
  меняется только порядок принятия решения о выпуске.
