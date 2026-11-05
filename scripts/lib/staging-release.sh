#!/usr/bin/env bash
# Общий layout и хелперы staging-машины (test.tamir.rs / test-api.tamir.rs).
#
# Подключается из staging-скриптов:
#   source "$(cd "$(dirname "$0")" && pwd)/lib/staging-release.sh"
#
# Контракт (ТЗ stages 2–5): всё в /opt/tamir-staging, релизы как на проде
# (releases/<sha> + current), секреты в /opt/tamir-staging/secrets (вне git),
# прод-адреса и прод-БД запрещены, наружу смотрит только cloudflared.

staging_script_dir() {
  cd "$(dirname "${BASH_SOURCE[1]:-${BASH_SOURCE[0]}}")" && pwd
}

staging_repo_root() {
  local here
  here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
  cd "$here/../.." && pwd
}

staging_root_defaults() {
  export STAGING_ROOT="${STAGING_ROOT:-/opt/tamir-staging}"
  export STAGING_REPO_DIR="${STAGING_REPO_DIR:-$STAGING_ROOT/repo}"
  export STAGING_SECRETS_DIR="${STAGING_SECRETS_DIR:-$STAGING_ROOT/secrets}"
  export STAGING_RELEASES_DIR="${STAGING_RELEASES_DIR:-$STAGING_ROOT/releases}"
  export STAGING_CURRENT_LINK="${STAGING_CURRENT_LINK:-$STAGING_ROOT/current}"
  export STAGING_BACKUP_DIR="${STAGING_BACKUP_DIR:-$STAGING_ROOT/backups}"
  export STAGING_LOG_DIR="${STAGING_LOG_DIR:-$STAGING_ROOT/logs}"
  export STAGING_TMP_DIR="${STAGING_TMP_DIR:-$STAGING_ROOT/tmp}"
  export STAGING_SHARED_UPLOADS="${STAGING_SHARED_UPLOADS:-$STAGING_ROOT/shared/uploads}"

  export STAGING_ENV_FILE="$STAGING_SECRETS_DIR/backend.env"
  export STAGING_FRONTEND_ENV_FILE="$STAGING_SECRETS_DIR/frontend.env"
  export STAGING_DOCKER_ENV_FILE="$STAGING_SECRETS_DIR/docker.env"
  export STAGING_MAIL_CERT_DIR="$STAGING_SECRETS_DIR/mail"
  export STAGING_COMPOSE_FILE="${STAGING_COMPOSE_FILE:-$STAGING_REPO_DIR/docker-compose.staging.yml}"

  export STAGING_APP_NAME="${STAGING_APP_NAME:-tamir-staging}"
  export STAGING_DB_NAME="${STAGING_DB_NAME:-tamir_staging}"
  export STAGING_DB_USER="${STAGING_DB_USER:-tamir_staging}"
  export STAGING_SITE_URL="${STAGING_SITE_URL:-https://test.tamir.rs}"
  export STAGING_API_URL="${STAGING_API_URL:-https://test-api.tamir.rs}"
  export STAGING_BACKEND_PORT="${STAGING_BACKEND_PORT:-9000}"
  export STAGING_FRONTEND_PORT="${STAGING_FRONTEND_PORT:-3000}"
  export STAGING_SMTP_PORT="${STAGING_SMTP_PORT:-587}"
  export STAGING_MAILPIT_API_PORT="${STAGING_MAILPIT_API_PORT:-8025}"
  export STAGING_PM2_BACKEND="${STAGING_PM2_BACKEND:-tamir-backend}"
  export STAGING_PM2_FRONTEND="${STAGING_PM2_FRONTEND:-tamir-frontend}"
  export STAGING_TUNNEL_NAME="${STAGING_TUNNEL_NAME:-tamir-staging}"
  export STAGING_TUNNEL_MARKER="${STAGING_TUNNEL_MARKER:-$STAGING_ROOT/.tunnel-enabled}"

  # Обслуживающий пользователь стенда: он же self-hosted runner GitHub Actions.
  # GitHub config.sh запрещает раннер от root, поэтому pm2/docker/git — под этим
  # пользователем; root нужен только для apt/systemd/cloudflared-сервиса.
  export STAGING_USER="${STAGING_USER:-actions-runner}"
}

