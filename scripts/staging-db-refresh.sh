#!/usr/bin/env bash
# Обслуживание данных staging (ТЗ §6): перенос анонимизированных данных с прода.
#
#   sudo bash scripts/staging-db-refresh.sh <файл-дампа> [--no-anonymize] [--keep-apps]
#
# Дамп обязателен: файлы с прода не должны задерживаться на staging.
# Порядок: резервная копия текущей БД -> восстановление -> scripts/sql/staging-anonymize.sql
# -> миграции активного релиза -> запуск приложений.
set -Eeuo pipefail
umask 077
HERE="$(cd "$(dirname "$0")" && pwd)"
source "$HERE/lib/staging-release.sh"
staging_root_defaults

dump_file="${1:?Укажите файл дампа, например /root/tamir_prod_2026-11-05.dump}"
shift || true
anonymize=1
keep_apps=0
for arg in "$@"; do
  case "$arg" in
    --no-anonymize) anonymize=0 ;;
    --keep-apps) keep_apps=1 ;;
    *) staging_abort "Неизвестный аргумент: $arg" ;;
  esac
done

staging_require_secrets
staging_assert_config_safe
[ -f "$dump_file" ] || staging_abort "Нет файла дампа: $dump_file"
dump_file="$(readlink -f "$dump_file")"

sql_file="$(staging_repo_root)/scripts/sql/staging-anonymize.sql"
[ -f "$sql_file" ] || staging_abort "Нет файла анонимизации: $sql_file"

timestamp="$(date -u +%Y-%m-%dT%H%M%SZ)"
staging_note "Дамп: $(basename "$dump_file") ($(du -h "$dump_file" | cut -f1))"

# 1. Резервная копия того, что в staging прямо сейчас: откат данных всегда возможен.
pre_backup="$STAGING_BACKUP_DIR/pre-db-refresh-$timestamp.dump"
mkdir -p "$STAGING_BACKUP_DIR"
if staging_psql_value "SELECT count(*) FROM pg_stat_user_tables;" >/dev/null 2>&1; then
  staging_pg_dump "$pre_backup"
  staging_note "Резервная копия staging-БД: $pre_backup"
else
  staging_note "Staging-БД пуста или недоступна — резервная копия не требуется."
fi

# 2. Приложения гасим: миграции и перезапись схемы не должны идти параллельно с трафиком.
if [ "$keep_apps" -eq 0 ]; then
  pm2 stop "$STAGING_PM2_BACKEND" >/dev/null 2>&1 || true
  pm2 stop "$STAGING_PM2_FRONTEND" >/dev/null 2>&1 || true
fi

cleanup_apps() {
  if [ "$keep_apps" -eq 0 ]; then
    pm2 restart "$STAGING_PM2_BACKEND" --update-env >/dev/null 2>&1 || true
    pm2 restart "$STAGING_PM2_FRONTEND" --update-env >/dev/null 2>&1 || true
  fi
}
trap cleanup_apps EXIT

staging_note "Пересоздаю схему staging-БД"
staging_recreate_database

staging_note "Восстанавливаю дамп"
if staging_pg_restore "$dump_file"; then
  :
else
  staging_abort "Восстановление дампа не удалось. Staging-БД пуста; резервная копия: $pre_backup"
fi

# 3. Пустой дамп с прода — не повод поднимать пустой staging, но и не ошибка.
tables="$(staging_psql_value "SELECT count(*) FROM information_schema.tables WHERE table_schema='public' AND table_type='BASE TABLE';")"
staging_note "Таблиц в схеме public: $tables"

if [ "$anonymize" -eq 1 ]; then
  if [ "${tables:-0}" -gt 0 ]; then
    staging_note "Анонимизация PII (scripts/sql/staging-anonymize.sql)"
    staging_psql_file "$sql_file" || staging_abort "Анонимизация не прошла: данные с прода не допускать к трафику"
    masked_tables="$(staging_psql_value "SELECT count(*) FROM tamir_staging.anonymized_column;" || echo 0)"
    masked_rows="$(staging_psql_value "SELECT coalesce(sum(rows_masked),0) FROM tamir_staging.anonymized_column;" || echo 0)"
    staging_note "Обезличено колонок: $masked_tables, строк: $masked_rows"
  else
    staging_note "Схема пуста — анонимизация не требуется."
  fi
else
  echo "Внимание: анонимизация пропущена по --no-anonymize." >&2
fi

# 4. Схема из дампа может быть старее кода активного релиза — нагоняем миграции.
if [ -L "$STAGING_CURRENT_LINK" ]; then
  release_dir="$(readlink -f "$STAGING_CURRENT_LINK")"
  staging_note "Миграции активного релиза"
  staging_run "$release_dir" "$STAGING_PM2_BACKEND" npx --no-install medusa db:migrate
  staging_run "$release_dir" "$STAGING_PM2_BACKEND" npx --no-install medusa exec ./src/scripts/setup-reviews.ts
  staging_run "$release_dir" "$STAGING_PM2_BACKEND" npx --no-install medusa exec ./src/scripts/setup-decimal-attributes.ts
  if [ -f "$STAGING_SECRETS_DIR/publishable-key" ]; then
    rm -f "$STAGING_SECRETS_DIR/publishable-key"
    staging_note "Кэш publishable key сброшен: ключи могут быть из другого дампа"
  fi
else
  staging_note "Активного релиза нет — миграции будут при следующем деплое."
fi

trap - EXIT
cleanup_apps
if [ -L "$STAGING_CURRENT_LINK" ]; then
  staging_wait_health || staging_note "После замены данных health не вернулся — проверьте pm2 logs."
fi

rm -f "$dump_file"
staging_note "Файл дампа удалён: $dump_file (прода-файлы на staging не храним)"
staging_note "Данные staging обновлены: $(basename "$pre_backup") — точка отката"
