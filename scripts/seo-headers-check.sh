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
# Второй блок (после деплоя текстов) держит то, из-за чего Search Console показывала
# «Crawled – currently not indexed»: у категорий и страниц-близнецов должны быть
# видимый серверный текст, description и CollectionPage/BreadcrumbList разметка.
# Там же проверяется сама разметка: каждый ListItem публикует `item` и `name`, иначе
# Search Console отвечает «Отсутствует поле "item" (в itemListElement)».
# Редирект www -> apex живёт в Cloudflare (Redirect Rule, исключение /api), и этот
# скрипт проверяет, что правило на месте и чат-API на www не склеивается с apex.
#
# Запуск: bash scripts/seo-headers-check.sh   (с любой машины с доступом в интернет)
# Секретов не нужно, только GET. Прод-sitemap строится через API, поэтому проверка
# занимает несколько секунд. SEO_STRICT=1 превращает известные зазоры в провал —
# так проверяют, что правило в Cloudflare уже поставили.
# Блок «страницы, которые Search Console не индексировала» краснеет, пока тексты
# категорий и товаров не применены (set-category-seo.ts / set-product-seo.ts).
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

# redirectcheck <url> <коды-через-|> <что должно быть в Location> — редирект обязан
# отвечать сам по себе: Google снимает страницу с индекса по ответу на свой запрос.
redirectcheck() {
  local url="$1" codes="$2" want="$3" d code loc
  d="$(headers_of "$url")"
  code="$(printf '%s\n' "$d" | awk 'toupper($1) ~ /^HTTP/ {c=$2} END {print c}')"
  loc="$(printf '%s\n' "$d" | grep -i '^location:' | head -1 | sed 's/^[^:]*: //')"
  if printf '%s' "$code" | grep -qE "^($codes)$" && printf '%s' "$loc" | grep -qF -- "$want"; then
    echo "PASS  $url  http=$code  -> $loc"; pass=$((pass + 1))
  else
    echo "FAIL  $url  http=$code  Location=${loc:-нет} (ожидались коды $codes и $want)"; fail=$((fail + 1))
  fi
}

# apihostcheck <url> — POST /api/chat/config без cookies: ответ не должен быть редиректом,
# иначе склейка www -> apex ломает Origin-белый список чата (scripts/check-chat-origin.mjs).
apihostcheck() {
  local url="$1" d code loc
  d="$(curl -sS -o /dev/null -D - --max-time 60 --max-redirs 0 -X POST \
        -H "Origin: $PROD_WWW" -H 'Content-Type: application/json' -d '{}' "$url" 2>/dev/null | tr -d '\r')"
  code="$(printf '%s\n' "$d" | awk 'toupper($1) ~ /^HTTP/ {c=$2} END {print c}')"
  loc="$(printf '%s\n' "$d" | grep -i '^location:' | head -1 | sed 's/^[^:]*: //')"
  if [ -z "$loc" ] && ! printf '%s' "$code" | grep -qE '^30[1-8]$'; then
    echo "PASS  $url  http=$code  без редиректа, Origin $PROD_WWW принимается"; pass=$((pass + 1))
  else
    echo "FAIL  $url  http=$code  Location=${loc:-нет} — chat-API на www нельзя склеивать с apex"; fail=$((fail + 1))
  fi
}

# pagecheck <url> <строка> <что ждём> — текст должен быть в серверном HTML: поисковик
# не дождётся клиентского рендера, а «Crawled – currently not indexed» лечится именно им.
pagecheck() {
  local url="$1" needle="$2" label="$3" body
  body="$(curl -fsSL --max-time 90 -L "$url" 2>/dev/null)"
  if printf '%s' "$body" | grep -qF -- "$needle"; then
    echo "PASS  $url  $label"; pass=$((pass + 1))
  else
    echo "FAIL  $url  $label: нет строки $needle"; fail=$((fail + 1))
  fi
}

