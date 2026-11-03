import path from "node:path"
import type { NextConfig } from "next"

/**
 * Next 16 требует абсолютные `turbopack.root` и `outputFileTracingRoot`.
 * `import.meta.url` при загрузке конфига иногда даёт путь, из‑за которого предупреждения остаются.
 * `path.resolve(process.cwd())` совпадает с каталогом, откуда запускают `next` (PM2: `cwd` → `.../frontend`).
 */
const frontendRoot = path.resolve(process.cwd())

/** Домены третьей стороны, которые витрина грузит сама: GA4 (после согласия) и Cloudflare Turnstile (формы). */
const GA_TAG_ORIGIN = "https://www.googletagmanager.com"
const TURNSTILE_ORIGIN = "https://challenges.cloudflare.com"
const ALLOWED_IMAGE_ORIGINS = [
  "https://medusa-public-images.s3.eu-west-1.amazonaws.com",
  "https://tamir.ua",
]

/**
 * Origin Store API, из которого браузер ходит в бэкенд. В проде это `https://api.tamir.rs`
 * (`NEXT_PUBLIC_MEDUSA_BACKEND_URL`), в локальной разработке переменная может быть не задана —
 * тогда разрешаем любой протокол/хост, иначе локальный checkout перестанет работать.
 */
function apiOriginForCsp(): string {
  const base = process.env.NEXT_PUBLIC_MEDUSA_BACKEND_URL
  if (!base) return "*://*"
  try {
    return new URL(base).origin
  } catch {
    return "*://*"
  }
}

/**
 * Базовый CSP витрины. `'unsafe-inline'` для скриптов и стилей оставлен намеренно:
 * Next отдаёт инлайновый бутстрап роутера, JSON-LD товара вставляется инлайном, а consent-скрипт
 * Google грузится через `document.createElement` (см. `src/lib/privacy/consent.ts`).
 * Ужесточение до nonce — отдельная задача, она зафиксирована в аудите.
 */
function contentSecurityPolicy(): string {
  const apiOrigin = apiOriginForCsp()
  // Хот-модульная замена в `next dev` исполняет модули через `eval`. В проде (`next build`/`next start`)
  // это запрещено: `NODE_ENV` там `production`, и директива остаётся строгой.
  const devEval = process.env.NODE_ENV === "development" ? " 'unsafe-eval'" : ""
  return [
    "default-src 'self'",
    `script-src 'self' 'unsafe-inline'${devEval} ${GA_TAG_ORIGIN} ${TURNSTILE_ORIGIN}`,
    "style-src 'self' 'unsafe-inline'",
    `img-src 'self' data: blob: ${ALLOWED_IMAGE_ORIGINS.join(" ")} ${apiOrigin}`,
    `connect-src 'self' ${apiOrigin} ${GA_TAG_ORIGIN} ${TURNSTILE_ORIGIN}`,
    // Шрифты next/font/google скачиваются на сборке и отдаются с `/self`, поэтому внешний origin здесь не нужен.
    "font-src 'self'",
    `frame-src ${TURNSTILE_ORIGIN}`,
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
  ].join("; ")
}

/** Формат правила `headers()` берём из типа Next, чтобы `next build` его принимал. */
type HeaderRule = Awaited<ReturnType<NonNullable<NextConfig["headers"]>>>[number]
type SecurityHeader = HeaderRule["headers"][number]

/** Постоянные security-заголовки витрины: CSP + защита от clickjacking/sniffing + отказ от лишних возможностей браузера. */
function storefrontSecurityHeaders(): SecurityHeader[] {
  return [
    { key: "Content-Security-Policy", value: contentSecurityPolicy() },
    { key: "X-Content-Type-Options", value: "nosniff" },
    { key: "X-Frame-Options", value: "DENY" },
    { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
    {
      key: "Permissions-Policy",
      value: "camera=(), microphone=(), geolocation=(), payment=(), usb=(), interest-cohort=()",
    },
    { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
    { key: "X-Permitted-Cross-Domain-Policies", value: "none" },
  ]
}

/**
 * Security-заголовки витрины для всех маршрутов. `Strict-Transport-Security` отдаём только в проде:
 * в `next dev` сайт работает по `http://localhost`, а годичное HSTS-правило браузера ломает локальную разработку.
 * Без `includeSubDomains`: правило распространилось бы на все поддомены `tamir.rs`, включая `vpn.tamir.rs`,
 * а инфраструктуру VPN мы сознательно не трогаем.
 */
async function securityHeaders(): Promise<HeaderRule[]> {
  const headers = storefrontSecurityHeaders()
  if (process.env.NODE_ENV === "production") {
    headers.push({ key: "Strict-Transport-Security", value: "max-age=31536000" })
  }
  return [{ source: "/:path*", headers }]
}

/** Картинки из админки Medusa идут с того же origin, что и Store API — добавляем в allowlist для next/image. */
function medusaUploadPatterns(): NonNullable<
  NonNullable<NextConfig["images"]>["remotePatterns"]
> {
  const base = process.env.NEXT_PUBLIC_MEDUSA_BACKEND_URL
  if (!base) return []
  try {
    const u = new URL(base)
    return [
      {
        protocol: (u.protocol === "https:" ? "https" : "http") as
          | "http"
          | "https",
        hostname: u.hostname,
        ...(u.port ? { port: u.port } : {}),
        pathname: "/**",
      },
    ]
  } catch {
    return []
  }
}

const nextConfig: NextConfig = {
  // Ограничиваем корень трейсинга/поиска в монорепозитории.
  // (А dev мы запускаем с `next dev --webpack`.)
  turbopack: {
    root: frontendRoot,
  },
  outputFileTracingRoot: frontendRoot,
  // Next больше не отдаёт `X-Powered-By: Next.js`.
  poweredByHeader: false,
  async headers() {
    return securityHeaders()
  },
  async redirects() {
    return [
      { source: "/me", destination: "/rs", permanent: true },
      { source: "/me/:path*", destination: "/rs/:path*", permanent: true },
    ]
  },
  async rewrites() {
    // Internal aliases retain the public Serbian URL and the locale header from Proxy.
    return [
      { source: "/rs/korpa", destination: "/rs/cart" },
      { source: "/rs/nalog", destination: "/rs/account" },
      { source: "/rs/nalog/prijava", destination: "/rs/account/login" },
      { source: "/rs/nalog/registracija", destination: "/rs/account/register" },
      { source: "/rs/nalog/zaboravljena-lozinka", destination: "/rs/account/forgot-password" },
    ]
  },
  images: {
    remotePatterns: [
      // Разрешённые origin совпадают с `img-src` в CSP: `ALLOWED_IMAGE_ORIGINS` — это
      // картинки из публичного S3 Medusa и фото из фида tamir.ua (Rozetka XML).
      ...ALLOWED_IMAGE_ORIGINS.map(origin => {
        const u = new URL(origin)
        return {
          protocol: (u.protocol === "https:" ? "https" : "http") as "http" | "https",
          hostname: u.hostname,
          pathname: "/**",
        }
      }),
      ...medusaUploadPatterns(),
    ],
  },
}

export default nextConfig
