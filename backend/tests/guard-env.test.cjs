const { test } = require("node:test")
const assert = require("node:assert/strict")
const { spawnSync } = require("node:child_process")
const {
  assertNonProduction,
  assertEnvironmentSafe,
  collectDatabaseUrls,
  TEST_DB_NAME,
} = require("../test-support/guard-env.cjs")

// Контракт: openspec testing/isolated-test-environment («Защитный барьер против
// боевого окружения»). Тесты не подключаются к PostgreSQL — они проверяют, что
// гард отказывает ещё до первого обращения к базе.

const ISOLATED = [
  "postgres://review_test:pw@127.0.0.1:5432/review_test",
  "postgres://ci:pw@localhost:5432/tamir_balkan_import_test",
  "postgres://ci:pw@postgres:5432/ci_tests",
  "postgresql://ci:pw@postgres:5432/reviews-test",
]

const PRODUCTION = [
  "postgres://tamir_prod:pw@db.prod.example.com:5432/tamir_balkan",
  "postgres://postgres:pw@127.0.0.1:5432/postgres",
  "postgres://app:pw@db.internal:5432/tamir_balkan_production",
  "postgres://app:pw@db.internal:5432/storefront",
]

function cli(args, env) {
  return spawnSync(process.execPath, ["test-support/guard-env.cjs", ...args], {
    cwd: process.cwd(),
    env,
    encoding: "utf8",
  })
}

// Ключ окружения собирается из частей, чтобы этот файл не выглядел «боевым»
// для discovery-раннера (test-support/run-tests.mjs ищет подстроку *_DB_URL).
const DB_ENV_KEY = ["TEST_REVIEWS", "_DB", "_URL"].join("")

test("гард принимает только одноразовые *_test базы", () => {
  for (const url of ISOLATED) {
    const { dbName } = assertNonProduction(url)
    assert.ok(TEST_DB_NAME.test(dbName), `${dbName} должен считаться тестовой базой`)
  }
})

test("гард отклоняет боевые имена баз", () => {
  for (const url of PRODUCTION) {
    const dbName = new URL(url).pathname.slice(1)
    assert.throws(
      () => assertNonProduction(url, "TEST_DB"),
      (error) => error.message.includes(dbName) && error.message.includes("isolated"),
      `${dbName} не должен проходить гард`
    )
  }
})

test("гард отклоняет пустые и неразбираемые строки подключения", () => {
  assert.throws(() => assertNonProduction("", "TEST_DB"), /is empty/)
  assert.throws(() => assertNonProduction("not-a-url", "TEST_DB"), /not a valid connection string/)
  assert.throws(() => assertEnvironmentSafe({ TEST_DB_URL: "" }), /is empty/)
})

test("в окружении собираются только переменные строк подключения", () => {
  const env = {
    DATABASE_URL: ISOLATED[0],
    [DB_ENV_KEY]: ISOLATED[1],
    DB_HOST: "127.0.0.1",
    REDIS_URL: "redis://127.0.0.1:6379",
  }
  assert.deepEqual(collectDatabaseUrls(env).map(([key]) => key), ["DATABASE_URL", DB_ENV_KEY])
  assert.deepEqual(assertEnvironmentSafe(env), ["DATABASE_URL", DB_ENV_KEY])
})

test("боевая переменная окружения прерывает проверку с указанием имени", () => {
  assert.throws(
    () => assertEnvironmentSafe({ [DB_ENV_KEY]: PRODUCTION[0], DATABASE_URL: ISOLATED[0] }),
    /tamir_balkan/
  )
})

test("proгон без строк подключения не считается ошибкой", () => {
  assert.deepEqual(assertEnvironmentSafe({ DB_HOST: "127.0.0.1" }), [])
})

test("CLI гарда: боевая строка -> код 1, тестовая -> код 0", () => {
  const rejected = cli([PRODUCTION[0]], { PATH: process.env.PATH })
  assert.equal(rejected.status, 1)
  assert.match(rejected.stderr, /tamir_balkan/)

  const accepted = cli([ISOLATED[1]], { PATH: process.env.PATH })
  assert.equal(accepted.status, 0)
  assert.match(accepted.stdout, /OK/)
})

test("CLI гарда с --require-env требует строку подключения", () => {
  const empty = cli(["--require-env"], { PATH: process.env.PATH })
  assert.equal(empty.status, 1)
  assert.match(empty.stderr, /nothing to check/)

  const withEnv = cli(["--require-env"], { PATH: process.env.PATH, [DB_ENV_KEY]: ISOLATED[0] })
  assert.equal(withEnv.status, 0)
})

test("discovery-раннер отказывается запускать БД-набор против боевой базы", () => {
  const result = spawnSync(process.execPath, ["test-support/run-tests.mjs", "--db-only"], {
    cwd: process.cwd(),
    env: { PATH: process.env.PATH, [DB_ENV_KEY]: PRODUCTION[1] },
    encoding: "utf8",
  })
  assert.equal(result.status, 2)
  assert.match(result.stderr, /refusing to run database tests/)
  assert.doesNotMatch(result.stdout, /node --test/, "тесты не должны стартовать")
})
