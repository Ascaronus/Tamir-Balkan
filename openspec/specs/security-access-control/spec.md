# security-access-control Specification

## Purpose
Фиксирует текущий уровень безопасности tamir.rs: маршрутную таблицу middleware с аутентификацией и лимитами тела запросов, блокировку legacy-регистрации, троттлинг входа, HMAC-хэширование счётчиков, доверенное определение IP клиента, проверку капчи и security-заголовки витрины.

## Requirements

### Requirement: The middleware route table assigns authentication and body limits

Middleware-конфигурация backend обязана (MUST) назначать аутентификацию и лимиты тела
по каждому маршруту отдельно (через `defineMiddlewares` с массивом `routes`): все
`/admin/**` кастомные маршруты требуют токен администратора, маршруты записи отзывов —
токен покупателя, публичные GET-маршруты пропускают неаутентифицированные запросы.

#### Scenario: An admin route without a user token

- **WHEN** запрос к `/admin/rozetka/sync` приходит без bearer/session-токена администратора
- **THEN** middleware аутентификации отклоняет запрос до выполнения обработчика импорта

#### Scenario: The public review list

- **WHEN** неаутентифицированный посетитель вызывает `GET /store/reviews?product_id=prod_x`
- **THEN** middleware пропускает запрос (режим `allowUnauthenticated`), а `POST /store/reviews` от того же посетителя отклоняется как неаутентифицированный

#### Scenario: The contents of the route table

- **WHEN** модуль экспортирует конфигурацию по умолчанию
- **THEN** в `routes` описаны matchers `/admin/products/:id/localized-url` (методы `GET`, `POST`), `/admin/products/:id/option-translations/translate` (`POST`), `/admin/rozetka*`, `/store/catalog/products` (`GET`), `/auth/customer/:provider/register` (`POST`), `/auth/customer/emailpass` (`POST`), `/store/customers` (`POST`), `/store/reviews` (`POST` и `GET`), `/store/reviews/:id/vote` (`POST`) и `/admin/reviews*`
- **AND** глобальный массив `middlewares` в вызове `defineMiddlewares` не задан

### Requirement: Both legacy customer registration routes return 403

Таблица middleware обязана (MUST) закрывать обход подтверждения e-mail: обработчик `verifiedRegistrationRequired` обязан (MUST) стоять перед `POST /store/customers` и `POST /auth/customer/:provider/register` и возвращать `403` с телом `{"code": "EMAIL_VERIFICATION_REQUIRED", "message": "EMAIL_VERIFICATION_REQUIRED"}`.

#### Scenario: Attempting to register through the legacy route

- **WHEN** клиент отправляет `POST /auth/customer/emailpass/register` с валидным payload
- **THEN** ответ возвращает статус `403` с кодом `EMAIL_VERIFICATION_REQUIRED`, и идентичность не создаётся

### Requirement: Login brute-force protection counts only failures and never denies on its own

Middleware `loginRateLimit` обязана (MUST) защищать `POST /auth/customer/emailpass`: перед аутентификацией проверять счётчики `tamir_login_rate` и при достижении пределов (5 неудач на связку e-mail+IP, 30 на IP за час) отвечать `429` `TOO_MANY_REQUESTS` с полем `retry_after`; увеличивать счётчики обязан (MUST) только для ответов `400`/`401`, а при сбое самой защиты (отсутствующий секрет, недоступная БД) — пропускать запрос (fail-open) с записью в лог.

#### Scenario: Successful logins do not affect the limit

- **WHEN** пользователь многократно успешно аутентифицируется (ответы `200`)
- **THEN** счётчики `login-email:*`/`login-ip:*` не создаются, и вход не блокируется

#### Scenario: The counters database is unavailable

- **WHEN** запрос к таблице `tamir_login_rate` завершается ошибкой
- **THEN** middleware логирует сбой и вызывает `next()`, не превращая сбой троттлинга в отказ входа

### Requirement: Counters and codes are stored under HMAC keys with a mandatory secret

Счётчики троттлинга и коды подтверждения обязаны (MUST) храниться в базе только как
HMAC-SHA256 от составного значения, а не в открытом виде; секрет для HMAC —
`REVIEW_RATE_SECRET` (fallback `JWT_SECRET`). При секретe короче 32 символов хелперы
обязаны (MUST) вернуть `503` с кодом недоступности, а троттлинг входа — пропустить запрос.

#### Scenario: The secret is shorter than the threshold

- **WHEN** `REVIEW_RATE_SECRET` не задан, а `JWT_SECRET` имеет длину 16 символов
- **THEN** запрос к защищённому хелперу возвращает `503` с соответствующим кодом доступности, и новая строка счётчика не записывается

#### Scenario: Storing the verification code

- **WHEN** код регистрации сохраняется в `tamir_registration_code`
- **THEN** в колонке `code_hash` лежит HMAC от `registration-code:<challenge_id>:<code>`, а сам шестизначный код в базе отсутствует

#### Scenario: Storing the password reset code

- **WHEN** код сброса сохраняется в `tamir_password_reset`
- **THEN** в `code_hash` лежит HMAC от `password-reset:<challenge_id>:<code>`
- **AND** в таблице нет ни самого кода, ни IP-адреса запроса

### Requirement: The client IP is resolved by the trusted loopback-peer rule

Хелпер `clientIp` обязан (MUST) возвращать адрес TCP-пика, когда он не loopback (прямое обращение к порту бэкенда — заголовок `X-Forwarded-For` полностью игнорируется), и только когда пик loopback (nginx на том же хосте) — брать правый элемент цепочки `x-forwarded-for`, оставляя поддельные клиентские записи слева.

