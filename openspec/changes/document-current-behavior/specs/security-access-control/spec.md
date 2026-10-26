# Spec Delta

## Purpose

Фиксирует текущий уровень безопасности tamir.rs: маршрутную таблицу middleware с аутентификацией и лимитами тела запросов, блокировку legacy-регистрации, троттлинг входа, HMAC-хэширование счётчиков, доверенное определение IP клиента и проверку капчи.

## ADDED Requirements

### Requirement: Маршрутная таблица middleware назначает аутентификацию и лимиты тела

Middleware-конфигурация backend обязана (MUST) назначать аутентификацию и лимиты тела
по каждому маршруту отдельно (через `defineMiddlewares` с массивом `routes`): все
`/admin/**` кастомные маршруты требуют токен администратора, маршруты записи отзывов —
токен покупателя, публичные GET-маршруты пропускают неаутентифицированные запросы.

#### Scenario: Админ-маршрут без токена пользователя

- **WHEN** запрос к `/admin/rozetka/sync` приходит без bearer/session-токена администратора
- **THEN** middleware аутентификации отклоняет запрос до выполнения обработчика импорта

#### Scenario: Публичный список отзывов

- **WHEN** неаутентифицированный посетитель вызывает `GET /store/reviews?product_id=prod_x`
- **THEN** middleware пропускает запрос (режим `allowUnauthenticated`), а `POST /store/reviews` от того же посетителя отклоняется как неаутентифицированный

#### Scenario: Состав маршрутной таблицы

- **WHEN** модуль экспортирует конфигурацию по умолчанию
- **THEN** в `routes` описаны matchers `/admin/products/:id/localized-url` (методы `GET`, `POST`), `/admin/products/:id/option-translations/translate` (`POST`), `/admin/rozetka*`, `/store/catalog/products` (`GET`), `/auth/customer/:provider/register` (`POST`), `/auth/customer/emailpass` (`POST`), `/store/customers` (`POST`), `/store/reviews` (`POST` и `GET`), `/store/reviews/:id/vote` (`POST`) и `/admin/reviews*`
- **AND** глобальный массив `middlewares` в вызове `defineMiddlewares` не задан

### Requirement: Оба legacy-маршрута регистрации покупателя возвращают 403

Таблица middleware обязана (MUST) закрывать обход подтверждения e-mail: обработчик `verifiedRegistrationRequired` обязан (MUST) стоять перед `POST /store/customers` и `POST /auth/customer/:provider/register` и возвращать `403` с телом `{"code": "EMAIL_VERIFICATION_REQUIRED", "message": "EMAIL_VERIFICATION_REQUIRED"}`.

#### Scenario: Попытка зарегистрироваться через старый маршрут

- **WHEN** клиент отправляет `POST /auth/customer/emailpass/register` с валидным payload
- **THEN** ответ возвращает статус `403` с кодом `EMAIL_VERIFICATION_REQUIRED`, и идентичность не создаётся

### Requirement: Brute-force защита входа считает только неудачи и не отказывает сама

Middleware `loginRateLimit` обязана (MUST) защищать `POST /auth/customer/emailpass`: перед аутентификацией проверять счётчики `tamir_login_rate` и при достижении пределов (5 неудач на связку e-mail+IP, 30 на IP за час) отвечать `429` `TOO_MANY_REQUESTS` с полем `retry_after`; увеличивать счётчики обязан (MUST) только для ответов `400`/`401`, а при сбое самой защиты (отсутствующий секрет, недоступная БД) — пропускать запрос (fail-open) с записью в лог.

#### Scenario: Успешные входы не влияют на лимит

- **WHEN** пользователь многократно успешно аутентифицируется (ответы `200`)
- **THEN** счётчики `login-email:*`/`login-ip:*` не создаются, и вход не блокируется

#### Scenario: БД счётчиков недоступна

- **WHEN** запрос к таблице `tamir_login_rate` завершается ошибкой
- **THEN** middleware логирует сбой и вызывает `next()`, не превращая сбой троттлинга в отказ входа

### Requirement: Счётчики и коды хранятся под HMAC-ключами с обязательным секретом

Счётчики троттлинга и коды подтверждения обязаны (MUST) храниться в базе только как
HMAC-SHA256 от составного значения, а не в открытом виде; секрет для HMAC —
`REVIEW_RATE_SECRET` (fallback `JWT_SECRET`). При секретe короче 32 символов хелперы
обязаны (MUST) вернуть `503` с кодом недоступности, а троттлинг входа — пропустить запрос.

