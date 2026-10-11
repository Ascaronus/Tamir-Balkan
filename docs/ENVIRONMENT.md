# Окружение

Значения ниже — примеры для разработки. Реальные `.env`, ключи, пароли и дампы нельзя добавлять в Git. Оба приложения получают собственное окружение; `NEXT_PUBLIC_*` становится доступным браузеру.

## Backend: `backend/.env`

```dotenv
DATABASE_URL=postgres://medusa:medusa@localhost:5432/medusa-v2
REDIS_URL=redis://localhost:6379
STORE_CORS=http://localhost:3000
ADMIN_CORS=http://localhost:9000
AUTH_CORS=http://localhost:3000,http://localhost:9000
JWT_SECRET=REPLACE_WITH_LOCAL_RANDOM_SECRET_AT_LEAST_32_CHARACTERS
COOKIE_SECRET=REPLACE_WITH_ANOTHER_LOCAL_RANDOM_SECRET
MEDUSA_PUBLIC_BACKEND_URL=http://localhost:9000
```

Пара БД `medusa/medusa` соответствует локальному Compose, не является production-рекомендацией. Секреты для новой установки генерируются отдельно; существующие production-секреты не заменяйте при обычном обновлении.

| Переменная | Назначение |
| --- | --- |
| `DATABASE_URL`, `REDIS_URL` | База и Redis |
| `STORE_CORS`, `ADMIN_CORS`, `AUTH_CORS` | Разрешённые origin витрины, админки и auth |
| `JWT_SECRET`, `COOKIE_SECRET` | Секреты существующей аутентификации |
| `MEDUSA_PUBLIC_BACKEND_URL` | Публичный origin для local file provider, production `https://api.tamir.rs` |
| `GOOGLE_TRANSLATE_API_KEY` | Необязательный серверный ключ перевода товаров, опций и категорий |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD` | Почта: код регистрации/сброса и welcome email; порты 587 или 465 |
| `TURNSTILE_SECRET_KEY`, `TURNSTILE_HOSTNAMES` | Серверная проверка CAPTCHA; рабочие домены витрины |
| `REVIEW_RATE_SECRET` | Необязательный отдельный секрет HMAC; иначе используется `JWT_SECRET` |
| `STORE_LOCALE_CODES` | Только скрипт подготовки локалей; по умолчанию `en,sr,sr-RS`. Витрина использует фиксированные `sr-RS`/`en` |
| `ROZETKA_STOCK_LOCATION_ID` | Предпочитаемый склад импорта; проверьте выбор в форме |

Другие `ROZETKA_*` относятся к [CLI-режиму](IMPORT-MODES.md), а не к сохранённым настройкам страницы админки.

## Frontend: `frontend/.env.local`

```dotenv
NEXT_PUBLIC_MEDUSA_BACKEND_URL=http://localhost:9000
NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY=pk_REPLACE_WITH_STORE_PUBLISHABLE_KEY
NEXT_PUBLIC_SITE_URL=http://localhost:3000
NEXT_PUBLIC_TURNSTILE_SITE_KEY=REPLACE_WITH_SITE_KEY
```

Для production: API `https://api.tamir.rs`, origin витрины `https://tamir.rs`, реальные publishable/Turnstile site keys. Publishable key привязывается к каналу продаж. Admin secret key вместо него использовать нельзя.

`TAMIR_PRIVACY_EMAIL` — серверная почта для публичной политики конфиденциальности. Старые `TAMIR_SELLER_*` / `TAMIR_TERMS_PUBLISHED` не включают реквизиты в текущие terms; см. [правовой статус документов](LEGAL-AND-COOKIES.md).

## Изменения на VPS

Источники конфигурации находятся в `/root/tamir_balkan/backend/.env` и файлах окружения frontend. Работающие PM2-процессы используют отдельный релиз; простой `export` в SSH не гарантирует постоянную конфигурацию. Деплой сохраняет окружение PM2, копирует файлы env и собирает новый релиз. Уже существующее значение PM2 может иметь приоритет над одноимённым значением файла: при изменении проверьте оба источника без вывода секретов в логи.

После изменения публичных frontend-переменных нужна новая сборка. После изменения серверного ключа перевода нужен перезапуск backend с актуальным окружением/новый релиз; проверьте доступность кнопки и результат одного перевода. Не подставляйте ключ как текст-подсказку `read -rsp`: ключ должен быть значением переменной. Удобнее редактировать защищённый env-файл на сервере.

GitHub Actions использует secrets `VPS_HOST`, `VPS_PORT`, `VPS_SSH_KEY`, `VPS_KNOWN_HOSTS`; они не заменяют окружение приложения. [Деплой](../DEPLOY.md) · [Email](EMAIL.md) · [CAPTCHA](REVIEWS.md).
