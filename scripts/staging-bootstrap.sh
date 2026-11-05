#!/usr/bin/env bash
# Одноразовая подготовка staging-машины (test.tamir.rs / test-api.tamir.rs).
#
# Делает: каталоги, секреты (вне git), self-signed CA + сертификат Mailpit для
# STARTTLS, docker.env / backend.env / frontend.env, поднимает Postgres+Redis+Mailpit,
# синхронизирует пароль роли БД, проверяет, что порты свободны и наружу ничего не торчит.
#
# Никакого production-контекста: ни прод-доменов, ни прод-БД, ни адресов VPS.
# Запуск: sudo -u actions-runner bash scripts/staging-bootstrap.sh [--turnstile-site-key <key>]
# (root тоже принимается, но в конце права на /opt/tamir-staging возвращаются
#  обслуживающему пользователю — pm2 и runner работают не от root)
set -Eeuo pipefail
umask 077
HERE="$(cd "$(dirname "$0")" && pwd)"
source "$HERE/lib/staging-release.sh"
staging_root_defaults

usage() {
  cat <<'USAGE'
Использование: scripts/staging-bootstrap.sh [опции]
  --turnstile-site-key <key>  sitekey Turnstile для test.tamir.rs (или env TAMIR_TURNSTILE_SITE_KEY)
  --allow-missing-turnstile   поднять стек без виджета (регистрация/логин будут нерабочими)
  --force-secrets             перегенерировать секреты (снесёт текущие креды staging)
  --no-up                     не поднимать docker compose (только файлы и секреты)
  -h | --help                 эта справка
USAGE
}

SITE_KEY="${TAMIR_TURNSTILE_SITE_KEY:-}"
ALLOW_MISSING_TURNSTILE=0
FORCE_SECRETS=0
DO_UP=1
while [ $# -gt 0 ]; do
  case "$1" in
    --turnstile-site-key) SITE_KEY="${2:?--turnstile-site-key требует значение}"; shift 2 ;;
    --allow-missing-turnstile) ALLOW_MISSING_TURNSTILE=1; shift ;;
    --force-secrets) FORCE_SECRETS=1; shift ;;
    --no-up) DO_UP=0; shift ;;
    -h|--help) usage; exit 0 ;;
    *) usage; staging_abort "Неизвестная опция: $1" ;;
  esac
done

# --- pre-flight -------------------------------------------------------------
staging_require_service_user "$@"
trap 'staging_fix_ownership || true' EXIT
for command in git docker openssl curl; do
  command -v "$command" >/dev/null || staging_abort "Нет команды: $command"
done
docker info >/dev/null 2>&1 || staging_abort "Docker не отвечает"
[ -f "$STAGING_COMPOSE_FILE" ] || staging_abort "Нет $STAGING_COMPOSE_FILE (клон main должен быть на машине)"

# Порт 587 нужен именно для Mailpit: backend не умеет другой SMTP-порт.
for port in 5432 6379 587 8025 3000 9000; do
  if ss -Hltn "( sport = :$port )" 2>/dev/null | grep -q .; then
    if docker ps --format '{{.Names}}' | grep -q "^${STAGING_APP_NAME}-"; then
      continue
    fi
    staging_abort "Порт $port уже занят другим процессом (см. ss -ltnp). Staging не должен ни во что упираться."
  fi
done

# --- каталоги ---------------------------------------------------------------
mkdir -p "$STAGING_SECRETS_DIR" "$STAGING_RELEASES_DIR" "$STAGING_BACKUP_DIR" "$STAGING_LOG_DIR" "$STAGING_TMP_DIR" "$STAGING_SHARED_UPLOADS" "$STAGING_MAIL_CERT_DIR"
chmod 700 "$STAGING_SECRETS_DIR" "$STAGING_TMP_DIR"

# --- секреты ----------------------------------------------------------------
secret() { openssl rand -hex 32; }

gen_docker_env=0
if [ ! -f "$STAGING_DOCKER_ENV_FILE" ] || [ "$FORCE_SECRETS" = 1 ]; then gen_docker_env=1; fi
if [ "$gen_docker_env" = 1 ]; then
  PG_PASSWORD="$(secret)"
  cat > "$STAGING_DOCKER_ENV_FILE" <<EOF
# Staging: docker compose (вне git, chmod 600).
POSTGRES_USER=$STAGING_DB_USER
POSTGRES_DB=$STAGING_DB_NAME
POSTGRES_PASSWORD=$PG_PASSWORD
EOF
  staging_note "Сгенерирован $STAGING_DOCKER_ENV_FILE"
fi
PG_PASSWORD="$(grep -E '^POSTGRES_PASSWORD=' "$STAGING_DOCKER_ENV_FILE" | head -n1 | cut -d= -f2-)"
[ -n "$PG_PASSWORD" ] || staging_abort "В $STAGING_DOCKER_ENV_FILE нет POSTGRES_PASSWORD"

if [ ! -f "$STAGING_ENV_FILE" ] || [ "$FORCE_SECRETS" = 1 ]; then
  SMTP_PASSWORD="$(secret)"
  cat > "$STAGING_ENV_FILE" <<EOF
