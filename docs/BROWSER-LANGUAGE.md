# Язык браузера и публичные адреса

Актуально на 11 октября 2026. Обе версии обслуживают Сербию, цены RSD и один набор commerce-данных.

## Выбор языка

- `/rs` и `/en` — самостоятельные главные, HTTP 200 без редиректа в каталог.
- Только корень `/` выбирает язык и возвращает **307**: валидный `store_locale` имеет приоритет; иначе используется наиболее приоритетный язык `Accept-Language`.
- Английский (`en`, `en-US`, `en-GB`) → `/en`. Сербский, неподдерживаемый основной язык или отсутствие заголовка → `/rs`. `ru-RU,ru;q=0.9,en;q=0.8` → SR, а не EN.
- Ответ выбора языка имеет `Cache-Control: private, no-store` и `Vary: Accept-Language, Cookie`; параметры запроса сохраняются.
- Явный адрес SR/EN имеет приоритет над cookie и браузером. `x-tamir-locale` задаётся серверным Proxy, входной пользовательский заголовок перезаписывается.
- Ручное переключение сохраняется через `/api/locale` на год. Для проверки первого визита удалите только `store_locale` или откройте приватное окно.

## Маршруты

| Страница | Сербский | Английский |
| --- | --- | --- |
| Главная / логотип | `/rs` | `/en` |
| Весь каталог | `/rs/catalog` | `/en/catalog` |
| Категория, пример | `/rs/catalog/kape` | `/en/catalog/hats` |
| Товар | `/rs/products/<sr-handle>` | `/en/products/<en-handle>` |
| Корзина | `/rs/korpa` | `/en/cart` |
| Кабинет | `/rs/nalog` | `/en/account` |
| Вход | `/rs/nalog/prijava` | `/en/account/login` |
| Регистрация | `/rs/nalog/registracija` | `/en/account/register` |
| Восстановление | `/rs/nalog/zaboravljena-lozinka` | `/en/account/forgot-password` |
| Оформление | `/rs/checkout` | `/en/checkout` |
| Заказ | `/rs/order/<id>` | `/en/order/<id>` |
| Условия / privacy / cookies | `/terms`, `/privacy`, `/cookies` | `/en/terms`, `/en/privacy`, `/en/cookies` |

Сербские служебные страницы используют internal rewrites в `next.config.ts`: адрес в браузере остаётся сербским, общая реализация и состояние корзины/аккаунта сохраняются. Старые `/rs/cart` и `/rs/account/...` перенаправляются 308 на соответствующие адреса; query сохраняется. `/me` → `/rs`, `/me/...` → `/rs/...`.

Названия сегментов `catalog`, `products`, `checkout`, `order` и юридических страниц пока общие. Переведённый slug категории/товара не означает перевод каждого сегмента URL.

Переключатель сохраняет страницу, query и hash. Для товаров/категорий `LanguagePaths` передаёт пару конкретных адресов; для остальных работает `localizedPath`. Не соединяйте языковой префикс вручную при переходе с локализованной страницы.

## Добавление языка

Детектор и `/api/locale` используют список `locales` в `frontend/src/lib/i18n/config.ts`, но полноценный новый язык требует также словаря сообщений, native-локали Medusa, переведённого контента, маршрутов, URL mapping, hreflang/sitemap, форматирования и тестов. Одного добавления кода в массив недостаточно.

Проверки: `tests/browser-locale.test.mjs`, `tests/english-routing.test.mjs` и `test-support/verify-localized-routes.mjs` в frontend. [Порядок запуска](TESTING.md).
