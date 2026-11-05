#!/usr/bin/env bash
# Публичный вход staging через cloudflared-туннель (ТЗ §4): без проброса портов,
# без nginx, без изменения записей tamir.rs / api.tamir.rs.
#
#   sudo bash scripts/staging-tunnel.sh login     # вход в Cloudflare (открыть ссылку)
#   sudo bash scripts/staging-tunnel.sh create    # создать туннель + конфиг + systemd-сервис
#   sudo bash scripts/staging-tunnel.sh dns       # добавить записи test.* (только их)
#   sudo bash scripts/staging-tunnel.sh status    # состояние туннеля и записей
#   sudo bash scripts/staging-tunnel.sh remove    # остановить сервис и снять маркер
#
# Повторный create безопасен: он переприкрепляет конфиг и сервис к существующему туннелю.
set -Eeuo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
source "$HERE/lib/staging-release.sh"
staging_root_defaults

CF_DIR="${STAGING_CLOUDFLARED_DIR:-/etc/cloudflared}"
CF_BIN="${STAGING_CLOUDFLARED_BIN:-/usr/local/bin/cloudflared}"
CF_VERSION="${STAGING_CLOUDFLARED_VERSION:-2026.10.1}"
CF_CONFIG="$CF_DIR/tamir-staging.yml"
UNIT="/etc/systemd/system/tamir-staging-tunnel.service"
# Только staging-имена. Прод-записи этот скрипт не создаёт, не меняет и не удаляет.
SITE_HOST="$(printf '%s' "$STAGING_SITE_URL" | sed -E 's#^https?://##; s#/.*$##')"
API_HOST="$(printf '%s' "$STAGING_API_URL" | sed -E 's#^https?://##; s#/.*$##')"

staging_tunnel_assert_hosts() {
  case "$SITE_HOST" in test.tamir.rs) ;; *) staging_abort "STAGING_SITE_URL обязан быть https://test.tamir.rs, получено $SITE_HOST" ;; esac
  case "$API_HOST" in test-api.tamir.rs) ;; *) staging_abort "STAGING_API_URL обязан быть https://test-api.tamir.rs, получено $API_HOST" ;; esac
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

# Файл входа Cloudflare (cert.pem) кладёт интерактивный `login`: он печатает ссылку,
# которую открывает человек. Автоматизировать этот шаг нельзя намеренно.
staging_tunnel_require_login() {
  [ -f "$CF_DIR/cert.pem" ] || staging_abort "Нет входа в Cloudflare. Запустите: sudo bash scripts/staging-tunnel.sh login"
}

staging_tunnel_id() {
  local file
  file="$(ls -1t "$CF_DIR"/*.json 2>/dev/null | head -n1 || true)"
  [ -n "$file" ] || staging_abort "Нет учётных данных туннеля в $CF_DIR. Запустите: sudo bash scripts/staging-tunnel.sh create"
  basename "$file" .json
}

staging_tunnel_write_config() {
  local id="$1"
  mkdir -p "$CF_DIR"
  cat > "$CF_CONFIG" <<YAML
tunnel: $id
credentials-file: $CF_DIR/$id.json
ingress:
  - hostname: $API_HOST
    service: http://127.0.0.1:$STAGING_BACKEND_PORT
  - hostname: $SITE_HOST
    service: http://127.0.0.1:$STAGING_FRONTEND_PORT
  # Всё остальное — глухо 404: чужой хост не должен попасть в приложение.
  - service: http_status:404
YAML
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
ExecStart=$CF_BIN tunnel run --config $CF_CONFIG
Restart=always
RestartSec=5
NoNewPrivileges=true

[Install]
WantedBy=multi-user.target
UNIT
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
    staging_tunnel_install_binary
    mkdir -p "$CF_DIR"
    staging_note "Откройте ссылку ниже в браузере и выберите зону tamir.rs."
    "$CF_BIN" tunnel login
    staging_note "Вход выполнен: $CF_DIR/cert.pem"
    ;;
  create)
    staging_tunnel_assert_hosts
    staging_tunnel_install_binary
    staging_tunnel_require_login
    id="$(staging_tunnel_id || true)"
    if [ -n "${id:-}" ]; then
      staging_note "Туннель уже существует: $id"
    else
      staging_note "Создаю туннель $STAGING_TUNNEL_NAME"
      "$CF_BIN" tunnel create "$STAGING_TUNNEL_NAME"
      id="$(staging_tunnel_id)"
    fi
    staging_tunnel_write_config "$id"
    staging_tunnel_write_service
    staging_tunnel_start
    staging_note "Туннель запущен (id=$id). Записи DNS: sudo bash scripts/staging-tunnel.sh dns"
    ;;
  dns)
    staging_tunnel_assert_hosts
    staging_tunnel_require_login
    id="$(staging_tunnel_id)"
    staging_note "Добавляю записи CNAME только для $API_HOST и $SITE_HOST"
    "$CF_BIN" tunnel route dns --overwrite-dns "$id" "$API_HOST"
    "$CF_BIN" tunnel route dns --overwrite-dns "$id" "$SITE_HOST"
    staging_tunnel_start
    if curl -fsS --retry 6 --retry-delay 5 --max-time 40 -o /dev/null "${STAGING_API_URL}/health"; then
      touch "$STAGING_TUNNEL_MARKER"
      staging_note "Публичный health отвечает: $STAGING_API_URL/health"
      staging_note "Маркер выпущен: $STAGING_TUNNEL_MARKER (публичные проверки включены)"
    else
      rm -f "$STAGING_TUNNEL_MARKER"
      staging_note "Записи добавлены, но $STAGING_API_URL/health пока не отвечает. Проверьте apps-state и pm2 status."
    fi
    ;;
  status)
    id="$(staging_tunnel_id)"
    systemctl status tamir-staging-tunnel --no-pager -n 15 || true
    staging_note "Туннель: $id"
    "$CF_BIN" tunnel info "$id" 2>&1 | head -n 25 || true
    for host in "$SITE_HOST" "$API_HOST"; do
      printf '%s -> %s\n' "$host" "$(dig +short CNAME "$host" 2>/dev/null | head -n1 || echo нет записи)"
    done
    staging_note "Маркер публичных проверок: $([ -f "$STAGING_TUNNEL_MARKER" ] && echo есть || echo нет)"
    ;;
  remove)
    systemctl disable --now tamir-staging-tunnel >/dev/null 2>&1 || true
    rm -f "$UNIT" "$STAGING_TUNNEL_MARKER"
    systemctl daemon-reload
    staging_note "Сервис снят, маркер удалён. Записи test.* в Cloudflare удалите вручную (prod-записи не трогаем)."
    ;;
  *)
    staging_abort "Неизвестное действие: $action (login|create|dns|status|remove)"
    ;;
esac
