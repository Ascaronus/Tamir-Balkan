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
на прод. HEAD `main` — `6702978`, релиз на VPS `20261024T190049Z-670297884f4d`
(история `main` вечером 24.10 перезаписана — см. заметку «Инцидент с автором коммита»).

Статус: **готовы H1, H2, H3, H4** (PR #22, #23, #24, #26) — весь раздел HIGH закрыт.
Попутно закрыты две поломки, которые обнаружили сами деплои: #27 (пустой
`VERIFIED_RUN`) и #28 (гонка в тесте H1).

Сводка на вечер 01.11 → 02.11: **аудит закрыт.** M7 был закрыт раньше — PR #35
(ветка `chore/modernize-existing-tests`, мерж `e85c120`, влит 27.10, на проде:
discovery-раннер `backend/test-support/run-tests.mjs`, `verify.yml` больше не
держит ручной список тестов). **M1–M6 исправлены, влиты и выложены на прод
вечером 01.11:** PR #59 (`fix/audit-m1-m2`, мерж `87438bb`), #60
(`fix/audit-m3`, мерж `10fbffd`), #61 (`fix/audit-m4`, мерж `1a530c0`), #62
(`fix/audit-m5`, мерж `83675f6`), #63 (`fix/audit-m6`, мерж `de5af3f`) — каждый
merge-коммитом, после зелёных `verify (20.20.2)`/`verify (24)`, с деплоем на прод.
Обновление этого документа — PR #64 (мерж `b65897d`), #65 (мерж `228f071`) и #71 (этот PR).
Плановые номера PR #29–#33,
названные в исходном тексте аудита, не действовали: они израсходованы фича- и
док-PR 24.10–31.10 (см. таблицу «Порядок PR»). **Ops-хвосты тоже выполнены:**
строки заглушки `test_test` вычищены из прод-БД (бэкап + транзакция с assert'ами),
`NODE_ENV=production` прописан в VPS `backend/.env`, seed-guard проверен на
скомпилированном прод-артефакте — детали в «Решённых вопросах», пункты 4–5.
**Аудит закрыт целиком: хвост M8 (фронтенд) закрыт PR #70 (влит merge-коммитом
`b3ad97a`, в проде с 02.11); LOW-список
закрыт PR #67 (merge `e241a4b`), M9 закрыт PR #66 (merge `4e62d00`); M10 закрыт
решением владельца
02.11 — кириллизацию (`sr-Cyrl`) в ближайшее время не заводим.** M8 был разбит на два
PR: **#69** — сетевые дедлайны в `frontend/src/lib/store/*` (влит merge-коммитом
`714f12e`, в проде), **#70** — выборочный `revalidate` (влит merge-коммитом
`b3ad97a`, в проде). Ориентиры на 02.11:
HEAD `main` — `b3ad97a` (мерж #70), прод-релиз `20261102T000452Z-b3ad97a395af`
(код `b3ad97a` — мерж
#70; док-PR #64, #65, #68 и #71 на прод не деплоятся: `verify.yml`/`deploy.yml` игнорируют
`docs/**`, `openspec/**` и `**.md`), checkout `main` на VPS — `b3ad97a`. Оба
pm2-процесса онлайн, backend крутится уже с `NODE_ENV=production` из
`backend/.env`.
Работа продолжается по одному маленькому PR на исправление.

---

## Как продолжить работу

1. `git fetch origin` и сверка с `origin/main` (на 02.11 это `b3ad97a`). Напоминание:
   24.10 история `main` перезаписана (force-push) — `git pull --ff-only` на старых
   клонах упадёт; вместо него `git reset --hard origin/main` (локальных правок в main
   всё равно быть не должно). Все аудитные ветки влиты: H1–H4 шли в ветках
   `fix/auth-rate-limit`, `fix/deploy-verified-sha`, `fix/deploy-dispatch-guard`,
   `fix/customer-auth-cookies`; M1–M6 — в ветках `fix/audit-m1-m2`, `fix/audit-m3`,
   `fix/audit-m4`, `fix/audit-m5`, `fix/audit-m6`; обновление этого документа —
   `docs/audit-refresh` (#64) и `docs/audit-closeout` (#65), документация M9 — в ветке `docs/audit-m9` (#66),
   LOW-микроправки — `chore/audit-low` (#67), SHA-строка к нему — `docs/audit-low-sha` (#68),
   дедлайны store-фетчей — `fix/audit-m8-timeouts` (#69, влит `714f12e`);
   выборочный `revalidate` — `fix/audit-m8-revalidate` (#70, влит `b3ad97a`);
   статус этого файла — `docs/audit-m71-status` (#71); предыдущие были созданы
   от `7be4a9c`, уже после перезаписи истории.
2. Открыть таблицу «Порядок PR» ниже и взять первый незакрытый номер. Плановая
   нумерация сдвинулась сильно: карточка #25 всё-таки создавалась, но была закрыта
   без мержа (диагностический эксперимент с CI); #26–#28 — H-исправления 24.10;
   #29–#58 израсходованы фича-, док- и CI-PR (24.10–31.10, последний — #58, мерж
   `7be4a9c`; в их числе #34 — OpenSpec-доки, влит `3d17db3`); M7 закрыт под
   номером **#35**. Аудитные M1–M6 влиты под номерами **#59–#63** (01.11),
   обновление этого документа — **#64** (влит `b65897d`), финальное закрытие аудита
   в этом файле — **#65** (влит `228f071`), документация M9 — **#66** (влит `4e62d00`);
   SHA для #67 — **#68** (влит `980380e`); дедлайны store-фетчей — **#69** (влит `714f12e`);
   выборочный `revalidate` — **#70** (влит `b3ad97a`); статус этого файла — **#71**
   (этот PR); следующая свободная карточка **#72**
   (номер всё равно уточнить при создании — нумерация общая для репозитория).
3. Ветка `fix/<slug>`, один коммит, PR, ждать `verify` (обязательные проверки
   `verify (20.20.2)` и `verify (24)`, строгие).
4. **Мерж = прод.** Перед `gh pr merge` всегда спрашивать разрешение. Все аудитные
   ветки (`fix/audit-m*`, `docs/audit-refresh`, `docs/audit-closeout`) были созданы
   от `7be4a9c`/`b65897d` — уже после перезаписи истории 24.10, так что
   перебаэзирование им не нужно; старый завет касался веток вроде
   `docs/code-audit-2026-10-23` (они уже влиты). Мерж кода — деплой на прод, мержить
   по одному. Док-PR (трогает только `docs/**`, `openspec/**`, `**.md`) деплой не
   запускает — `verify.yml`/`deploy.yml` идут с `paths-ignore`, — но PR-проверки
   на нём всё равно обязаны быть зелёными перед мержем.
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
| #28 | Тест H1: закрыта гонка записи счётчиков в forged-XFF кейсе | `6702978` |
| #35 | **M7**: discovery-раннер `backend/test-support/run-tests.mjs` (категории с БД/без, guard от прод-строк), `verify.yml` больше не держит ручной список тестов | `e85c120` |
| #34 | Документация: OpenSpec-спецификации текущего поведения (`docs/specs/`), перевод документации на русский | `3d17db3` |
| #59 | **M1+M2**: `test_test` убран из прод-конфига и файлов; `seed` → `seed:dev`, `seedDemoData` бросает ошибку при `NODE_ENV=production` (переопределение `TAMIR_ALLOW_SEED=1`) | `87438bb` |
| #60 | **M3**: `zod` → `dependencies`, `knex` → `devDependencies` в `backend/package.json` | `10fbffd` |
| #61 | **M4**: ff-merge чекаута `main` на VPS только после успешной активации релиза | `1a530c0` |
| #62 | **M5**: публичный IP убран из `DEPLOY.md`, `product-image.ts` и тестовых моков | `83675f6` |
| #63 | **M6**: `.gitignore` — `backend/static/` и `backend/private-static/` | `de5af3f` |
| #15 | Документация: `docs/DOCKER-EXIT-PLAN.md` (план ухода от Docker) влит в `main` | `0c4e6ba` |
| — | Защита ветки `main`: обязательные проверки `verify (20.20.2)` / `verify (24)`, строгие, обязателен PR (0 ревью), запрещены force-push и удаление ветки, `enforce_admins: true` (с 24.10; раньше было `false` — админы могли мержить в обход проверок) | — |

Прод `tamir.rs` здоров, деплои проходят через гейт. На вечер 24.10 на проде крутится
`6702978` (H1–H4 + #27 + #28): релиз и резервная копия `20261024T190049Z-670297884f4d`,
Verify-прогон `40122982248` зелёный, деплой-прогон `40123202990` успешный (первый попыт
упёрся в предохранитель `deploy-vps.sh` — см. заметку про инцидент), оба
pm2-процесса онлайн. Ручная проверка приватного прокси (с ноутбука, 24.10): товары
отдаются со `x-publishable-api-key`, без ключа — `400` от Medusa; не-store пути
(`admin`, `health`, путь с `..`) — `404 {"error":"not_found"}` от самого прокси; во всех
проксируемых ответах есть `cache-control: no-store` и нет `set-cookie`. Живая проба логина
(24.10 18:04 UTC, ноутбук → `https://tamir.rs/api/auth/login`, несуществующий e-mail):
5×`401` («Invalid email or password», без `set-cookie` и токена в теле), 6-й запрос тем же
e-mail — `429 {"retry_after":3600}`, другой e-mail с того же IP — `401` (блок покадровый,
по e-mail+IP). Сверка на VPS: cwd обоих pm2-процессов — релиз
`20261024T190049Z-670297884f4d` (тот же код, что и `20261024T161211Z-0f294291568c`, с которого
пробы делались), `MEDUSA_PROXY_BACKEND_URL=http://127.0.0.1:9000`,
обращений nginx к `/auth/customer/emailpass` с `127.0.0.1` — **0** (бэкенд не зовёт сам
себя через `api.tamir.rs`), в JSON-логе бэкенда `client_ip` — реальный адрес клиента
(правый `x-forwarded-for` от nginx).

### Инцидент 24.10: «левый» автор коммита и перезапись истории `main`

Коммит PR #28 (бывший `59a4050`) был создан с адресом `94155111+Ascaronus@users.noreply.github.com`
— такая форма noreply приклеилась от конвенции одной из AI-сессий, но GitHub привязывает её по
числу до `@`: `94155111` — чужой спящий аккаунт `slxxmpz` (создан 2021-11-12), из-за чего он появился
в списке контрибьюторов. Правильная форма для этого аккаунта — `213390378+Ascaronus@...`, но в
репозитории принята прямая почта `vicommsk@gmail.com` (147 коммитов так и сделаны).
Решение владельца: переписать. Через `git commit-tree` (дерево, сообщение и даты — байт в байт,
изменились только автор/коммитер) получены `d88b8f0` (вместо `59a4050`) и `6702978`
(merge-коммит вместо `0f29429`); `diff` пустой. Force-push в `main` сделан с временным
ослаблением защиты (`allow_force_pushes: true`, `enforce_admins: false`) и сразу восстановлен
в исходный вид. Страницы старых PR (#28) на GitHub по-прежнему показывают старый SHA — это
невыводимый metadata, в историю и контрибьюторов он не попадает.
Последствие для деплоя: `deploy-vps.sh` отказался деплоить (`HEAD` чек-аута `/root/tamir_balkan`
перестал быть предком цели) — на VPS по согласованию сделан `git reset --hard 6702978`, после
этого `gh run rerun` прошёл успешно. **Правило на будущее: история `main` не перезаписывается;
если всё же пришлось — первым делом `git reset --hard origin/main` в `/root/tamir_balkan`.**
Все будущие коммиты — только с `-c user.name="Ascaronus" -c user.email="vicommsk@gmail.com"`;
форма `94155111+...` запрещена.

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

**✅ В проде — влит PR #59 (ветка `fix/audit-m1-m2`, коммит `8b7acf4`, merge-коммит
`87438bb`, на проде с 01.11).** `test_test` убран из `medusa-config.ts`; удалены файлы
`backend/src/scripts/test-fulfillment-provider.ts` и
`backend/src/scripts/link-stub-fulfillment-to-locations.ts`; из
`src/api/store/custom/route.ts` убран `void testFulfillmentModule`; упоминания
вычищены из README backend'а; `seed.ts` больше не вяжет заглушку со складом.

Пробел прод-БД (read-only, 31.10): в базе от старых сидов остались строки заглушки —
связь `test_test`↔склад в `location_fulfillment_provider`/`location_fulfillment_set`
(склад `sloc_01KNA4KNCV0D9RQYWKD6R2DY76`), софт-делетнутые опции доставки, 6 осиротевших
fulfillment и 2 ручных заказа через заглушку. **Зачистка выполнена 01.11 отдельным
ops-шагом после мержа #59** (бэкап + транзакция с assert'ами, заказы не тронуты —
подробности в «Решённых вопросах», п. 4).

### M2. `backend/src/scripts/seed.ts` без guard'а

Скрипт сидирует демо-товары и `pp_system_default` и может быть запущен на проде
случайно (`npm run seed` — `backend/package.json:17`). Нужен явный guard по
`NODE_ENV`/переменной окружения.

**✅ В проде — влит PR #59 (тот же, что M1, merge-коммит `87438bb`, на проде с
01.11).** npm-скрипт переименован `seed` → `seed:dev`, а `seedDemoData` бросает
ошибку при `NODE_ENV === "production"` без `TAMIR_ALLOW_SEED=1`. Пробел на VPS
(31.10): `NODE_ENV` в `backend/.env` релиза не был задан — поэтому именно
переименование скрипта реально защищало от случайного запуска. **Усиление
исполнено 01.11:** `NODE_ENV=production` прописан в VPS `backend/.env`, guard
проверен на скомпилированном артефакте прод-релиза — см. «Решённые вопросы», п. 5.

### M3. Фантомные зависимости в backend

Перепроверено на `main` (`git grep` + чтение `backend/package.json`):

- `zod` импортируется в 5 файлах (`src/admin/decimal/number.ts`, два админ-роута
  `translate`, `src/utils/rozetka-admin.ts`, `src/utils/rozetka-preview.ts`) —
  в `dependencies` его **нет**;
- `knex` импортируется **только по типам** (`import type { Knex }`) в 3 файлах
  (`catalog-popularity.ts`, `password-reset.ts`, `registration-code.ts`) — тоже
  отсутствует в зависимостях.

Сейчас работает только за счёт транзитивной установки из `@medusajs/*`.

**✅ В проде — влит PR #60 (ветка `fix/audit-m3`, коммит `c4e90ef`, merge-коммит
`10fbffd`, на проде с 01.11).** В `backend/package.json` добавлены `"zod": "^3.25.76"` в `dependencies`
и `"knex": "^3.1.0"` в `devDependencies` (тип-импорты оставлены как есть);
`package-lock.json` обновлен точечно — только корневой блок `""`, без сплошной
регенерации лок-файла. Проверено: `npm install --package-lock-only --dry-run`
даёт «up to date» (лок-файл консистентен манифесту).

### M4. Неатомарный cutover и простой

Файлы: `scripts/deploy-vps.sh:157-159`, `scripts/activate-release.sh`.

- `git merge --ff-only "$target"` выполняется **до** активации релиза, поэтому при
  откате рабочее дерево `main` на VPS остаётся ff-слитым с тем, что откатили.
- Активация = `pm2 delete` + `pm2 start` → короткий простой витрины.

**✅ В проде — влит PR #61 (ветка `fix/audit-m4`, коммит `0a66b13`, merge-коммит
`1a530c0`, на проде с 01.11).** `git merge --ff-only "$target"` перенесён на **после** успешной
`activate-release.sh`: при неудачной активации checkout `main` на VPS остаётся на
прошлом релизе. `pm2 delete` + `pm2 start` сохранены (`pm2 reload` не перезапускает
npm-скрипты в fork-режиме); короткий простой принят осознанно и описан в шаге 6
`DEPLOY.md`. Откат теперь: напрямую `activate-release.sh <старый релиз> <его бэкап>` —
ff-merge в откате не участвует. Предохранитель против редеплоя старого SHA
(`merge-base --is-ancestor` в `deploy-vps.sh`, закреплен тестом
`test-support/verify-deploy-pin.mjs`) не тронут.

### M5. Публичный IP VPS в репозитории и в клиентском бандле

Места (перепроверено grep'ом по `main`): `DEPLOY.md:36` (`ssh root@178.104.108.200`),
`frontend/src/lib/product-image.ts:9` (значение `178.104.108.200` попадает в
браузерный бандл), `frontend/tests/commerce.test.mjs:39-40,76` (тот же IP в
тестовых моках).

Внешний QA-отчёт называл другой адрес (`188.121.137.67`) — в коде его нет;
видимо, это устаревший/сторонний адрес. Актуальный — `178.104.108.200`.

**✅ В проде — влит PR #62 (ветка `fix/audit-m5`, коммит `061b02a`, merge-коммит
`83675f6`, на проде с 01.11).** Из массива разрешённых хостов в `frontend/src/lib/product-image.ts:9`
убран `"178.104.108.200"` (голый regex на IPv4 НЕ добавляли — он бы вернул в
список любой внешний адрес; остались локальные хосты). Тестовые моки в
`frontend/tests/commerce.test.mjs` переведены на нейтральные базы
`http://api.example.net:9000` / `http://127.0.0.1:9000`. В `DEPLOY.md` ssh-строка
теперь `ssh root@tamir.rs`. Принято осознанно: сам адрес остаётся в этом
аудит-документе и в истории git.

### M6. `.gitignore` не закрывает загруженные медиа

`.gitignore:30-35` игнорирует только `backend/uploads/`, а реальное хранилище
медиа — `backend/static/` и `backend/private-static/` (см.
`scripts/deploy-vps.sh:77-87`, `backend/medusa-config.ts:41`).

**✅ В проде — влит PR #63 (ветка `fix/audit-m6`, коммит `31dc826`, merge-коммит
`de5af3f`, на проде с 01.11).** В `.gitignore` добавлены `backend/static/` и `backend/private-static/`
(сразу после `backend/uploads/`); проверено `git check-ignore -v`, отслеживаемых
файлов в этих каталогах нет.

### M7. Тесты разъезжаются с CI

Перепроверено на `main`: в `backend/tests/` 15 `.cjs`-тестов, `verify.yml` явными
списками запускает 14 — **`registration-email.test.cjs` не запускается никогда**;
- `backend/jest.config.js:21-27`: при `TEST_TYPE=integration:http` testMatch реально
  находит `integration-tests/http/health.spec.ts` — но этот тест CI не запускает;
  паттерны `integration:modules` и `unit` (`src/modules/*/__tests__/`,
  `**/__tests__/**/*.unit.spec.*`) не находят ничего — таких каталогов в `backend/src`
  нет (grep пуст);
- в `backend/package.json` нет скрипта `test` (только jest-скрипты Medusa).

**✅ Готово — PR #35 (ветка `chore/modernize-existing-tests`, мерж `e85c120`,
27.10, на проде).** Плановый #33 не выпускался — номер израсходован другим PR.
Сделано: единый discovery-раннер `backend/test-support/run-tests.mjs`
(npm-скрипт `test:cjs`) — сам находит все `*.test.cjs`/`*.integration.cjs` в
`backend/tests`, делит на категории «с БД» / «без БД», каталог с БД отказывается
запускаться на непрод-строках (`test-support/guard-env`); `verify.yml` больше не
держит ручные списки — забытый `registration-email.test.cjs` теперь запускается
автоматически. Есть `--list`/`--junit-dir`/`--reverse` для диагностики.

### M8. Фронтенд: лишние сетевые запросы и build-зависимость от сети

- `src/lib/store/*` — RSC-фетчи без таймаутов (единственный
  `AbortSignal.timeout` — `src/lib/reviews/server.ts:17`);
  **✅ Сделано — PR #69 (ветка `fix/audit-m8-timeouts`), влит merge-коммитом
  `714f12e`, в проде с 02.11.** Новый хелпер
  `frontend/src/lib/store/fetch-timeout.ts` (`timedSignal`, дедлайн
  `STORE_FETCH_TIMEOUT_MS = 8000`) ограничивает каждый store-запрос:
  `regions.ts`, `categories.ts` (один дедлайн на всю пагинацию + отдельный на
  одну категорию), `banners.ts`, `products.ts`, `catalog.ts`,
  `product-delivery.ts`. `AbortSignal.timeout`/`AbortSignal.any` намеренно не
  используем: эти же fetcher'ы работают и в браузере через прокси
  `/api/medusa/*` (`CatalogClient`, `WishlistPage`, `ShopSidebar`,
  `RelatedProducts`, `cart-client`), где таких API в части Safari/Firefox нет.
  `done()` в `finally` снимает таймер и слушатель внешнего сигнала. Проверено:
  уже были с дедлайном `api/medusa/[...path]/route.ts:110-116`,
  `api/auth/login/route.ts:62-68` и `lib/reviews/server.ts:17`.
- везде `cache: "no-store"` → регионы и категории переfetch'иваются на каждый хит;
  **сделано — PR #70 (ветка `fix/audit-m8-revalidate`, влит merge-коммитом `b3ad97a`,
  в проде с 02.11):** `regions.ts` и
  `categories.ts` (список с пагинацией и фетч одной категории) переходят на
  `next: { revalidate: 60 }`, `banners.ts` — на `next: { revalidate: 300 }`.
  Локаль категорий переехала из заголовка `x-medusa-locale` в query-параметр
  `?locale=`: Next ключует fetch-кэш по URL+method+body и не смотрит на
  заголовки, поэтому заголовочная локаль склеила бы sr- и en-ответы в одну
  кэш-запись. Middleware Medusa `applyLocale` читает `?locale=` на всём
  пространстве `/store` и удаляет его из фильтров, а `normalizeLocale` делает
  `sr-RS`/`en` — семантически то же, что заголовок. Баннеры и регионы от локали
  не зависят (синглтон `sdk` в `src/lib/medusa.ts` серверную локаль не выставляет).
  Ключевой момент: `cache: "no-store"` убран, а не оставлен рядом — `cache`
  молча побеждает `next.revalidate` и кэш бы не включился. `@medusajs/js-sdk`
  своих `cache`/`next` не добавляет (`normalizeRequest` просто раскрывает `init`),
  опции доходят до нативного `fetch`. Товары, каталог, цены, остатки и корзина
  остаются `no-store` — изменения из админки должны появляться сразу. Опции
  фетчей закреплены тестом `frontend/tests/store-fetch-cache.test.mjs`
  (нет ключа `cache`, значение `next.revalidate`, `locale` в query, `headers`
  не передаются). Проверка в проде 02.11: за сутки все 22 серверных фетча
  `/store/product-categories` ушли с `?locale=` (9× `sr-RS`, 13× `en`) —
  sr- и en-списки категорий в кэше не склеиваются; дневной счётчик фетчей
  регионов/категорий/баннеров сравниваем с базой (01.11 — 1257 регионов)
  по логам pm2 на VPS.
