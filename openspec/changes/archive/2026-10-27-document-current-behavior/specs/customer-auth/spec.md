# Spec Delta

## Purpose

Фиксирует текущий механизм регистрации и восстановления доступа покупателей tamir.rs: e-mail-подтверждение с HMAC-хэшируемыми кодами, блокировку legacy-регистрации, сброс пароля и троттлинг входа.

## ADDED Requirements

### Requirement: Старт регистрации проверяет данные, лимиты и капчу по фиксированному порядку

`POST /store/registration/start` обязана (MUST) обрабатывать запросы строго в порядке: валидация e-mail, общий rate-limit по IP с ключом `registration-send-ip` (30 запросов), капча Turnstile с действием `register`, rate-limit по нормализованному e-mail с ключом `registration-send-email` (5 запросов), и только затем выпуск кода через `issueCode`; сбой любого шага прерывает обработку до отправки письма.

#### Scenario: Превышен IP-лимит отправки

- **WHEN** с одного IP за скользящийся час выпущено более 30 кодов регистрации
- **THEN** ответ возвращает статус `429` с кодом `TOO_MANY_REQUESTS`, и письмо не отправляется

#### Scenario: Капча не предоставлена

- **WHEN** запрос стартa регистрации проходит лимиты, но не содержит валидного токена Turnstile для действия `register`
- **THEN** ответ возвращает статус `400` с кодом `CAPTCHA_REQUIRED` до обращения к лимиту по e-mail

### Requirement: Выпуск кода регистрации хэширует код и ограничивает повторные отправки

`issueCode` обязана (MUST) выпускать 6-значный код со сроком действия 600000 мс, идентификатором `challenge_id` из 64 hex-символов и хранить только HMAC-хэш по ключу `registration-code:<challenge_id>:<code>`; повторная отправка ранее 60 секунд обязана (MUST) возвращать `429` с кодом `CODE_COOLDOWN`, а выпуск выполняться под advisory-блокировкой `78321`, и при сбое SMTP транзакция откатывает выпуск кода.

#### Scenario: Повторная отправка в окне кулдауна

- **WHEN** тот же e-mail запрашивает новый код через 30 секунд после предыдущего выпуска
- **THEN** ответ возвращает статус `429` с телом `{"code": "CODE_COOLDOWN", "message": "CODE_COOLDOWN"}`, и новое письмо не отправляется

#### Scenario: SMTP недоступен

- **WHEN** отправка письма с кодом завершается ошибкой
- **THEN** транзакция откатывает выпуск кода, прежний действующий код сохраняется, и клиент получает `503` с кодом `CODE_SEND_FAILED`

### Requirement: Верификация кода регистрации активирует покупателя идемпотентно

`POST /store/registration/verify` должна (MUST) сначала применить rate-limit `registration-verify`
(60 запросов в час на IP), затем проверить формат (`challenge_id` по `^[a-f0-9]{64}$`, `code` не длиннее
32 символов, иначе `CODE_INVALID`) и вызвать `confirmCode`: просроченный или отсутствующий вызов даёт
`CODE_EXPIRED`, а несовпадение кода даёт `CODE_INVALID` и `CODE_ATTEMPTS` при `attempts >= 5`. Счётчик
неудач должен (MUST) фиксироваться в БД даже при ошибочном ответе.

#### Scenario: Пять неверных кодов

- **WHEN** с правильным `challenge_id` пять раз подряд отправлен неверный 6-значный код
- **THEN** четвёртый ответ — `400` `CODE_INVALID`, пятый и последующие — `400` `CODE_ATTEMPTS`, и каждое увеличение `attempts` сохранено в таблице

#### Scenario: Повтор успешной верификации

- **WHEN** клиент повторно отправляет верный код после уже выполненной активации
- **THEN** `activateRegistration` получает сохранённый `customer_id`, создаётся тот же покупатель, и ответ снова `{"verified": true}`

### Requirement: Legacy-регистрация без подтверждения e-mail заблокирована

Middleware-конфигурация обязана (MUST) перехватывать оба встроенных маршрута регистрации покупателя — `POST /store/customers` и `POST /auth/customer/:provider/register` — возвращая `403` с кодом `EMAIL_VERIFICATION_REQUIRED`, чтобы создание аккаунта было возможно только через поток `registration/start` + `registration/verify`.

#### Scenario: Прямой вызов Medusa-регистрации

