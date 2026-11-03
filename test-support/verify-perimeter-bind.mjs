// HIGH-1 guard (контрольный аудит 03.11): прод-процессы обязаны слушать только loopback.
// Публичный вход — за nginx (TLS, rate-limit, Host-маршрутизация). Если из скрипта старта
// пропадёт `-H`, Medusa поднимется на 0.0.0.0:9000, а витрина — на 0.0.0.0:3000, то есть
// наружу в обход nginx. Guard статический: проверяет тексты запуска, процесс не поднимает.
import { readFileSync } from 'node:fs'
import assert from 'node:assert/strict'

const read = relative => readFileSync(new URL(relative, import.meta.url), 'utf8')

const startServer = read('../backend/scripts/start-server.mjs')
const frontendPkg = JSON.parse(read('../frontend/package.json'))

assert.match(
  startServer,
  /MEDUSA_BACKEND_HOST\s*\|\|\s*"127\.0\.0\.1"/,
  'start-server.mjs must default the production bind address to loopback (127.0.0.1)'
)
assert.match(
  startServer,
  /\["medusa",\s*"start",\s*"-H",\s*backendHost\]/,
  'start-server.mjs must pass -H <host> to `medusa start`'
)
assert.doesNotMatch(
  startServer,
  /"medusa",\s*"start",\s*"-H",\s*"0\.0\.0\.0"/,
  'start-server.mjs must not hardcode a wildcard bind address'
)

assert.equal(
  frontendPkg.scripts.start,
  'next start -H 127.0.0.1',
  'frontend start script must bind the production server to loopback via -H (the flag beats HOSTNAME from the PM2 ecosystem)'
)

console.log('Perimeter bind verified: backend and frontend production starts listen on 127.0.0.1 only')