# Все staging-операции (pm2, docker compose, секреты, релизы) принадлежат STAGING_USER.
staging_require_service_user() {
  local me id_ok=0
  me="$(id -un)"
  if [ "$me" = "$STAGING_USER" ]; then
    id_ok=1
  elif [ "$(id -u)" = 0 ]; then
    # root допускается только как «установщик» (svc.sh, cloudflared); такой запуск
    # обязан в конце вернуть права на STAGING_ROOT обслуживающему пользователю.
    id_ok=1
    export STAGING_NEED_CHOWN=1
  fi
  [ "$id_ok" = 1 ] || staging_abort "Стенд обслуживается пользователем $STAGING_USER (или root для установки). Запустите: sudo -u $STAGING_USER bash $0 $*"
}

staging_fix_ownership() {
  if [ "${STAGING_NEED_CHOWN:-0}" = 1 ]; then
    chown -R "$STAGING_USER:$STAGING_USER" "$STAGING_ROOT"
    staging_note "Права на $STAGING_ROOT возвращены пользователю $STAGING_USER"
  fi
}

staging_note() { echo ">>> $*"; }
staging_abort() { printf 'ERROR: %b\n' "$*" >&2; exit 1; }

# Секреты — только на staging-машине: без них нельзя ни поднять стек, ни выложить релиз.
staging_require_secrets() {
  local missing=() f
  for f in "$STAGING_ENV_FILE" "$STAGING_FRONTEND_ENV_FILE" "$STAGING_DOCKER_ENV_FILE"; do
    [ -f "$f" ] || missing+=("$f")
  done
  if [ "${#missing[@]}" -gt 0 ]; then
    staging_abort "Нет секретов staging (${missing[*]}). Сначала: scripts/staging-bootstrap.sh"
  fi
}

# Жёсткий guard ТЗ: staging не имеет права смотреть на production.
# Разрешённые хосты — только test.* (и localhost/127.0.0.1 для внутренних связей).
# Плюс запрещены имена прод-БД: случайный `DATABASE_URL` с прод-строкой обязан уронить деплой.
staging_assert_config_safe() {
  local allow_re='^(test\.tamir\.rs|test-api\.tamir\.rs|localhost|127\.0\.0\.1|::1|postgres|redis|mailpit|host\.docker\.internal)$'
  local f host bad
  for f in "$STAGING_ENV_FILE" "$STAGING_FRONTEND_ENV_FILE" "$STAGING_DOCKER_ENV_FILE"; do
    [ -f "$f" ] || continue
    bad=""
    for host in $(grep -oE '(([a-zA-Z0-9-]+\.)+tamir\.rs)' "$f" | sort -u); do
      if ! printf '%s' "$host" | grep -qE "$allow_re"; then
        bad="$bad\n  $host"
      fi
    done
    if grep -qE '(tamir_rs|tamir_prod|tamir_development)' "$f"; then
      bad="$bad\n  прод-имя БД (tamir_rs / tamir_prod / tamir_development)"
    fi
    if [ -n "$bad" ]; then
      staging_abort "В $f найдено то, что ломает изоляцию staging:$bad"
    fi
  done
}

staging_compose() { docker compose -f "$STAGING_COMPOSE_FILE" "$@"; }

staging_db_user() {
  staging_psql_value "SELECT current_user;"
}

staging_pg_password() {
  [ -f "$STAGING_DOCKER_ENV_FILE" ] || staging_abort "Нет $STAGING_DOCKER_ENV_FILE"
  local pw
  pw="$(grep -E '^POSTGRES_PASSWORD=' "$STAGING_DOCKER_ENV_FILE" | head -n1 | cut -d= -f2- | tr -d '"')"
  [ -n "$pw" ] || staging_abort "В $STAGING_DOCKER_ENV_FILE нет POSTGRES_PASSWORD"
  printf '%s' "$pw"
}

# psql внутри compose-контейнера: пароли только через -e PGPASSWORD (не в argv).
staging_psql() {
  local pw="$1"; shift
  staging_compose exec -T -e PGPASSWORD="$pw" postgres psql -U "$STAGING_DB_USER" -d "$STAGING_DB_NAME" -v ON_ERROR_STOP=1 "$@"
}

