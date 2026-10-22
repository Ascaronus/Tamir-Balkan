import path from "node:path"
import { loadEnv, defineConfig, Modules } from '@medusajs/framework/utils'
import { decimalAdminConfig } from "./src/utils/admin-decimal-vite"

loadEnv(process.env.NODE_ENV || 'development', process.cwd())

// No shared fallback: development and builds also need explicit local secrets.
function authSecret(name: "JWT_SECRET" | "COOKIE_SECRET"): string {
  const value = process.env[name]
  if (!value || value.trim().length < 32 || /replace|changeme|supersecret|placeholder/i.test(value)) {
    throw new Error(`${name}: set a private random value of at least 32 characters in the runtime environment`)
  }
  return value
}

/** Абсолютный путь от `medusa-config.js`: и dev (`backend/`), и prod (`.medusa/server/`). */
const testFulfillmentStub = path.join(__dirname, "src", "scripts", "test-fulfillment-provider")

module.exports = defineConfig({
  admin: { vite: () => decimalAdminConfig(__dirname) },
  modules: [
    {
      resolve: "@medusajs/medusa/file",
      options: {
        providers: [{
          resolve: "@medusajs/medusa/file-local",
          id: "local",
          options: {
            backend_url: `${(process.env.MEDUSA_PUBLIC_BACKEND_URL || (process.env.NODE_ENV === "production" ? "https://api.tamir.rs" : "http://localhost:9000")).replace(/\/$/, "")}/static`,
          },
        }],
      },
    },
    {
      resolve: "@medusajs/medusa/translation",
    },
    {
      key: Modules.FULFILLMENT,
      resolve: "@medusajs/medusa/fulfillment",
      options: {
        providers: [
          {
            resolve: "@medusajs/medusa/fulfillment-manual",
            id: "manual",
          },
          /** Заглушка для админки / тестов (id в БД: `test_test`). Файл должен попасть в бандл — см. `src/api/store/custom/route.ts`. */
          {
            resolve: testFulfillmentStub,
            id: "test",
          },
        ],
      },
    },
  ],
  featureFlags: {
    translation: true,
  },
  projectConfig: {
    databaseUrl: process.env.DATABASE_URL,
    redisUrl: process.env.REDIS_URL,
    http: {
      storeCors: process.env.STORE_CORS!,
      adminCors: process.env.ADMIN_CORS!,
      authCors: process.env.AUTH_CORS!,
      jwtSecret: authSecret("JWT_SECRET"),
      cookieSecret: authSecret("COOKIE_SECRET"),
    },
    // HTTP + IP: default Secure cookies break admin session; use HTTPS in real prod.
    cookieOptions: {
      sameSite: "lax",
      secure: false,
    },
  },
})
