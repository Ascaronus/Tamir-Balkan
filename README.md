# TAMIR Balkan

Интернет-магазин одежды TAMIR для рынка Сербии: одна Medusa, одна база, общий ассортимент, остатки, корзина и заказы; две версии витрины — сербская латиница и английская. Валюта магазина — RSD.

Документация сверена с кодом `main` на **16 ноября 2026**. [Полный указатель](docs/README.md).

## Рабочие адреса

| Назначение | Адрес |
| --- | --- |
| Вход на сайт (308 → `/rs`) | https://tamir.rs |
| Главная SR / EN | https://tamir.rs/rs · https://tamir.rs/en |
| Каталог SR / EN | https://tamir.rs/rs/catalog · https://tamir.rs/en/catalog |
| Товар SR / EN | https://tamir.rs/rs/products/... · https://tamir.rs/en/products/... |
| Корзина SR / EN | https://tamir.rs/rs/korpa · https://tamir.rs/en/cart |
| Избранное SR / EN | https://tamir.rs/rs/wishlist · https://tamir.rs/en/wishlist |
| Кабинет SR / EN | https://tamir.rs/rs/nalog · https://tamir.rs/en/account |
| Оформление SR / EN | https://tamir.rs/rs/checkout · https://tamir.rs/en/checkout |
| API / админка | https://api.tamir.rs · https://api.tamir.rs/app |

`/rs` и `/en` открывают главную без перенаправления в каталог. Корень `/` постоянно ведёт на сербскую
версию: **308 на `/rs`**, без учёта cookie `store_locale` и языка браузера — это согласовано с canonical
`/rs`. Английская версия открывается через переключатель или прямой адрес `/en`. Сербские служебные
адреса (`/rs/korpa`, `/rs/nalog`, `/rs/wishlist`) — публичные; внутренние адреса вида `/rs/cart`
перенаправляются на них. [Правила и все маршруты](docs/BROWSER-LANGUAGE.md).

## Стек и структура

- `frontend/`: Next.js 16.4.5, React 19, TypeScript, Tailwind CSS 4, Manrope.
- `backend/`: Medusa 2.13.6, стандартный модуль переводов, расширения админки и API.
- `docker-compose.yml`: PostgreSQL 16 и Redis 7 для разработки.
- `scripts/`: проверка конфигурации, сборка и активация релиза на VPS.
- `.github/workflows/`: CI на Node 20.20.2 и 24; выпуск `main` через GitHub Actions.
- `docs/`: инструкции администратора, API, переводы, SEO, тестирование и эксплуатация.

## Локальный запуск

Нужны Node.js 24 (либо проверяемый CI Node 20.20.2), npm и Docker Compose. Окружение описано в [ENVIRONMENT.md](docs/ENVIRONMENT.md).

```bash
npm ci
npm run deps
```

Создайте корневой `.env`, `backend/.env` и `frontend/.env.local` из соответствующих `.env.example` и заполните их по [инструкции хранения секретов](docs/SECRETS.md). Затем запустите `npm run infra:up` и в **локальной** базе выполните:

```bash
cd backend
npx medusa db:migrate
npm run store-locales
npx medusa exec ./src/scripts/setup-reviews.ts
npx medusa exec ./src/scripts/setup-decimal-attributes.ts
cd ..
npm run dev
```

Создайте администратора и настройте магазин: регион Сербия/RSD, канал продаж, его publishable key, склад и доставку. Демо `seed` используйте только в отдельной учебной базе. [Backend](backend/README.md).

Витрина: `http://localhost:3000`; API: `http://localhost:9000`; админка: `http://localhost:9000/app`.

`npm run dev` поднимает Docker Compose и оба приложения; занятые порты автоматически не освобождает. `npm run dev:nodocker` использует уже запущенную инфраструктуру. `npm run stop` останавливает Compose; процессы dev останавливаются отдельно через Ctrl+C. Именованный том PostgreSQL сохраняется.

## Основные возможности

- Импорт XML Rozetka с предпросмотром, выбором товаров, редактированием цен, вариантов, категорий и переводов. Фото по умолчанию копируются на сервер; адрес источника сохраняется в настройках магазина.
- Переводы товаров, категорий и опций SR/EN; отдельные адреса товаров и категорий, переходы со старых ссылок.
- Фильтры каталога, складские ограничения, галерея с увеличением при наведении, отзывы и модерация.
- Гостевая корзина и оформление, корзина покупателя с восстановлением после входа, предпросмотр корзины при наведении на значок в шапке.
- Вход и регистрация с подтверждением по email и CAPTCHA, восстановление пароля, сессия покупателя в cookie; имя и меню аккаунта в шапке, диалог входа из шапки, избранного и отзывов.
- Избранное покупателя: сердца в карточках и на странице товара, счётчик в шапке, страница избранного.
- TAMIR Chat: чат с посетителем на витрине, диалоги и ответы в админке, доставка в Telegram по умолчанию выключена.
- Canonical/hreflang, общий sitemap двух языков и JSON-LD товаров; стенд закрыт от индексации.

## Проверки и выпуск

```bash
npm --prefix frontend test
npm --prefix frontend run lint -- --quiet
npm --prefix frontend run build
```

Полный порядок: [TESTING.md](docs/TESTING.md). Следующий релиз сначала проверяется на стенде
`test.tamir.rs` / `test-api.tamir.rs` — он деплоится автоматически после зелёного Verify на push в `main`,
прод деплоится только вручную: [STAGING.md](docs/STAGING.md). Выпуск и резервные копии: [DEPLOY.md](DEPLOY.md).
Не пересобирайте работающий каталог релиза вручную и не коммитьте `.env`, ключи, пароли или дампы.

Юридические тексты и реквизиты требуют отдельного согласования владельцем: техническая готовность магазина не означает завершение этой работы. [Текущее состояние](docs/LEGAL-AND-COOKIES.md).
