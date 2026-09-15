# Google Search Console

Сайт отдаёт автоматически генерируемые файлы:
- https://tamir.rs/robots.txt
- https://tamir.rs/sitemap.xml

Sitemap включает главную страницу и доступные через Store API товары. Новые товары появляются автоматически, отдельный деплой для них не нужен. Дата lastmod берётся из updated_at товара, если дата корректна. При недоступном backend генерация может завершиться ошибкой — проверьте его /health.

Каталог без фильтров канонизирован на главную и не дублируется в sitemap. Личный кабинет, корзина, оформление и API запрещены к обходу в robots.txt; это не механизм защиты данных или гарантированного удаления из индекса.

Обновление кода на VPS:
```bash
cd /root/tamir_balkan && git pull --ff-only && bash scripts/deploy-vps.sh
curl -fsS https://tamir.rs/robots.txt
curl -fsS https://tamir.rs/sitemap.xml
```

В Google Search Console выберите ресурс tamir.rs → Файлы Sitemap → добавьте https://tamir.rs/sitemap.xml. Robots отдельно отправлять не требуется: он ссылается на sitemap. Отправка sitemap не гарантирует индексацию.
