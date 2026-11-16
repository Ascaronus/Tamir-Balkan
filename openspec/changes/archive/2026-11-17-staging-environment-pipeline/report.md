# Report: staging-environment-pipeline

Итоговый отчёт по формату `stage.txt` (замеры от 05.11, дополнения от 16.11). Секреты в отчёте не
приводятся: нигде нет токенов, ключей Turnstile, паролей стенда и значений `MP_UI_AUTH`.

## Done

- Контракт и проверки: `backend/tests/staging-contract.test.cjs` (профиненные URL, БД/Redis/SMTP только
  на `127.0.0.1`, Mailpit в LAN только под `MP_UI_AUTH`), гейт `test-support/verify-deploy-staging.mjs`
  (обязательный `sha`, ancestry-гейт по зелёному Verify на `main`), обновлённый
  `verify-deploy-pin.mjs`, шаг `bash -n` по всем `scripts/*.sh` + staging-guard в `verify.yml`.
- Workflow-слой: `deploy-staging.yml` (автозапуск `workflow_run` после зелёного Verify-push + ручной
  `workflow_dispatch` с `sha`, jobs `gate → deploy`, `environment: staging`); прод-`deploy.yml` —
  только ручной `workflow_dispatch`, `pull_request`-триггер Verify снят.
- Хост и запуск: `scripts/bootstrap-staging.sh` (создаёт пользователя `actions-runner`, systemd-юниты
  туннеля и pm2, каталоги `releases/shared/backups`), `docker-compose.staging.yml` (postgres, redis,
  mailpit — все порты на loopback), деплой `scripts/deploy-staging.sh` (сборка, `current`-симлинк,
  миграции, смоук, ротация релизов).
- Данные: `scripts/staging-db-refresh.sh` (дамп прода → локальная БД стенда → `staging-anonymize.sql`
  с масками по `information_schema`, assert «оригинальных писем не осталось», guard имён баз) и
  перенос медиа прода в `shared/uploads` (переживают смену релиза).
- Публичный доступ: `scripts/staging-tunnel.sh` — Cloudflare Tunnel `tamir-staging`, DNS только для
  `test` / `test-api` (CNAME на `<id>.cfargotunnel.com`, прокси), прод-зоны не затронуты.
- Медиа-контур (замер 16.11): 922 файла в `shared/uploads/static`; блок `$media$` в анонимизации
  переписывает продные префиксы на `https://test-api.tamir.rs/static/`; в `image.url` 216/460 на
  стендовом хосте, 0 на прод-хостах (остальное — сторонние S3-демо Medusa). Формулировка «404
  медиа-дампа» из первоначальной постановки устарела: медиа перенесены и отдают 200.
- CAPTCHA (закрыто 16.11): для `test.tamir.rs` создан отдельный виджет Turnstile; на стенде — бэкап
  `secrets` (`/opt/tamir-staging/backups/pre-turnstile-20261116T230948Z`), запись нового secret-ключа
  в `secrets/turnstile-secret-key` (0600), перезапуск bootstrap (`BOOTSTRAP_EXIT=0`) и редеплой, чтобы
  sitekey попал в собранный бандл (4 файла `.next`). Ранее bootstrap писал placeholder, и CAPTCHA в
  регистрации не работала.

## Verified

- Тесты: `node --test tests/staging-contract.test.cjs` → 8/8 pass; `run-tests.mjs --no-db` → 84/84
  pass (05.11). Прямые прогоны гейт-скриптов → exit 0.
- Полный контур (7.1, PR #88): PR → зелёный Verify на PR → merge → Verify на push → автозапуск
  `Deploy TAMIR Staging` (тот же SHA) → `current` на SHA merge-коммита (05.11).
- Откат (7.2, 16.11): ручной `workflow_dispatch` со старым SHA `96c205f` (run 43977998048) — гейт
  пропущен (коммит достижим из `main`, зелёный Verify-push есть), релиз
  `20261116T231751Z-96c205f65cf9` активирован, на старом коде `/health` и публичные URL отдают 200 —
  откат работает. Job красный из-за смоука: 2 проверки падают на дрейфе контракта инфраструктуры
  (Mailpit UI теперь на `0.0.0.0:8025`; `Mailpit API` отвечает 401 — `MP_UI_AUTH` добавлен после
  05.11). Стенд восстановлен ручным деплоем `218d8fb` (run 43978731336, зелёный).
- Защита прода (7.3): `workflow_dispatch` прод-`deploy.yml` с SHA без зелёного Verify-push → job
  красный на шаге гейта, шаг деплоя skipped, на VPS ничего не уходило (05.11).
- Публичный доступ (6.3): DNS `test`/`test-api` — CNAME на арготуннель, прод-записи не тронуты;
  `https://test.tamir.rs` 200, `https://test-api.tamir.rs/health` 200. Смоук (6.4) зелёный, тестовое
  письмо с кодом доставки прилетает в Mailpit UI.
- Медиа (16.11): пробы переписанных `image.url` — 8/8 отдают 200; баннеры `tamir_banner_media` — 4/4
  отдают 200, файлы лежат в `shared/uploads/static/banners` и переживают смену релиза.
- CAPTCHA живьём (16.11): валидация пары sitekey/secret через живой `siteverify` (`invalid-input-
  response` на тестовом токенe = secret настоящий); POST `/store/password-reset/start` с фиктивным
  токеном и publishable key отвечает `400 CAPTCHA_FAILED` (не `503 CAPTCHA_UNAVAILABLE`) — контур
  CAPTCHA на стенде работает.

## Open items

- Одиночная residual-строка в `tamir_banner_media`
  (`media_3b7c9e98-d028-4280-b12a-0b9e1e7dd38a.jpg`) осталась с продным
  префиксом `api.tamir.rs`; файл физически есть на стенде, URL отвечает 200. Вред не мешает стенду,
  но стоит разово переписать строку вручную (блок `$media$` её не догнал).
- Смоук деплоя проверяет текущий контракт инфраструктуры, поэтому откат на старый релиз даёт красные
  job'ы (Mailpit `0.0.0.0:8025` + `MP_UI_AUTH`). При этом авто-отката нет: если смоук упал после
  переключения `current`, стенд остаётся на откаченном релизе, восстановление — только ручной деплой
  актуального SHA. Кандидат на доработку: revert `current` при падении смоука.
- GitHub периодически отвергает deploy key при `git fetch` (замерено на проде 04.11) — в стенде
  снято 12 попытками; при регулярных отказах нужен перевыпуск ключа.
- Runner на стенде работает от root (осознанный компромисс) — ужесточение возможно при переносе
  pm2/Docker под отдельного пользователя.
- Поведение `npx medusa user` и `NODE_EXTRA_CA_CERTS` в собранном релизе подтверждается только
  фактическим прогоном на машине.
