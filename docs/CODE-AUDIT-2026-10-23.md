# Аудит кода и CI/CD: 23 октября 2026

Черновик для работы. Все пункты сверены вручную с кодом в `main` на коммите
`768426f` (после мержей #18, #19, #20). Это не отчёт «про голоса» — каждый пункт
подтверждён чтением конкретных файлов; в конце есть список того, что проверено и
признано чистым, чтобы не перефлагать завтра. Вечером 23.10 весь аудит перечитан
второй раз построчно — внутри пунктов исправлены неточности (rate-limit в H1,
посылка M10, путь `collection.jpg`, версия Node, несколько абзацев про QA).

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

Что делать (PR #22): middleware ограничения частоты по IP+телефону для
`/store/auth/*`, обязательная проверка Turnstile на этом маршруте, добавить
`PORT` в `backend/.env.example`. Уточнения после перечитки кода:

- в самом `phone-login` rate-limit отсутствует — но более ранняя формулировка
  «ни в одном роуте» была ошибочной: хелпер `rateLimit`
  (`backend/src/utils/review-http.ts:30`) вызывается в 6 соседних store-маршрутах —
  `reviews/route.ts:38`, `reviews/[id]/vote/route.ts:10`, `registration/start/route.ts:12,14`,
  `registration/verify/route.ts:10`, `password-reset/start/route.ts:13,15`,
  `password-reset/verify/route.ts:11`; phone-login — единственный mutation-роут без него;
- `backend/src/utils/captcha.ts` умеет `verifyCaptcha(token, action)`, но union
  action'ов — `"register" | "review" | "password_reset"`; для логина нужно
  добавить `"phone_login"` и завести action в облачном Turnstile;
- токен приходит в теле запроса (не в заголовке `X-Turnstile-Token`, как
  утверждал внешний QA-отчёт — в коде таких заголовков нет);
- фронтенд: компонент `src/components/security/Captcha.tsx` уже есть и используется
  в `RegisterForm`, `PasswordResetForm` и `ProductReviews`; в `LoginForm.tsx` его
  **нет** — в PR #22 нужно подключить его к форме логина и передать токен в
  запрос phone-login.

Тест: интеграционный тест на 429 и на отказ без токена CAPTCHA.

### H2. Деплой берёт HEAD `origin/main`, а не проверенный коммит (гонка)

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

Файл: `.github/workflows/deploy.yml:5-6`, `:21-25`.

- У `workflow_dispatch` нет условия `github.ref == 'refs/heads/main'`: запуск с
  любой ветки выполняет деплой с секретами `VPS_*`.
- Job'ы без `environment: production`, поэтому правила окружения и отдельный
  approval не работают.

Что делать (PR #24): добавить `environment: production` и условие на `refs/heads/main`
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

PR #25: убрать `test_test` из прод-конфига + guard на seed.

### M3. Фантомные зависимости в backend

Перепроверено на `main` (`git grep` + чтение `backend/package.json`):

- `zod` импортируется в 5 файлах (`src/admin/decimal/number.ts`, два админ-роута
  `translate`, `src/utils/rozetka-admin.ts`, `src/utils/rozetka-preview.ts`) —
  в `dependencies` его **нет**;
- `knex` импортируется **только по типам** (`import type { Knex }`) в 3 файлах
  (`catalog-popularity.ts`, `password-reset.ts`, `registration-code.ts`) — тоже
  отсутствует в зависимостях.

Сейчас работает только за счёт транзитивной установки из `@medusajs/*`. PR #26:
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

PR #27: вынести в переменную окружения / заменить на список «локальные хосты» без
публичного адреса; в `DEPLOY.md` — плейсхолдер вместо IP.

### M6. `.gitignore` не закрывает загруженные медиа

`.gitignore:30-35` игнорирует только `backend/uploads/`, а реальное хранилище
медиа — `backend/static/` и `backend/private-static/` (см.
`scripts/deploy-vps.sh:77-87`, `backend/medusa-config.ts:41`).

PR #28: добавить `backend/static/` и `backend/private-static/`.

### M7. Тесты разъезжаются с CI

Перепроверено на `main`: в `backend/tests/` 15 `.cjs`-тестов, `verify.yml` явными
списками запускает 14 — **`registration-email.test.cjs` не запускается никогда**;
- `backend/jest.config.js:21-27`: при `TEST_TYPE=integration:http` testMatch реально
  находит `integration-tests/http/health.spec.ts` — но этот тест CI не запускает;
  паттерны `integration:modules` и `unit` (`src/modules/*/__tests__/`,
  `**/__tests__/**/*.unit.spec.*`) не находят ничего — таких каталогов в `backend/src`
  нет (grep пуст);
- в `backend/package.json` нет скрипта `test` (только jest-скрипты Medusa).

PR #29: сделать glob-список (или единый скрипт `npm test` в backend) и добавить
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

Внешний отчёт (P0/P1/P2/SR-LAT/EN) сверен с кодом `main` — половина пунктов уже
учтена выше (#22–#24), остальные разобраны:

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

Номера плановые (фактические появятся при создании PR). Этот аудит-PR занял **#21**,
поэтому отсчёт исправлений начинается с #22.

| PR | Предмет | Приоритет |
|----|---------|-----------|
| #22 | phone-login: rate-limit + CAPTCHA + `PORT` в `.env.example` | HIGH |
| #23 | Деплой по проверенному SHA (`workflow_run.head_sha`) | HIGH |
| #24 | Guard `workflow_dispatch` + `environment: production` | HIGH |
| #25 | Убрать `test_test` из прод-конфига + guard на `seed.ts` | MED |
| #26 | Зависимости `zod` / `knex` в `backend/package.json` | MED |
| #27 | Убрать публичный IP из `DEPLOY.md` и бандла | MED |
| #28 | `.gitignore`: `backend/static/`, `backend/private-static/` | MED |
| #29 | Тесты: glob/единый скрипт + пропущенный тест + `docs/TESTING.md` | MED |
| — | M10: решение по письму `sr` (сейчас латиница; при желании — отдельная локаль `sr-Cyrl`) + браузер-проверка алфавитов | MED, продукт |
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
   Раздел «Существующий VPS: порядок до объединения PR» в `docs/SECRETS.md:31-43`
   описывает именно этот миграционный PR, но номер не называет — прямых ссылок
   на PR #15 в файле нет. После решения здесь появится запись, что с ним сделано.
3. Figma MCP: официальный remote `https://mcp.figma.com/mcp` работает по OAuth на
   бесплатном тарифе (seat View), но лимит ~20 read-вызовов в месяц — беречь.
   Запасной вариант (не настроен): `npx figma-developer-mcp --stdio` + read-only PAT
   (~5000 REST-запросов/мес).
