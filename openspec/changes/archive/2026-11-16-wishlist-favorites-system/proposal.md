# Proposal

## Why

YouTrack TB-14 (Product Wishlist / Favorites): покупатель должен сохранять товары в персональное «избранное» — сердцем на карточке товара и со страницы товара, видеть счётчик в шапке и страницу `/wishlist`, а гость должен попадать в модалку входа с автоматическим повтором действия после авторизации. Фича уже реализована и влита в историю текущей ветки (коммит `d9e958e` «Add account-backed product wishlist with localized UI and isolated tests» от 2026-10-27 плюс последующие правки `fix/favorite-icon-background` и `fix/wishlist-header-typography`), но возможность нигде не зафиксирована в спеках OpenSpec, часть решений сознательно отклоняется от буквального текста TB-14 (имя таблицы, цвет сердца, состав шапки), а браузерный E2E-контур на момент реализации оставался пробелом. TB-14 прямо предписывает сначала проверить существующую реализацию, затем зафиксировать контракт и закрыть расхождения — этот change это и делает.

## What Changes

- Формализуем избранное как новую capability `wishlist` в спеках: сердце на карточках и PDP, гостевой вход через модалку с повтором действия ровно один раз, кнопка/счётчик в шапке, страница `/wishlist` с пустым состоянием, отображение недоступных товаров, контракт API `GET/POST/DELETE /store/wishlist` с кодами ошибок, уникальность и изоляция хранения на уровне БД, запрет хранения в браузере.
- **Никаких новых миграций, таблиц, API или зависимостей** (реализация уже в коде): таблица `tamir_customer_favorite` идемпотентно создаётся существующим скриптом `backend/src/scripts/setup-reviews.ts` (тот же паттерн, что `tamir_product_url`/отзывы); задачи по backend — проверка и подтверждение, а не написание нового кода.
- Зафиксировать как осознанные отклонения от TB-14 (с обоснованием в design.md): таблица `tamir_customer_favorite` вместо `customer_favorites`; цвет сердца — брендовый accent вместо жёлтого `#EAB308`; в шапке последовательность Language Switcher → Wishlist → Account → Cart, переключатель валюты остаётся внутри корзины (отдельного currency-селектора в шапке не было и не добавляется).
- Закрыть пробел браузерного E2E: сценарии WD-004 из `docs/WISHLIST.md` (сердце на PDP/карточках, гостевой replay, страница `/wishlist`) — сначала локальным прогоном из ветки `fix/nexte2e-pdp-wishlist-anchors`, затем перенос в контур QA-автоматизации, которого в репозитории ещё нет (репозиторий QA будет создан позже).
- Сверить `docs/WISHLIST.md` и тесты с TB-14 §QA-чеклистом; обновить документацию при расхождениях.
- Не трогаем авторизацию (`LoginDialog`/`customer-auth`), корзину, каталог и остальные capability-спеки: требования только ADDED в новой capability.

## Capabilities

### New Capabilities

- `wishlist`: избранное покупателя — UI-поверхность (сердца, счётчик, страница), гостевой intent-replay, контракт store API и правила хранения (уникальность, изоляция по сессии, отсутствие браузерного хранилища).

### Modified Capabilities

- Нет: существующие спеки `customer-auth` и `product-catalog` не меняются; избранное только использует их контракты (модалка входа, доступность товара в sales channel).

## Impact

- **Backend (уже реализовано, в change только верификация):** `backend/src/api/store/wishlist/route.ts`, `backend/src/api/store/wishlist/[productId]/route.ts`, `backend/src/utils/wishlist.ts`, `backend/src/utils/wishlist-http.ts`, `backend/src/api/middlewares.ts` (строки 52–53: `authenticate("customer", ["bearer","session"])`, sizeLimit 2 kb для POST), `backend/src/scripts/setup-reviews.ts` (DDL таблицы).
- **Frontend (уже реализовано, в change только верификация):** `frontend/src/components/wishlist/` (`WishlistProvider`, `WishlistPage`, `FavoriteButton`, `WishlistLink`), `frontend/src/lib/store/wishlist-state.ts`, `frontend/src/components/store/ShopHeader.tsx` (порядок в `header__actions`), `ProductCard.tsx`, `frontend/src/components/product/ProductDetails.tsx` (сердце в `product-title-row`), `frontend/src/app/[countryCode]/wishlist/page.tsx`, `frontend/src/messages/sr.json` / `en.json` (клавиши `wishlist.*`), стили в `frontend/src/app/globals.css`.
- **Тесты:** существуют `frontend/tests/wishlist.test.mjs`, `backend/tests/wishlist.test.cjs`, `backend/tests/wishlist.integration.cjs` (нужен `TEST_REVIEWS_DB_URL`), `backend/integration-tests/http/wishlist.spec.ts` (Jest, CI). Пробел — браузерный E2E (WD-004).
- **Design:** Figma-ноды избранного (ссылки в `docs/WISHLIST.md`) — обязательная сверка/синхронизация до любых визуальных правок (см. tasks.md, группа 1).
- **Известный baseline (зафиксирован 2026-11-16):** `frontend` `npm test` — 372/372; `backend` `npm run test:cjs -- --no-db` — 106/108, два падения не про избранное (`order-email` regex `/0,00/` и `tamir-chat-images.test.cjs`) — аутентифицированы как предсуществующие, в этом change не чинятся.