staging_psql_value() {
  local pw
  pw="$(staging_pg_password)"
  staging_psql "$pw" -At -F'|' -c "$1" | tr -d '\r'
}

# Файл SQL через stdin того же psql: скрипты анонимизации идут именно так.
staging_psql_file() {
  local pw file
  pw="$(staging_pg_password)"
  file="$1"
  [ -f "$file" ] || staging_abort "Нет файла SQL: $file"
  staging_compose exec -T -e PGPASSWORD="$pw" postgres psql -U "$STAGING_DB_USER" -d "$STAGING_DB_NAME" \
    -v ON_ERROR_STOP=1 -f - < "$file"
}

staging_redis() {
  staging_compose exec -T redis redis-cli "$@"
}

# Дамп/восстановление тоже только внутри контейнера: на HP Mini клиентского postgres нет.
staging_pg_dump() {
  local pw out
  pw="$(staging_pg_password)"
  out="$1"
  mkdir -p "$(dirname "$out")"
  staging_compose exec -T -e PGPASSWORD="$pw" postgres pg_dump -U "$STAGING_DB_USER" -Fc "$STAGING_DB_NAME" > "$out"
  [ -s "$out" ] || staging_abort "pg_dump вернул пустой файл: $out"
}

staging_pg_restore() {
  local pw src
  pw="$(staging_pg_password)"
  src="$1"
  [ -f "$src" ] || staging_abort "Нет файла дампа: $src"
  staging_compose exec -T -e PGPASSWORD="$pw" postgres pg_restore -U "$STAGING_DB_USER" -d "$STAGING_DB_NAME" --no-owner --no-privileges < "$src"
}

# Пересоздание staging-БД: дамп с прода несёт старую схему, латать её по кускам надёжнее
# пересборкой. Подключаемся к postgres, а не к самой базе, иначе DROP не разрешён.
staging_recreate_database() {
  local pw
  pw="$(staging_pg_password)"
  staging_compose exec -T -e PGPASSWORD="$pw" postgres psql -U "$STAGING_DB_USER" -d postgres -v ON_ERROR_STOP=1 \
    -c "DROP DATABASE IF EXISTS \"$STAGING_DB_NAME\" WITH (FORCE);" \
    -c "CREATE DATABASE \"$STAGING_DB_NAME\" OWNER \"$STAGING_DB_USER\";"
}

# Достаём значение из экосистемы конкретного релиза (smoke/диагностика).
staging_release_env() {
  local eco="$1" app_name="$2" key="$3"
  node -e '
    const path = require("node:path")
    const [eco, appName, key] = process.argv.slice(1)
    const app = require(path.resolve(eco)).apps.find(a => a.name === appName)
    process.stdout.write(String((app && app.env && app.env[key]) || ""))
  ' "$eco" "$app_name" "$key"
}

# Контейнер compose-проекта по имени сервиса (для inspect/диагностики).
staging_container_id() {
  staging_compose ps -q "$1" | head -n1
}

# Публикуемые порты инфраструктуры обязаны смотреть только на loopback.
staging_ports_are_loopback() {
  local service id ip
  for service in postgres redis mailpit; do
    id="$(staging_container_id "$service")"
    [ -n "$id" ] || return 1
    for ip in $(docker inspect --format '{{range $p, $c := .NetworkSettings.Ports}}{{range $c}}{{.HostIp}} {{end}}{{end}}' "$id" 2>/dev/null); do
      [ "$ip" = "127.0.0.1" ] || return 1
    done
  done
  return 0
}

# pm2-процесс в состоянии online (staging-имена tamir-backend / tamir-frontend).
staging_pm2_online() {
  local wanted="$1"
  pm2 jlist | node -e '
    let raw = "";
    process.stdin.on("data", chunk => raw += chunk);
    process.stdin.on("end", () => {
      const apps = staging_parse_jlist(raw);
      const app = apps.find(entry => entry.name === process.argv[1]);
      if (!app || app.pm2_env.status !== "online") process.exit(1);
    });
    function staging_parse_jlist(raw) {
      // pm2 может вернуть пустую строку (пустый pm2_HOME) или мусор в начале вывода.
      const start = raw.indexOf("[");
      const end = raw.lastIndexOf("]");
      if (start < 0 || end <= start) {
        console.error("pm2 jlist вернул пустой вывод");
        process.exit(1);
      }
      try {
        return JSON.parse(raw.slice(start, end + 1));
      } catch (err) {
        console.error("pm2 jlist вернул не JSON: " + err.message);
        process.exit(1);
      }
    }
  ' "$wanted"
}

