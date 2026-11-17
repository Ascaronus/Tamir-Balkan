# testing/http-integration-tests Specification

## Purpose
Фиксирует слой HTTP-интеграционных тестов: исполнение in-app против реальной среды Medusa, покрытие кастомных store-маршрутов реальными запросами, неизменность поведения приложения при их добавлении и явную границу с внешним E2E-контуром Tamir-QA-Automation.

## Requirements

### Requirement: HTTP integration tests run in-app against a real Medusa environment

HTTP-интеграционные тесты SHALL использовать `medusaIntegrationTestRunner`
(пакет `@medusajs/test-utils`, in-app режим) с реальной тестовой PostgreSQL-базой,
создаваемой и удаляемой прогоном. Запросы SHALL идти через внутренний API-клиент
тестового раннера, а не через подменные `req`/`res` объекты.

#### Scenario: Basic service availability
- **WHEN** запускается Jest-набор `npm run test:integration:http`
- **THEN** тест `GET /health` получает ответ 200 от приложения Medusa

#### Scenario: Real database for the custom route
- **WHEN** HTTP-тест запрашивает `GET /api/store/catalog/products`
- **THEN** ответ сформирован реальными данными БД и кодом маршрута
  `backend/src/api/store/catalog/products/route.ts`, включая обработку
  налогового контекста (`setTaxContext`, `wrapProductsWithTaxPrices`)

### Requirement: Custom store routes are covered by real requests

Для кастомных store-маршрутов backend SHALL существовать хотя бы один
незащищённый моками HTTP-тест на успешный путь и один — на отказ
(невалидные данные или отсутствие авторизации), с проверкой кода ответа и
полезной части тела ответа.

#### Scenario: Successful catalog path
- **WHEN** тест выполняет `GET /api/store/catalog/products` с валидным запросом
- **THEN** ответ 200 содержит структуру товаров без секретов и токенов

#### Scenario: Rejection without authorization
- **WHEN** тест вызывает защищённый admin-маршрут (например, обзорный или
  rozetka-маршрут) без корректной сессии администратора
- **THEN** ответ имеет статус 401 или 403, и тест это утверждает

### Requirement: Application behavior does not change along with the tests

Изменение или добавление HTTP-тестов SHALL не менять рантайм-поведение приложения.
Если тест требует изменения кода приложения, это оформляется отдельно и не входит
в данный change.

#### Scenario: The test adapts to the route, not the other way around
- **WHEN** фактический ответ маршрута отличается от ожиданий нового теста
- **THEN** ожидаемое значение выверяется по текущему поведению приложения,
  а поведение приложения остаётся прежним

### Requirement: Boundary with the external Tamir-QA-Automation E2E loop

HTTP-тесты в этом репозитории SHALL оставаться in-app интеграцией уровня API.
Пользовательские browser-E2E сценарии, почтовые проверки через Mailpit и black-box
проверения развёрнутых стендов SHALL относиться к репозиторию Tamir-QA-Automation
и не дублироваться здесь.

#### Scenario: Scenario belongs to the E2E repository
- **WHEN** предполагаемая проверка проходит через настоящий браузер или внешний
  развёрнутый стенд
- **THEN** в этом change она не реализуется, а фиксируется как зона
  Tamir-QA-Automation