- `unoptimized` у баннера каталога: `src/app/[countryCode]/catalog/page.tsx:51` —
  **не делать:** утверждение устарело, `unoptimized` в `frontend/src` не
  встречается (grep пуст), менять нечего;
- `next/font/google` (`src/app/layout.tsx:3`) — сборка падает без доступа к Google Fonts.
  **не делать:** `next/font` скачивает шрифты и самохостит их на шаге
  `next build`; в рантайме и на проде обращений к Google Fonts нет, отдельного
  фикса не требуется (зависимость от сети остаётся только в момент сборки).

Блок задач разбит на два PR: **#69** — только таймауты (минимальный риск; влит
`714f12e`), **#70** — выборочный `revalidate` (влит `b3ad97a`, в проде с 02.11).
M8 закрыт.

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

**Статус на 02.11: закрывается этим PR #66.** Пункт про публичный IP был закрыт
раньше, PR #62 (M5): ssh-строка в `DEPLOY.md` — `ssh root@tamir.rs`. Дальше:

- `DEPLOY.md`: дата обновлена на «2 ноября 2026», добавлен подраздел «known_hosts
  и HostKeyAlias» — запись в `VPS_KNOWN_HOSTS` обязана начинаться с алиаса
  `tamir-vps` (генерация: `ssh-keyscan -t ed25519 -p <port> <ip> | sed
  's/^[^ ]*/tamir-vps/'`, отпечатк сверять до добавления);
