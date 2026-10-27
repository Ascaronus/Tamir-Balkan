# HTTP интеграционные тесты

Проверено 2026-10-11. Каталог сейчас содержит `health.spec.ts`: он использует `medusaIntegrationTestRunner` из `@medusajs/test-utils`, поднимает приложение и проверяет, что GET `/health` отвечает 200. Это Jest-тест, отдельный от наборов Node-тестов в `backend/tests/`.

Из каталога `backend/` при установленных зависимостях и отдельной тестовой базе и конфигурации:

```bash
npm run test:integration:http
```

Скрипт пакета задаёт `TEST_TYPE=integration:http`; эти файлы отбирает `jest.config.js`. Не направляйте интеграционную конфигурацию на production-данные. Успешный health-тест не проверяет импорт, отправку писем, оформление заказа и остальные бизнес-правила.

Основной GitHub CI выполняет явные проверки frontend и регрессии `backend/tests/*.cjs` плюс сборки, и не заменяет ими этот единственный health-тест. См. [TESTING.md](../../../docs/TESTING.md) и [verify.yml](../../../.github/workflows/verify.yml).
