import type { NextConfig } from "next"

const nextConfig: NextConfig = {
  // Ограничиваем корень трейсинга/поиска в монорепозитории.
  // (А dev мы запускаем с `next dev --webpack`.)
  turbopack: {
    root: ".",
  },
  outputFileTracingRoot: ".",
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "medusa-public-images.s3.eu-west-1.amazonaws.com",
        pathname: "/**",
      },
    ],
  },
}

export default nextConfig
