# Аудит кода и CI/CD: 23 октября 2026

Черновик для работы. Все пункты сверены вручную с кодом в `main` на коммите
`768426f` (после мержей #18, #19, #20). Это не отчёт «про голоса» — каждый пункт
подтверждён чтением конкретных файлов; в конце есть список того, что проверено и
признакомо чисто, чтобы не перефлагать завтра.

Статус: **ничего из списка ниже ещё не исправлено** (кроме отмеченного «готово»).
Работа продолжается по одному маленькому PR на исправление.

---

## Как вернуться к работе завтра

1. `git fetch origin && git checkout main && git pull --ff-only` — убедиться, что
   локальный `main` совпадает с `origin/main`.
2. Открыть таблицу «Порядок PR» ниже и взять первый незакрытый номер.
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
| — | Защита ветки `main`: обязательные проверки `verify (20.20.2)` / `verify (24)`, строгие, обязателен PR (0 ревью), запрещены force-push и удаление ветки, `enforce_admins: false` | — |

Прод `tamir.rs` после #20 здоров, деплои проходят через гейт.

---

## HIGH — делать в первую очередь

### H1. `POST /store/auth/phone-login` без rate-limit и CAPTCHA (подбор пароля)

Файл: `backend/src/api/store/auth/phone-login/route.ts`.

- Нет ни ограничения частоты, ни Turnstile. Поворот `POST → 401` повторяется
  бесплатно: `route.ts:12-62`.
- Повторно аутентифицируется через loopback `http://127.0.0.1:${PORT}`
  (`route.ts:42-57`), то есть защита «по IP» на уровне маршрута отсутствует.
- `PORT` нет в `backend/.env.example`, поэтому в проде значение по умолчанию — `9000`.

Что делать (PR #21): middleware ограничения частоты по IP+телефону для
`/store/auth/*`, обязательная проверка Turnstile на этом маршруте
(`backend/src/utils/captcha.ts` уже умеет), добавить `PORT` в `backend/.env.example`.
Тест: интеграционный тест на 429 и на отказ без токена CAPTCHA.

### H2. Деплой берёт HEAD `origin/main`, а не проверенный коммит (гонка)

Файлы: `.github/workflows/deploy.yml:30-33`, `scripts/deploy-vps.sh:17`.

- Шаг «Record the verified commit» только **печатает** SHA проверенного запуска.
- `deploy-vps.sh` берёт `git rev-parse --verify "${1:-origin/main}^{commit}"`,
  то есть свежий HEAD `main`. Если между `Verify` и `Deploy` в `main` попал второй
  push — на прод уедет непроверенный коммит.

Что делать (PR #22): `workflow_run.head_sha` → `GITHUB_SHA` →
`bash scripts/deploy-vps.sh "$SHA"` (или отдельный аргумент), плюс в скрипте
жёсткая проверка, что SHA существует на `origin/main` и что это тот самый коммит,
который прошёл `Verify`.

### H3. `workflow_dispatch` в `deploy.yml` без guard'а и без `environment`

Файл: `.github/workflows/deploy.yml:5-6`, `:21-25`.

- У `workflow_dispatch` нет условия `github.ref == 'refs/heads/main'`: запуск с
  любой ветки выполняет деплой с секретами `VPS_*`.
- Job'ы без `environment: production`, поэтому правила окружения и отдельный
  approval не работают.

Что делать (PR #23): добавить `environment: production` и условие на `refs/heads/main`
для `workflow_dispatch`; при dispatch — брать HEAD `main`, а не HEAD ветки запуска.

### H4. Токен покупателя в `localStorage` (XSS = угон аккаунта)

Файлы: `frontend/src/lib/auth/auth-storage.ts`, `frontend/src/lib/medusa.ts:25`.

- JWT клиента лежит в `localStorage` под ключом `tb_customer_token` и
  пересылается заголовком `Authorization`. Любой XSS забирает аккаунт.
- Исправление — не «маленький PR»: нужен переход на `httpOnly`-cookie сессии
  (медуса умеет) и удаление ручного хранения токена из фронтенда.

Отметить как отдельную дизайн-задачу; до неё — H1 (rate-limit + CAPTCHA) снижает
риск подбора пароля.

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

PR #24: убрать `test_test` из прод-конфига + guard на seed.

### M3. Фантомные зависимости в backend

`backend/package.json` (см. `:25-32`):

- `zod` используется в рантайме минимум в 5 файлах (в том числе
  `src/utils/rozetka-*.ts`) — в зависимостях его **нет**;
- `knex` импортируется по типам в 3 файлах — тоже отсутствует.

Сейчас работает только за счёт транзитивной установки. PR #25: добавить `zod` в
`dependencies`, `knex` в `devDependencies` (или убрать импорт типов).

### M4. Неатомарный cutover и простой

Файлы: `scripts/deploy-vps.sh:157-159`, `scripts/activate-release.sh`.

- `git merge --ff-only "$target"` выполняется **до** активации релиза, поэтому при
  откате рабочее дерево `main` на VPS остаётся ff-слитым с тем, что откатили.
- Активация = `pm2 delete` + `pm2 start` → короткий простой витрины.

PR: менять порядок (активация → затем ff-merge), рассмотреть `pm2 reload`.

### M5. Публичный IP VPS в репозитории и в клиентском бандле

Места: `DEPLOY.md` и `frontend/src/lib/product-image.ts:9`
(значение `178.104.108.200` попадает в браузерный бандл).

PR #26: вынести в переменную окружения / заменить на список «локальные хосты» без
публичного адреса; в `DEPLOY.md` — плейсхолдер вместо IP.

### M6. `.gitignore` не закрывает загруженные медиа

`.gitignore:30-35` игнорирует только `backend/uploads/`, а реальное хранилище
медиа — `backend/static/` и `backend/private-static/` (см.
`scripts/deploy-vps.sh:77-87`, `backend/medusa-config.ts:41`).

PR #27: добавить `backend/static/` и `backend/private-static/`.

### M7. Тесты разъезжаются с CI

- `CI` запускает два явных списка `node --test` (`.github/workflows/verify.yml:69,71`);
  в них **нет** `backend/tests/registration-email.test.cjs`;
- `backend/jest.config.js` указывает на несуществующий `__tests__`;
- в `backend/package.json` нет скрипта `test`.

PR #28: сделать glob-список (или единый скрипт `npm test` в backend) и добавить
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
- `docs/SECRETS.md:43` ссылается на **не смерженный** PR #15;
- `docs/DOCKER-EXIT-PLAN.md` исходит из «любой push в main деплоит» — после #18 неверно;
- `HostKeyAlias=tamir-vps` (`.github/workflows/deploy.yml:63`) — генерацию записи
  known_hosts для алиаса нигде не описали;
- `TAMIR_PRIVACY_EMAIL` используется в `src/app/privacy/page.tsx:17`, но его нет в
  `frontend/.env.example`;
- `admin@tamir.local` зашит в `backend/src/utils/review-validation.ts:28`.

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
  `frontend/public/tamir-logo.png`, `frontend/design/collection.jpg`.
- `@medusajs/types` в `dependencies` фронтенда, используется только как типы → `devDependencies`.
- ID GA `G-0L34ZN3ZB6` захардкожен в `frontend/src/lib/privacy/consent.ts`.
  ⚠ Пункт пришёл из суб-агента, **лично не перепроверен** — проверить перед правкой.
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

---

## Порядок PR

| PR | Предмет | Приоритет |
|----|---------|-----------|
| #21 | phone-login: rate-limit + CAPTCHA + `PORT` в `.env.example` | HIGH |
| #22 | Деплой по проверенному SHA (`workflow_run.head_sha`) | HIGH |
| #23 | Guard `workflow_dispatch` + `environment: production` | HIGH |
| #24 | Убрать `test_test` из прод-конфига + guard на `seed.ts` | MED |
| #25 | Зависимости `zod` / `knex` в `backend/package.json` | MED |
| #26 | Убрать публичный IP из `DEPLOY.md` и бандла | MED |
| #27 | `.gitignore`: `backend/static/`, `backend/private-static/` | MED |
| #28 | Тесты: glob/единый скрипт + пропущенный тест + `docs/TESTING.md` | MED |
| — | Пакет фронтенда: таймауты, `no-store`, баннер, `next/font` | MED |
| — | Документация: `DEPLOY.md`, `SECRETS.md`, `DOCKER-EXIT-PLAN.md`, `.env.example` | MED |
| — | LOW-микроправки (теги actions, `.gitattributes`, бэкапы, мёртвые ассеты) | LOW |
| — | H4: `httpOnly`-сессии вместо `localStorage` (дизайн-задача) | HIGH, отдельная |

---

## Открытые вопросы (ждут решения владельца)

1. Доступ к VPS для диагностики: **A** — отдельный SSH-ключ
   (`~/.ssh/tamir_vps_key`) или **B** — только read-only диагностика через
   `workflow_dispatch` c существующими секретами `VPS_*`.
2. PR #15 (`docs/native-services-migration-plan`, открыт) — мержить или закрыть?
   В `docs/SECRETS.md:43` ссылка уже стоит на него.
3. Figma MCP: официальный remote `https://mcp.figma.com/mcp` работает по OAuth на
   бесплатном тарифе (seat View), но лимит ~20 read-вызовов в месяц — беречь.
   Запасной вариант (не настроен): `npx figma-developer-mcp --stdio` + read-only PAT
   (~5000 REST-запросов/мес).