#### Scenario: Секрет короче порога

- **WHEN** `REVIEW_RATE_SECRET` не задан, а `JWT_SECRET` имеет длину 16 символов
- **THEN** запрос к защищённому хелперу возвращает `503` с соответствующим кодом доступности, и новая строка счётчика не записывается

#### Scenario: Хранение кода подтверждения

- **WHEN** код регистрации сохраняется в `tamir_registration_code`
- **THEN** в колонке `code_hash` лежит HMAC от `registration-code:<challenge_id>:<code>`, а сам шестизначный код в базе отсутствует

#### Scenario: Хранение кода сброса пароля

- **WHEN** код сброса сохраняется в `tamir_password_reset`
- **THEN** в `code_hash` лежит HMAC от `password-reset:<challenge_id>:<code>`
- **AND** в таблице нет ни самого кода, ни IP-адреса запроса

### Requirement: IP клиента определяется по доверенному правилу loopback-peer

Хелпер `clientIp` обязан (MUST) возвращать адрес TCP-пика, когда он не loopback (прямое обращение к порту бэкенда — заголовок `X-Forwarded-For` полностью игнорируется), и только когда пик loopback (nginx на том же хосте) — брать правый элемент цепочки `x-forwarded-for`, оставляя поддельные клиентские записи слева.

#### Scenario: Прямое обращение к бэкенду с поддельным заголовком

- **WHEN** запрос приходит напрямую на публичный порт бэкенда с заголовком `X-Forwarded-For: 8.8.8.8`
- **THEN** в ключи троттлинга попадает реальный пиковый адрес атакующего, а не `8.8.8.8`

#### Scenario: Запрос через локальный nginx

- **WHEN** пик — `127.0.0.1`, а `x-forwarded-for` содержит `1.2.3.4, 5.6.7.8`
- **THEN** клиентским считается правый адрес `5.6.7.8`, добавленный nginx

### Requirement: Turnstile капча проверяет секрет, формат токена, действие и hostname

`verifyCaptcha` обязан (MUST) вернуть `503` `CAPTCHA_UNAVAILABLE`, если `TURNSTILE_SECRET_KEY`
не задан или список `TURNSTILE_HOSTNAMES` пуст (значение по умолчанию `tamir.rs,www.tamir.rs`);
`400` `CAPTCHA_REQUIRED` — если токен не строка, пуст или длиннее 2048 символов;
`503` `CAPTCHA_UNAVAILABLE` — при сетевой ошибке или не-2xx ответе Cloudflare (таймаут 10 с);
`400` `CAPTCHA_FAILED` — при `success: false`, несовпадении `action` или hostname вне allowlist.

#### Scenario: Токен выпущен для другого действия

- **WHEN** в `POST /store/registration/start` приходит валидный токен Turnstile с action `review`
- **THEN** проверка `result.action !== "register"` даёт `400` с кодом `CAPTCHA_FAILED`, и код регистрации не выпускается
- **AND** проверка выполнена POST-запросом на `https://challenges.cloudflare.com/turnstile/v0/siteverify` с `AbortSignal.timeout(10000)`

#### Scenario: Сервис капчи недоступен

- **WHEN** Cloudflare отвечает `500` или запрос к `siteverify` прерван по таймауту
- **THEN** `verifyCaptcha` бросает ошибку `503` с кодом `CAPTCHA_UNAVAILABLE`, и операция не выполняется

### Requirement: Секреты аутентификации и флаги cookie задаёт medusa-config с валидацией

`backend/medusa-config.ts` обязан (MUST) загружать `JWT_SECRET` и `COOKIE_SECRET` только как
приватные случайные значения длиной не менее 32 символов — при коротком значении или подстроке
`replace|changeme|supersecret|placeholder` конфиг обязан (MUST) упасть при старте;
`cookieOptions` обязаны (MUST) быть `sameSite: "lax"` с флагом `secure` по умолчанию в
`production` и переопределяемым через `COOKIE_SECURE=true|false`.

#### Scenario: Placeholder-секрет в окружении

- **WHEN** `JWT_SECRET` равен `supersecretvalue1234567890abcdef`
- **THEN** загрузка конфига завершается ошибкой валидации, и сервер не поднимается

#### Scenario: Локальная разработка без HTTPS

- **WHEN** `NODE_ENV=development` и `COOKIE_SECURE=false`
- **THEN** auth-cookie выдаются без флага `Secure`, сохраняя `sameSite=lax`
