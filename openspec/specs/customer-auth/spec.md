# customer-auth Specification

## Purpose
Фиксирует текущий механизм авторизации покупателей tamir.rs: UX входа в шапке (кнопка входа, модальное окно, имя и меню аккаунта), вход через BFF с httpOnly-кукой сессии, e-mail-подтверждение регистрации с HMAC-хэшируемыми кодами, блокировку legacy-регистрации, сброс пароля и троттлинг входа.

## Requirements

### Requirement: Registration start validates data, limits and captcha in a fixed order

`POST /store/registration/start` обязана (MUST) обрабатывать запросы строго в порядке: валидация e-mail, общий rate-limit по IP с ключом `registration-send-ip` (30 запросов), капча Turnstile с действием `register`, rate-limit по нормализованному e-mail с ключом `registration-send-email` (5 запросов), и только затем выпуск кода через `issueCode`; сбой любого шага прерывает обработку до отправки письма.

#### Scenario: Sending IP limit exceeded

- **WHEN** с одного IP за скользящийся час выпущено более 30 кодов регистрации
- **THEN** ответ возвращает статус `429` с кодом `TOO_MANY_REQUESTS`, и письмо не отправляется

#### Scenario: Captcha not provided

- **WHEN** запрос стартa регистрации проходит лимиты, но не содержит валидного токена Turnstile для действия `register`
- **THEN** ответ возвращает статус `400` с кодом `CAPTCHA_REQUIRED` до обращения к лимиту по e-mail

### Requirement: Registration code issuance hashes the code and limits repeat sends

`issueCode` обязана (MUST) выпускать 6-значный код со сроком действия 600000 мс, идентификатором `challenge_id` из 64 hex-символов и хранить только HMAC-хэш по ключу `registration-code:<challenge_id>:<code>`; повторная отправка ранее 60 секунд обязана (MUST) возвращать `429` с кодом `CODE_COOLDOWN`, а выпуск выполняться под advisory-блокировкой `78321`, и при сбое SMTP транзакция откатывает выпуск кода.

#### Scenario: Repeat send inside the cooldown window

- **WHEN** тот же e-mail запрашивает новый код через 30 секунд после предыдущего выпуска
- **THEN** ответ возвращает статус `429` с телом `{"code": "CODE_COOLDOWN", "message": "CODE_COOLDOWN"}`, и новое письмо не отправляется

#### Scenario: SMTP unavailable

- **WHEN** отправка письма с кодом завершается ошибкой
- **THEN** транзакция откатывает выпуск кода, прежний действующий код сохраняется, и клиент получает `503` с кодом `CODE_SEND_FAILED`

### Requirement: Registration code verification activates the customer idempotently

`POST /store/registration/verify` должна (MUST) сначала применить rate-limit `registration-verify`
(60 запросов в час на IP), затем проверить формат (`challenge_id` по `^[a-f0-9]{64}$`, `code` не длиннее
32 символов, иначе `CODE_INVALID`) и вызвать `confirmCode`: просроченный или отсутствующий вызов даёт
`CODE_EXPIRED`, а несовпадение кода даёт `CODE_INVALID` и `CODE_ATTEMPTS` при `attempts >= 5`. Счётчик
неудач должен (MUST) фиксироваться в БД даже при ошибочном ответе.

#### Scenario: Five incorrect codes

- **WHEN** с правильным `challenge_id` пять раз подряд отправлен неверный 6-значный код
- **THEN** четвёртый ответ — `400` `CODE_INVALID`, пятый и последующие — `400` `CODE_ATTEMPTS`, и каждое увеличение `attempts` сохранено в таблице

#### Scenario: Repeating a successful verification

- **WHEN** клиент повторно отправляет верный код после уже выполненной активации
- **THEN** `activateRegistration` получает сохранённый `customer_id`, создаётся тот же покупатель, и ответ снова `{"verified": true}`

### Requirement: Legacy registration without e-mail confirmation is blocked

Middleware-конфигурация обязана (MUST) перехватывать оба встроенных маршрута регистрации покупателя — `POST /store/customers` и `POST /auth/customer/:provider/register` — возвращая `403` с кодом `EMAIL_VERIFICATION_REQUIRED`, чтобы создание аккаунта было возможно только через поток `registration/start` + `registration/verify`.

