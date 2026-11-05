#!/usr/bin/env bash
# Публичный вход staging через cloudflared-туннель (ТЗ §4): без проброса портов,
# без nginx, без изменения записей tamir.rs / api.tamir.rs.
#
#   sudo bash scripts/staging-tunnel.sh login    # вход в Cloudflare (открыть ссылку)
#   sudo bash scripts/staging-tunnel.sh create   # туннель + конфиг + systemd-сервис
#   sudo bash scripts/staging-tunnel.sh dns      # CNAME только для test.*
#   sudo bash scripts/staging-tunnel.sh status   # состояние туннеля и сервиса
#   sudo bash scripts/staging-tunnel.sh remove   # остановить сервис и снять маркер
#
# Повторный create безопасен: он переприкрепляет конфиг и сервис к существующему туннелю.
# Удаление DNS-записей и самого туннеля из Cloudflare делается вручную в дашборде -
# скрипт ничего в зоне не удаляет.
set -Eeuo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
source "$HERE/lib/staging-release.sh"
staging_root_defaults

CF_DIR="${STAGING_CLOUDFLARED_DIR:-/etc/cloudflared}"
CF_BIN="${STAGING_CLOUDFLARED_BIN:-/usr/local/bin/cloudflared}"
CF_VERSION="${STAGING_CLOUDFLARED_VERSION:-2026.10.1}"
CF_CONFIG="$CF_DIR/tamir-staging.yml"
CF_NAME="${STAGING_TUNNEL_NAME:-tamir-staging}"
CF_CRED_FILE="$CF_DIR/$CF_NAME.json"
UNIT="/etc/systemd/system/tamir-staging-tunnel.service"

# cloudflared хранит сертифицированный доступ к зоне в $HOME/.cloudflared/cert.pem.
# HOME подбираем так, чтобы этот путь совпадал ровно с $CF_CERT (по умолчанию - /root,
# потому что командами туннеля управляет root).
CF_CERT_DIR="${STAGING_CF_CERT_DIR:-/root/.cloudflared}"
CF_CERT="$CF_CERT_DIR/cert.pem"
UUID_RE='[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}'

# Только staging-имена. Прод-записи этот скрипт не создаёт, не меняет и не удаляет.
SITE_HOST="$(printf '%s' "$STAGING_SITE_URL" | sed -E 's#^https?://##; s#/.*$##')"
API_HOST="$(printf '%s' "$STAGING_API_URL" | sed -E 's#^https?://##; s#/.*$##')"

staging_tunnel_assert_hosts() {
  case "$SITE_HOST" in test.tamir.rs) ;; *) staging_abort "STAGING_SITE_URL обязан быть https://test.tamir.rs, получено $SITE_HOST" ;; esac
  case "$API_HOST" in test-api.tamir.rs) ;; *) staging_abort "STAGING_API_URL обязан быть https://test-api.tamir.rs, получено $API_HOST" ;; esac
}

staging_tunnel_require_root() {
  [ "$(id -u)" -eq 0 ] || staging_abort "Команда 'tunnel $1' требует root: sudo bash scripts/staging-tunnel.sh $1"
}

# Единая точка запуска cloudflared: сертификат зоны всегда берётся из $CF_CERT.
staging_cf() {
  env HOME="${CF_CERT_DIR%/.cloudflared}" TUNNEL_ORIGIN_CERT="$CF_CERT" "$CF_BIN" "$@"
}

staging_tunnel_install_binary() {
  if [ -x "$CF_BIN" ]; then
    staging_note "cloudflared: $("$CF_BIN" --version 2>&1 | head -n1)"
    return
  fi
  staging_note "Ставлю cloudflared $CF_VERSION"
  local arch deb
  case "$(uname -m)" in
    x86_64|amd64) arch="amd64" ;;
    aarch64|arm64) arch="arm64" ;;
    *) staging_abort "Неизвестная архитектура $(uname -m): поставьте cloudflared вручную" ;;
  esac
  deb="cloudflared-${CF_VERSION}.${arch}.deb"
  apt-get install -y "https://github.com/cloudflare/cloudflared/releases/download/${CF_VERSION}/${deb}" \
    || staging_abort "Не удалось поставить cloudflared. Проверьте сеть и версию ($CF_VERSION)."
  CF_BIN="$(command -v cloudflared)"
}

