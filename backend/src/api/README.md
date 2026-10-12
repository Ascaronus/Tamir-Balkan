# Пользовательский API TAMIR

Сверено с кодом 11 октября 2026. Методы экспортируются из `route.ts`, общие правила — в `middlewares.ts`. Ниже перечислены расширения проекта; штатные commerce/auth endpoints Medusa также используются.

## Store API

Запросы витрины используют publishable key канала продаж. Для локализации — `x-medusa-locale: sr-RS` / `en`. Customer JWT передаётся только когда нужен контекст покупателя; admin secret не попадает в frontend.

| Метод и путь | Назначение и ограничения |
| --- | --- |
| GET `/store/catalog/products` | Каталог, фильтры, цены/остатки, сортировки и поиск переводов; контекст региона и канала обязателен |
| GET `/store/product-redirects/:handle` | Разрешение локализованного/старого адреса, включая повторный импорт той же модели из soft-deleted карточки; последующая загрузка через Store products проверяет доступность каналу |
| POST `/store/auth/phone-login` | Вход покупателя по телефону и паролю |
| POST `/store/registration/start` | CAPTCHA `register`, отправка кода; пока не создаёт аккаунт |
| POST `/store/registration/verify` | Проверка кода и создание аккаунта; защищённое восстановление оставшейся auth identity |
| POST `/store/password-reset/start` | CAPTCHA `password_reset`, отправка кода; одинаковый публичный ответ для неизвестного email |
| POST `/store/password-reset/verify` | Одноразовый код и смена пароля существующего покупателя |
| GET `/store/reviews` | Опубликованные отзывы; необязательная авторизация для состояния покупателя |
| POST `/store/reviews` | Авторизованный покупатель, CAPTCHA, один отзыв на товар |
| GET `/store/reviews/summary` | Пакетные публичные рейтинги |
| POST `/store/reviews/:id/vote` | Авторизованный покупатель, одна неизменяемая реакция |

Публичное создание аккаунта через POST `/auth/customer/:provider/register` и POST `/store/customers` блокируется с `EMAIL_VERIFICATION_REQUIRED`: используйте подтверждение email. Админское создание покупателя и гостевое оформление этим не заменяются.

## Admin API

Требуется аутентификация пользователя админки (bearer/session). Авторизация также проверяется обработчиками. Маршруты отзывов дополнительно проверяют личность модератора.

| Метод и путь | Назначение |
| --- | --- |
| GET/POST `/admin/rozetka` | Предпросмотр исходного/заданного URL или XML; без записи товаров |
| GET/POST `/admin/rozetka/settings` | Общий сохранённый URL источника в metadata магазина |
| POST `/admin/rozetka/translate` | Перевод подготовленного текста через серверный Google key |
| POST `/admin/rozetka/import` | Один подготовленный товар, выбранные варианты, настройки и идентификатор источника |
| GET/POST `/admin/products/:id/localized-url` | Просмотр/изменение EN URL с сохранением aliases |
| POST `/admin/products/:id/option-translations/translate` | Автоперевод опций для редактора |
| GET `/admin/reviews` | Список отзывов для модератора |
| POST `/admin/reviews/:id` | Модерация с проверкой версии и audit |

Rozetka принимает XML до 10 МБ; middleware разрешает JSON body до 25 МБ с учётом упаковки XML. Источник ограничен валидированным HTTPS URL tamir.ua/www.tamir.ua либо загруженным XML. Не удаляйте эту проверку для обхода ошибки произвольного URL.

`GET /store/custom` и `GET /admin/custom` — оставшиеся технические ответы 200. Store-маршрут также импортирует test fulfillment provider, чтобы его файл включался в backend build. Они не заменяют `/health` и не являются API импорта.

## Где искать реализацию

Основная логика — `../utils/`: `catalog-*`, `rozetka-*`, `product-urls`, `category-localization`, `option-auto-translate`, registration/password-reset/review helpers. Commerce-записи используют core flows Medusa. Дополнительные SQL-таблицы создаёт [setup-reviews](../scripts/README.md), а не произвольный SQL в браузере.

[Каталог](../../../docs/CATALOG-API.md) · [Импорт](../../../docs/ROZETKA-ADMIN-IMPORT.md) · [Регистрация](../../../docs/REGISTRATION.md) · [Отзывы](../../../docs/REVIEWS.md) · [Тесты](../../../docs/TESTING.md).
