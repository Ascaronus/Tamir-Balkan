# Design

## Context

Мотивация — в proposal.md. Контекст состояния кода: функционал mini-cart уже частично реализован в `main` (коммиты `e33d0d2` — локализованный hover-предпросмотр корзины в шапке, `cf5770c` — удаление позиций из предпросмотра, `3f6ba16` — «открытие предпросмотра по тапу на мобильных»). Relevant files:

- `frontend/src/components/cart/CartPreview.tsx` — компонент: триггер в шапке (ссылка на `/…/cart`), popover-секция, позиции, футер «View cart», состояния loading/error/retry, Escape, закрытие по pointerdown вне.
- `frontend/src/lib/cart/preview-interaction.ts` — `CartPreviewInteraction` (задержка открытия 180 мс, закрытия 220 мс, pinned-режим для тача) и `cartPreviewPosition` (ширина 380 px, `maxHeight` до 520 px, кламп по вьюпорту).
- `frontend/src/lib/cart/display.ts` — `cartLineHref` (URL товара + `?v_id=`), `cartLineTotal`, `cartProductsTotal` — переиспользование логики расчёта, без дублей.
- `frontend/src/components/cart/CartProvider.tsx`, `useLocalizedCart.ts` — единое состояние корзины, локализованные названия, `displayReady`/`retryDisplay`.
- `frontend/src/components/store/ShopHeader.tsx` — рендер `<CartPreview />` в `header-actions`.
- `frontend/src/app/globals.css` (строки ~529–555) — стили `.cart-preview*`.
- `frontend/src/messages/sr.json` / `en.json` (клавиши `cartPreview.*`, ~строка 477).
- `frontend/tests/cart-preview.test.mjs` — существующие поведенческие тесты, включая Assertions «тап по тач-устройству переключает закреплённый предпросмотр» (строки ~153–165) — подтверждены владельцем продукта как эталонное поведение (2026-11-16).

Сверка реализации с TB-15: задержки 180/220 мс, ширина 380 px, макс. высота 520 px (TB-15 §3 допускает 450–550), миниатюры 60×75, пустая корзина без итога и кнопки, клик по позиции → страница товара, отсутствие fetch при hover (таймеры не дёргают сеть), focus/Escape, состояния loading/error — уже соответствуют. Единственное расхождение (мобильное поведение против TB-15 §4) закрыто решением владельца продукта от 2026-11-16: pinned-toggle верен, §4 заменён.

## Goals / Non-Goals

**Goals:**
- Привести поведение к требованиям спеки (`specs/cart-checkout/spec.md` этого change), зафиксировав расхождения как явные правки.
- Не сломать существующие корзину, хедер и checkout (критерий приёмки TB-15 §7).

**Non-Goals:**
- Изменения backend/Medusa/БД/API — нет (TB-15 §5, §8).
- Новый дизайн корзины и новые зависимости (TB-15 §3, §8).
- Redesign компонента: архитектура «один disclosure для pointer + keyboard, таймеры не делают fetch» сохраняется.

## Decisions

### D1. Mobile tap = pinned preview (product owner decision 2026-11-16)
**Решение:** оставить текущую реализацию `main` без изменений: при тапе touch/pen или на устройстве без hover (`CartPreviewControl`: `pointerType === "touch" | "pen"` либо `!(any-hover: hover)`) выполняется `event.preventDefault(); interaction.toggle()` — открывается pinned-предпросмотр; повторный тап по иконке, Escape или `pointerdown` вне закрывают его (`dismiss()`). Механика `pinned`/`toggle()` в `CartPreviewInteraction` остаётся. Тесты pinned-toggle (`cart-preview.test.mjs`, ~153–165) сохраняются как эталон; специфика TB-15 §4 («тап → страница корзины») заменена решением владельца.
**Альтернатива:** навигация на страницу корзины по тапу (буквальное TB-15 §4) — отклонена владельцем продукта: pinned-preview нужен гибридным ноутбукам (коммит `3f6ba16`: «touch must work on hybrid laptops too»), а переход на страницу корзины остаётся доступным через «View cart» в предпросмотре.
**Следствие:** правки кода в группе 2 отсутствуют; задача группы — сверка и дополнение тестов, плюс перенос решения в YouTrack TB-15.