# cert.pem кладёт интерактивный `login`: он печатает ссылку, которую открывает человек.
# Автоматизировать этот шаг нельзя намеренно - так требует Cloudflare.
staging_tunnel_require_login() {
  [ -f "$CF_CERT" ] || staging_abort "Нет входа в Cloudflare. Запустите: sudo bash scripts/staging-tunnel.sh login"
}

staging_tunnel_id() {
  if [ -f "$CF_CRED_FILE" ]; then
    basename "$CF_CRED_FILE" .json
    return
  fi
  staging_cf tunnel list 2>/dev/null | grep -E "[[:space:]]$CF_NAME([[:space:]]|$)" | grep -oE "$UUID_RE" | head -n1 || true
}

staging_tunnel_write_config() {
  local id="$1"
  mkdir -p "$CF_DIR"
  cat > "$CF_CONFIG" <<YAML
tunnel: $id
credentials-file: $CF_CRED_FILE
ingress:
  - hostname: $API_HOST
    service: http://127.0.0.1:$STAGING_BACKEND_PORT
  - hostname: $SITE_HOST
    service: http://127.0.0.1:$STAGING_FRONTEND_PORT
  # Всё остальное - глухо 404: чужой хост не должен попасть в приложение.
  - service: http_status:404
YAML
  chmod 700 "$CF_DIR"
  chmod 600 "$CF_CONFIG"
  staging_note "Конфиг туннеля: $CF_CONFIG"
}

staging_tunnel_write_service() {
  cat > "$UNIT" <<UNIT
[Unit]
Description=TAMIR staging tunnel (test.tamir.rs / test-api.tamir.rs)
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
Environment=HOME=${CF_CERT_DIR%/.cloudflared}
Environment=TUNNEL_ORIGIN_CERT=$CF_CERT
ExecStart=$CF_BIN tunnel run --config $CF_CONFIG
Restart=always
RestartSec=5
NoNewPrivileges=true

[Install]
WantedBy=multi-user.target
UNIT
  chmod 600 "$UNIT"
  systemctl daemon-reload
  systemctl enable tamir-staging-tunnel >/dev/null
  staging_note "systemd-сервис: tamir-staging-tunnel"
}

staging_tunnel_start() {
  systemctl restart tamir-staging-tunnel
  sleep 5
  systemctl is-active --quiet tamir-staging-tunnel || staging_abort "Туннель не поднялся: journalctl -u tamir-staging-tunnel -n 50"
}

