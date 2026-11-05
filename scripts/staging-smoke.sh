#!/usr/bin/env bash
# Комплексная проверка staging после деплоя (ТЗ: staging smoke suite).
#
# Проверяет: контейнеры, pm2-процессы, loopback-health, витрину, витринный API
# (publishable key из staging-БД), почтовый тракт (отправка + приём в Mailpit)
# и публичные HTTPS-адреса, когда выпущен cloudflared-туннель.
#
# Запуск: sudo -u actions-runner bash scripts/staging-smoke.sh
set -Eeuo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
source "$HERE/lib/staging-release.sh"
staging_root_defaults
# pm2/docker-сокеты принадлежат STAGING_USER; root нужен только staging-tunnel.sh.
[ "$(id -un)" = "$STAGING_USER" ] || staging_abort \
  "Запускайте от имени $STAGING_USER: sudo -u $STAGING_USER bash scripts/staging-smoke.sh"

failures=0
notes=()
ok() {
  local label="$1"
  echo "OK    $label"
}
bad() {
  local label="$1"
  echo "FAIL  $label" >&2
  failures=$((failures + 1))
}
check() {
  local label="$1"
  shift
  if "$@" >/dev/null 2>&1; then ok "$label"; else bad "$label"; fi
}

[ -L "$STAGING_CURRENT_LINK" ] || staging_abort "Staging ещё не активирован: нет $STAGING_CURRENT_LINK"
release_dir="$(readlink -f "$STAGING_CURRENT_LINK")"
eco="$release_dir/ecosystem.config.cjs"
[ -f "$eco" ] || staging_abort "Нет экосистемы активного релиза: $eco"

echo "=== Staging smoke: $release_dir ==="

# --- Инфраструктура -----------------------------------------------------------
for service in postgres redis mailpit; do
  check "compose: $service запущен" staging_compose ps "$service"
done
if staging_container_id postgres | grep -q .; then
  state="$(docker inspect --format '{{.State.Health.Status}}' "$(staging_container_id postgres)" 2>/dev/null || echo none)"
  if [ "$state" = "healthy" ]; then ok "postgres healthcheck: healthy"; else bad "postgres healthcheck: $state"; fi
else
  bad "postgres контейнер не найден"
fi
check "postgresql принимает соединения" staging_psql_value "SELECT 1"
check "redis отвечает PONG" staging_redis ping
check "порты инфраструктуры смотрят только на loopback" staging_ports_are_loopback

# --- Процессы приложений ------------------------------------------------------
check "pm2: $STAGING_PM2_BACKEND online" staging_pm2_online "$STAGING_PM2_BACKEND"
check "pm2: $STAGING_PM2_FRONTEND online" staging_pm2_online "$STAGING_PM2_FRONTEND"
check "pm2: процессы работают в каталоге релиза" staging_pm2_cwd_matches "$release_dir"
check "конфиг отзывов проходит проверку" node "$release_dir/scripts/check-review-config.cjs"

backend_port="$(staging_release_env "$eco" "$STAGING_PM2_BACKEND" MEDUSA_BACKEND_PORT)"
frontend_port="$(staging_release_env "$eco" "$STAGING_PM2_FRONTEND" NEXT_PUBLIC_BASE_FRONTEND_PORT)"
backend_port="${backend_port:-$STAGING_BACKEND_PORT}"
frontend_port="${frontend_port:-$STAGING_FRONTEND_PORT}"
api_base="$(staging_release_env "$eco" "$STAGING_PM2_BACKEND" MEDUSA_BACKEND_URL)"
api_base="${api_base:-$STAGING_API_URL}"

# --- Loopback-вход приложений -----------------------------------------------
check "backend http://127.0.0.1:${backend_port}/health" curl -fsS --max-time 20 "http://127.0.0.1:${backend_port}/health"
check "frontend http://127.0.0.1:${frontend_port}/robots.txt" curl -fsS --max-time 30 -o /dev/null "http://127.0.0.1:${frontend_port}/robots.txt"
# /sitemap.xml строится запросами витрины к API по публичному URL, поэтому до
# выпуска туннеля он законно отвечает 500.
if staging_public_checks_enabled; then
  check "frontend http://127.0.0.1:${frontend_port}/sitemap.xml" curl -fsS --max-time 60 -o /dev/null "http://127.0.0.1:${frontend_port}/sitemap.xml"
else
  notes+=("/sitemap.xml не проверялся: витрина строит его через $STAGING_API_URL, нужен туннель")
fi

# --- Витринный API через publishable key из staging-БД -----------------------
publishable="$(staging_psql_value "SELECT token FROM api_key WHERE type='publishable' AND revoked_at IS NULL AND token LIKE 'pk_%' ORDER BY created_at LIMIT 1;" 2>/dev/null || true)"
if [ -z "$publishable" ]; then
  bad "publishable key не найден в staging-БД (нужен сид: TAMIR_ALLOW_SEED=1)"
