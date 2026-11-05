#!/usr/bin/env bash
# Переключает staging на уже собранный релиз и оставляет путь откатa.
#
# Отличия от activate-release.sh (прод):
#   * публичные URL проверяются только когда выпущен cloudflared-туннель (маркер),
#     иначе деплой падал бы до появления HTTPS-входа;
#   * symlink current/a указывает на активный релиз — от него зависит откат следующего деплоя.
#   * rollback: pm2 delete + pm2 start экосистемы предыдущего релиза.
set -Eeuo pipefail
umask 077
HERE="$(cd "$(dirname "$0")" && pwd)"
source "$HERE/lib/staging-release.sh"
staging_root_defaults

release_dir=${1:?Release directory required}
backup_dir=${2:?Backup directory required}
export TAMIR_RELEASE="$release_dir"

test -f "$release_dir/frontend/.next/BUILD_ID" || staging_abort "Нет сборки витрины: $release_dir/frontend/.next/BUILD_ID"
test -f "$release_dir/backend/.medusa/server/package.json" || staging_abort "Нет сборки backend: $release_dir/backend/.medusa/server/package.json"
test -f "$release_dir/ecosystem.config.cjs" || staging_abort "Нет экосистемы релиза: $release_dir/ecosystem.config.cjs"

# pm2 обязан работать в каталоге релиза: иначе процессы останутся на старых путях.
node - "$release_dir/ecosystem.config.cjs" <<'JS'
const config = require(process.argv[2])
for (const [name, folder] of [['tamir-backend', 'backend'], ['tamir-frontend', 'frontend']]) {
  const apps = config.apps.filter(a => a.name === name)
  if (apps.length !== 1 || apps[0].cwd !== process.env.TAMIR_RELEASE + '/' + folder) {
    throw new Error('Unexpected release configuration: ' + name)
  }
}
if (config.apps.length !== 2) throw new Error('Unexpected applications in release configuration')
JS

rollback() {
  trap - ERR
  echo "Активация упала. Возвращаю предыдущие приложения staging." >&2
  pm2 delete "$STAGING_PM2_BACKEND" >/dev/null 2>&1 || true
  pm2 delete "$STAGING_PM2_FRONTEND" >/dev/null 2>&1 || true
  if [ -f "$backup_dir/ecosystem.config.cjs" ] && pm2 start "$backup_dir/ecosystem.config.cjs"; then
    pm2 save --force
    echo "Прежняя конфигурация восстановлена: $(cat "$backup_dir/previous-release.txt" 2>/dev/null || echo 'ecosystem из бэкапа')" >&2
  else
    # Откатывать некуда (первый релиз): поднимаем то, что собрали, чтобы стенд не лежал,
    # но деплой всё равно остаётся упавшим — причину видно в логах.
    if pm2 start "$release_dir/ecosystem.config.cjs"; then
      echo "Откат невозможен (нет экосистемы предыдущего релиза): поднимаю новый релиз, деплой помечен упавшим. Бэкап: $backup_dir" >&2
    else
      echo "Откат невозможен ($backup_dir) и новый релиз не поднялся — нужен ручной пуск." >&2
    fi
  fi
  exit 1
}
trap rollback ERR

# Ждём именно HTTP 200, а не только соединения: на холодный старт Medusa на HP Mini
# уходит до нескольких минут, и в это время витрина отвечает 500 (её запросы к ещё не
# поднявшейся API возвращают HTML вместо JSON). `curl --retry` так не отличает.
wait_http() {
  local url="${1:?URL required}" attempts="${2:-60}" delay="${3:-3}" code="" i
  for i in $(seq 1 "$attempts"); do
    code="$(curl -s -o /dev/null -m 20 -w '%{http_code}' "$url" || true)"
    if [ "$code" = "200" ]; then
      echo "  OK $url (попытка $i)"
      return 0
    fi
    sleep "$delay"
  done
  echo "Healthcheck staging не прошёл: $url (последний код=${code:-000}, попыток=$attempts)" >&2
  return 1
}

pm2 delete "$STAGING_PM2_BACKEND" >/dev/null 2>&1 || true
pm2 delete "$STAGING_PM2_FRONTEND" >/dev/null 2>&1 || true
pm2 start "$release_dir/ecosystem.config.cjs"
staging_pm2_cwd_matches "$release_dir"

# Активный релиз фиксируем до healthcheck: откат следующего деплоя ищет экосистему здесь же.
ln -sfn "$release_dir" "$STAGING_CURRENT_LINK"
ln -sfn "$release_dir/backend" "$STAGING_ROOT/current-backend"
ln -sfn "$release_dir/frontend" "$STAGING_ROOT/current-frontend"

# Loopback-health обязателен всегда; публичные URL — только когда есть туннель.
wait_http "http://127.0.0.1:${STAGING_BACKEND_PORT}/health" 80 3
wait_http "http://127.0.0.1:${STAGING_FRONTEND_PORT}/robots.txt" 40 3
wait_http "http://127.0.0.1:${STAGING_FRONTEND_PORT}/sitemap.xml" 20 3
if staging_public_checks_enabled; then
  wait_http "${STAGING_SITE_URL}/robots.txt" 20 3
  wait_http "${STAGING_API_URL}/health" 20 3
else
  echo "Публичные проверки пропущены: нет $STAGING_TUNNEL_MARKER (scripts/staging-tunnel.sh)." >&2
fi

pm2 save --force
trap - ERR
echo "Активация staging завершена: $release_dir"
