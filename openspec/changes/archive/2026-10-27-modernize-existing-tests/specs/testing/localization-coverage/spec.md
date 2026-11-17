# Spec Delta: localization-coverage

## ADDED Requirements

### Requirement: Localization checks rely on real en and sr strings

Тесты локализации SHALL утверждать наличие реальных англоязычных и
сербскоязычных строк витрины из файлов `frontend/src/messages/`, а не абстрактных
заглушек. Русские переводы витринного текста в тестах и фикстурах SHALL не
использоваться.

#### Scenario: Assertion on an English string
- **WHEN** тестируется компонент или маршрут витрины в локали `en`
- **THEN** утверждение проверяет конкретную английскую строку из сообщений
  приложения

#### Scenario: Assertion on a Serbian string
- **WHEN** тестируется тот же сценарий в локали `sr`
- **THEN** утверждение проверяет конкретную сербскую строку (латиница или кириллица
  — так, как она записана в сообщениях приложения), а не её перевод на русский

### Requirement: Parity of Serbian and English routes is checked in CI

Скрипт `frontend/test-support/verify-localized-routes.mjs` SHALL продолжать
исполняться в workflow `Verify storefront and backend`, и новые языковые маршруты
SHALL покрываться его проверкой парности `/rs` и `/en`.

#### Scenario: Asymmetric route breaks CI
- **WHEN** добавлен маршрут, существующий только в одной локали
- **THEN** шаг проверки локализованных маршрутов завершается ошибкой

### Requirement: Locale switching and persistence has a check

Поведение выбора локали (URL-префикс, cookie, редирект корня) SHALL иметь
тестовое подтверждение в существующих тестах (`browser-locale.test.mjs`,
`english-routing.test.mjs`, `localized-cart.test.mjs`) и не регрессировать.

#### Scenario: Root follows the browser language
- **WHEN** запрос корня приходит с заголовком `Accept-Language` для `en`
- **THEN** существующий тест подтверждения редиректа/выбора локали проходит,
  и новый код не ломает это поведение
