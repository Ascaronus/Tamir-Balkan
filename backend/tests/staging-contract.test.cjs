// Staging-контракт (ТЗ §2–5): секреты и инфраструктура staging должны оставаться
// совместимыми с продуктовым гейтом check-review-config.cjs и почтовым трактом продукта.
// Если кто-то меняет контракт SMTP/порт/гейт в продукте, этот тест падает, а не staging-машине.
// Тест не трогает БД: fixture-файлы живут во временном каталоге.
const { test } = require('node:test')
const assert = require('node:assert/strict')
const { readFileSync, writeFileSync, mkdirSync, rmSync, cpSync } = require('node:fs')
const path = require('node:path')
const os = require('node:os')
const crypto = require('node:crypto')
const { spawnSync } = require('node:child_process')

const backendRoot = path.join(__dirname, '..')
const repoRoot = path.join(backendRoot, '..')
const read = relative => readFileSync(path.join(repoRoot, relative), 'utf8')

const stagingScripts = [
  'scripts/staging-bootstrap.sh',
  'scripts/deploy-staging.sh',
  'scripts/activate-staging-release.sh',
  'scripts/staging-db-refresh.sh',
  'scripts/staging-smoke.sh',
  'scripts/staging-tunnel.sh',
  'scripts/lib/staging-release.sh',
]
const stagingFiles = [...stagingScripts, 'docker-compose.staging.yml', '.github/workflows/deploy-staging.yml']

function withoutStagingHosts(text) {
  return text.replaceAll('test-api.tamir.rs', '').replaceAll('test.tamir.rs', '')
}

