import path from "node:path"
import type { NextConfig } from "next"

/**
 * Next 16 требует абсолютные `turbopack.root` и `outputFileTracingRoot`.
 * `import.meta.url` при загрузке конфига иногда даёт путь, из‑за которого предупреждения остаются.
 * `path.resolve(process.cwd())` совпадает с каталогом, откуда запускают `next` (PM2: `cwd` → `.../frontend`).
 */
const frontendRoot = path.resolve(process.cwd())

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
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "medusa-public-images.s3.eu-west-1.amazonaws.com",
        pathname: "/**",
      },
      // Source product images from tamir.ua feed (Rozetka XML)
      {
        protocol: "https",
        hostname: "tamir.ua",
        pathname: "/**",
      },
      ...medusaUploadPatterns(),
    ],
  },
}

export default nextConfig
