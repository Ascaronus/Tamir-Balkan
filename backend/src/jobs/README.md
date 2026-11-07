# Плановые задания

`tamir-chat.ts`: Medusa job `tamir-chat-delivery`, interval 10000 ms, concurrency `forbid`.
Обрабатывает до 10 сообщений PostgreSQL outbox и удаляет истёкшую историю/гостей/счётчики.
Доставка также запускается после сохранения сообщения. Блокировки БД защищают очередь между workers.
Схему создаёт setup-reviews.ts; внешняя доставка требует настроенных Telegram/Google secrets.

Автоматического расписания импорта Rozetka по-прежнему нет.

[Архитектура и настройка](../../../docs/TAMIR-CHAT.md) · [Тестирование](../../../docs/TESTING.md).