else
  # В Medusa 2.x список товаров витрины отдаёт GET /store/products; POST здесь
  # отвечает 404, поэтому проверяем тот метод, который реально существует.
  products_url="$api_base/store/products?limit=2"
  products_json="$STAGING_ROOT/logs/staging-smoke-products.json"
  if curl -fsS --max-time 30 -H "x-publishable-api-key: $publishable" "$products_url" -o "$products_json"; then
    ok "store API: список продуктов (publishable key из БД)"
    if node -e 'const j=require(process.argv[1]); if(!Array.isArray(j.products)) process.exit(1)' "$products_json" 2>/dev/null; then
      ok "store API: ответ содержит products"
    else
      bad "store API: ответ без products"
    fi
  else
    bad "store API: $products_url недоступен"
  fi
  admin_code="$(curl -s -o /dev/null -w '%{http_code}' --max-time 20 "$api_base/admin/store")"
  if [ "$admin_code" = "401" ]; then ok "admin API: без токена отвечает 401"; else bad "admin API: ожидаем 401, получили $admin_code"; fi
fi

# --- Почта: реальная отправка + приём в Mailpit ------------------------------
# Веб-почта опубликована на локальную сеть, поэтому UI и API Mailpit обязаны
# отвечать только с HTTP Basic. креды берём из docker.env и даём их же проверке
# почтового тракта (STAGING_MAILPIT_AUTH в backend-скрипте).
mailpit_auth="$(staging_docker_env_value MP_UI_AUTH)"
export STAGING_MAILPIT_AUTH="$mailpit_auth"
lan_ip="$(staging_lan_ip)"
if staging_mailpit_curl -fsS --max-time 10 -o /dev/null "http://127.0.0.1:${STAGING_MAILPIT_API_PORT}/api/v1/info"; then
  # staging_call, а не staging_run: abort внутри проверки только подсвечивает вывод
  # команды, а фиксировать её неуспех должен check — иначе смоук обрывается без FAIL.
  check "почтовый тракт: отправка и приём в Mailpit" staging_call "$release_dir" "$STAGING_PM2_BACKEND" \
    npx --no-install medusa exec ./src/scripts/staging-mail-check.ts
  check "Mailpit UI доступен из локальной сети: http://${lan_ip}:${STAGING_MAILPIT_API_PORT}" \
    staging_mailpit_curl -fsS --max-time 10 -o /dev/null "http://${lan_ip}:${STAGING_MAILPIT_API_PORT}/"
  if [ -n "$mailpit_auth" ]; then
    mailpit_code="$(curl -s -o /dev/null -w '%{http_code}' --max-time 10 "http://127.0.0.1:${STAGING_MAILPIT_API_PORT}/")"
    if [ "$mailpit_code" = "401" ]; then
      ok "Mailpit UI под паролем: без MP_UI_AUTH отвечает 401"
    else
      bad "Mailpit UI: ожидаем 401 без токена, получили $mailpit_code"
    fi
  else
    bad "Mailpit UI опубликован без пароля: добавьте MP_UI_AUTH в $STAGING_DOCKER_ENV_FILE"
  fi
else
  bad "Mailpit API не отвечает: почтовый тракт не проверен"
fi

# --- Публичные адреса (только когда выпущен туннель) -------------------------
if staging_public_checks_enabled; then
  check "публичный ${STAGING_API_URL}/health" curl -fsS --retry 5 --retry-delay 3 --max-time 30 "${STAGING_API_URL}/health"
  check "публичный ${STAGING_SITE_URL}/robots.txt" curl -fsS --retry 5 --retry-delay 3 --max-time 30 -o /dev/null "${STAGING_SITE_URL}/robots.txt"
  if [ -n "${publishable:-}" ]; then
    check "публичный ${STAGING_API_URL}/store/products с publishable key" \
      curl -fsS --retry 5 --retry-delay 3 --max-time 30 -H "x-publishable-api-key: $publishable" -o /dev/null "${STAGING_API_URL}/store/products?limit=1"
  fi
else
  notes+=("Публичные HTTPS-проверки пропущены: нет $STAGING_TUNNEL_MARKER (scripts/staging-tunnel.sh)")
fi

# --- Ресурсы -----------------------------------------------------------------
free_gb="$(df -BG "$STAGING_ROOT" | awk 'NR==2 {gsub("G","",$4); print $4}')"
if [ "${free_gb:-0}" -ge 20 ]; then ok "диск: ${free_gb}G свободно"; else bad "диск: всего ${free_gb}G свободно"; fi

echo
for note in "${notes[@]:-}"; do [ -n "$note" ] && echo "Note: $note"; done
if [ "$failures" -ne 0 ]; then
  echo "Staging smoke: провалено проверок: $failures" >&2
  exit 1
fi
echo "Staging smoke: все проверки пройдены."