action="${1:-status}"
case "$action" in
  login)
    staging_tunnel_require_root login
    staging_tunnel_install_binary
    mkdir -p "$CF_DIR" "$(dirname "$CF_CERT")"
    if [ -f "$CF_CERT" ]; then
      staging_note "Сертификат зоны уже есть: $CF_CERT (перелогин не требуется)"
      staging_note "Если нужен новый вход: удалите $CF_CERT и повторите команду."
    fi
    staging_note "Откройте ссылку ниже в браузере, выберите зону tamir.rs и разрешите доступ."
    staging_cf tunnel login
    [ -f "$CF_CERT" ] || staging_abort "cert.pem не появился по пути $CF_CERT"
    chmod 600 "$CF_CERT"
    staging_note "Вход выполнен: $CF_CERT"
    ;;
  create)
    staging_tunnel_require_root create
    staging_tunnel_assert_hosts
    staging_tunnel_install_binary
    staging_tunnel_require_login
    staging_note "Создаю туннель $CF_NAME (повторный запуск безопасен)"
    out="$(staging_cf tunnel create --name "$CF_NAME" --credentials-file "$CF_CRED_FILE" "$CF_NAME" 2>&1 || true)"
    printf '%s\n' "$out" | grep -qi 'already exists' && staging_note "Туннель $CF_NAME уже был в зоне - использую существующий."
    id="$(staging_cf tunnel list 2>/dev/null | grep -E "[[:space:]]$CF_NAME([[:space:]]|$)" | grep -oE "$UUID_RE" | head -n1)"
    [ -n "$id" ] || id="$(printf '%s' "$out" | grep -oE "$UUID_RE" | head -n1)"
    [ -n "$id" ] || staging_abort "Не удалось определить id туннеля. Вывод: $out"
    if [ ! -f "$CF_CRED_FILE" ]; then
      staging_abort "Нет файла учётных данных $CF_CRED_FILE. Проверьте вывод: $out"
    fi
    chmod 600 "$CF_CRED_FILE"
    staging_note "Туннель: $CF_NAME id=$id"
    staging_tunnel_write_config "$id"
    staging_tunnel_write_service
    staging_tunnel_start
    staging_note "Туннель запущен. Записи DNS: sudo bash scripts/staging-tunnel.sh dns"
    ;;
  dns)
    staging_tunnel_require_root dns
    staging_tunnel_assert_hosts
    staging_tunnel_install_binary
    staging_tunnel_require_login
    id="$(staging_cf tunnel list 2>/dev/null | grep -E "[[:space:]]$CF_NAME([[:space:]]|$)" | grep -oE "$UUID_RE" | head -n1)"
    [ -n "$id" ] || staging_abort "Туннель $CF_NAME не найден в зоне. Запустите: sudo bash scripts/staging-tunnel.sh create"
    staging_note "Добавляю CNAME только для $API_HOST и $SITE_HOST (прод-записи не трогаю)"
    staging_cf tunnel route dns --overwrite-dns "$CF_NAME" "$API_HOST"
    staging_cf tunnel route dns --overwrite-dns "$CF_NAME" "$SITE_HOST"
    staging_tunnel_start
    if curl -fsS --retry 8 --retry-delay 5 --max-time 60 -o /dev/null "${STAGING_API_URL}/health"; then
      touch "$STAGING_TUNNEL_MARKER"
      staging_note "Публичный health отвечает: ${STAGING_API_URL}/health. Маркер: $STAGING_TUNNEL_MARKER"
      staging_note "Проверка витрины: curl -I ${STAGING_SITE_URL}/robots.txt"
    else
      staging_note "Публичный ${STAGING_API_URL}/health пока не отвечает."
      staging_note "Cloudflare распространяет DNS-запись несколько минут - повторите проверку позже."
    fi
    ;;
  status)
    staging_cf tunnel list 2>/dev/null || staging_note "Нет входа в Cloudflare ($CF_CERT)."
    printf '%s\n' "--- сервис:"
    systemctl is-active tamir-staging-tunnel 2>/dev/null || true
    [ -f "$CF_CONFIG" ] && staging_note "Конфиг: $CF_CONFIG"
    [ -f "$STAGING_TUNNEL_MARKER" ] && staging_note "Маркер публичного входа: $STAGING_TUNNEL_MARKER" \
      || staging_note "Маркера публичного входа нет - публичные проверки пропущены."
    ;;
  remove)
    staging_tunnel_require_root remove
    staging_note "Останавливаю туннель и снимаю маркер публичного входа."
    systemctl stop tamir-staging-tunnel 2>/dev/null || true
    systemctl disable tamir-staging-tunnel 2>/dev/null || true
    rm -f "$STAGING_TUNNEL_MARKER"
    staging_note "DNS-записи test.tamir.rs / test-api.tamir.rs удалите вручную в дашборде Cloudflare."
    ;;
  *)
    staging_abort "Неизвестное действие: $action. Нужен login | create | dns | status | remove"
    ;;
esac
