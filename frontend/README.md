# TAMIR storefront

Next.js 16.2.2 / React 19 / TypeScript / Tailwind CSS 4. Витрина SR/EN обслуживает один рынок Сербии и цены RSD. Шрифт — Manrope через `next/font`, не шаблонный Geist.

## Запуск

Из корня репозитория установите зависимости через `npm ci` и `npm run deps`, настройте [окружение](../docs/ENVIRONMENT.md), запустите backend и инфраструктуру.

```bash
# Из frontend/
npm run dev
npm test
npm run lint -- --quiet
npm run build
npm start
```

`dev` использует webpack; production build — штатную сборку Next. Для проверки production-маршрутов после сборки: `node test-support/verify-localized-routes.mjs`. На VPS используйте [общий деплой](../DEPLOY.md).

## Карта кода

- `src/proxy.ts`: выбор языка только для `/`, доверенный серверный заголовок локали, редиректы старых служебных адресов.
- `src/lib/i18n/`: сообщения интерфейса, SR ↔ EN пути и серверная локаль.
- `src/app/rs/page.tsx`, `src/app/en/page.tsx`: главные `/rs` и `/en`; общий контент использует страницу каталога.
- `next.config.ts`: внутренние rewrites `/rs/korpa`, `/rs/nalog` и подстраниц в общие реализации; `/me` — старый адрес.
- `src/app/[countryCode]/`: каталог, товары, корзина, оформление, кабинет и заказ. `en` — язык URL, но аргументы commerce API сохраняют страну `rs`.
- `src/lib/store/`: API каталога, категории, товары, регион и ограничения количества.
- `src/components/i18n/LocalizedLink.tsx`, `useLocalizedRouter.ts`: локализованная навигация. Не подменять обычным Link/router без учёта языка.
- `src/components/product/`, `cart/`, `auth/`, `checkout/`, `reviews/`: покупательские сценарии.
- `src/app/sitemap.ts`, `robots.ts`, `src/lib/seo/`: SEO и структурированные данные.
- `tests/`, `test-support/`: автоматические проверки и production-route smoke test.

Названия товаров, категорий и опций приходят из переводов Medusa; словари интерфейса не заменяют администраторские переводы. Галерея сохраняет пропорции фото, увеличивается при наведении; поле количества блокируется вместе с кнопками при остатке ≤1. Нулевой счётчик отзывов скрыт, пустые звёзды остаются.

См. [маршруты](../docs/BROWSER-LANGUAGE.md), [переводы](../docs/LOCALIZATION.md), [каталог API](../docs/CATALOG-API.md), [адаптивность](../docs/RESPONSIVE-V2.md), [тестирование](../docs/TESTING.md).

Перед изменением Next.js-кода прочитайте [AGENTS.md](AGENTS.md) и релевантную документацию установленной версии в `node_modules/next/dist/docs/`.