test('staging files never address production hosts', () => {
  for (const file of stagingFiles) {
    const rest = withoutStagingHosts(read(file))
    // Функциональных обращений к прод-домену быть не может: staging живёт только в test.*.
    // Упоминание зоны tamir.rs в комментариях/подсказках Cloudflare допустимо, запрос — нет.
    assert.ok(
      !/https?:\/\/(?:api\.)?tamir\.rs/.test(rest),
      `${file}: URL на прод-домен tamir.rs — staging обязан обращаться только к test.*`
    )
    assert.ok(!/VPS_(HOST|PORT|SSH_KEY|KNOWN_HOSTS)/.test(rest), `${file}: ссылки на прод-VPS запрещены`)
    // Строки подключения (БД/Redis) могут указывать только на loopback — прод-БД недоступна staging.
    for (const url of rest.match(/(?:postgres|postgresq|redis|rediss):\/\/[^"'`\s]+/g) ?? []) {
      assert.ok(/:\/\/[^@]*@?127\.0\.0\.1|:\/\/127\.0\.0\.1/.test(url), `${file}: ${url} — подключение не на 127.0.0.1`)
    }
  }
})

test('staging scripts use their own env guard, not the CI guard', () => {
  for (const file of stagingScripts) {
    assert.ok(!/guard-env/.test(read(file)), `${file}: guard-env это CI-инструмент, у staging свой staging_assert_config_safe`)
  }
  assert.match(read('scripts/lib/staging-release.sh'), /staging_assert_config_safe/, 'lib должен экспортировать собственный guard')
})

test('product SMTP contract still matches the mailpit staging transport', () => {
  const mailer = read('backend/src/utils/registration-email.ts')
  assert.match(mailer, /requireTLS:\s*true/, 'продукт требует STARTTLS — mailpit обязан держать MP_SMTP_REQUIRE_STARTTLS')
  assert.match(mailer, /port !== 587 && port !== 465/, 'продукт принимает только 587/465 — compose-порт 587 согласован')
  const compose = read('docker-compose.staging.yml')
  assert.match(compose, /MP_SMTP_BIND_ADDR:\s*0\.0\.0\.0:587/, 'mailpit обязан слушать 587, иначе проброс бесполезен')
  assert.match(compose, /MP_SMTP_REQUIRE_STARTTLS:\s*"?true"?/, 'STARTTLS на mailpit обязан быть включён')
  assert.match(compose, /"127\.0\.0\.1:587:587"/, 'SMTP публикуется только на loopback')
  assert.match(compose, /MP_SMTP_TLS_CERT:\s*\/certs\/mailpit-tls\.crt/, 'сертификат SMTP монтируется из staging-секретов')
})

test('mail check goes through the production email code path', () => {
  const check = read('backend/src/scripts/staging-mail-check.ts')
  assert.match(check, /from "\.\.\/utils\/registration-email"/, 'проверка обязана слать письмо продуктовым кодом')
  assert.match(check, /sendRegistrationCode/, 'используется реальный тракт кодов регистрации')
  // MP_UI_AUTH закрывает и веб-интерфейс, и API Mailpit, поэтому каждое обращение к
  // API обязано идти с Basic. Иначе чек падает на 401 уже при чтении тела письма.
  const mailpitFetches = check.match(/fetch\(`\$\{MAILPIT_API\}[^\n]*/g) ?? []
  assert.ok(mailpitFetches.length >= 2, 'у проверки два обращения к API Mailpit: список писем и тело письма')
  for (const call of mailpitFetches) {
    assert.match(call, /mailpitOptions\(\)/, `обращение к Mailpit API без авторизации: ${call}`)
  }

  // Неуспех почтового чека должен попадать в FAIL смоука, а не обрывать прогон:
  // staging_run при ошибке вызывает staging_abort, тот выходит с кодом 1, и smoke
  // заканчивается строкой ERROR без единого FAIL. Поэтому чек гоняют через staging_call.
  const smokeLines = read('scripts/staging-smoke.sh').split('\n')
  const at = smokeLines.findIndex((line) => line.includes('staging-mail-check.ts'))
  assert.ok(at >= 0, 'смоук обязан запускать staging-mail-check.ts')
  let statement = smokeLines[at]
  for (let i = at - 1; i >= 0 && smokeLines[i].trimEnd().endsWith('\\'); i -= 1) {
    statement = `${smokeLines[i]} ${statement}`
  }
  assert.match(statement, /staging_call/, `почтовый чек обязан идти через staging_call: ${statement}`)
  assert.doesNotMatch(statement, /staging_run/, `почтовый чек обрывает смоук через staging_run: ${statement}`)
  const callWrapper = read('scripts/lib/staging-release.sh').match(/staging_call\(\)\s*\{[\s\S]*?\n\}/)
  assert.ok(callWrapper, 'в scripts/lib/staging-release.sh нет не-aborting обёртки staging_call')
  assert.doesNotMatch(callWrapper[0], /staging_abort/, 'staging_call не имеет права обрывать прогон')
})

test('mailpit web UI opens to the LAN only behind HTTP Basic', () => {
  const compose = read('docker-compose.staging.yml')
  // Веб-почта публикуется на интерфейс домашней сети (иначе её видно только на самой машине),
  // и ровно поэтому она обязана быть под паролем: в ящике лежат коды регистрации.
  assert.match(compose, /MP_UI_BIND_ADDR:\s*0\.0\.0\.0:8025/, 'mailpit обязан слушать 8025, иначе LAN-проброс бесполезен')
  assert.match(compose, /"8025:8025"/, 'веб-почта проброшена на интерфейсы локальной сети')
  assert.ok(!/"127\.0\.0\.1:8025:8025"/.test(compose), 'веб-почта не должна возвращаться на loopback')
  assert.match(
    compose,
    /env_file:\s*\n\s*-\s*\/opt\/tamir-staging\/secrets\/docker\.env/,
    'mailpit обязан получать MP_UI_AUTH из staging-секретов, иначе LAN-доступ открыт всем'
  )
  // Единственное исключение в периметре: SMTP, Postgres и Redis наружу не публикуются.
  assert.match(compose, /"127\.0\.0\.1:5432:5432"/, 'База остаётся на loopback')
  assert.match(compose, /"127\.0\.0\.1:6379:6379"/, 'Redis остаётся на loopback')
  assert.match(compose, /"127\.0\.0\.1:587:587"/, 'SMTP остаётся на loopback')

  const lib = read('scripts/lib/staging-release.sh')
  assert.match(lib, /staging_docker_env_value\(\)/, 'креды веб-почты читаются из docker.env')
  assert.match(lib, /staging_mailpit_ui_has_auth/, 'периметр обязан проверять, что веб-почта под паролем')
  assert.match(lib, /MP_UI_AUTH/, 'lib знает про HTTP Basic для Mailpit')
  assert.match(read('scripts/staging-bootstrap.sh'), /MP_UI_AUTH=\S*\$\(secret\)/, 'bootstrap выпускает пароль веб-почты')
  assert.match(read('scripts/staging-smoke.sh'), /MP_UI_AUTH/, 'смоук проверяет, что пароль веб-почты на месте')

  const check = read('backend/src/scripts/staging-mail-check.ts')
  assert.match(check, /STAGING_MAILPIT_AUTH/, 'проверка тракта получает пароль веб-почты')
  assert.match(check, /Basic \$\{Buffer\.from\(MAILPIT_AUTH\)\.toString\("base64"\)\}/, 'пароль передаётся заголовком Authorization, а не URL')
})

// CAPTCHA-обход для автотестов живёт только в стендовом env: bootstrap обязан
// выпустить токен и привязать его к staging-домену, иначе сценарии регистрации,
// сброса пароля и отзывов не покрываются на стенде вообще.
test('bootstrap wires the QA CAPTCHA bypass to the staging hostname only', () => {
  const bootstrap = read('scripts/staging-bootstrap.sh')
  assert.match(bootstrap, /QA_CAPTCHA_BYPASS_TOKEN=\$\(secret\)/, 'bootstrap выпускает токен обхода')
  assert.match(bootstrap, /QA_CAPTCHA_BYPASS_HOSTNAMES=test\.tamir\.rs/, 'обход разрешён только test.tamir.rs')
})

test('generated ecosystem keeps pm2 names and loopback binding', () => {
  const lib = read('scripts/lib/staging-release.sh')
  const template = lib.match(/<<'ECOSYSTEM'\n([\s\S]*?)\nECOSYSTEM/)
  assert.ok(template, 'экосистема генерируется heredoc-ом в lib/staging-release.sh')
  const ecosystemSource = template[1]
    .replaceAll('@@STAGING_MAIL_CA@@', '/opt/tamir-staging/secrets/mail/mailpit-ca.crt')
    .replaceAll('@@STAGING_LOG_DIR@@', '/opt/tamir-staging/logs')
    .replaceAll('@@STAGING_BACKEND_PORT@@', '9000')
    .replaceAll('@@STAGING_FRONTEND_PORT@@', '3000')
  assert.match(ecosystemSource, /name: "tamir-backend"/, 'check-review-config.cjs ищет процессы по имени tamir-backend')
  assert.match(ecosystemSource, /name: "tamir-frontend"/, 'и по имени tamir-frontend')
  assert.match(ecosystemSource, /MEDUSA_BACKEND_HOST: "127\.0\.0\.1"/, 'наружу смотрит только cloudflared')
  assert.match(ecosystemSource, /NODE_EXTRA_CA_CERTS: "[^@"]+"/, 'CA Mailpit подставляется явным путём, а не плейсхолдером')
  assert.ok(!/@@[A-Z_]+@@/.test(ecosystemSource), 'в экосистеме не осталось незаменённых плейсхолдеров')
})

// Прогоняем продуктовый гейт scripts/check-review-config.cjs по fixture,
// собранному по тому же шаблону, что пишет staging-bootstrap.sh.
function stagingFixtureSite(overrides = {}) {
  const secret = seed => crypto.createHash('sha256').update(seed).digest('hex')
  const site = fs.mkdtempSync(path.join(os.tmpdir(), 'tamir-staging-gate-'))
  mkdirSync(path.join(site, 'scripts'), { recursive: true })
  cpSync(path.join(repoRoot, 'scripts/check-review-config.cjs'), path.join(site, 'scripts/check-review-config.cjs'))
  // Гейт грузит dotenv из <root>/backend/node_modules: подсовываем установленный dotenv.
  mkdirSync(path.join(site, 'backend/node_modules/dotenv'), { recursive: true })
  writeFileSync(
    path.join(site, 'backend/node_modules/dotenv/index.js'),
    `module.exports = require(${JSON.stringify(path.join(backendRoot, 'node_modules/dotenv'))})\n`
  )
  mkdirSync(path.join(site, 'frontend'), { recursive: true })
  writeFileSync(path.join(site, 'ecosystem.config.cjs'), 'module.exports = { apps: [' +
    '{ name: "tamir-backend", env: { NODE_ENV: "production" } },' +
    '{ name: "tamir-frontend", env: { NODE_ENV: "production" } } ] }\n')
  const backendEnv = [
    'JWT_SECRET=' + secret('jwt'),
    'COOKIE_SECRET=' + secret('cookie'),
    'REVIEW_RATE_SECRET=' + secret('rate'),
    'TURNSTILE_SECRET_KEY=' + (overrides.turnstileSecret ?? secret('turnstile')),
    'TURNSTILE_HOSTNAMES=test.tamir.rs',
    'QA_CAPTCHA_BYPASS_TOKEN=' + (overrides.qaToken ?? secret('qa-captcha')),
    'QA_CAPTCHA_BYPASS_HOSTNAMES=test.tamir.rs',
    'SMTP_HOST=127.0.0.1',
    'SMTP_PORT=587',
    'SMTP_USER=staging@tamir.local',
    'SMTP_PASSWORD=' + secret('smtp'),
  ].join('\n')
  writeFileSync(path.join(site, 'backend/.env'), backendEnv + '\n')
  const frontendEnv = [
    'NEXT_PUBLIC_MEDUSA_BACKEND_URL=https://test-api.tamir.rs',
    'MEDUSA_PROXY_BACKEND_URL=http://127.0.0.1:9000',
    'NEXT_PUBLIC_SITE_URL=https://test.tamir.rs',
    'NEXT_PUBLIC_TURNSTILE_SITE_KEY=' + (overrides.siteKey ?? 'staging-placeholder-sitekey-00000000'),
  ].join('\n')
  writeFileSync(path.join(site, 'frontend/.env.production.local'), frontendEnv + '\n')
  return site
}

const fs = require('node:fs')

function runGate(site) {
  // process.env гейт читает первым: чистим CI-переменные, иначе fixture проверится не fixture-ом.
  const env = { ...process.env }
  for (const key of ['JWT_SECRET', 'COOKIE_SECRET', 'REVIEW_RATE_SECRET', 'TURNSTILE_SECRET_KEY',
    'NEXT_PUBLIC_TURNSTILE_SITE_KEY', 'SMTP_USER', 'SMTP_PASSWORD', 'SMTP_PORT']) delete env[key]
  return spawnSync(process.execPath, [path.join(site, 'scripts/check-review-config.cjs')], { env, encoding: 'utf8' })
}

test('staging secret template passes the product review-config gate', () => {
  const site = stagingFixtureSite()
  try {
    const run = runGate(site)
    assert.equal(run.status, 0, `гейт должен пропустить staging-шаблон: ${run.stderr}`)
  } finally {
    fs.rmSync(site, { recursive: true, force: true })
  }
})

test('gate still stops a staging release with a broken Turnstile sitekey', () => {
  const site = stagingFixtureSite({ siteKey: '1x00000000000000000000' })
  try {
    const run = runGate(site)
    assert.notEqual(run.status, 0, 'пустой/сервисный sitekey обязан валить деплой до активации релиза')
  } finally {
    fs.rmSync(site, { recursive: true, force: true })
  }
})

// Секреты деплоя лежат в backend/.env, а Medusa v2 в рантайме читает
// .medusa/server/.env.production — его кладёт postbuild в момент `medusa build`, и сборка
// же пересоздаёт `.medusa/server`. Ключ, добавленный в секреты стенда после сборки релиза,
// до процессов pm2 не доходил (на стенде: QA_CAPTCHA_BYPASS_* в backend/.env, но не в
// .env.production -> CAPTCHA_REQUIRED). Хелпер staging_sync_runtime_env обязан добирать
// недостающие ключи, не трогая уже записанные значения.
const RUNTIME_ENV_HELPER = 'staging_sync_runtime_env'

test(`deploy-staging calls ${RUNTIME_ENV_HELPER} after the backend build`, () => {
  const lib = read('scripts/lib/staging-release.sh')
  const helper = lib.match(/staging_sync_runtime_env\(\)\s*\{[\s\S]*?\n\}/)
  assert.ok(helper, `scripts/lib/staging-release.sh должен определять ${RUNTIME_ENV_HELPER}`)

  const deploy = read('scripts/deploy-staging.sh')
  const buildAt = deploy.indexOf('npm run build')
  const syncAt = deploy.indexOf(`${RUNTIME_ENV_HELPER} "$release_dir"`)
  assert.ok(buildAt >= 0, 'деплой собирает backend через npm run build')
  assert.ok(syncAt > buildAt, 'синхронизация runtime env обязана идти после medusa build')

  // Значки секретов в вывод деплоя попадать не должны: хелпер печатает только имена ключей.
  assert.doesNotMatch(helper[0], /echo [^\n]*\$(line|value)\b/, 'хелпер обязан молчать о значениях env')
})

// findBash даёт и сам интерпретатор, и признак WSL: из WSL пути Windows видны как /mnt/...,
// а chmod на /mnt/... не работает, поэтому проверку режима там не делаем. Пути передаём через
// файл-драйвер (WSL не наследует переменные, подставленные в env процесса), переводя их в
// /mnt/<диск>/... и записывая строго с LF.
function findBash() {
  for (const command of ['bash', 'bash.exe']) {
    const probe = spawnSync(command, ['--version'], { encoding: 'utf8' })
    if (!probe.error && probe.status === 0) {
      return { command, wsl: /linux-gnu/.test(probe.stdout ?? '') }
    }
  }
  return null
}

function toBashPath(target, wsl) {
  if (!wsl) return target
  const match = /^([A-Za-z]):[\\/](.*)$/.exec(target)
  return match ? `/mnt/${match[1].toLowerCase()}/${match[2].replace(/\\/g, '/')}` : target
}

function runRuntimeSync(bash, site) {
  const lib = toBashPath(path.join(repoRoot, 'scripts/lib/staging-release.sh'), bash.wsl)
  const releaseDir = toBashPath(site, bash.wsl)
  const driver = path.join(site, 'runtime-env-sync.sh')
  fs.writeFileSync(
    driver,
    ['set -Eeuo pipefail', `source '${lib}'`, `${RUNTIME_ENV_HELPER} '${releaseDir}'`, ''].join('\n')
  )
  return spawnSync(bash.command, [toBashPath(driver, bash.wsl)], { encoding: 'utf8' })
}

function writeReleaseEnv(site, relative, lines) {
  fs.mkdirSync(path.dirname(path.join(site, relative)), { recursive: true })
  fs.writeFileSync(path.join(site, relative), lines.join('\n') + '\n')
}

test('runtime env sync adds missing keys and keeps the values the build wrote', (t) => {
  const bash = findBash()
  if (!bash) {
    t.skip('нет bash: хелпер проверен только статически')
    return
  }
  const site = fs.mkdtempSync(path.join(os.tmpdir(), 'tamir-runtime-env-'))
  const runtimeEnvFile = path.join(site, 'backend/.medusa/server/.env.production')
  try {
    writeReleaseEnv(site, 'backend/.env', [
      'DATABASE_URL=postgres://tamir_staging:tamir_staging@127.0.0.1:5432/tamir_staging',
      'TURNSTILE_SECRET_KEY=turnstile-value-from-secrets',
      '# комментарий bootstrap-а, не переменная',
      'QA_CAPTCHA_BYPASS_HOSTNAMES=test.tamir.rs',
      'QA_CAPTCHA_BYPASS_TOKEN=qa-bypass-token-value',
      'SMTP_PASSWORD=mailpit-password-value',
      'EMPTY_SECRET_IN_SECRETS=',
    ])
    writeReleaseEnv(site, 'backend/.medusa/server/.env.production', [
      'DATABASE_URL=postgres://tamir_staging:tamir_staging@127.0.0.1:5432/tamir_staging',
      'TURNSTILE_SECRET_KEY=turnstile-value-from-build',
      'SMTP_PASSWORD=',
    ])

    const run = runRuntimeSync(bash, site)
    assert.equal(run.status, 0, `хелпер упал: ${run.stderr}`)
    const runtime = readFileSync(runtimeEnvFile, 'utf8')

    // 1) ключ, которого в runtime env не было, появился именно со значением из секретов.
    assert.match(runtime, /^QA_CAPTCHA_BYPASS_TOKEN=qa-bypass-token-value$/m, 'токен обхода обязан дойти до runtime env')
    assert.match(runtime, /^QA_CAPTCHA_BYPASS_HOSTNAMES=test\.tamir\.rs$/m, 'хост обхода обязан дойти до runtime env')
    // 2) значение, записанное сборкой, не перезаписывается.
    assert.match(runtime, /^TURNSTILE_SECRET_KEY=turnstile-value-from-build$/m, 'runtime env сохраняет своё значение')
    assert.ok(!/turnstile-value-from-secrets/.test(runtime), 'хелпер не имеет права затирать непустые значения')
    // 3) пустое значение в runtime env добирается из секретов (dotenv берёт последнее вхождение).
    assert.ok(
      runtime.slice(runtime.lastIndexOf('SMTP_PASSWORD=')).startsWith('SMTP_PASSWORD=mailpit-password-value'),
      'пустое значение в runtime env обязано быть добрано из секретов'
    )
    // 4) пустой ключ из секретов в runtime env не копируется.
    assert.doesNotMatch(runtime, /EMPTY_SECRET_IN_SECRETS/, 'пустые значения из секретов в runtime env не нужны')
    // 5) вывод хелпера не раскрывает секретные значения.
    const output = `${run.stdout}\n${run.stderr}`
    assert.ok(!output.includes('qa-bypass-token-value') && !output.includes('mailpit-password-value'),
      'лог деплоя не должен содержать значения env')
    assert.match(output, /QA_CAPTCHA_BYPASS_TOKEN/, 'лог называет добавленные ключи')
    // 6) режим секрета остаётся закрытым.
    if (!bash.wsl) {
      assert.equal(fs.statSync(runtimeEnvFile).mode & 0o077, 0, '.env.production не должен быть доступен группе/прочим')
    }

    // Повторный деплой того же релиза ничего не меняет: идемпотентность важнее скорости.
    const second = runRuntimeSync(bash, site)
    assert.equal(second.status, 0, `второй прогон хелпера упал: ${second.stderr}`)
    assert.equal(readFileSync(runtimeEnvFile, 'utf8'), runtime, 'второй прогон не должен ничего добавлять')
  } finally {
    fs.rmSync(site, { recursive: true, force: true })
  }
})

test('runtime env sync creates .env.production when the build left none', (t) => {
  const bash = findBash()
  if (!bash) {
    t.skip('нет bash: хелпер проверен только статически')
    return
  }
  const site = fs.mkdtempSync(path.join(os.tmpdir(), 'tamir-runtime-env-init-'))
  try {
    writeReleaseEnv(site, 'backend/.env', ['JWT_SECRET=jwt-value-from-secrets', 'QA_CAPTCHA_BYPASS_TOKEN=qa-bypass-token-value'])
    const run = runRuntimeSync(bash, site)
    assert.equal(run.status, 0, `хелпер упал: ${run.stderr}`)
    const runtime = readFileSync(path.join(site, 'backend/.medusa/server/.env.production'), 'utf8')
    assert.equal(runtime, readFileSync(path.join(site, 'backend/.env'), 'utf8'), 'без .env.production он создаётся копией backend/.env')
  } finally {
    fs.rmSync(site, { recursive: true, force: true })
  }
})
