import test from 'node:test'
import assert from 'node:assert/strict'
import * as fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import vm from 'node:vm'
import { createRequire } from 'node:module'
import { createServer } from 'node:http'
import { once } from 'node:events'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { checkChatOrigin } from '../scripts/check-chat-origin.mjs'

const root = fileURLToPath(new URL('../', import.meta.url))
const require = createRequire(import.meta.url)
const deploy = fs.readFileSync(path.join(root, 'scripts/deploy-vps.sh'), 'utf8')
const preparation = deploy.match(/node <<'JS'\n([\s\S]*?)\nJS/)[1]

test('release preparation replaces stale frontend PM2 origin and preserves rollback environment', t => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'tamir-env-'))
  t.after(() => fs.rmSync(tmp, { recursive: true, force: true }))
  const source = path.join(tmp, 'source'), release = path.join(tmp, 'release'), backup = path.join(tmp, 'backup')
  for (const dir of [source, release, backup])
    for (const app of ['backend', 'frontend']) fs.mkdirSync(path.join(dir, app), { recursive: true })
  fs.writeFileSync(path.join(source, 'backend/.env'), 'DATABASE_URL=unused\n')
  fs.writeFileSync(path.join(source, 'frontend/.env.production.local'), 'NEXT_PUBLIC_SITE_URL=https://localhost:3000\n')
  for (const stale of ['https://localhost:3000', 'https://test.tamir.rs', undefined]) {
    const processes = ['backend', 'frontend'].map(app => ({ name: `tamir-${app}`, pm2_env: {
      status: 'online', pm_exec_path: '/usr/bin/npm', args: 'start', pm_cwd: path.join(source, app),
      env: { DATABASE_URL: 'postgres://test:test@localhost/test', KEEP_ME: app,
        ...(stale === undefined ? {} : { NEXT_PUBLIC_SITE_URL: stale }) },
    } }))
    fs.writeFileSync(path.join(backup, 'pm2.json'), JSON.stringify(processes))
    vm.runInNewContext(preparation, {
      URL,
      process: { env: { TAMIR_SOURCE: source, TAMIR_RELEASE: release, TAMIR_BACKUP: backup },
        exit: code => { throw Error(`Unexpected preparation exit ${code}`) } },
      require: name => name.endsWith('/node_modules/dotenv') ? { parse: () => ({}) }
        : name === 'node:child_process' ? { spawnSync: command => {
          assert.equal(command, 'pg_dump'); return { status: 0 }
        } } : require(name),
    })
    const config = dir => JSON.parse(fs.readFileSync(path.join(dir, 'ecosystem.config.cjs'), 'utf8').slice('module.exports = '.length))
    const next = config(release), old = config(backup)
    assert.equal(next.apps[1].env.NEXT_PUBLIC_SITE_URL, 'https://tamir.rs')
    assert.equal(next.apps[1].env.KEEP_ME, 'frontend')
    assert.equal(next.apps[0].env.NEXT_PUBLIC_SITE_URL, stale)
    assert.deepEqual(old.apps.map(app => app.env), processes.map(p => p.pm2_env.env))
  }
})

async function fixture(t, handler) {
  const server = createServer(handler)
  server.listen(0, '127.0.0.1')
  await once(server, 'listening')
  t.after(() => { server.closeAllConnections(); server.close() })
  return `http://127.0.0.1:${server.address().port}`
}

test('origin smoke check accepts public origins, rejects foreign origins and sends no conversation data', async t => {
  const requests = []
  const url = await fixture(t, async (req, res) => {
    let body = ''
    for await (const chunk of req) body += chunk
    requests.push({ method: req.method, path: req.url, origin: req.headers.origin, body })
    assert.equal(req.headers.cookie, undefined)
    assert.equal(req.headers.authorization, undefined)
    const foreign = req.headers.origin === 'https://untrusted.example'
    res.writeHead(foreign ? 403 : 404, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ code: foreign ? 'INVALID_ORIGIN' : 'CHAT_NOT_FOUND' }))
  })
  await checkChatOrigin(url)
  assert.equal(requests.length, 3)
  assert.deepEqual(requests.map(r => r.origin), ['https://tamir.rs', 'https://www.tamir.rs', 'https://untrusted.example'])
  for (const r of requests) assert.deepEqual({ ...r, origin: undefined }, {
    method: 'POST', path: '/api/chat/config', origin: undefined, body: '{}',
  })
})

