#!/usr/bin/env bash
# Деплой release-кандидата на staging (test.tamir.rs / test-api.tamir.rs).
#
# Отличия от deploy-vps.sh (product-flow, ТЗ §2–5):
#   * секреты берутся из /opt/tamir-staging/secrets, а не из исходного checkout;
#   * миграции выполняются всегда (staging обязан идти впереди прода), прод — нет;
#   * сид только по явному TAMIR_ALLOW_SEED=1;
#   * health-check публичных URL только когда выпущен туннель;
#   * никаких прод-адресов: guard из lib/staging-release.sh.
#
# Запускается self-hosted runner'ом (workflow_run после Verify в main) или вручную:
#   sudo -u actions-runner bash scripts/deploy-staging.sh <40-hex SHA из origin/main>
set -Eeuo pipefail
umask 077
HERE="$(cd "$(dirname "$0")" && pwd)"
source "$HERE/lib/staging-release.sh"
staging_root_defaults

# pm2-демон, секреты и релизы принадлежат STAGING_USER; root-запуск породил бы
# отдельный root-демон pm2 и root-права на релизы — это запрещено.
[ "$(id -un)" = "$STAGING_USER" ] || staging_abort \
  "Staging-деплой выполняется пользователем $STAGING_USER (под ним же работают runner и pm2): sudo -u $STAGING_USER bash scripts/deploy-staging.sh <sha>"

for command in git node npm pm2 docker curl tar flock; do
  command -v "$command" >/dev/null || staging_abort "Нет команды: $command"
done
staging_require_secrets
staging_assert_config_safe

cd "$STAGING_REPO_DIR"
exec 9>"$STAGING_ROOT/deploy.lock"
flock -n 9 || staging_abort "Другой staging-деплой уже выполняется"
[[ -z "$(git status --porcelain --untracked-files=no)" ]] || staging_abort "В клоне есть локальные правки отслеживаемых файлов — деплой по git-flow запрещён"

# GitHub периодически отвергает deploy key (замерено на проде 04.11); fetch read-only,
# поэтому повторяем, а падаем только если не вышло ни разу.
fetch_ok=0
for attempt in 1 2 3 4 5 6 7 8 9 10 11 12; do
  if git fetch origin main; then fetch_ok=1; break; fi
  echo "git fetch origin main не вышел (попытка ${attempt}/12), жду 15 с..." >&2
  sleep 15
done
(( fetch_ok )) || staging_abort "git fetch origin main не вышел ни разу — проверьте deploy key и сеть"