### D2. Trigger remains a link to the cart page
Ссылка (`LocalizedLink href="/…/cart"`) сохраняет семантику и TB-15 §2.1 «обычный клик открывает страницу корзины» на десктопе. Popover — надстройка через pointer/keyboard, не замена ссылки. Альтернатива `<button>` + программный роутинг — отклонена (ломает среднюю кнопку/открытие в новой вкладке и уже реализованный a11y-путь).

### D3. Cart state comes only from `CartProvider`
Предпросмотр читает `useCart()` (`cart`, `displayReady`, `displayError`, `retryDisplay`), расчёт — через `cartLineTotal`/`cartProductsTotal`, URL — через `cartLineHref` (`?v_id=`). Никаких новых запросов и хранилищ; `tb_cart_id` не трогаем (TB-15 §5).

### D4. Dimensions and styles — existing values are valid, minimal edits
`cartPreviewPosition`: ширина `min(380, vw−32)` (TB-15: 340–400), `maxHeight = min(520, vh−top−16)` (TB-15: 450–550) — оставляем как есть; фиксированный footer и скролл `.cart-preview-items` уже есть. Проверить визуально соответствие теней/скруглений (`globals.css` 529–555) — правки только если ревью/Figma укажет.

### D5. Tests use the existing `frontend/tests/*.test.mjs` zone
Согласно `docs/TESTING-RULES.md`: не создавать новую test-зону; дополнить `cart-preview.test.mjs` (открытие/задержка, закрытие/задержка, Esc, пустая корзина, клик → страница товара с `?v_id=`, пустой footer скрыт) и сценариями закрытия pinned-режима (повторный тап, клик вне, Escape); существующие pinned-toggle тесты сохраняются без замены; проверить en/sr-пары клавиш `cartPreview.*`. Прогон: `npm test` в `frontend/` + `tsc`/ESLint/build. Если правки затронут Next-специфичные API компонентов — свериться с `node_modules/next/dist/docs/` (frontend/AGENTS.md).

## Risks / Trade-offs

- [Расхождение описания TB-15 §4 и реализованного/подтверждённого поведения] → решение владельца зафиксировано в D1 и переносится в комментарий YouTrack (task 2.3), чтобы приёмка шла по обновлённому критерию, а не по устаревшему тексту §4.
- [Гибридные ноутбуки (тач + мышь)] → hover-путь работает по `any-hover: hover`, тап по экрану открывает закреплённый предпросмотр — оба сценария покрыты тестами.
- [Недостаточное покрытие сценариев закрытия pinned-режима] → дополнить тесты во группе 2 (повторный тап, клик вне, Escape).
- [Кламп высоты 520 px может считаться выходящим за «450–550» при ином чтении] → значение внутри диапазона TB-15 §3; при требовании — одна константа в `cartPreviewPosition`.

## Migration Plan

Изменений данных и кода мобильного поведения нет: правки ожидаемо ограничены стилями/тестами/документацией. Merge → обычный deploy. Откат — revert коммитов стилистических правок; БД/API не затронуты. Deployment только после проверки и согласования (TB-15 §8).

## Open Questions

- Q1 (владелец продукта) — **закрыт 2026-11-16**: pinned-toggle (предпросмотр по тапу на мобильных) — верное поведение как в `main`; TB-15 §4 «тап → страница корзины» заменён. Направление D1 подтверждено, правки кода мобильности не требуются.
- Q2 (дизайнер) — **закрыт 2026-11-16**: отдельный pinned-variant в Figma не нужен (можно отложить); влияет только на CSS-детали, на спеку не влияет.
