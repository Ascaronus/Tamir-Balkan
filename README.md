# TAMIR Balkan

Интернет-магазин одежды TAMIR для рынка Сербии: одна Medusa, одна база, общий ассортимент, остатки, корзина и заказы; две версии витрины — сербская латиница и английская. Валюта магазина — RSD.

Документация сверена с кодом `main` на **11 октября 2026**. [Полный указатель](docs/README.md).

## Рабочие адреса

| Назначение | Адрес |
| --- | --- |
| Выбор языка при входе | https://tamir.rs |
| Главная SR / EN | https://tamir.rs/rs · https://tamir.rs/en |
| Каталог SR / EN | https://tamir.rs/rs/catalog · https://tamir.rs/en/catalog |
| Корзина SR / EN | https://tamir.rs/rs/korpa · https://tamir.rs/en/cart |
| Кабинет SR / EN | https://tamir.rs/rs/nalog · https://tamir.rs/en/account |
| API / админка | https://api.tamir.rs · https://api.tamir.rs/app |

`/rs` и `/en` открывают главную без перенаправления в каталог. Корень `/` временно перенаправляет на выбранный язык: сохранённый ручной выбор имеет приоритет; иначе английский язык браузера включает EN, остальные — SR. [Правила и все маршруты](docs/BROWSER-LANGUAGE.md).

## Стек и структура

- `frontend/`: Next.js 16.2.2, React 19, TypeScript, Tailwind CSS 4, Manrope.
- `backend/`: Medusa 2.13.1, стандартный модуль переводов, расширения админки и API.
- `docker-compose.yml`: PostgreSQL 16 и Redis 7 для разработки.
- `scripts/`: проверка конфигурации, сборка и активация релиза на VPS.
- `.github/workflows/`: CI на Node 20.20.2 и 24; выпуск `main` через GitHub Actions.
- `docs/`: инструкции администратора, API, переводы, SEO, тестирование и эксплуатация.

## Локальный запуск

Нужны Node.js 24 (либо проверяемый CI Node 20.20.2), npm и Docker Compose. Окружение описано в [ENVIRONMENT.md](docs/ENVIRONMENT.md).

```bash
npm ci
npm run deps
npm run infra:up
```

Создайте `backend/.env` и `frontend/.env.local` по инструкции, затем в **локальной** базе выполните:

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
- Фильтры каталога, складские ограничения, галерея с hover zoom, отзывы и модерация.
- Гостевое оформление, кабинет, регистрация и восстановление пароля с кодом по email и CAPTCHA.
- Canonical/hreflang, общий sitemap двух языков и JSON-LD товаров.

## Проверки и выпуск

```bash
npm --prefix frontend test
npm --prefix frontend run lint -- --quiet
npm --prefix frontend run build
```

Полный порядок: [TESTING.md](docs/TESTING.md). Выпуск и резервные копии: [DEPLOY.md](DEPLOY.md). Не пересобирайте работающий каталог релиза вручную и не коммитьте `.env`, ключи, пароли или дампы.

Юридические тексты и реквизиты требуют отдельного согласования владельцем: техническая готовность магазина не означает завершение этой работы. [Текущее состояние](docs/LEGAL-AND-COOKIES.md).
