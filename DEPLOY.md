# Выпуск TAMIR на VPS

Актуально на 11 октября 2026. Рабочий checkout: `/root/tamir_balkan`; PM2-процессы: `tamir-backend`, `tamir-frontend`. Приложения работают из отдельных каталогов релизов, а не обязательно из checkout.

## Основной способ: GitHub Actions

1. Подготовить PR в `main`, проверить diff и результат `Verify storefront and backend`.
2. После merge workflow **Deploy TAMIR** автоматически запускает выпуск. Для повторного запуска доступен `workflow_dispatch` на `main`.
3. Проверить завершение deploy и публичные страницы.

Workflow использует ограниченный SSH-доступ `tamir-deploy` и команду `deploy`, secrets `VPS_HOST`, `VPS_PORT`, `VPS_SSH_KEY`, `VPS_KNOWN_HOSTS`, проверку host key. Конкурентные выпуски сериализованы. Сейчас push в `main` запускает deploy даже при изменении только документации; deploy берёт актуальный `origin/main`, поэтому проверяйте SHA в имени активированного релиза.

## Что делает скрипт

`scripts/deploy-vps.sh`:

1. Проверяет утилиты, отсутствие локальных изменений tracked-файлов и блокировку `/root/tamir-deploy.lock`.
2. Получает `origin/main`, проверяет допустимый fast-forward, создаёт `/root/tamir-releases/<UTC>-<SHA>`.
3. Сохраняет в `/root/tamir-backups/<UTC>-<SHA>` PostgreSQL custom dump, env, прежнюю PM2-конфигурацию и архивы public/private media.
4. Устанавливает зависимости и собирает backend/frontend в новом каталоге; выполняет frontend lint/tests и конфигурационный preflight CAPTCHA/SMTP.
5. Сохраняет доступ к существующим media через symlink. Выполняет `setup-reviews.ts`, проверку SMTP без отправки письма и `setup-decimal-attributes.ts`.
6. Обновляет checkout fast-forward и передаёт релиз `activate-release.sh`: переключает два PM2-процесса, проверяет health/robots/sitemap, сохраняет PM2.
7. Уже после активации выполняет `normalize-rozetka-products.ts` с apply и `prepare-english-store.ts`: native-переводы, адреса и опции.

Скрипт не запускает общую `medusa db:migrate` автоматически. При добавлении новых Medusa-миграций нужен отдельный план их применения и совместимости. Текущие пользовательские таблицы/дробные поля подготавливаются явно указанными скриптами.

Для deploy необходимы `git`, `npm`, `node`, `pm2`, `pg_dump`, `curl`, `tar`, `flock`, готовое окружение и по одному online-процессу каждого приложения. Это обновление существующего сервера, не установщик чистого VPS.

## Ручной запуск через SSH

```bash
ssh root@178.104.108.200
cd /root/tamir_balkan
git fetch origin main
git show origin/main:scripts/deploy-vps.sh > /tmp/tamir-deploy.sh
bash /tmp/tamir-deploy.sh
```

Скрипт сам переносит checkout к выбранному commit. Не используйте `scp` поверх активного релиза, удаление работающего `.next`, `fuser -k` или ручной `npm start` как штатный способ выпуска.

## Конфигурация и данные

Окружение редактируется в исходном каталоге и согласуется с существующими переменными PM2: [ENVIRONMENT.md](docs/ENVIRONMENT.md). Backend production wrapper стартует из `.medusa/server`; простая замена `.env` в другом каталоге не меняет уже работающий процесс.

Не удаляйте старые релизы, пока не проверили `media-paths.json` и реальные цели ссылок `static`/`private-static`: новый релиз может использовать принадлежащие им фотографии. Backup содержит секреты и данные покупателей; храните его вне Git и публичной раздачи.

## Диагностика

```bash
pm2 list
pm2 describe tamir-backend
pm2 describe tamir-frontend
pm2 logs tamir-backend --lines 100 --nostream
pm2 logs tamir-frontend --lines 100 --nostream
curl -fsS https://api.tamir.rs/health
curl -I https://tamir.rs/rs
curl -I https://tamir.rs/en
curl -fsS https://tamir.rs/robots.txt
curl -fsS https://tamir.rs/sitemap.xml
```

Ожидается: `/rs`, `/en` — 200, `/` — временный 307 по языку; старый `/rs/cart` — 308 на `/rs/korpa`. В sitemap должны быть главные обеих локалей, готовые товары и непустые категории. Проверяйте реальный товар, выбор варианта, корзину, страницу входа и импорт без создания лишних заказов.

PostgreSQL здесь может работать в Docker, поэтому отсутствие `postgresql.service` в systemd не означает отсутствие базы:

```bash
cd /root/tamir_balkan
docker compose ps -a
docker compose logs --tail=100 postgres
```

Сначала изучите ошибку. Не удаляйте том `postgres_data` и не запускайте `down -v` для восстановления рабочей базы.

## Ошибки и откат

- До активации: старые процессы продолжают работать; используйте путь backup из лога. Отдельные подготовительные изменения БД могли уже выполниться.
- При ошибке активации/health: `activate-release.sh` пытается восстановить предыдущую PM2-конфигурацию и сообщает результат.
- После активации: ошибка нормализации/переводов может завершить workflow неуспешно при уже работающей новой версии. Автоматического отката этого этапа нет. Проверьте логи и исправьте причину перед повтором.
- Откат процессов не откатывает БД. Восстановление `database.dump` — отдельная операция с риском потери новых заказов; сначала проверьте дамп на отдельной базе и выберите точку восстановления.

Не повторяйте деплой параллельно с импортом/ремонтом данных. Автоматический `prepare-english-store.ts` может обращаться к Google для недостающих переводов; он сохраняет заполненный контент по правилам [LOCALIZATION.md](docs/LOCALIZATION.md).
