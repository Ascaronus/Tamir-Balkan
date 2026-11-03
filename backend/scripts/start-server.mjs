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

// Прод-прослушивание только loopback: публичный вход — за nginx (контрольный аудит
// 03.11, HIGH-1). На VPS `api.tamir.rs` слушает nginx (`listen 443` + `listen [::]:443`),
// проксирует на 9000, и весь `*-CORS` в pm2-окружении — это origin'ы браузеров, а не
// адрес прослушивания. Medusa же без `-H` слушает `0.0.0.0`, поэтому до 03.11 и API, и
// витрина торчали наружу на `0.0.0.0:9000` и `0.0.0.0:3000` в обход nginx, TLS и
// rate-limit'ов. `MEDUSA_BACKEND_HOST` оставляем переменной только для режимов, где
// витрина и API живут на разных узлах.
const backendHost = process.env.MEDUSA_BACKEND_HOST || "127.0.0.1"

const r = spawnSync("npx", ["medusa", "start", "-H", backendHost], {
  cwd: serverDir,
  stdio: "inherit",
  shell: true,
  env: { ...process.env, NODE_ENV: "production" },
})

process.exit(r.status ?? 1)
