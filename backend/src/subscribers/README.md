# События TAMIR

Сверено с кодом 11 октября 2026. Medusa загружает эти subscribers; у каждого стабильный `subscriberId`.

| Файл | События | Работа |
| --- | --- | --- |
| `customer-welcome.ts` | `customer.created` | Welcome email только активному покупателю с `has_account=true`; row lock и marker в metadata защищают от обычных повторов |
| `product-localized-url.ts` | `product.created`, `product.updated`, `translation.created/updated/deleted` | Синхронизация EN URL и готовности контента; translation-события обрабатываются только для product/en |
| `category-localized-url.ts` | `product-category.created/updated`, `translation.created/updated` | Native названия и стабильные SR/EN category handles; translation-события только для product_category |

Создание категории разрешает заполнение недостающих переводов. Изменение имени не должно молча переименовывать закреплённый URL. Восстановление/подготовка существующих данных также выполняется `prepare-english-store.ts`.

Welcome email отправляется после создания аккаунта. Он не является проверкой email: код подтверждения отправляет registration API до создания аккаунта. Сбой welcome не откатывает аккаунт; гарантированной durable очереди писем этот subscriber не добавляет. Сбой после принятия письма SMTP, но до записи marker, оставляет возможность повторной доставки. [Email](../../../docs/EMAIL.md).

Не обходите commerce workflows ручной записью, ожидая тех же событий. Для проверки правил используйте SQL-интеграции URL/локализации и email unit tests из [TESTING.md](../../../docs/TESTING.md).