# listitemcheck <url> — Google в ListItem (ItemList и BreadcrumbList) читает `item` и
# требует `name`; ключ `url` вне схемы, поэтому разметка с `url` даёт в Search Console
# ошибку «Отсутствует поле "item" (в itemListElement)» на всех адресах каталога.
listitemcheck() {
  local url="$1" body chunk total=0 bad=0
  body="$(curl -fsSL --max-time 90 -L "$url" 2>/dev/null)"
  while IFS= read -r chunk; do
    total=$((total + 1))
    case "$chunk" in
      *'"item":"'*) ;;
      *) echo "FAIL  $url  ListItem без item"; bad=$((bad + 1)); continue ;;
    esac
    case "$chunk" in
      *'"name":"'*) ;;
      *) echo "FAIL  $url  ListItem без name"; bad=$((bad + 1)); continue ;;
    esac
    case "$chunk" in
      *'"url":"'*) echo "FAIL  $url  ListItem с ключом url — Google его не читает"; bad=$((bad + 1)) ;;
    esac
  done < <(printf '%s' "$body" | grep -oE '"@type":"ListItem"[^}]*')
  if [ "$total" -eq 0 ]; then
    echo "FAIL  $url  в разметке нет ни одного itemListElement"; fail=$((fail + 1))
  elif [ "$bad" -gt 0 ]; then
    fail=$((fail + bad))
  else
    echo "PASS  $url  item и name у всех $total ListItem"; pass=$((pass + 1))
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

echo "=== Редиректы: www склеивается на edge, apex-домашняя ведёт в каталог ==="
# Правило Redirect Rule в Cloudflare (http.host eq "www.tamir.rs"), кроме /api:
# без него Search Console показывает www-адреса как «Redirect page»-дубли.
redirectcheck "$PROD_WWW/rs" "301|308" "https://tamir.rs/rs"
redirectcheck "$PROD_WWW/rs/catalog/pojacanja" "301|308" "https://tamir.rs/rs/catalog/pojacanja"
redirectcheck "$PROD_WWW/en/catalog/buffs?utm_source=seo" "301|308" "https://tamir.rs/en/catalog/buffs?utm_source=seo"
# Apex-домашняя и http-версия редиректят на каталог намеренно (см. frontend/src/proxy.ts):
# записи «Redirect page» в Search Console для них — норма, а не ошибка индексации.
redirectcheck "$PROD_SITE/" "301|308" "https://tamir.rs/rs"
redirectcheck "http://tamir.rs/" "301|308" "https://tamir.rs"
# Чат на www остаётся на своём хосте: Origin https://www.tamir.rs в белом списке backend.
apihostcheck "$PROD_WWW/api/chat/config"

echo "=== Страницы, которые Search Console не индексировала ==="
# Видимый серверный текст + description + разметка: без этого страница тонкая, а
# тексты задаются скриптами set-category-seo.ts / set-product-seo.ts.
pagecheck "$PROD_SITE/rs/catalog/pojacanja" 'catalog-seo-intro' "видимый текст категории"
pagecheck "$PROD_SITE/rs/catalog/pojacanja" 'BreadcrumbList' "хлебные крошки в разметке"
pagecheck "$PROD_SITE/rs/catalog/pojacanja" 'CollectionPage' "разметка коллекции"
listitemcheck "$PROD_SITE/rs/catalog/pojacanja"
listitemcheck "$PROD_SITE/en/catalog/buffs"
pagecheck "$PROD_SITE/en/catalog/buffs" 'catalog-seo-intro' "видимый текст категории"
pagecheck "$PROD_SITE/en/catalog/buffs" 'Buffs and Neck Gaiters' "en-название категории"
# Страницы-близнецы должны различаться текстом, а не только цветом в заголовке.
pagecheck "$PROD_SITE/rs/products/crna-kapa-buff-balaklava" 'Crna kapa balaklava sa flis podstavom' "уникальное описание товара"
pagecheck "$PROD_SITE/rs/products/siva-kapa-buff-balaklava" 'Siva kapa balaklava za hladne dane' "уникальное описание товара"
pagecheck "$PROD_SITE/rs/products/muski-crni-buff-sa-flisom" 'Muški crni buff sa flisom: grejač' "уникальное описание товара"
pagecheck "$PROD_SITE/rs/products/siva-prelazna-kapa" 'Siva prelazna kapa sa flisom' "уникальное описание товара"
pagecheck "$PROD_SITE/en/products/men-s-gray-fleece-buff" 'buff with fleece lining for daily commutes' "en-описание товара"

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