# Staging: окружение backend (вне git, chmod 600). Значения прод-машины тут запрещены.
NODE_ENV=production
DATABASE_URL=postgres://$STAGING_DB_USER:$PG_PASSWORD@127.0.0.1:5432/$STAGING_DB_NAME
REDIS_URL=redis://127.0.0.1:6379
JWT_SECRET=$(secret)
COOKIE_SECRET=$(secret)
REVIEW_RATE_SECRET=$(secret)
STORE_CORS=$STAGING_SITE_URL
ADMIN_CORS=$STAGING_SITE_URL,$STAGING_API_URL
AUTH_CORS=$STAGING_SITE_URL,$STAGING_API_URL
COOKIE_SECURE=true
MEDUSA_PUBLIC_BACKEND_URL=$STAGING_API_URL
MEDUSA_BACKEND_HOST=127.0.0.1
MEDUSA_BACKEND_PORT=$STAGING_BACKEND_PORT
# Почта — локальный Mailpit. Продуктовый mailConfig() требует STARTTLS и порт 587/465,
# поэтому сертификат self-signed, а доверие к нему — через NODE_EXTRA_CA_CERTS в pm2.
SMTP_HOST=127.0.0.1
SMTP_PORT=587
SMTP_USER=staging@tamir.local
SMTP_PASSWORD=$SMTP_PASSWORD
SMTP_FROM=TAMIR staging <staging@tamir.local>
TURNSTILE_HOSTNAMES=test.tamir.rs
EOF
  chmod 600 "$STAGING_ENV_FILE"
  staging_note "Сгенерирован $STAGING_ENV_FILE"
fi

if [ ! -f "$STAGING_FRONTEND_ENV_FILE" ] || [ "$FORCE_SECRETS" = 1 ]; then
  cat > "$STAGING_FRONTEND_ENV_FILE" <<EOF
# Staging: окружение витрины (вне git, chmod 600). NEXT_PUBLIC_* печатаются в бандл —
# сборка обязана идти именно с этим файлом.
NEXT_PUBLIC_MEDUSA_BACKEND_URL=$STAGING_API_URL
MEDUSA_PROXY_BACKEND_URL=http://127.0.0.1:$STAGING_BACKEND_PORT
NEXT_PUBLIC_SITE_URL=$STAGING_SITE_URL
NEXT_PUBLIC_TURNSTILE_SITE_KEY=__TBD__
EOF
  chmod 600 "$STAGING_FRONTEND_ENV_FILE"
  staging_note "Сгенерирован $STAGING_FRONTEND_ENV_FILE"
fi

# Turnstile: без реального sitekey витрина не может подтвердить регистрацию,
# а scripts/check-review-config.cjs намеренно валит деплой с placeholder'ом.
site_key_file="$STAGING_SECRETS_DIR/turnstile-site-key"
if [ -n "$SITE_KEY" ]; then
  printf '%s\n' "$SITE_KEY" > "$site_key_file"
  chmod 600 "$site_key_file"
  staging_note "Sitekey Turnstile сохранён"
elif [ ! -s "$site_key_file" ]; then
  if [ "$ALLOW_MISSING_TURNSTILE" != 1 ]; then
    staging_abort "Нет sitekey Turnstile для test.tamir.rs. Передайте --turnstile-site-key <key> (создайте виджет в Cloudflare для test.tamir.rs) или --allow-missing-turnstile, если регистрация пока не нужна."
  fi
  printf 'staging-placeholder-sitekey-00000000\n' > "$site_key_file"
  chmod 600 "$site_key_file"
  staging_note "ВНИМАНИЕ: стоит placeholder Turnstile — форма регистрации/логина работать не будет"
fi
SITE_KEY="$(head -n1 "$site_key_file" | tr -d '\r')"
secret_key_file="$STAGING_SECRETS_DIR/turnstile-secret-key"
if [ ! -s "$secret_key_file" ]; then
  openssl rand -hex 20 > "$secret_key_file"
  chmod 600 "$secret_key_file"
  staging_note "Сгенерирован локальный TURNSTILE_SECRET_KEY (Cloudflare такой токен не примет — подставьте реальный secret key из виджета)"
fi
TURNSTILE_SECRET="$(head -n1 "$secret_key_file" | tr -d '\r')"

# frontend.env: sitekey; publishable key проставит deploy-staging.sh из БД.
TMP_ENV="$STAGING_FRONTEND_ENV_FILE.tmp"
sed -e "s/^NEXT_PUBLIC_TURNSTILE_SITE_KEY=.*/NEXT_PUBLIC_TURNSTILE_SITE_KEY=$SITE_KEY/" "$STAGING_FRONTEND_ENV_FILE" > "$TMP_ENV"
grep -q '^NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY=' "$TMP_ENV" || printf 'NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY=\n' >> "$TMP_ENV"
mv "$TMP_ENV" "$STAGING_FRONTEND_ENV_FILE"
chmod 600 "$STAGING_FRONTEND_ENV_FILE"

