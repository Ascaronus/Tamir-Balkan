# Spec Delta

## Purpose

Фиксирует текущее поведение корзины и оформления заказа tamir.rs: создание корзины через Medusa Store API (medusa js-sdk), хранение идентификатора корзины в `localStorage`, изменение позиций и пошаговое оформление с доставкой и оплатой при получении в валюте RSD.

## ADDED Requirements

### Requirement: Cart is created through the Store API with a region chosen by shipping country

`sdk.store.cart.create` обязана (MUST) вызываться с `region_id` региона, подобранного по стране доставки (`getRegionByCountry`), и `shipping_address.country_code`; параллельные обращения одной страницы к корзине для той же страны обязаны (MUST) переиспользовать один общий незавершённый запрос (`pendingCarts`).

#### Scenario: First cart for Serbia

- **WHEN** пользователь впервые добавляет товар и сохранённой корзины нет
- **THEN** frontend создаёт корзину через `POST /store/carts` с `region_id` сербского региона и `country_code: rs`
- **AND** корзина работает в валюте RSD

### Requirement: Guest cart id is stored in localStorage under the tb_cart_id key

Frontend обязана (MUST) хранить id активной корзины в `window.localStorage` под ключом `tb_cart_id` и переиспользовать её при повторных визитах; если сохранённая корзина не найдена (404) или уже завершена (`completed_at`), frontend обязана (MUST) сбросить `tb_cart_id` и создать новую корзину, а при смене страны — обновить `region_id` существующей корзины.

#### Scenario: Returning visitor with an active cart

- **WHEN** страница обращается к корзине и в `localStorage` есть `tb_cart_id`
- **THEN** frontend загружает эту корзину через `GET /store/carts/{id}` и не создаёт новую

#### Scenario: Saved cart is already completed

- **WHEN** корзина по сохранённому id имеет `completed_at` или отсутствует на бэкенде
- **THEN** frontend удаляет `tb_cart_id`
- **AND** создаёт новую корзину

### Requirement: Cart line items are changed through js-sdk methods

Frontend обязана (MUST) добавлять, изменять количество и удалять позиции через `sdk.store.cart.createLineItem`, `updateLineItem` и `deleteLineItem` с проверкой положительного количества (`requireQuantity`); при ошибке «корзина уже завершена» добавление обязана (MUST) повторить на новой корзине.

#### Scenario: Changing a line item quantity

- **WHEN** пользователь меняет количество позиции в корзине
- **THEN** frontend вызывает `sdk.store.cart.updateLineItem` с новым количеством
- **AND** обновлённая корзина отображается без перезагрузки страницы

### Requirement: Checkout goes through the address, shipping and payment steps on the checkout page

Страница checkout обязана (MUST) проводить оформление последовательно: адреса и e-mail (`sdk.store.cart.update`), вариант доставки (`GET /store/shipping-options` + `sdk.store.cart.addShippingMethod`), платёжная сессия (`sdk.store.payment.initiatePaymentSession`) и завершение корзины (`sdk.store.cart.complete`). Провайдер оплаты берётся из `GET /store/payment-providers?region_id=` — это провайдер с подстрокой `system` в `id` (в нижнем регистре), а не константа.

#### Scenario: Successful checkout

- **WHEN** пользователь отправил корректный адрес, выбрал доставку и подтверждает заказ
- **THEN** frontend проставляет в корзину `email`, `shipping_address` и `billing_address`, выбирает способ доставки, инициализирует платёжную сессию провайдером с `system` в `id`
- **AND** `billing_address` при этом копируется из `shipping_address`
- **AND** завершает корзину и получает заказ

#### Scenario: No shipping options available

- **WHEN** для введённого адреса `GET /store/shipping-options` возвращает пустой список
- **THEN** frontend показывает ошибку и не создаёт заказ

#### Scenario: No cash-on-delivery payment provider in the region

- **WHEN** `GET /store/payment-providers?region_id=...` не содержит провайдера с `system` в `id`
- **THEN** frontend показывает сообщение об ошибке и не вызывает `sdk.store.cart.complete`
- **AND** корзина остаётся незавершённой

### Requirement: Guest checkout is available without sign-in

Оформление обязана (MUST) быть доступно неавторизованному посетителю: на странице checkout показывается выбор «продолжить как гость» или «войти», заказ создаётся по введённому e-mail без обязательного входа; для авторизованного покупателя frontend обязана (MUST) предлагать использовать данные аккаунта.

#### Scenario: Checkout without signing into an account

- **WHEN** неавторизованный пользователь заполняет форму и подтверждает заказ
- **THEN** заказ создаётся без требования входа
- **AND** в заказе сохраняется указанный e-mail

### Requirement: After checkout the cart is cleared and the confirmation is read from sessionStorage

После успешного `complete` frontend обязана (MUST) сохранить квитанцию заказа (`id`, `display_id`, `total`, `currency_code`) в `sessionStorage` под ключом `tamir_order_receipts`, удалить `tb_cart_id` и перейти на `/rs/order/{id}` или `/en/order/{id}`; страница подтверждения обязана (MUST) сначала читать квитанцию из `sessionStorage`, затем — `GET /store/orders?id=...` (для авторизованных), иначе показывать состояние «не подтверждено».

#### Scenario: Navigation to the confirmation page

- **WHEN** `sdk.store.cart.complete` возвращает объект заказа
- **THEN** frontend сохраняет квитанцию в `sessionStorage`, очищает `tb_cart_id` и переходит на `/order/{id}`
- **AND** страница показывает номер `display_id` подтверждённого заказа

#### Scenario: Guest opens the confirmation page directly without a receipt

- **WHEN** гость открывает `/rs/order/{id}` в другой вкладке, где `sessionStorage` не содержит квитанции
- **THEN** страница показывает сообщение «не подтверждено» с подсказкой вернуться в браузер покупки или войти
- **AND** данные чужого заказа не раскрываются
