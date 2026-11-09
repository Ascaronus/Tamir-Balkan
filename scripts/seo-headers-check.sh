#!/usr/bin/env bash
# Живая проверка: стенд закрыт от поисковиков, прод открыт.
#
# Проверяются ответы публичных адресов, а не только их тело:
#   * X-Robots-Tag: noindex на стенде (витрина, её входной redirect, backend, YouTrack);
#   * отсутствие заголовка на публичных прод-хостах (allow-list в коде);
#   * robots.txt: на закрытом хосте без строки Sitemap:, на проде — с прод-картой;
#   * sitemap.xml: на закрытом хосте пустой <urlset>, на проде — непустой;
#   * canonical www-дубля ссылается на apex — дубли хостов склеиваются без noindex.
#
# Запуск: bash scripts/seo-headers-check.sh   (с любой машины с доступом в интернет)
# Секретов не нужно, только GET. Прод-sitemap строится через API, поэтому проверка
# занимает несколько секунд. SEO_STRICT=1 превращает известные зазоры в провал —
# так проверяют, что правило в Cloudflare уже поставили.
set -uo pipefail

STAGING_SITE="${SEO_STAGING_SITE:-https://test.tamir.rs}"
STAGING_API="${SEO_STAGING_API:-https://test-api.tamir.rs}"
STAGING_YOUTRACK="${SEO_STAGING_YOUTRACK:-https://youtrack.tamir.rs}"
PROD_SITE="${SEO_PROD_SITE:-https://tamir.rs}"
PROD_WWW="${SEO_PROD_WWW:-https://www.tamir.rs}"
PROD_API="${SEO_PROD_API:-https://api.tamir.rs}"

pass=0
fail=0
gap=0

# Headers of the first response: --max-redirs 0, because a redirect must carry the
# header itself — Google de-indexes by the headers of the answer it received.
headers_of() {
  curl -sS -o /dev/null -D - --max-time 60 --max-redirs 0 "$1" 2>/dev/null | tr -d '\r'
}

# hdrcheck <url> <yes|no|gap> — gap is a known hole the application cannot close.
hdrcheck() {
  local url="$1" expect="$2" d code tag
  d="$(headers_of "$url")"
  code="$(printf '%s\n' "$d" | awk 'toupper($1) ~ /^HTTP/ {c=$2} END {print c}')"
  tag="$(printf '%s\n' "$d" | grep -i '^x-robots-tag:' | head -1)"
  case "$expect" in
    yes)
      if [ -n "$tag" ]; then echo "PASS  $url  http=$code  $tag"; pass=$((pass + 1));
      else echo "FAIL  $url  http=$code  нет X-Robots-Tag (ожидался noindex)"; fail=$((fail + 1)); fi
      ;;
    gap)
      if [ -n "$tag" ]; then echo "PASS  $url  http=$code  $tag"; pass=$((pass + 1));
      elif [ "${SEO_STRICT:-0}" = "1" ]; then
        echo "FAIL  $url  http=$code  известный зазор закрыт не полностью"; fail=$((fail + 1))
      else
        echo "GAP   $url  http=$code  заголовок отдаёт не приложение (закрывается правилом в Cloudflare)"; gap=$((gap + 1))
      fi
      ;;
    *)
      if [ -z "$tag" ]; then echo "PASS  $url  http=$code  заголовка нет (как надо)"; pass=$((pass + 1));
      else echo "FAIL  $url  http=$code  $tag"; fail=$((fail + 1)); fi
      ;;
  esac
}

# robotscheck <host> <closed|open> — на закрытом хосте карта сайта не публикуется.
robotscheck() {
  local host="$1" mode="$2" body
  body="$(curl -fsS --max-time 60 "https://$host/robots.txt" 2>/dev/null)"
  if [ -z "$body" ]; then echo "FAIL  $host robots.txt не отдаётся"; fail=$((fail + 1)); return; fi
  if [ "$mode" = closed ]; then
    if printf '%s\n' "$body" | grep -qi '^sitemap:'; then
      echo "FAIL  $host robots.txt публикует Sitemap: — стенд открыт поисковикам"; fail=$((fail + 1))
    else
      echo "PASS  $host robots.txt без Sitemap:"; pass=$((pass + 1))
    fi
  else
    if printf '%s\n' "$body" | grep -qi '^sitemap: https://tamir\.rs/sitemap\.xml'; then
      echo "PASS  $host robots.txt с прод-картой"; pass=$((pass + 1))
    else
      echo "FAIL  $host robots.txt изменён:"; printf '%s\n' "$body" | sed 's/^/      /'; fail=$((fail + 1))
    fi
  fi
}

