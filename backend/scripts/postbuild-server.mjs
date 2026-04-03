/**
 * После `medusa build` Medusa v2 ожидает зависимости и .env внутри `.medusa/server`.
 * @see https://docs.medusajs.com/learn/build#start-built-medusa-application
 */
import { copyFileSync, existsSync } from "node:fs"
import { join, dirname } from "node:path"
import { fileURLToPath } from "node:url"
import { spawnSync } from "node:child_process"

const __dirname = dirname(fileURLToPath(import.meta.url))
const backendRoot = join(__dirname, "..")
const serverDir = join(backendRoot, ".medusa", "server")
const envSrc = join(backendRoot, ".env")
const envDest = join(serverDir, ".env.production")

if (!existsSync(join(serverDir, "package.json"))) {
  console.error("Нет `.medusa/server` — сначала выполни `medusa build` (npm run build).")
  process.exit(1)
}

const install = spawnSync("npm", ["install", "--omit=dev"], {
  cwd: serverDir,
  stdio: "inherit",
  shell: true,
})
if (install.status !== 0) process.exit(install.status ?? 1)

if (existsSync(envSrc)) {
  copyFileSync(envSrc, envDest)
  console.log("Скопировано backend/.env → .medusa/server/.env.production")
} else {
  console.warn("Файл backend/.env не найден — для production задай переменные вручную в `.medusa/server/.env.production`.")
}