# Процессы обязаны работать внутри каталога релиза, иначе откат не сработает.
staging_pm2_cwd_matches() {
  local release_dir="$1"
  # pm2 jlist обязан быть на входе: без пайпа node получил бы пустой stdin,
  # JSON.parse упал бы с "Unexpected end of JSON input" и деплой прервался бы.
  pm2 jlist | TAMIR_STAGING_RELEASE="$release_dir" \
  TAMIR_STAGING_APPS="$STAGING_PM2_BACKEND:backend,$STAGING_PM2_FRONTEND:frontend" \
  node -e '
    let raw = "";
    process.stdin.on("data", chunk => raw += chunk);
    process.stdin.on("end", () => {
      const start = raw.indexOf("[");
      const end = raw.lastIndexOf("]");
      if (start < 0 || end <= start) {
        console.error("pm2 jlist вернул пустой вывод");
        process.exit(1);
      }
      let apps;
      try {
        apps = JSON.parse(raw.slice(start, end + 1));
      } catch (err) {
        console.error("pm2 jlist вернул не JSON: " + err.message);
        process.exit(1);
      }
      for (const pair of process.env.TAMIR_STAGING_APPS.split(",")) {
        const [name, folder] = pair.split(":");
        const app = apps.find(entry => entry.name === name);
        const expected = process.env.TAMIR_STAGING_RELEASE + "/" + folder;
        if (!app || app.pm2_env.pm_cwd !== expected) {
          console.error(name + ": pm_cwd=" + (app ? app.pm2_env.pm_cwd : "нет процесса") + ", ожидался " + expected);
          process.exit(1);
        }
      }
    });
  ' || staging_abort "Процессы pm2 работают не в каталоге релиза"
}

staging_public_checks_enabled() {
  [ -f "$STAGING_TUNNEL_MARKER" ]
}

staging_health_urls() {
  printf '%s\n' \
    "http://127.0.0.1:${STAGING_BACKEND_PORT}/health" \
    "http://127.0.0.1:${STAGING_FRONTEND_PORT}/robots.txt"
  if staging_public_checks_enabled; then
    printf '%s\n' \
      "${STAGING_API_URL}/health" \
      "${STAGING_SITE_URL}/robots.txt"
  fi
}

staging_wait_health() {
  # 240s: холодный старт Medusa на HP Mini медленнее, чем на проде.
  local wait_health="${STAGING_HEALTH_WAIT_SECS:-240}" ok=0 url code
  staging_note "Healthcheck staging (до ${wait_health}s)..."
  while IFS= read -r url; do
    for _ in $(seq 1 "$wait_health"); do
      code="$(curl -s -o /dev/null -m 10 -w '%{http_code}' "$url" || true)"
      if [ "$code" = "200" ]; then
        staging_note "  OK $url"
        ok=1
        break
      fi
      sleep 1
    done
    [ "$ok" = 1 ] || staging_abort "Staging healthcheck timeout: $url"
    ok=0
  done < <(staging_health_urls)
  staging_note "Staging healthcheck пройден."
}

