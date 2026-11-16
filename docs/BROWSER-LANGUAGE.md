# Browser Language and Public Addresses

Актуально на 16 ноября 2026. Обе версии обслуживают Сербию, цены RSD и один набор commerce-данных.

## Language Selection

- `/rs` и `/en` — самостоятельные главные, HTTP 200 без редиректа в каталог.
- Корень `/` всегда возвращает **308 на `/rs`**, независимо от `store_locale` и `Accept-Language`. Это постоянный вход в сербскую версию, согласованный с canonical `/rs`.
- Параметры запроса сохраняются. Ответ имеет `Cache-Control: private, no-store`, без языкового `Vary`.
- Английская версия открывается через переключатель или прямые ссылки `/en`; автоматического выбора английского на корне больше нет.
- Явный адрес SR/EN имеет приоритет над cookie и браузером. `x-tamir-locale` задаётся серверным Proxy, входной пользовательский заголовок перезаписывается.
- Ручное переключение сохраняется через `/api/locale` на год. Cookie не меняет постоянный редирект корня `/`.

## Routes

| Страница | Сербский | Английский |
| --- | --- | --- |
| Главная / логотип | `/rs` | `/en` |
| Весь каталог | `/rs/catalog` | `/en/catalog` |
| Категория, пример | `/rs/catalog/kape` | `/en/catalog/hats` |
| Товар | `/rs/products/<sr-handle>` | `/en/products/<en-handle>` |
| Корзина | `/rs/korpa` | `/en/cart` |
| Избранное | `/rs/wishlist` | `/en/wishlist` |
| Кабинет | `/rs/nalog` | `/en/account` |
| Вход | `/rs/nalog/prijava` | `/en/account/login` |
| Регистрация | `/rs/nalog/registracija` | `/en/account/register` |
| Восстановление | `/rs/nalog/zaboravljena-lozinka` | `/en/account/forgot-password` |
| Оформление | `/rs/checkout` | `/en/checkout` |
| Заказ | `/rs/order/<id>` | `/en/order/<id>` |
| Условия / privacy / cookies | `/terms`, `/privacy`, `/cookies` | `/en/terms`, `/en/privacy`, `/en/cookies` |

Сербские служебные страницы используют internal rewrites в `next.config.ts`: адрес в браузере остаётся сербским, общая реализация и состояние корзины/аккаунта сохраняются. Старые `/rs/cart` и `/rs/account/...` перенаправляются 308 на соответствующие адреса; query сохраняется. `/me` → `/rs`, `/me/...` → `/rs/...`. Служебного сербского адреса у избранного нет: `localizedPath` в `frontend/src/lib/i18n/paths.ts` локализирует только префикс языка, поэтому остаются `/rs/wishlist` и `/en/wishlist`.

Названия сегментов `catalog`, `products`, `checkout`, `order` и юридических страниц пока общие. Переведённый slug категории/товара не означает перевод каждого сегмента URL.

Переключатель сохраняет страницу, query и hash. Для товаров/категорий `LanguagePaths` передаёт пару конкретных адресов; для остальных работает `localizedPath`. Не соединяйте языковой префикс вручную при переходе с локализованной страницы.

## Adding a Language

Детектор и `/api/locale` используют список `locales` в `frontend/src/lib/i18n/config.ts`, но полноценный новый язык требует также словаря сообщений, native-локали Medusa, переведённого контента, маршрутов, URL mapping, hreflang/sitemap, форматирования и тестов. Одного добавления кода в массив недостаточно.

Проверки: `frontend/tests/browser-locale.test.mjs`, `frontend/tests/english-routing.test.mjs`, `frontend/tests/seo.test.mjs` и `frontend/test-support/verify-localized-routes.mjs`. [Порядок запуска](TESTING.md).
