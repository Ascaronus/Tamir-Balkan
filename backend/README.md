# TAMIR backend

Medusa **2.13.1**, PostgreSQL, Redis, TypeScript. Backend обслуживает обе языковые версии одной витрины; отдельной EN-базы или магазина нет.

## Локальная подготовка

Настройте [backend/.env](../docs/ENVIRONMENT.md), установите зависимости и запустите PostgreSQL/Redis из корня репозитория.

```bash
# Из backend/
npm ci
npx medusa db:migrate
npm run store-locales
npx medusa exec ./src/scripts/setup-reviews.ts
npx medusa exec ./src/scripts/setup-decimal-attributes.ts
npm run dev
```

Админка — `/app`, проверка доступности — `/health`. Для создания администратора используйте `npx medusa user --help` и значения своего локального аккаунта. До покупки настройте регион Сербия/RSD, канал и publishable key, склад, остатки, доставку и payment provider. `seed` и скрипт демонстрационных RSD-цен не предназначены для рабочего ассортимента.

## Production

`npm run build` создаёт `.medusa/server`, затем postbuild устанавливает runtime-зависимости и копирует окружение. `npm start` запускает собранный сервер именно из `.medusa/server`, вместе с admin build. Не запускайте `medusa start` из произвольного каталога вместо обёртки. На рабочем сервере оба приложения переключает [deploy-vps.sh](../scripts/deploy-vps.sh); порядок и ограничения — в [DEPLOY.md](../DEPLOY.md).

## Расширения проекта

- [API](src/api/README.md): каталог, отзывы, регистрация/восстановление, админский импорт, переводы и адреса.
- [Админка](src/admin/README.md): Rozetka, модерация, переводы опций, статус перевода, английский адрес товара.
- [Скрипты](src/scripts/README.md): подготовка схемы/локалей, импорт, нормализация, диагностика SMTP.
- [Subscribers](src/subscribers/README.md): welcome email и синхронизация URL после изменений.
- `src/utils/` и `src/shared/`: валидация, импорт, SEO/переводы, дробные значения, email/CAPTCHA.
- `tests/`: основной набор регрессий Node; [integration-tests/http](integration-tests/http/README.md): отдельный Jest health smoke test.

`medusa-config.ts` подключает стандартные translation/file/fulfillment modules. Фото по умолчанию обслуживает local file provider с публичным адресом `MEDUSA_PUBLIC_BACKEND_URL`; production fallback — `https://api.tamir.rs/static`. Translation feature включена. Исправления Dashboard применяются Vite-преобразованием при сборке, а не ручным изменением `node_modules`.

Конфигурация cookie сейчас явно задаёт `sameSite: lax`, `secure: false` для совместимости прежнего HTTP-доступа. Эта документация не меняет настройки аутентификации; публичные рабочие адреса используют HTTPS.

[Импорт](../docs/ROZETKA-ADMIN-IMPORT.md) · [Переводы](../docs/LOCALIZATION.md) · [Тесты](../docs/TESTING.md) · [Окружение](../docs/ENVIRONMENT.md).
