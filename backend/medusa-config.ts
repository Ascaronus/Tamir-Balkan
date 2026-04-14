import path from "node:path"
import { loadEnv, defineConfig, Modules } from '@medusajs/framework/utils'

loadEnv(process.env.NODE_ENV || 'development', process.cwd())

/** Абсолютный путь от `medusa-config.js`: и dev (`backend/`), и prod (`.medusa/server/`). */
const testFulfillmentStub = path.join(__dirname, "src", "scripts", "test-fulfillment-provider")

module.exports = defineConfig({
  modules: [
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
      jwtSecret: process.env.JWT_SECRET || "supersecret",
      cookieSecret: process.env.COOKIE_SECRET || "supersecret",
    },
    // HTTP + IP: default Secure cookies break admin session; use HTTPS in real prod.
    cookieOptions: {
      sameSite: "lax",
      secure: false,
    },
  },
})