- **WHEN** клиент отправляет `POST /store/customers` с e-mail и паролем напрямую
- **THEN** ответ возвращает статус `403` с кодом `EMAIL_VERIFICATION_REQUIRED`, и учётная запись не создаётся

### Requirement: Старт сброса пароля находит только покупателя-магазинного профиля

`POST /store/password-reset/start` должна (MUST) идти в фиксированном порядке: e-mail, rate-limit
`password-reset-send-ip` (30), капча с действием `password_reset`, rate-limit
`password-reset-send-email` (5), `issuePasswordReset` под advisory-блокировкой `78322`; неизвестному
адресу должен (MUST) возвращаться тот же публичный ответ без письма.

#### Scenario: Неизвестный или гостевой e-mail

- **WHEN** запрос сброса приходит на адрес без подтверждённого аккаунта покупателя
- **THEN** ответ содержит `challenge_id`, `expires_at`, `retry_after: 60`, но письмо не отправляется и в `tamir_password_reset` запись остаётся без `customer_id`

#### Scenario: Идентичность связана с администратором

- **WHEN** у auth-идентичности в `app_metadata` есть ключи кроме `customer_id`
- **THEN** `resetTarget` возвращает `null`, и код для этого адреса не отправляется

#### Scenario: Пароль привязывается к хэшу провайдера

- **WHEN** `resetTarget` ищет пару `provider_identity` с `provider: "emailpass"` и клиента с `has_account: true`
- **THEN** совпадение считается по `lower(p.entity_id)` и `lower(c.email)`, а строки с `deleted_at` отброшены
- **THEN** `password_version` равно SHA-256 от `provider_metadata.password`, и `null` возвращается, если это не строка

### Requirement: Завершение сброса пароля проверяет код и состояние цели на `password-reset/verify`

`POST /store/password-reset/verify` должна (MUST) применить rate-limit `password-reset-verify`
(60 в час на IP), отклонить пароль вне диапазона 8–256 символов кодом `PASSWORD_INVALID`, отклонить
использованный код (`consumed_at`) кодом `CODE_USED`, повторно сверить `resetTarget` с сохранёнными
`auth_identity_id`, `customer_id` и `password_version` (расхождение — `CODE_EXPIRED`) и затем вызвать
`Modules.AUTH.updateProvider("emailpass")`.

#### Scenario: Повторное использование кода

- **WHEN** верный код отправляется второй раз после успешного сброса
- **THEN** ответ возвращает статус `400` с кодом `CODE_USED`, и пароль не меняется повторно

#### Scenario: Пароль слишком короткий

- **WHEN** `password` содержит 7 символов
- **THEN** ответ возвращает статус `400` с кодом `PASSWORD_INVALID`, и код-челлендж не расходуется

#### Scenario: Провайдер emailpass не принял пароль

- **WHEN** `Modules.AUTH.updateProvider("emailpass", { entity_id, password })` вернул `success: false`
- **THEN** ответ возвращает статус `503` с кодом `RESET_UNAVAILABLE`, и `consumed_at` не проставляется
- **WHEN** обновление провайдера прошло успешно
- **THEN** ответ равен `{"success": true}`, а строка челленджа помечена `consumed_at`

### Requirement: Вход throttled по неудачным попыткам без отказа сервиса

Middleware `loginRateLimit` на `POST /auth/customer/emailpass` должна (MUST) хранить счётчики неудач в
таблице `tamir_login_rate` под HMAC-ключами `login-email:hmac(email|ip)` (предел
`LOGIN_EMAIL_FAIL_LIMIT = 5`) и `login-ip:hmac(ip)` (предел `LOGIN_IP_FAIL_LIMIT = 30`) со скользящим
часовым окном, учитывать только ответы `400`/`401` и отвечать `429` `TOO_MANY_REQUESTS` с полем
`retry_after`.

#### Scenario: Превышен лимит неудач по e-mail

- **WHEN** с комбинации e-mail+IP поступило 5 ответов `401` в течение часа
- **THEN** следующий запрос входа немедленно получает `429` `TOO_MANY_REQUESTS` с числовым `retry_after`, не доходя до аутентификации

#### Scenario: Секрет троттлинга не настроен

- **WHEN** `REVIEW_RATE_SECRET` и `JWT_SECRET` отсутствуют или короче 32 символов
- **THEN** middleware логирует проблему и пропускает запрос дальше (fail-open), сохраняя доступность входа
