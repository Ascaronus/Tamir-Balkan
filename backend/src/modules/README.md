# Пользовательские модули

Сверено с кодом 11 октября 2026.

В этом каталоге нет собственных module implementations: только README. Приложение использует стандартные модули Medusa, а дополнительные review/auth/URL таблицы обслуживаются helpers из `../utils/` и создаются `setup-reviews.ts`. Native-переводы хранятся в стандартном модуле Translation. Fulfillment stub находится в `../scripts/test-fulfillment-provider.ts` и подключён через `medusa-config.ts`.

Если здесь появится реализация, обновите этот файл её назначением, регистрацией, миграциями и проверками. Используйте API установленной Medusa 2.13.1 и проверяйте совместимость при обновлении зависимостей.

[Backend](../../README.md) · [API](../api/README.md) · [Скрипты](../scripts/README.md) · [Тестирование](../../../docs/TESTING.md).