#### Scenario: Direct call to Medusa registration

- **WHEN** клиент отправляет `POST /store/customers` с e-mail и паролем напрямую
- **THEN** ответ возвращает статус `403` с кодом `EMAIL_VERIFICATION_REQUIRED`, и учётная запись не создаётся

### Requirement: Password reset start finds only a store-profile customer

`POST /store/password-reset/start` должна (MUST) идти в фиксированном порядке: e-mail, rate-limit
`password-reset-send-ip` (30), капча с действием `password_reset`, rate-limit
`password-reset-send-email` (5), `issuePasswordReset` под advisory-блокировкой `78322`; неизвестному
адресу должен (MUST) возвращаться тот же публичный ответ без письма.

#### Scenario: Unknown or guest e-mail

- **WHEN** запрос сброса приходит на адрес без подтверждённого аккаунта покупателя
- **THEN** ответ содержит `challenge_id`, `expires_at`, `retry_after: 60`, но письмо не отправляется и в `tamir_password_reset` запись остаётся без `customer_id`

#### Scenario: Identity is linked to an admin user

- **WHEN** у auth-идентичности в `app_metadata` есть ключи кроме `customer_id`
- **THEN** `resetTarget` возвращает `null`, и код для этого адреса не отправляется

#### Scenario: Password is tied to the provider hash

- **WHEN** `resetTarget` ищет пару `provider_identity` с `provider: "emailpass"` и клиента с `has_account: true`
- **THEN** совпадение считается по `lower(p.entity_id)` и `lower(c.email)`, а строки с `deleted_at` отброшены
- **THEN** `password_version` равно SHA-256 от `provider_metadata.password`, и `null` возвращается, если это не строка

### Requirement: Password reset completion checks the code and target state at `password-reset/verify`

`POST /store/password-reset/verify` должна (MUST) применить rate-limit `password-reset-verify`
(60 в час на IP), отклонить пароль вне диапазона 8–256 символов кодом `PASSWORD_INVALID`, отклонить
использованный код (`consumed_at`) кодом `CODE_USED`, повторно сверить `resetTarget` с сохранёнными
`auth_identity_id`, `customer_id` и `password_version` (расхождение — `CODE_EXPIRED`) и затем вызвать
`Modules.AUTH.updateProvider("emailpass")`.

#### Scenario: Code reuse

- **WHEN** верный код отправляется второй раз после успешного сброса
- **THEN** ответ возвращает статус `400` с кодом `CODE_USED`, и пароль не меняется повторно

#### Scenario: Password too short

- **WHEN** `password` содержит 7 символов
- **THEN** ответ возвращает статус `400` с кодом `PASSWORD_INVALID`, и код-челлендж не расходуется

#### Scenario: The emailpass provider did not accept the password

- **WHEN** `Modules.AUTH.updateProvider("emailpass", { entity_id, password })` вернул `success: false`
- **THEN** ответ возвращает статус `503` с кодом `RESET_UNAVAILABLE`, и `consumed_at` не проставляется
- **WHEN** обновление провайдера прошло успешно
- **THEN** ответ равен `{"success": true}`, а строка челленджа помечена `consumed_at`

### Requirement: Sign-in is throttled on failed attempts without denying service

Middleware `loginRateLimit` на `POST /auth/customer/emailpass` должна (MUST) хранить счётчики неудач в
таблице `tamir_login_rate` под HMAC-ключами `login-email:hmac(email|ip)` (предел
`LOGIN_EMAIL_FAIL_LIMIT = 5`) и `login-ip:hmac(ip)` (предел `LOGIN_IP_FAIL_LIMIT = 30`) со скользящим
часовым окном, учитывать только ответы `400`/`401` и отвечать `429` `TOO_MANY_REQUESTS` с полем
`retry_after`.

#### Scenario: E-mail failure limit exceeded

- **WHEN** с комбинации e-mail+IP поступило 5 ответов `401` в течение часа
- **THEN** следующий запрос входа немедленно получает `429` `TOO_MANY_REQUESTS` с числовым `retry_after`, не доходя до аутентификации