- `docs/SECRETS.md`: раздел «Существующий VPS» прямо называет миграционный PR #15
  (`0c4e6ba`, влит 27.10), финальный абзац переписан в прошедшем времени как
  описание уже выполненного;
- `docs/DOCKER-EXIT-PLAN.md`: таблица влияния учитывает актуальный порядок —
  гейт `workflow_run` после зелёного Verify и `paths-ignore` (`docs/**`,
  `openspec/**`, `**.md`); посылка «любой push в main деплоит» исправлена;
- `frontend/.env.example`: добавлена серверная переменная `TAMIR_PRIVACY_EMAIL`;
- `admin@tamir.local` в `backend/src/utils/review-validation.ts:28` — **решение
  оставить код как есть** (02.11): адрес зафиксирован в OpenSpec-спецификациях
  `administration` и `product-reviews` и покрыт тестами, а реальный путь отправки
  (`backend/src/utils/banner-http.ts:7`) читает env `BANNER_ADMIN_EMAILS` с этим
  значением по умолчанию — то есть переопределение и без того возможно через env.

Отдельно по OpenSpec-спецификациям текущего поведения (`docs/specs/`) — PR #34,
влит 27.10 (merge-коммит `3d17db3`).

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

**✅ Закрыто решением владельца от 02.11: кириллица в ближайшем будущем не нужна —
локаль `sr-Cyrl` не заводим, код не меняется.** Абзац выше остаётся как справочная
оценка объёма работы, если решение когда-нибудь изменится.

