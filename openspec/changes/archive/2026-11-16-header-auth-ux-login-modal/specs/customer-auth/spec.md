# Spec Delta: customer-auth

## ADDED Requirements

### Requirement: Header sign-in button for an unauthenticated visitor

Для неавторизованного посетителя в шапке сайта (область `header-actions`) SHALL отображаться кнопка «Prijavi se» (српски) / «Sign in» (английский). Открытие окна входа SHALL происходить без перехода на другую страницу и без перезагрузки текущей; высота шапки SHALL оставаться фиксированной.

#### Scenario: Guest sees the sign-in button

- **WHEN** неавторизованный посетитель открывает главную страницу
- **THEN** в шапке отображается кнопка «Prijavi se» (локаль sr) или «Sign in» (локаль en)
- **AND** в шапке отсутствуют элементы имени пользователя и меню аккаунта

#### Scenario: Sign-in dialog opens without changing the page

- **WHEN** посетитель нажимает кнопку «Prijavi se» / «Sign in»
- **THEN** открывается модальное окно входа поверх текущей страницы
- **AND** URL не меняется и страница не перезагружается

#### Scenario: Sign-in without losing the current location

- **WHEN** посетитель успешно входит в аккаунт из окна, открытого на произвольной публичной странице (например, детальной карточке товара)
- **THEN** окно закрывается, посетитель остаётся на той же странице
- **AND** шапка без перезагрузки заменяет кнопку входа на имя пользователя

### Requirement: Sign-in modal

Окно входа SHALL быть модальным (`<dialog>` с `showModal`) поверх затемняющего фона, поверх всех элементов страницы, ширина на desktop SHALL быть в диапазоне 400–460 px (текущая реализация — 440 px), на mobile — занимать ширину вьюпорта с полями. При открытии фокус SHALL переходить на поле email, прокрутка страницы SHALL блокироваться до закрытия окна.

#### Scenario: Focus and scroll lock on open

- **WHEN** посетитель открывает окно входа из шапки или прямого URL `/rs/nalog/prijava` / `/en/account/login`
- **THEN** фокус установлен в поле «Email adresa» / «Email address»
- **AND** прокрутка страницы заблокирована, фон за окном затемнён

#### Scenario: Contents of the sign-in dialog

- **WHEN** окно входа открыто
- **THEN** отображаются заголовок «Prijava» / «Sign in», поля email и password, кнопка-ссылка «Zaboravili ste lozinku?» / «Forgot password?», кнопка отправки «Prijavi se» / «Sign in» и кнопка «Registruj se» / «Sign up»
- **AND** ссылка «Zaboravili ste lozinku?» ведёт на существующую страницу восстановления пароля (`/rs/nalog/zaboravljena-lozinka` / `/en/account/forgot-password`)

### Requirement: Sign-up button in the sign-in dialog

В окне входа SHALL присутствовать кнопка «Registruj se» / «Sign up» со стилями, идентичными кнопке «Prijavi se» / «Sign in» (вторичный вариант одной ширины), SHALL вести на существующую страницу регистрации без изменения логики кодов доступа и SHALL сохранять локаль.

#### Scenario: Navigating to registration from the modal

- **WHEN** посетитель нажимает «Registruj se» в окне входа, открытом в локе `/rs`
- **THEN** выполняется переход на `/rs/nalog/registracija` (в локе `/en` — `/en/account/register`)
- **AND** окно входа закрывается при переходе

#### Scenario: The modal does not change registration logic

- **WHEN** посетитель завершает регистрацию на странице регистрации
- **THEN** применяются существующие требования `customer-auth`: обязательный код регистрации, проверка кода и лимитов
- **AND** модалка входа не влияет на эти проверки

### Requirement: Sign-in is performed through the existing BFF

Вход из модалки SHALL выполняться через существующий маршрут `POST /api/auth/login` (прокси в Medusa `POST /auth/customer/emailpass`, httpOnly cookie `medusa_customer_session`). Ограничения по кодам регистрации, лимиты и троттлинг существующей спецификации SHALL оставаться без изменений.

#### Scenario: Successful sign-in

- **WHEN** посетитель отправляет корректные email и пароль
- **THEN** BFF возвращает `set-cookie` с httpOnly сессией клиента
- **AND** окно закрывается, в шапке отображается имя пользователя

#### Scenario: Invalid credentials error

- **WHEN** отправлены неверные email или пароль
- **THEN** отображается локализованное сообщение об ошибке в окне входа
- **AND** окно остаётся открытым, введённый email сохраняется, пароль очищается
- **AND** технические детали (код ошибки бэкенда, стектрейсы) не отображаются

#### Scenario: Submitting state

- **WHEN** запрос входа выполняется
- **THEN** кнопка «Prijavi se» / «Sign in» переведена в состояние загрузки и повторная отправка исключена

### Requirement: Customer name in the header