#### Scenario: A direct backend request with a spoofed header

- **WHEN** запрос приходит напрямую на публичный порт бэкенда с заголовком `X-Forwarded-For: 8.8.8.8`
- **THEN** в ключи троттлинга попадает реальный пиковый адрес атакующего, а не `8.8.8.8`

#### Scenario: A request through the local nginx

- **WHEN** пик — `127.0.0.1`, а `x-forwarded-for` содержит `1.2.3.4, 5.6.7.8`
- **THEN** клиентским считается правый адрес `5.6.7.8`, добавленный nginx

### Requirement: Turnstile captcha validates the secret, token format, action and hostname

`verifyCaptcha` обязан (MUST) вернуть `503` `CAPTCHA_UNAVAILABLE`, если `TURNSTILE_SECRET_KEY`
не задан или список `TURNSTILE_HOSTNAMES` пуст (значение по умолчанию `tamir.rs,www.tamir.rs`);
`400` `CAPTCHA_REQUIRED` — если токен не строка, пуст или длиннее 2048 символов;
`503` `CAPTCHA_UNAVAILABLE` — при сетевой ошибке или не-2xx ответе Cloudflare (таймаут 10 с);
`400` `CAPTCHA_FAILED` — при `success: false`, несовпадении `action` или hostname вне allowlist.

#### Scenario: The token was issued for a different action

- **WHEN** в `POST /store/registration/start` приходит валидный токен Turnstile с action `review`
- **THEN** проверка `result.action !== "register"` даёт `400` с кодом `CAPTCHA_FAILED`, и код регистрации не выпускается
- **AND** проверка выполнена POST-запросом на `https://challenges.cloudflare.com/turnstile/v0/siteverify` с `AbortSignal.timeout(10000)`

#### Scenario: The captcha service is unavailable

- **WHEN** Cloudflare отвечает `500` или запрос к `siteverify` прерван по таймауту
- **THEN** `verifyCaptcha` бросает ошибку `503` с кодом `CAPTCHA_UNAVAILABLE`, и операция не выполняется

### Requirement: medusa-config sets auth secrets and cookie flags with validation

`backend/medusa-config.ts` обязан (MUST) загружать `JWT_SECRET` и `COOKIE_SECRET` только как
приватные случайные значения длиной не менее 32 символов — при коротком значении или подстроке
`replace|changeme|supersecret|placeholder` конфиг обязан (MUST) упасть при старте;
`cookieOptions` обязаны (MUST) быть `sameSite: "lax"` с флагом `secure` по умолчанию в
`production` и переопределяемым через `COOKIE_SECURE=true|false`.

#### Scenario: A placeholder secret in the environment

- **WHEN** `JWT_SECRET` равен `supersecretvalue1234567890abcdef`
- **THEN** загрузка конфига завершается ошибкой валидации, и сервер не поднимается

#### Scenario: Local development without HTTPS

- **WHEN** `NODE_ENV=development` и `COOKIE_SECURE=false`
- **THEN** auth-cookie выдаются без флага `Secure`, сохраняя `sameSite=lax`

### Requirement: The storefront serves security headers on every route

`frontend/next.config.ts` обязан (MUST) через `headers()` назначать на правиле `/:path*`
набор security-заголовков: `Content-Security-Policy`, `X-Content-Type-Options: nosniff`,
`X-Frame-Options: DENY`, `Referrer-Policy: strict-origin-when-cross-origin`,
`Permissions-Policy` (запрещены `camera`, `microphone`, `geolocation`, `payment`, `usb`,
`interest-cohort`), `Cross-Origin-Opener-Policy: same-origin` и
`X-Permitted-Cross-Domain-Policies: none`; там же обязан (MUST) стоять
`poweredByHeader: false`, чтобы Next не публиковал `X-Powered-By`.
Базовые директивы CSP обязаны (MUST) быть `default-src 'self'`, `frame-ancestors 'none'`,
`base-uri 'self'`, `form-action 'self'`, `font-src 'self'`; внешние origin в CSP обязаны (MUST)
ограничиваться тем, что витрина грузит фактически: `https://www.googletagmanager.com` (GA4 после
согласия), `https://challenges.cloudflare.com` (Turnstile — `script-src`, `connect-src`, `frame-src`)
и origin Store API из `NEXT_PUBLIC_MEDUSA_BACKEND_URL` (`connect-src`, `img-src`).

#### Scenario: Headers arrive on both a successful page and a route error

- **WHEN** браузер запрашивает существующий маршрут витрины и несуществующий
- **THEN** оба ответа содержат `Content-Security-Policy`, `X-Frame-Options: DENY` и `X-Content-Type-Options: nosniff`
- **AND** ни один ответ не содержит `X-Powered-By`

#### Scenario: HSTS does not extend to subdomains

- **WHEN** витрина отвечает в `production`
- **THEN** приходит `Strict-Transport-Security: max-age=31536000` без `includeSubDomains`, поэтому правило браузера не затрагивает `vpn.tamir.rs`
- **AND** в `development` этот заголовок не отправляется, потому что локальная витрина отвечает по `http://localhost`

#### Scenario: CSP allows only the images that next/image loads

- **WHEN** в `images.remotePatterns` описан удалённый origin
- **THEN** директива `img-src` разрешает этот же origin

#### Scenario: The inline script keeps working

- **WHEN** CSP собран для `production`
- **THEN** `script-src` и `style-src` содержат `'unsafe-inline'` (инлайновый бутстрап роутера Next, JSON-LD товара и inline-стили Tailwind), но не содержат `'unsafe-eval'`
- **AND** в `development` `'unsafe-eval'` добавляется, потому что HMR-раннер `next dev` исполняет модули через `eval`