# Экосистему pm2 не держим в git: секреты живут в секретах staging, а pm2-имена
# должны совпадать с эталоном, который проверяет scripts/check-review-config.cjs.
staging_write_ecosystem() {
  local release_dir="$1"
  local eco="$release_dir/ecosystem.config.cjs"
  local mail_ca="${STAGING_MAIL_CA_FILE:-$STAGING_MAIL_CERT_DIR/mailpit-ca.crt}"
  cat > "$eco" <<'ECOSYSTEM'
// Генерируется staging-деплоем (scripts/lib/staging-release.sh). Секреты не в git:
// их несёт backend/.env и frontend/.env.production.local, скопированные в релиз.
// Пути абсолютные: релизы ротируются, а логи и почтовый CA живут вне релиза.
const path = require("node:path")
module.exports = {
  apps: [
    {
      name: "tamir-backend",
      cwd: path.join(__dirname, "backend"),
      script: "./scripts/start-server.mjs",
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: "1024M",
      env: {
        NODE_ENV: "production",
        // Публичный вход — только cloudflared: Medusa обязана слушать loopback.
        MEDUSA_BACKEND_HOST: "127.0.0.1",
        MEDUSA_BACKEND_PORT: "@@STAGING_BACKEND_PORT@@",
        // Доверие к self-signed сертификату Mailpit: Node читает переменную при старте,
        // поэтому её нельзя отдавать только через backend/.env.
        NODE_EXTRA_CA_CERTS: "@@STAGING_MAIL_CA@@",
      },
      error_file: "@@STAGING_LOG_DIR@@/pm2-backend-error.log",
      out_file: "@@STAGING_LOG_DIR@@/pm2-backend-out.log",
    },
    {
      name: "tamir-frontend",
      cwd: path.join(__dirname, "frontend"),
      script: "./node_modules/next/dist/bin/next",
      args: "start -H 127.0.0.1 -p @@STAGING_FRONTEND_PORT@@",
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: "1024M",
      env: { NODE_ENV: "production" },
      error_file: "@@STAGING_LOG_DIR@@/pm2-frontend-error.log",
      out_file: "@@STAGING_LOG_DIR@@/pm2-frontend-out.log",
    },
  ],
}
ECOSYSTEM
  sed -i \
    -e "s#@@STAGING_MAIL_CA@@#$mail_ca#" \
    -e "s#@@STAGING_LOG_DIR@@#$STAGING_LOG_DIR#" \
    -e "s#@@STAGING_BACKEND_PORT@@#$STAGING_BACKEND_PORT#" \
    -e "s#@@STAGING_FRONTEND_PORT@@#$STAGING_FRONTEND_PORT#" \
    "$eco"
  grep -q "\"${STAGING_PM2_BACKEND}\"" "$eco" || staging_abort "Экосистема staging собрана без ${STAGING_PM2_BACKEND}"
  node - "$eco" <<'JS'
const config = require(process.argv[2])
const names = config.apps.map(app => app.name)
if (JSON.stringify(names) !== JSON.stringify(['tamir-backend', 'tamir-frontend'])) {
  throw new Error('Unexpected staging pm2 apps: ' + names.join(','))
}
for (const app of config.apps) {
  if (!app.cwd.startsWith('/') || !app.cwd.includes('/releases/')) throw new Error('Unexpected cwd: ' + app.name)
}
JS
}

# pm2 resume не подхватывает изменившиеся env-файлы, поэтому рестарт с --update-env.
staging_restart_apps() {
  local release_dir="$1"
  staging_note "pm2 startOrReload ($STAGING_PM2_BACKEND, $STAGING_PM2_FRONTEND)..."
  (cd "$release_dir" && pm2 startOrReload ecosystem.config.cjs --update-env) || staging_abort "pm2 startOrReload не поднял приложения staging"
  pm2 save --force || staging_abort "pm2 не смог сохранить список приложений"
}

# Сборка, миграции и medusa exec обязаны идти в том же окружении, что и процессы pm2:
# иначе SMTP-проверка не увидит NODE_EXTRA_CA_CERTS, а build соберётся не с теми флагами.
# Пишем через ecosystem.config.cjs релиза — тот же путь, что использует deploy-vps.sh.
staging_run() {
  local release_dir="$1" app_name="$2" command="$3"
  shift 3
  [ -f "$release_dir/ecosystem.config.cjs" ] || staging_abort "Нет экосистемы релиза: $release_dir/ecosystem.config.cjs"
  node -e '
    const path = require("node:path"), { spawnSync } = require("node:child_process")
    const [eco, appName, command, ...args] = process.argv.slice(1)
    const app = require(path.resolve(eco)).apps.find(a => a.name === appName)
    if (!app) throw new Error("Нет приложения в экосистеме staging: " + appName)
    const r = spawnSync(command, args, { cwd: app.cwd, env: { ...process.env, ...app.env }, stdio: "inherit" })
    if (r.error) throw r.error
    if (r.status !== 0) process.exit(r.status || 1)
  ' "$release_dir/ecosystem.config.cjs" "$app_name" "$command" "$@" \
    || staging_abort "Не вышло: $command $* (cwd приложения $app_name)"
}