#### Scenario: Throttling secret is not configured

- **WHEN** `REVIEW_RATE_SECRET` и `JWT_SECRET` отсутствуют или короче 32 символов
- **THEN** middleware логирует проблему и пропускает запрос дальше (fail-open), сохраняя доступность входа

### Requirement: Header sign-in button for an unauthenticated visitor

Для неавторизованного посетителя в шапке SHALL отображаться кнопка с иконкой пользователя и подписью «Prijavi se» (sr) / «Sign in» (en) из ключа `auth.login.signIn`, с `aria-haspopup="dialog"`. Нажатие SHALL открывать модальное окно входа поверх текущей страницы: URL SHALL NOT меняться, страница SHALL NOT перезагружаться, высота шапки SHALL оставаться неизменной. Кнопка SHALL быть недоступна до завершения первоначальной проверки сессии (`isReady`).

#### Scenario: Guest sees the sign-in button

- **WHEN** неавторизованный посетитель открывает любую страницу магазина
- **THEN** в шапке отображается кнопка «Prijavi se» / «Sign in» с иконкой пользователя
- **AND** элементы имени пользователя и меню аккаунта отсутствуют

#### Scenario: Sign-in dialog opens without changing the page

- **WHEN** посетитель нажимает кнопку «Prijavi se» / «Sign in»
- **THEN** открывается модальное окно входа поверх текущей страницы
- **AND** URL не меняется и страница не перезагружается

#### Scenario: Sign-in without losing the current location

- **WHEN** посетитель успешно входит из окна, открытого на произвольной публичной странице (например, карточке товара)
- **THEN** окно закрывается, посетитель остаётся на той же странице
- **AND** шапка без перезагрузки заменяет кнопку входа на имя пользователя

### Requirement: Sign-in modal

Окно входа SHALL использовать нативный `<dialog>` с `showModal()` поверх затемняющего backdrop. Ширина на desktop SHALL быть 440 px, на узких экранах — `calc(100vw − 32px)` с ограничением высоты по вьюпорту и внутренней прокруткой. При открытии фокус SHALL переходить на поле e-mail, прокрутка страницы SHALL блокироваться на время открытого окна. В заголовке SHALL быть `h2` с текстом «Prijava» / «Sign in» (`aria-labelledby` диалога) и кнопка закрытия крестиком с локализованной подписью.

#### Scenario: Focus and scroll lock on open

- **WHEN** посетитель открывает окно входа из шапки, страницы избранного или блока отзывов
- **THEN** фокус установлен в поле «Email adresa» / «Email address»
- **AND** прокрутка страницы заблокирована, фон за окном затемнён

#### Scenario: Contents of the sign-in dialog

- **WHEN** окно входа открыто
- **THEN** отображаются поля e-mail и пароля, ссылка «Zaboravili ste lozinku?» / «Forgot password?» на страницу сброса пароля, кнопка отправки «Prijavi se» / «Sign in» и кнопка «Registruj se» / «Sign up»
- **AND** над формой может отображаться подсказка контекста (например, «Prijavite se da sačuvate proizvod.» для избранного)

### Requirement: Sign-up button in the sign-in dialog

В окне входа SHALL присутствовать кнопка «Registruj se» / «Sign up» (`auth.login.signUp`) вторичного стиля, ведущая на существующую страницу регистрации `/{lang}/account/registracija|register` через локализованную ссылку. Переход SHALL закрывать окно; требования регистрации (код доступа, лимиты, подтверждение e-mail) SHALL оставаться неизменными. На полностраничной форме вместо кнопки SHALL отображаться подпись «Нет аккаунта?» со ссылкой «Создать».

#### Scenario: Navigating to registration from the modal

- **WHEN** посетитель нажимает «Registruj se» в окне входа, открытом в локе `/rs`
- **THEN** выполняется переход на `/rs/nalog/registracija` (в локе `/en` — `/en/account/register`)
- **AND** окно входа закрывается при переходе

#### Scenario: The modal does not change registration logic

- **WHEN** посетитель завершает регистрацию на странице регистрации
- **THEN** применяются существующие требования регистрации этой спецификации
- **AND** модалка входа не влияет на эти проверки