---

## LOW

**✅ Микроправки LOW-волны выполнены PR #67 (`chore/audit-low`), 02.11.** Ниже —
исходный список с пометками по каждому пункту (в том числе исправление одной
ошибки самого аудита про `tamir-logo.png`).

- Плавучие теги actions: `actions/checkout@v4`, `actions/setup-node@v4`,
`actions/upload-artifact@v4` (`.github/workflows/verify.yml:73,74,127`) —
запинены на SHA (`v4.4.0`/`v4.4.0`/`v4.6.2`). Фактически страховка на будущее:
мажорные теги `v4` уже указывали на эти же коммиты. В `deploy.yml` шагов `uses:` нет.
- Добавлен `.gitattributes` (`*.sh text eol=lf`) — защита bash-скриптов от CRLF
на Windows.
- Добавлен `LICENSE` в корне: проприетарная («Copyright (c) 2026 TAMIR. All rights
reserved.») — решение владельца от 02.11.
- Бэкапы `/root/tamir-backups/<id>` (`scripts/deploy-vps.sh`): после успешной
активации релиза хранятся **последние 14** релизных бэкапов (по шаблону имени
`<UTC>-<sha>`), ручные файлы (`.sql`, `.bak`) не трогаются.
- `bash -n` теперь проверяет все `scripts/*.sh` (`verify.yml`), а не только
`deploy-vps.sh`.
- `backend/.yarnrc.yml` удалён: `yarnPath: .yarn/releases/yarn-4.12.0.cjs`, файла нет,
проект живёт на npm (`packageManager: npm@11.6.2`).
- Мёртвые ассеты удалены: `frontend/public/{vercel,next,file,window,globe}.svg`,
`frontend/public/design/collection.jpg`. **Пункт аудита про
`frontend/public/tamir-logo.png` был ошибочен** — файл используется
(`ShopHeader.tsx:20`, OG-изображение в `layout.tsx:24`, `catalog/page.tsx:77`)
и остаётся в репозитории.
- `@medusajs/types` перенесён в `devDependencies` фронтенда: все 23 импорта —
`import type`.
- ID GA `G-0L34ZN3ZB6` захардкожен в `frontend/src/lib/privacy/consent.ts:5`
(перепроверено 23.10 — также упомянут в `src/lib/legal/content.ts:85,91`).
Не секрет, но выносился бы в env при переезде на другой аккаунт аналитики.
**Решение владельца от 02.11: в env не выносим, ID остаётся в коде.**
- Гостевая receipt формируется из `sessionStorage` (`src/lib/checkout/receipt.ts`) —
пользователь может показать сам себе любые данные заказа; LOW UX, не уязвимость.
Не меняем.
- `frontend/AGENTS.md` в репозитории — это намеренное предупреждение про Next 16
(«this is NOT the Next.js you know»). Не удалять; обсуждать отдельно.

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
  он удалён как непроверяемый из репозитория. Уточнение на 31.10: заглушка убрана из
   Уточнение на 31.10: заглушка убрана из
   прод-конфига в PR #59 (M1); её старые строки в прод-БД зачищены 01.11 —
   см. пункт M1 и «Решённые вопросы», п. 4.
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
тесте H1). Уточнение на 31.10 (первая версия абзаца ошибалась): карточка **#25**
всё-таки создавалась, но была закрыта без мержа (диагностический эксперимент с CI).
Номера **#29–#58** израсходованы фича-, док- и CI-PR (24.10–31.10; последний —
#58, мерж `7be4a9c`; в их числе **#34** — OpenSpec-доки, влит `3d17db3`); M7 закрыт
под номером **#35**, план миграции с Docker — **#15** (влит). Аудитные M1–M6 влиты
под номерами **#59–#63** (01.11, все ветки от `7be4a9c`), обновление этого
документа — **#64** (влит `b65897d`), финальное закрытие аудита в этом файле —
**#65** (влит `228f071`), документационный PR по M9 — **#66** (влит `4e62d00`), SHA
для #67 — **#68** (влит `980380e`), дедлайны store-фетчей — **#69** (влит `714f12e`),
выборочный `revalidate` — **#70** (влит `b3ad97a`), статус этого файла — **#71**
(этот PR); следующая свободная карточка **#72** (номер
всё равно уточнить при создании — нумерация общая для репозитория).