if [[ $# -ne 1 || ! $1 =~ ^[0-9a-f]{40}$ ]]; then
  staging_abort "Использование: deploy-staging.sh <40-hex SHA, прошедший Verify>. Релиз «просто HEAD main» запрещён"
fi
target="$(git rev-parse --verify "$1^{commit}" 2>/dev/null)" || staging_abort "Коммит $1 не найден в клоне (возможно, ветку переписали)"

# Единственный путь привилегированного runner'а — коммит из main, уже прошедший Verify.
# Обход доступен только вручную по SSH: TAMIR_ALLOW_NON_MAIN=1 (и ff-merge тогда пропускается).
if [ "${TAMIR_ALLOW_NON_MAIN:-0}" = "1" ]; then
  echo "ВНИМАНИЕ: TAMIR_ALLOW_NON_MAIN=1 — депля коммит вне origin/main, ответственность ручная." >&2
else
  git merge-base --is-ancestor "$target" origin/main || staging_abort "Коммит $target не входит в origin/main: staging принимает только прошедший Verify код из main"
fi

# Клону нужен сам код целевого коммита: иначе выполняются старые скрипты из HEAD клона,
# а не те, что прошли Verify. Переключаем клон на коммит и перезапускаем этот же скрипт
# из него (блокировка flock на fd 9 переживает exec, повторного захвата не будет).
clone_head="$(git rev-parse HEAD)"
if [ "$clone_head" != "$target" ]; then
  if [ "${TAMIR_DEPLOY_RESYNC:-0}" = "1" ]; then
    staging_abort "После синхронизации HEAD клона (${clone_head:0:12}) снова не равен $target"
  fi
  git checkout -q --force --detach "$target" || staging_abort "Не удалось переключить клон $STAGING_REPO_DIR на $target"
  staging_note "Клон обновлён ${clone_head:0:12} -> ${target:0:12}, перезапускаю скрипт из этого коммита"
  TAMIR_DEPLOY_RESYNC=1 exec bash "$STAGING_REPO_DIR/scripts/deploy-staging.sh" "$target"
fi

release_id="$(date -u +%Y%m%dT%H%M%SZ)-${target:0:12}"
release_dir="$STAGING_RELEASES_DIR/$release_id"
backup_dir="$STAGING_BACKUP_DIR/$release_id"
mkdir -p "$release_dir" "$backup_dir"
export TAMIR_SOURCE="$STAGING_REPO_DIR" TAMIR_RELEASE="$release_dir" TAMIR_BACKUP="$backup_dir"

staging_note "Релиз $release_id ($target)"
pm2 jlist > "$backup_dir/pm2.json"
git rev-parse HEAD > "$backup_dir/source-commit.txt"

# Экосистема предыдущего релиза — то, на что откатывает activate-staging-release.sh.
if [ -L "$STAGING_CURRENT_LINK" ] || [ -e "$STAGING_CURRENT_LINK" ]; then
  previous_release="$(readlink -f "$STAGING_CURRENT_LINK")"
  printf '%s\n' "$previous_release" > "$backup_dir/previous-release.txt"
  if [ -f "$previous_release/ecosystem.config.cjs" ]; then
    cp "$previous_release/ecosystem.config.cjs" "$backup_dir/ecosystem.config.cjs"
  else
    echo "Внимание: у предыдущего релиза нет экосистемы ($previous_release) — откат будет только останавливать процессы." >&2
  fi
fi

git archive "$target" | tar -x -C "$release_dir"

# Снимок БД до релиза: staging-данные анонимизированные, но их всё равно должно быть
# к чему вернуть. Пароль не попадает в argv.
staging_note "pg_dump staging БД"
pg_password="$(staging_pg_password)"
staging_compose exec -T -e PGPASSWORD="$pg_password" postgres pg_dump --format=custom \
  --username="$STAGING_DB_USER" --dbname="$STAGING_DB_NAME" > "$backup_dir/database.dump"
[ -s "$backup_dir/database.dump" ] || staging_abort "pg_dump вернул пустой файл"

# Секреты staging в релиз: те же имена файлов, что проверяет check-review-config.cjs.
cp "$STAGING_ENV_FILE" "$release_dir/backend/.env"
cp "$STAGING_FRONTEND_ENV_FILE" "$release_dir/frontend/.env.production.local"
chmod 600 "$release_dir/backend/.env" "$release_dir/frontend/.env.production.local"

staging_write_ecosystem "$release_dir"

# Publishable key витрины берём из БД staging (свой канал, не прод).
# Витрина шлёт его как заголовок x-publishable-api-key, и это должен быть api_key.token
# (pk_...), а не api_key.id (apk_...) - иначе API отвечает 400 "not_allowed".
publishable_key="$(staging_psql_value "SELECT token FROM api_key WHERE type = 'publishable' AND revoked_at IS NULL AND token LIKE 'pk_%' ORDER BY created_at LIMIT 1;" || true)"
if [ -z "$publishable_key" ] && [ -s "$STAGING_SECRETS_DIR/publishable-key" ]; then
  publishable_key="$(head -n1 "$STAGING_SECRETS_DIR/publishable-key" | tr -d '\r')"
fi
if [ -z "$publishable_key" ]; then
  staging_abort "Нет publishable key staging. Сначала: TAMIR_ALLOW_SEED=1 scripts/deploy-staging.sh <sha> (сид создаёт ключ) или файла $STAGING_SECRETS_DIR/publishable-key"
fi
case "$publishable_key" in
  pk_*) ;;
  *) staging_abort "Publishable key staging не похож на токен Medusa (нужен api_key.token вида pk_...)" ;;
esac
printf '%s\n' "$publishable_key" > "$STAGING_SECRETS_DIR/publishable-key"
chmod 600 "$STAGING_SECRETS_DIR/publishable-key"
sed -i "s#^NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY=.*#NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY=$publishable_key#" \
  "$release_dir/frontend/.env.production.local" "$STAGING_FRONTEND_ENV_FILE"

# Медиа живёт вне релиза: релизы меняются, загруженные картинки — нет.
mkdir -p "$STAGING_SHARED_UPLOADS/static" "$STAGING_SHARED_UPLOADS/private-static"
node <<'JS'
const fs = require('node:fs'), path = require('node:path')
const release = process.env.TAMIR_RELEASE, shared = process.env.STAGING_SHARED_UPLOADS
for (const name of ['static', 'private-static']) {
  for (const root of ['backend', 'backend/.medusa/server']) {
    const dest = path.join(release, root, name)
    if (fs.existsSync(dest)) fs.rmSync(dest, { recursive: true, force: true })
    fs.mkdirSync(path.dirname(dest), { recursive: true })
    fs.symlinkSync(path.join(shared, name), dest, 'dir')
  }
}
JS

