/**
 * Продакшен-старт только из `.medusa/server` (там лежит admin build + index.html).
 */
import { existsSync, copyFileSync } from "node:fs"
import { join, dirname } from "node:path"
import { fileURLToPath } from "node:url"
import { spawnSync } from "node:child_process"

const __dirname = dirname(fileURLToPath(import.meta.url))
const backendRoot = join(__dirname, "..")
const serverDir = join(backendRoot, ".medusa", "server")

if (!existsSync(join(serverDir, "package.json"))) {
  console.error("Нет `.medusa/server`. Сначала: npm run build")
  process.exit(1)
}

const envProd = join(serverDir, ".env.production")
if (!existsSync(envProd) && existsSync(join(backendRoot, ".env"))) {
  copyFileSync(join(backendRoot, ".env"), envProd)
  console.log("Скопировано backend/.env → .medusa/server/.env.production")
}

const r = spawnSync("npx", ["medusa", "start", "-H", "0.0.0.0"], {
  cwd: serverDir,
  stdio: "inherit",
  shell: true,
  env: { ...process.env, NODE_ENV: "production" },
})

process.exit(r.status ?? 1)
