# Предложение: UX авторизации в шапке и модальное окно входа (TB-13)

## Why

По ТЗ (YouTrack TB-13) неавторизованный клиент должен входить и регистрироваться, не покидая текущей страницы: в шапке — кнопка «Prijavi se» / «Sign in», открывающая модальное окно, в котором есть и вход, и переход к регистрации. Авторизованному клиенту вместо кнопки показывается имя пользователя; после перезагрузки страницы статус должен сохраняться.

Часть этого уже реализована и закоммичена (`9b64517`, `d9e958e`, `318146c`: `HeaderAccount`, `LoginDialog`, `LoginForm` modal-вариант, тест `frontend/tests/header-authentication.test.mjs`), но UX-требование нигде не зафиксировано как спецификация, а макет Figma (http://figma.com/prototype/111576374988653, экран «Пользовательские сценарии и авторизация») не обновлён под утверждённый pattern. Требуется зафиксировать контракт, закрыть оставшиеся расхождения с критериями приёмки и дотестировать.

## What Changes

- Специфицировать контрол авторизации в шапке: для гостя — кнопка «Prijavi se» / «Sign in»; для авторизованного — имя (`first_name` → `display_name` → префикс email) с выпадающим меню (Moj nalog / Moje porudžbine / Odjavi se); состояние восстанавливается после перезагрузки; высота шапки не меняется.
- Специфицировать модальное окно входа: `<dialog>` поверх затемняющего фона, ширина ~440 px, фокус на поле email, блокировка прокрутки, закрытие по Escape / клику по фону / крестику с возвратом фокуса на триггер; внутри — email, пароль, ссылка «Zaboravili ste lozinku?», кнопка «Пријави се» и кнопка «Региструј се» с идентичными стилями, ведущая на существующий маршрут регистрации.
- Авторизация через существующий BFF `/api/auth/login` (Medusa `/auth/customer/emailpass`, httpOnly cookie `medusa_customer_session`): без изменения бэкенда, кодов регистрации, лимитов и троттлинга — существующая спецификация `customer-auth` остаётся неизменной.
- Локализация SR/EN по таблицам ТЗ (`auth.login.*`, `headerAuth.*` в `frontend/src/messages/{sr,en}.json`).
- До начала реализации — обновить Figma-макет (header-кнопка гостя, имя авторизованного, модалка входа с кнопкой регистрации).
- Тесты: расширение `frontend/tests/header-authentication.test.mjs`, интеграционные проверки `verify-localized-routes.mjs`, ручной чек-лист по TESTING-RULES §6.

## Capabilities

### New Capabilities

*(нет)*

### Modified Capabilities

- `customer-auth`: добавляются (ADDED) требования уровня интерфейса — контрол авторизации в шапке, модальное окно входа, кнопки и локализация, сценарии ошибок входа, состояние авторизации после перезагрузки, закрытие модалки и фокус, адаптивность. Требования уровня API существующей спецификации (коды регистрации, лимиты, троттлинг) не меняются и не противоречат новому UX.

## Impact

- **Спецификации**: `openspec/specs/customer-auth/spec.md` при архивации дополнится новыми UX-требованиями; разделы API не затрагиваются.
- **Код (верификация расхождений, точечные правки)**: `frontend/src/components/auth/{HeaderAccount,LoginDialog,LoginForm}.tsx`, `frontend/src/components/layout/UserNav.tsx` (синхронизация мобильной панели с pattern), `frontend/src/components/auth/AuthProvider.tsx`, `frontend/src/messages/{sr,en}.json`, `frontend/src/app/globals.css`.
- **Тесты**: `frontend/tests/header-authentication.test.mjs` (расширение, без ослаблений — TESTING-RULES §4), `frontend/test-support/verify-localized-routes.mjs` (already covers `/rs/nalog/prijava|registracija|zaboravljena-lozinka`).
- **Макет**: Figma-прототип TAMIR (экран «Пользовательские сценарии и авторизация») — обязателен до implementation.
- **Бэкенд / база / админка / платёжные провайдеры**: без изменений.