| PR | Предмет | Приоритет | Статус |
|----|---------|-----------|--------|
| #22 | Удалить phone-login + rate-limit на `/auth/customer/emailpass` (IP+email, только неудачи) + friendly-429 в `LoginForm` | HIGH | ✅ в проде (`5f82714`) |
| #23 | Деплой по проверенному SHA (`workflow_run.head_sha`) | HIGH | ✅ в проде (`e6fdefc`) |
| #24 | Guard `workflow_dispatch` + `environment: production` | HIGH | ✅ в проде (`8e88d8e`) |
| #26 | H4: `httpOnly`-сессии вместо `localStorage` + прокси только `/api/medusa/store/*` | HIGH | ✅ в проде (`5f8320e`) |
| #27 | CI: `VERIFIED_RUN` из `workflow_run.id` (в payload нет `run_id`) | HIGH | ✅ в проде (`09c470d`) |
| #28 | H1: тест на гонку счётчиков и forged-`x-forwarded-for` | HIGH | ✅ в проде (`6702978`) |
| #35 | M7: единый discovery-раннер `test-support/run-tests.mjs` + автосбор тестов в `verify.yml` | MED | ✅ в проде (`e85c120`) |
| #34 | Документация: OpenSpec-спецификации текущего поведения (`docs/specs/`) | MED | ✅ в проде (`3d17db3`) |
| #59 | M1 + M2: убрать `test_test` из прод-конфига + guard на `seed.ts` (`fix/audit-m1-m2`) | MED | ✅ в проде (merge `87438bb`) |
| #60 | M3: зависимости `zod` / `knex` в `backend/package.json` (`fix/audit-m3`) | MED | ✅ в проде (merge `10fbffd`) |
| #61 | M4: ff-merge чекаута на VPS только после успешной активации (`fix/audit-m4`) | MED | ✅ в проде (merge `1a530c0`) |
| #62 | M5: убрать публичный IP из `DEPLOY.md` и бандла (`fix/audit-m5`) | MED | ✅ в проде (merge `83675f6`) |
| #63 | M6: `.gitignore` — `backend/static/`, `backend/private-static/` (`fix/audit-m6`) | MED | ✅ в проде (merge `de5af3f`) |
| #64 | обновление этого аудит-документа (`docs/audit-refresh`) | MED | ✅ влит (`b65897d`) |
| #65 | финальное закрытие этого аудит-документа (`docs/audit-closeout`) | MED | ✅ влит (`228f071`) |
| #66 | M9: документация — `DEPLOY.md`, `SECRETS.md`, `DOCKER-EXIT-PLAN.md`, `.env.example` (`docs/audit-m9`) | MED | ✅ влит merge-коммитом `4e62d00` (02.11) |
| — | ops: чистка старых строк заглушки `test_test` в прод-БД (после мержа #59) + `NODE_ENV=production` в VPS `backend/.env` | MED, ops | ✅ выполнено 01.11 (см. «Решённые вопросы», п. 4–5) |
| — | M10: решение по письму `sr` (сейчас латиница; при желании — отдельная локаль `sr-Cyrl`) + браузер-проверка алфавитов | MED, продукт | ✅ решено 02.11: `sr-Cyrl` не заводим (решение владельца) |
| #69 | M8-1: дедлайн `timedSignal` на каждый store-фетч — `regions`, `categories`, `banners`, `products`, `catalog`, `product-delivery` (`fix/audit-m8-timeouts`) | MED | ✅ в проде (merge-коммит `714f12e`, релиз `20261101T232756Z-714f12e751df`, 02.11) |
| #70 | M8-2: `revalidate` 60 с для регионов/категорий + 300 с для баннеров, локаль категорий в query `?locale=` вместо заголовка (`fix/audit-m8-revalidate`) | MED | ✅ в проде (merge-коммит `b3ad97a`, релиз `20261102T000452Z-b3ad97a395af`, 02.11) |
| — | M8-3: «`unoptimized`» у баннера каталога и `next/font/google` | LOW | ✅ не делать: пункты устарели (см. раздел M8) |
| #67 | LOW-микроправки (пины actions SHA, `.gitattributes`, `LICENSE`, ротация бэкапов, мёртвые ассеты, `@medusajs/types`, `bash -n` по `scripts/*.sh`) (`chore/audit-low`) | LOW | ✅ влит merge-коммитом `e241a4b` (02.11) |
| #68 | docs: SHA merge-коммита PR #67 в этом файле (`docs/audit-low-sha`) | LOW | ✅ влит merge-коммитом `980380e` (02.11) |
| — | Следующий свободный номер PR: **#72** | — | — |
Порядок мержей: **#59 → #60 → #61 → #62 → #63 → #64 → #65** — все влиты 01.11
по одному,
каждый merge-коммитом (не squash) и только после зелёных `verify (20.20.2)`/
`verify (24)` при включённой branch protection. Мерж кода = деплой на прод:
деплой-раны #59–#63 — `41342134663`, `41343794357`, `41345205448`, `41346779539`,
`41348749287`; итоговый релиз на VPS — `20261101T204844Z-de5af3fa5d45`. Док-PR
(#64, #65) деплой не запускают — `verify.yml`/`deploy.yml` идут с `paths-ignore`
по `docs/**`, `openspec/**`, `**.md`, — но PR-проверки на них обязаны быть
зелёными перед мержем. Ops-шаг на VPS (чистка старых строк `test_test` в прод-БД
после мержа #59) выполнен 01.11 — см. «Решённые вопросы», п. 4.

---

## Открытые вопросы (ждут решения владельца)

На 02.11 открытых вопросов нет. Оба прежних вопроса (ops-зачистка прод-БД после
PR #59 и `NODE_ENV=production` в VPS `backend/.env`) закрыты 01.11 по явному
«да» владельца — подробности перенесены в «Решённые вопросы», пункты 4–5.
(Прежний вопрос про PR #15 был закрыт раньше — см. «Решённые вопросы», п. 3.)

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
3. PR #15 (`docs/native-services-migration-plan`) — **влит 27.10**, мерж `0c4e6ba`.
   `docs/DOCKER-EXIT-PLAN.md` теперь в `main`. Хвосты перенесены в M9: правка
   устаревшей посылки «любой push в main деплоит» и обновление раздела
   `docs/SECRETS.md` «Существующий VPS: порядок до объединения PR».
4. Зачистка прод-БД от старых строк заглушки `test_test` (ops после мержа #59) —
   **выполнено 01.11 по явному «да» владельца.** Перед удалением — поштучный
   `pg_dump --data-only` затронутых таблиц в
   `/root/tamir-backups/cleanup-test_test-20261101T210205Z.sql` (140 строк —
   единственный откат). Само удаление — одна транзакция `psql -v ON_ERROR_STOP=1`
   с assert'ами до DELETE: нули ссылок `order_fulfillment` на fulfillment
   заглушки (заказы не должны быть затронуты) и ровно два тестовых
   `shipping_option` по ID. Удалено по таблицам: `fulfillment_item` — 12,
   `fulfillment` — 6, `shipping_option_rule` — 4, `shipping_option` — 2
   (`so_01KP73Z0WSZ9Q6Y966XXDSVM8B`, `so_01KP740WJBAHXE5CM23V6K3XY4`),
   `location_fulfillment_provider` — 2, `fulfillment_provider` — 1 (`test_test`).
   `fulfillment_label` попала в цепочку зачистки (FK-каскад) и осталась пустой.
   Пост-проверки по всем таблицам — нули; в `fulfillment_provider` остался только
   законный `manual_manual`; заказы (`orders`) не тронуты.
5. `NODE_ENV=production` в VPS `backend/.env` (усиление seed-guard'а из M2) —
   **выполнено 01.11 по явному «да» владельцу.** `.env` сначала скопирован в
   `/root/tamir-backups/backend.env.bak-20261101T210525Z`; в файл добавлены
   комментарий и строка `NODE_ENV=production` (единственный откат — этот бэкап).
   Перезапуск `pm2 restart tamir-backend`: backend `http://127.0.0.1:9000/health`
   → 200, витрина `http://127.0.0.1:3000/` → 307 (норма), dotenv читает
   `NODE_ENV` из `.env`. Guard проверен не «на исходниках», а на **скомпилированном
   артефакте прод-релиза** `/root/tamir-releases/20261101T204844Z-de5af3fa5d45/backend/.medusa/server/src/scripts/seed.js`:
   harness с `NODE_ENV=production`, без `TAMIR_ALLOW_SEED`, импортирует `seed.js`
   и вызывает default-экспорт (с CJS-разворачиванием `default.default`) с фейковым
   контейнером, который бросает ошибку при первом `resolve`. Результат — ошибка
   `seed.ts refuses to run in production` ещё до любых прикосновений к контейнеру
   и БД. Локальные прогоны TypeScript-исходников для этой проверки не подойдут
   (в репозитории компилируется CJS-артефакт) — проверять только так, на VPS.

## Примечание: Figma MCP

Настроены оба варианта (в `~/.config/opencode/opencode.json`): официальный remote
`figma` (`https://mcp.figma.com/mcp`, OAuth, бесплатный тариф seat View, лимит
~20 read-вызовов в месяц — беречь) и запасной `figma-rest`
(`npx -y figma-developer-mcp --stdio` + PAT в `FIGMA_API_KEY`,
~5000 REST-запросов/мес). Массовое чтение гонять через `figma-rest`, remote беречь.