Для авторизованного клиента вместо кнопки входа SHALL отображаться имя: `first_name` → `display_name` → префикс email (до `@`), с усечением длинных имён средствами CSS без изменения высоты шапки. Рядом SHALL быть доступно меню: «Moj nalog» / «My account», «Moje porudžbine» / «My orders», «Odjavi se» / «Sign out» — только на существующих маршрутах аккаунта и существующем `POST /api/auth/logout`.

#### Scenario: Name is shown after sign-in

- **WHEN** вход выполнен успешно
- **THEN** в шапке вместо кнопки «Prijavi se» / «Sign in» отображается имя пользователя по цепочке приоритетов
- **AND** длинные имена усечены, высота шапки не изменилась

#### Scenario: Menu for an authenticated customer

- **WHEN** авторизованный клиент открывает меню имени в шапке
- **THEN** доступны ссылки «Moj nalog» → `/rs/nalog`, «Moje porudžbine» → `/rs/nalog/porudzbine` (en: `/en/account`, `/en/account/orders`) и «Odjavi se»
- **AND** новых маршрутов не появляется

#### Scenario: Signing out of the account

- **WHEN** клиент нажимает «Odjavi se» / «Sign out»
- **THEN** сессия завершается (`POST /api/auth/logout`, cookie удаляется), меню закрывается
- **AND** в шапке снова отображается кнопка «Prijavi se» / «Sign in», содержимое корзины сохраняется

### Requirement: Auth state is preserved after a reload

Состояние авторизации SHALL восстанавливаться при загрузке страницы по httpOnly cookie сессии (запрос `retrieveCustomer` при инициализации `AuthProvider`). После перезагрузки страницы авторизованный клиент SHALL видеть своё имя вместо кнопки входа; после выхода — кнопка входа SHALL возвращаться.

#### Scenario: Reloading an authenticated session

- **WHEN** авторизованный клиент перезагружает страницу
- **THEN** после восстановления сессии в шапке снова отображается имя пользователя, а не кнопка входа

#### Scenario: Guest state returns after sign-out

- **WHEN** клиент выходит из аккаунта и перезагружает страницу
- **THEN** в шапке отображается кнопка «Prijavi se» / «Sign in»

### Requirement: Closing the sign-in dialog and focus management

Окно входа SHALL закрываться крестиком в заголовке, клавишей Escape и кликом по затемняющему фону, без потери состояния страницы. После закрытия фокус SHALL возвращаться на элемент шапки, открывший окно.

#### Scenario: Closing with Escape and a backdrop click

- **WHEN** посетитель нажимает Escape или кликает по затемняющему фону открытого окна
- **THEN** окно закрывается
- **AND** фокус возвращается на кнопку шапки, открывшую окно

#### Scenario: Closing with the cross button

- **WHEN** посетитель нажимает кнопку закрытия в заголовке окна
- **THEN** окно закрывается и фокус возвращается на элемент шапки, открывший окно

### Requirement: Localization of auth texts (SR/EN)

Все элементы UX авторизации SHALL использовать ключи локализации `auth.login.*` и `headerAuth.*` из `frontend/src/messages/sr.json` и `en.json`. Тексты SHALL соответствовать таблице ТЗ (кириллица запрещена, диакритика — по существующей орфографии проекта).

#### Scenario: Texts match the specification table

- **WHEN** открываются кнопка входа, окно входа и меню аккаунта
- **THEN** в локали sr используются: «Prijava», «Email adresa», «Lozinka», «Zaboravili ste lozinku?», «Prijavi se», «Registruj se», «Moj nalog», «Moje porudžbine», «Odjavi se»
- **AND** в локали en: «Sign in», «Email address», «Password», «Forgot password?», «Sign up», «My account», «My orders», «Sign out»

#### Scenario: Serbian locale

- **WHEN** страница открыта в локе `/rs`
- **THEN** кнопка входа, окно входа и меню аккаунта отображаются с текстами «Prijavi se», «Prijava», «Registruj se», «Moj nalog», «Moje porudžbine», «Odjavi se»

#### Scenario: English locale

- **WHEN** страница открыта в локе `/en`
- **THEN** отображаются тексты «Sign in», «Sign up», «Email address», «Password», «Forgot password?», «My account», «My orders», «Sign out»

#### Scenario: No unresolved translation keys

- **WHEN** рендерится любой элемент UX авторизации в любой из двух локалей
- **THEN** все подписи резолвятся из словарей, ключи без перевода не отображаются

### Requirement: Responsiveness and accessibility of the sign-in dialog

Окно входа SHALL занимать всю ширину вьюпорта (с полями) на узких экранах и сохранять пропорции на desktop. SHALL использоваться нативная семантика `<dialog>`; SHALL существовать семантическая разметка полей (`<label htmlFor>`), а сообщения об ошибках SHALL быть доступны AT.

#### Scenario: Mobile width

- **WHEN** окно входа открыто на узком мобильном экране
- **THEN** окно занимает доступную ширину вьюпорта, все поля и кнопки доступны для касания

#### Scenario: Accessibility of dialog elements

- **WHEN** AT анализирует открытое окно входа
- **THEN** элементы представлены как диалог с полем email, полем пароля, кнопкой входа и ссылкой регистрации, а сообщение об ошибке — как alert