### Requirement: Sign-in is performed through the existing BFF

Вход SHALL выполняться через `POST /api/auth/login` (прокси в Medusa `POST /auth/customer/emailpass`). Сессия SHALL храниться в httpOnly-куке `tb_customer_session` с `sameSite=lax`, `secure` в production и `maxAge` по `exp` токена (не более 30 суток); JWT SHALL NOT попадать в браузерное хранилище. Ограничения и троттлинг существующей спецификации SHALL оставаться без изменений. Успешный вход SHALL загружать профиль покупателя и обновлять состояние авторизации.

#### Scenario: Successful sign-in

- **WHEN** посетитель отправляет корректные e-mail и пароль
- **THEN** BFF устанавливает httpOnly-куку `tb_customer_session`, профиль покупателя загружен
- **AND** в модальном режиме окно закрывается, в шапке отображается имя пользователя; в полностраничном — переход на `/{lang}/account` (или `/{lang}/checkout` при `?next=checkout`)

#### Scenario: Invalid credentials error

- **WHEN** отправлены неверные e-mail или пароль
- **THEN** отображается локализованное сообщение `auth.login.failed` («Neuspela prijava»), для `429` — `auth.login.tooMany`, для отсутствующего профиля — `auth.login.profileMissing`
- **AND** окно остаётся открытым, введённые e-mail и пароль сохраняются в полях
- **AND** технические детали (код ошибки бэкенда, стектрейсы) не отображаются

#### Scenario: Submitting state

- **WHEN** запрос входа выполняется
- **THEN** кнопка переведена в состояние загрузки («Prijavljivanje…» / «Signing in…») и заблокирована, повторная отправка исключена рефлагом `submitting`

#### Scenario: Direct sign-in URL, full-page form

- **WHEN** посетитель открывает `/rs/nalog/prijava` или `/en/account/login`
- **THEN** отображается полностраничная форма входа (`LoginForm` без модальности), а не диалог
- **AND** параметр `?next=checkout` сохраняет переход в оформление после успешного входа

### Requirement: Customer name in the header

Для авторизованного покупателя вместо подписи входа SHALL отображаться имя по цепочке приоритетов: `first_name` → `display_name` → `metadata.display_name` → префикс e-mail до `@`; при пустом результате — «Moj nalog» / «My account». Длинные имена SHALL усекаться средствами CSS без изменения высоты шапки, полное имя SHALL дублироваться в `title`.

#### Scenario: Name is shown after sign-in

- **WHEN** вход выполнен успешно
- **THEN** в шапке вместо «Prijavi se» / «Sign in» отображается имя по цепочке приоритетов
- **AND** длинные имена усечены, высота шапки не изменилась

#### Scenario: Name fallback for a customer without a name

- **WHEN** у покупателя нет `first_name`, `display_name` и `metadata.display_name`
- **THEN** отображается префикс e-mail до символа `@`
- **AND** если e-mail тоже пуст, отображается «Moj nalog» / «My account»

### Requirement: Account menu in the header

Рядом с именем SHALL находиться меню аккаунта: «Moj nalog» / «My account» → `?panel=profile`, «Moje porudžbine» / «My orders» → `?panel=orders` (обе ссылки ведут на существующую страницу аккаунта и локализуются как `/rs/nalog?panel=...` / `/en/account?panel=...`), «Odjavi se» / «Sign out» → существующий `POST /api/auth/logout`. Меню SHALL открываться наведением мыши или кликом по имени и SHALL закрываться по Escape, клику вне меню или потере фокуса; новых маршрутов меню добавлять SHALL NOT.

#### Scenario: Menu for an authenticated customer

- **WHEN** авторизованный покупатель наводит курсор или кликает по имени в шапке
- **THEN** доступны ссылки «Moj nalog» → `/rs/account?panel=profile` и «Moje porudžbine» → `/rs/account?panel=orders` (en: `/en/account?panel=profile`, `/en/account?panel=orders`) и кнопка «Odjavi se»
- **AND** новых маршрутов не появляется

#### Scenario: Menu closes

- **WHEN** покупатель нажимает Escape, кликает вне меню или меню теряет фокус
- **THEN** меню закрывается, состояние авторизации не меняется