# sitemapcheck <host> <empty|full> — закрытый хост отдаёт пустой <urlset> без обращений к API.
sitemapcheck() {
  local host="$1" mode="$2" file code n
  file="$(mktemp)"
  code="$(curl -sS -o "$file" -w '%{http_code}' --max-time 90 "https://$host/sitemap.xml" 2>/dev/null)"
  n="$(grep -c '<url>' "$file" 2>/dev/null || true)"; n="${n:-0}"
  rm -f "$file"
  if [ "$mode" = empty ]; then
    if [ "$n" -eq 0 ]; then echo "PASS  $host sitemap.xml пустой (http=$code, urls=$n)"; pass=$((pass + 1))
    else echo "FAIL  $host sitemap.xml содержит $n URL"; fail=$((fail + 1)); fi
  else
    if [ "$n" -gt 0 ]; then echo "PASS  $host sitemap.xml живой (http=$code, urls=$n)"; pass=$((pass + 1))
    else echo "FAIL  $host sitemap.xml пустой (http=$code)"; fail=$((fail + 1)); fi
  fi
}

# canonicalcheck <url> <expected-origin> — canonical всегда строится из siteUrl(),
# поэтому дублирующий хост обязан ссылаться на основной, а не на себя.
canonicalcheck() {
  local url="$1" origin="$2" found
  found="$(curl -fsS --max-time 60 -L "$url" 2>/dev/null | grep -oE '<link rel="canonical" href="[^"]*"' | head -1)"
  if printf '%s' "$found" | grep -q "href=\"$origin"; then
    echo "PASS  $url  $found"; pass=$((pass + 1))
  else
    echo "FAIL  $url  canonical не на $origin: ${found:-не найден}"; fail=$((fail + 1))
  fi
}

echo "=== Стенд: X-Robots-Tag: noindex на каждом ответе ==="
hdrcheck "$STAGING_SITE/rs" yes
hdrcheck "$STAGING_SITE/" yes
hdrcheck "$STAGING_SITE/en" yes
hdrcheck "$STAGING_SITE/rs/presetenija" yes
hdrcheck "$STAGING_SITE/app" yes
hdrcheck "$STAGING_API/health" yes
# Medusa отдаёт /app и /store/products до глобального middleware (admin-статика и
# ошибка publishable key), поэтому эти два ответа закрывает только правило в Cloudflare.
hdrcheck "$STAGING_API/app" gap
hdrcheck "$STAGING_API/store/products" gap
# YouTrack — чужое приложение в той же зоне Cloudflare: заголовок ставит только правило.
hdrcheck "$STAGING_YOUTRACK/login" gap

echo "=== Прод: заголовка быть не должно ==="
hdrcheck "$PROD_SITE/rs" no
hdrcheck "$PROD_SITE/" no
hdrcheck "$PROD_SITE/en" no
hdrcheck "$PROD_WWW/rs" no
hdrcheck "$PROD_API/health" no
hdrcheck "$PROD_API/app" no

echo "=== Дубли хостов склеивает canonical, а не noindex ==="
canonicalcheck "$PROD_WWW/rs" "https://tamir.rs"
canonicalcheck "$PROD_WWW/rs/catalog" "https://tamir.rs"

echo "=== robots.txt ==="
robotscheck test.tamir.rs closed
robotscheck tamir.rs open

echo "=== sitemap.xml ==="
sitemapcheck test.tamir.rs empty
sitemapcheck tamir.rs full

echo
echo "=== Итог: PASS=$pass FAIL=$fail GAP=$gap ==="
if [ "$gap" -gt 0 ] && [ "${SEO_STRICT:-0}" != "1" ]; then
  echo "Note: GAP — ответы, где заголовок ставит не приложение. Закрывается Transform Rule"
  echo "      (Modify Response Header) в Cloudflare для http.host тестовых имён."
fi
[ "$fail" -eq 0 ]
