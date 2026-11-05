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