#### Scenario: Signing out of the account

- **WHEN** покупатель нажимает «Odjavi se» / «Sign out»
- **THEN** выполняется `POST /api/auth/logout`, кука сессии удаляется, меню закрывается, фокус возвращается на кнопку имени
- **AND** в шапке снова отображается кнопка «Prijavi se» / «Sign in»
- **AND** при сбое выхода отображается `headerAuth.logoutFailed` с `role="alert"`, состояние входа сохраняется

### Requirement: Auth state is preserved after a reload

Состояние авторизации SHALL восстанавливаться при инициализации `AuthProvider` запросом профиля по httpOnly-куке сессии; ключи старых версий (JWT в браузерном хранилище) SHALL удаляться. Временный сбой бэкенда SHALL NOT очищать куку и SHALL NOT показывать ошибку покупателю.

#### Scenario: Reloading an authenticated session

- **WHEN** авторизованный покупатель перезагружает страницу
- **THEN** после восстановления сессии в шапке снова отображается имя пользователя, а не кнопка входа

#### Scenario: Guest state returns after sign-out

- **WHEN** покупатель выходит из аккаунта и перезагружает страницу
- **THEN** в шапке отображается кнопка «Prijavi se» / «Sign in»

### Requirement: Closing the sign-in dialog and focus management

Окно входа SHALL закрываться крестиком в заголовке, клавишей Escape (с перехватом `cancel` у `<dialog>`) и нажатием по затемняющему фону, без потери содержимого страницы. После закрытия (кроме перехода по ссылкам регистрации и сброса пароля) фокус SHALL возвращаться на элемент шапки, открывший окно.

#### Scenario: Closing with Escape and a backdrop click

- **WHEN** посетитель нажимает Escape или нажимает по затемняющему фону открытого окна
- **THEN** окно закрывается
- **AND** фокус возвращается на кнопку шапки, открывшую окно

#### Scenario: Closing with the cross button

- **WHEN** посетитель нажимает кнопку закрытия в заголовке окна
- **THEN** окно закрывается и фокус возвращается на элемент, открывший окно

### Requirement: Localization of auth texts (SR/EN)

Все элементы UX авторизации SHALL использовать ключи `auth.login.*` и `headerAuth.*` из `frontend/src/messages/sr.json` и `en.json` без хардкода строк в компонентах и без незакрытых ключей при рендере.

#### Scenario: Serbian locale

- **WHEN** страница открыта в локе `/rs`
- **THEN** используются тексты «Prijava», «Email adresa», «Lozinka», «Zaboravili ste lozinku?», «Prijavi se», «Prijavljivanje…», «Registruj se», «Moj nalog», «Moje porudžbine», «Odjavi se», «Odjavljivanje…»

#### Scenario: English locale

- **WHEN** страница открыта в локе `/en`
- **THEN** отображаются «Sign in», «Sign up», «Email address», «Password», «Forgot password?», «Signing in…», «My account», «My orders», «Sign out», «Signing out…»

### Requirement: Responsiveness and accessibility of the sign-in dialog

Окно входа SHALL занимать доступную ширину вьюпорта на узких экранах (padding по краям 16 px, на ≤480 px — уменьшенные отступы) и сохранять пропорции 440 px на desktop. SHALL использоваться нативная семантика `<dialog>` с `aria-labelledby`; поля формы SHALL быть обёрнуты в `<label>` с текстовой подписью и `name`/`autocomplete` (`username`, `current-password`); сообщения об ошибках SHALL выводиться с `role="alert"`, кнопка открытия SHALL иметь `aria-haspopup`/`aria-expanded`.

#### Scenario: Mobile width

- **WHEN** окно входа открыто на узком мобильном экране
- **THEN** окно занимает `100vw − 32px`, все поля и кнопки доступны для касания, содержимое прокручивается внутри окна

#### Scenario: Accessibility of dialog elements

- **WHEN** AT анализирует открытое окно входа
- **THEN** элементы представлены как диалог с заголовком, полем e-mail, полем пароля, кнопкой входа и ссылкой регистрации, а сообщение об ошибке — как alert