for (const [name, status, body] of [
  ['old INVALID_ORIGIN regression', 403, '{"code":"INVALID_ORIGIN"}'],
  ['unrelated 404', 404, '{"code":"NOT_FOUND"}'],
  ['unavailable backend', 503, '{"code":"CHAT_UNAVAILABLE"}'],
  ['non-JSON proxy error', 502, '<html>Bad gateway</html>'],
  ['unexpected success', 200, '{"code":"CHAT_NOT_FOUND"}'],
]) test(`origin smoke check fails on ${name}`, async t => {
  const url = await fixture(t, (_req, res) => { res.writeHead(status); res.end(body) })
  await assert.rejects(checkChatOrigin(url))
})

test('origin smoke check rejects a foreign origin mistakenly allowed by the server', async t => {
  const url = await fixture(t, (_req, res) => { res.writeHead(404); res.end('{"code":"CHAT_NOT_FOUND"}') })
  await assert.rejects(checkChatOrigin(url), /untrusted/)
})

test('origin smoke check does not follow redirects', async t => {
  let requests = 0
  const url = await fixture(t, (_req, res) => { requests++; res.writeHead(307, { Location: '/other' }); res.end() })
  await assert.rejects(checkChatOrigin(url))
  assert.equal(requests, 1)
})

for (const fails of [false, true]) test(`activation ${fails ? 'rolls back on origin failure' : 'saves a passing release'}`, t => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'tamir-activation-'))
  t.after(() => fs.rmSync(tmp, { recursive: true, force: true }))
  const release = path.join(tmp, 'release'), backup = path.join(tmp, 'backup'), bin = path.join(tmp, 'bin')
  for (const dir of [backup, bin, `${release}/frontend/.next`, `${release}/backend/.medusa/server`, `${release}/scripts`])
    fs.mkdirSync(dir, { recursive: true })
  fs.writeFileSync(`${release}/frontend/.next/BUILD_ID`, 'fixture')
  fs.writeFileSync(`${release}/backend/.medusa/server/package.json`, '{}')
  fs.writeFileSync(`${release}/scripts/check-chat-origin.mjs`, `process.exit(${fails ? 1 : 0})`)
  const apps = ['backend', 'frontend'].map(folder => ({ name: `tamir-${folder}`, cwd: `${release}/${folder}` }))
  fs.writeFileSync(`${release}/ecosystem.config.cjs`, `module.exports = ${JSON.stringify({ apps })}`)
  fs.writeFileSync(`${backup}/ecosystem.config.cjs`, 'module.exports = {}')
  const live = apps.map(app => ({ name: app.name, pm2_env: { pm_cwd: app.cwd } }))
  fs.writeFileSync(`${bin}/pm2`, `#!/usr/bin/env bash\necho "$*" >> "$PM2_CALLS"\nif [[ $1 == jlist ]]; then echo '${JSON.stringify(live)}'; fi\n`, { mode: 0o755 })
  fs.writeFileSync(`${bin}/curl`, '#!/usr/bin/env bash\nexit 0\n', { mode: 0o755 })
  const calls = path.join(tmp, 'pm2-calls')
  const result = spawnSync('bash', [path.join(root, 'scripts/activate-release.sh'), release, backup], {
    env: { ...process.env, PATH: `${bin}:${process.env.PATH}`, PM2_CALLS: calls }, encoding: 'utf8',
  })
  assert.equal(result.status, fails ? 1 : 0, result.stderr)
  const events = fs.readFileSync(calls, 'utf8').trim().split('\n')
  if (fails) {
    assert.ok(events.includes(`start ${backup}/ecosystem.config.cjs`))
    assert.ok(events.indexOf('save') > events.indexOf(`start ${backup}/ecosystem.config.cjs`))
    assert.doesNotMatch(result.stdout, /Activation complete/)
  } else {
    assert.ok(!events.includes(`start ${backup}/ecosystem.config.cjs`))
    assert.equal(events.at(-1), 'save')
    assert.match(result.stdout, /Activation complete/)
  }
})

test('deployment uses activation checks from the pinned release', () => {
  assert.match(deploy, /bash "\$release_dir\/scripts\/activate-release\.sh"/)
  assert.doesNotMatch(deploy, /bash "\$source_dir\/scripts\/activate-release\.sh"/)
})
