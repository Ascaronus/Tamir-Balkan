# Скрипты обслуживания TAMIR

Сверено с кодом 11 октября 2026. Рабочий каталог — `backend/` соответствующего окружения/релиза. Обычный формат запуска: `npx medusa exec ./src/scripts/<file>.ts`. Он загружает конфигурацию приложения и может менять реальную БД; сам по себе `exec` не означает dry run.

## Поддерживаемые операции

| Файл | Действие / условия |
| --- | --- |
| `add-store-locales.ts` | Создаёт отсутствующие Translation locales и объединяет локали магазина; по умолчанию `en,sr,sr-RS`, переопределение `STORE_LOCALE_CODES`; npm script `store-locales` |
| `setup-reviews.ts` | Повторяемое создание review/vote/audit/rate, registration-code, password-reset и product-URL таблиц/indexes в транзакции |
| `setup-decimal-attributes.ts` | Расширение размеров/веса variant/inventory до double precision; сохраняет данные, не откатывает тип к integer |
| `check-email.ts` | Проверка SMTP-соединения/авторизации, без отправки письма |
| `import-rozetka-xml.ts` | Пакетный XML-импорт; цены, остатки и товары изменяются. [Режимы](../../../docs/IMPORT-MODES.md) |
| `normalize-rozetka-products.ts` | Нормализация завершённых старых admin-импортов: базовый SR-текст и читаемый URL, сохранение исходного текста/старого alias. По умолчанию dry run; запись только при `ROZETKA_NORMALIZE_APPLY=true` |
| `prepare-english-store.ts` | Запись недостающих переводов категорий/EN-товаров/опций и синхронизация URL; может вызвать Google и исправить EN-текст с кириллицей; dry run нет |

`setup-reviews.ts` сохранил историческое название, но требуется также для регистрации, восстановления и локализованных URL. Это не замена `medusa db:migrate` для штатной схемы Medusa.

Пример **просмотра** плана нормализации без записи:

```bash
ROZETKA_NORMALIZE_APPLY=false npx medusa exec ./src/scripts/normalize-rozetka-products.ts
```

Перед записью проверьте резервную копию и результат dry run. Не запускайте нормализацию, импорт и deploy параллельно. Текущий deploy выполняет setup и SMTP check до активации, а normalize/apply и prepare-English — после неё; [порядок и откат](../../../DEPLOY.md).

## Демо и первоначальная настройка

| Файл | Ограничение |
| --- | --- |
| `seed.ts` | Демо-магазин/товары/настройки; `npm run seed`. Только отдельная учебная база, не регулярное обновление production |
| `add-balkan-regions.ts` | Создание предопределённых регионов; сначала изучите валюты и существующие настройки, не добавляйте новые рынки для EN-версии Сербии |
| `add-rsd-prices-to-variants.ts` | Демо-массовая установка RSD-цены **1200** вариантам первых 500 товаров; не применять как конвертацию рабочих цен |
| `link-stub-fulfillment-to-locations.ts` | Связь stub provider `test_test` со складами (до 200); это не подключение реального перевозчика |
| `test-fulfillment-provider.ts` | Экспорт ModuleProvider, подключённый конфигурацией. Несмотря на каталог, это не CLI-функция для `medusa exec` |

[Окружение](../../../docs/ENVIRONMENT.md) · [Тесты](../../../docs/TESTING.md) · [Локализация](../../../docs/LOCALIZATION.md).