trap 'echo "Сборка/подготовка упала. Работающие процессы pm2 не тронуты. Бэкап: $backup_dir" >&2' ERR

(cd "$release_dir/backend" && npm ci --no-audit --no-fund)
node "$release_dir/scripts/check-review-config.cjs"

staging_note "Сборка backend"
staging_run "$release_dir" "$STAGING_PM2_BACKEND" npm run build

# Migrations — обязательный шаг staging (прод их не запускает).
staging_note "Миграции БД staging"
staging_run "$release_dir" "$STAGING_PM2_BACKEND" npx --no-install medusa db:migrate
staging_note "Расширения schema (reviews/decimal)"
staging_run "$release_dir" "$STAGING_PM2_BACKEND" npx --no-install medusa exec ./src/scripts/setup-reviews.ts
staging_run "$release_dir" "$STAGING_PM2_BACKEND" npx --no-install medusa exec ./src/scripts/setup-decimal-attributes.ts

if [ "${TAMIR_ALLOW_SEED:-0}" = "1" ]; then
  staging_note "Сид по TAMIR_ALLOW_SEED=1"
  staging_run "$release_dir" "$STAGING_PM2_BACKEND" npx --no-install medusa exec ./src/scripts/seed.ts
fi

# Почта до переключения процессов: STARTTLS + auth к локальному Mailpit.
# NODE_EXTRA_CA_CERTS приходит из экосистемы релиза — без него Node не примет сертификат Mailpit.
staging_note "Проверка SMTP (STARTTLS + auth)"
staging_run "$release_dir" "$STAGING_PM2_BACKEND" npx --no-install medusa exec ./src/scripts/check-email.ts

# Администратор staging: отдельный аккаунт, креды в секретах (не в git, не в отчётах).
# Таблица админов Medusa называется "user". Анонимизация снимает пароли прода
# (provider_identity.provider_metadata), поэтому наличие строк в "user" не значит,
# что в админку можно войти: ищем свой staging-адрес, а не любое число пользователей.
admin_file="$STAGING_SECRETS_DIR/staging-admin.txt"
admin_email="staging-admin@tamir.local"
admin_count="$(staging_psql_value "SELECT count(*) FROM \"user\" WHERE email = '$admin_email';" 2>/dev/null || echo 0)"
if [ "${admin_count:-0}" = "0" ]; then
  staging_note "Создаю staging-администратора"
  admin_password="$(openssl rand -base64 18)"
  staging_run "$release_dir" "$STAGING_PM2_BACKEND" npx --no-install medusa user -e "$admin_email" -p "$admin_password"
  umask 077
  cat > "$admin_file" <<EOF
# Staging: $STAGING_SITE_URL/a (доступен только через туннель test.tamir.rs).
email=$admin_email
password=$admin_password
EOF
  chmod 600 "$admin_file"
  staging_note "Креды администратора: $admin_file (пароль в отчёты не выносить)"
fi

staging_note "Сборка витрины"
(cd "$release_dir/frontend" && npm ci --no-audit --no-fund && npm run lint -- --quiet)
staging_run "$release_dir" "$STAGING_PM2_FRONTEND" npm run build
(cd "$release_dir/frontend" && npm test)

trap - ERR
bash "$HERE/activate-staging-release.sh" "$release_dir" "$backup_dir"

# Клон продвигаем только после успешной активации: при откате main на машине остаётся
# на предыдущем релизе. Откат к более старому коммиту main допустим (staging — не прод),
# поэтому ff-merge пропускаем с предупреждением, а не падаем в самом конце.
if [ "${TAMIR_ALLOW_NON_MAIN:-0}" != "1" ]; then
  if git merge-base --is-ancestor HEAD "$target"; then
    git merge --ff-only "$target"
  else
    echo "HEAD клона не является предком $target (откат к более старой ревизии) — ff-merge пропущен." >&2
  fi
fi

# Храним последние 14 релизов/бэкапов; ручные файлы не трогаем.
ls -1dt "$STAGING_BACKUP_DIR"/[0-9]*T[0-9]*Z-*/ 2>/dev/null | tail -n +15 | while IFS= read -r old; do
  echo "Удаляю старый бэкап: $old"
  rm -rf -- "$old"
done
ls -1dt "$STAGING_RELEASES_DIR"/[0-9]*T[0-9]*Z-*/ 2>/dev/null | tail -n +15 | while IFS= read -r old; do
  echo "Удаляю старый релиз: $old"
  rm -rf -- "$old"
done

bash "$HERE/staging-smoke.sh" || staging_abort "Smoke-проверки staging упали. Бэкап: $backup_dir"

echo "Staging-деплой завершён. Релиз: $release_dir  Бэкап: $backup_dir"