# backend.env: секреты Turnstile + CA почтового сертификата (пересобирается каждый раз).
TMP_ENV="$STAGING_ENV_FILE.tmp"
grep -vE '^(TURNSTILE_SECRET_KEY|NODE_EXTRA_CA_CERTS)=' "$STAGING_ENV_FILE" > "$TMP_ENV"
printf 'TURNSTILE_SECRET_KEY=%s\nNODE_EXTRA_CA_CERTS=%s\n' "$TURNSTILE_SECRET" "$STAGING_MAIL_CERT_DIR/mailpit-ca.crt" >> "$TMP_ENV"
mv "$TMP_ENV" "$STAGING_ENV_FILE"
chmod 600 "$STAGING_ENV_FILE"

# --- сертификат Mailpit (STARTTLS обязателен) --------------------------------
if [ ! -s "$STAGING_MAIL_CERT_DIR/mailpit-tls.crt" ] || [ "$FORCE_SECRETS" = 1 ]; then
  staging_note "Выпускаю self-signed CA + сертификат Mailpit (SAN: localhost, mailpit, 127.0.0.1)"
  openssl req -x509 -newkey rsa:2048 -nodes -days 1825 \
    -keyout "$STAGING_MAIL_CERT_DIR/mailpit-ca.key" -out "$STAGING_MAIL_CERT_DIR/mailpit-ca.crt" \
    -subj "/CN=TAMIR staging mail CA" -addext "basicConstraints=critical,CA:TRUE"
  openssl req -newkey rsa:2048 -nodes \
    -keyout "$STAGING_MAIL_CERT_DIR/mailpit-tls.key" -out "$STAGING_MAIL_CERT_DIR/mailpit-tls.csr" \
    -subj "/CN=mailpit"
  printf 'subjectAltName=DNS:localhost,DNS:mailpit,DNS:host.docker.internal,IP:127.0.0.1\nextendedKeyUsage=serverAuth\n' > "$STAGING_MAIL_CERT_DIR/mailpit-tls.ext"
  openssl x509 -req -days 825 -in "$STAGING_MAIL_CERT_DIR/mailpit-tls.csr" \
    -CA "$STAGING_MAIL_CERT_DIR/mailpit-ca.crt" -CAkey "$STAGING_MAIL_CERT_DIR/mailpit-ca.key" \
    -CAcreateserial -extfile "$STAGING_MAIL_CERT_DIR/mailpit-tls.ext" \
    -out "$STAGING_MAIL_CERT_DIR/mailpit-tls.crt"
  rm -f "$STAGING_MAIL_CERT_DIR/mailpit-tls.csr" "$STAGING_MAIL_CERT_DIR/mailpit-tls.ext"
  chmod 600 "$STAGING_MAIL_CERT_DIR"/*.key
  chmod 644 "$STAGING_MAIL_CERT_DIR"/*.crt
fi

staging_assert_config_safe

# --- стек -------------------------------------------------------------------
if [ "$DO_UP" = 1 ]; then
  staging_note "Поднимаю staging-стек (postgres, redis, mailpit)"
  staging_compose up -d --wait || staging_abort "Compose-стек не поднялся: см. $(basename "$STAGING_COMPOSE_FILE") logs"

  # Пароль роли уже созданной БД compose не меняет — синхронизируем явно.
  staging_note "Синхронизирую пароль роли $STAGING_DB_USER"
  staging_compose exec -T postgres psql -v ON_ERROR_STOP=1 -U "$STAGING_DB_USER" -d postgres \
    -c "ALTER USER \"$STAGING_DB_USER\" WITH PASSWORD '$PG_PASSWORD';" >/dev/null

  staging_note "Postgres: $(staging_psql_value "SELECT current_database() || ' / ' || current_user;")"
  staging_note "Redis : $(staging_redis ping)"
  staging_note "Mailpit SMTP готов (127.0.0.1:587, STARTTLS). Веб-почта: http://127.0.0.1:8025"

  # Публичного входа не должно быть: все порты staging смотрят на loopback.
  exposed="$(ss -Hltn "( sport = :5432 or sport = :6379 or sport = :587 or sport = :8025 )" 2>/dev/null | grep -vE '127\.0\.0\.1|\[::1\]' || true)"
  [ -z "$exposed" ] || staging_abort "Стек опубликован наружу (не loopback):$exposed"
fi

cat <<SUMMARY

Staging-машина подготовлена.
  ROOT      : $STAGING_ROOT
  Секреты   : $STAGING_SECRETS_DIR (chmod 600/700, в git не попадают)
  Sitekey   : ${SITE_KEY:0:6}… (файл $site_key_file)
  Почта     : http://127.0.0.1:8025 (SMTP 127.0.0.1:587, STARTTLS)

Дальше:
  1) HTTPS-туннель: scripts/staging-tunnel.sh login && scripts/staging-tunnel.sh create
  2) Релиз      : scripts/deploy-staging.sh <sha>   (или CI: deploy-staging.yml)
  3) Данные     : scripts/staging-db-refresh.sh <dump>   (анонимизация PII обязательна)
  4) Smoke      : scripts/staging-smoke.sh
SUMMARY
