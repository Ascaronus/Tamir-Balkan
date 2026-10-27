#!/usr/bin/env node
"use strict"
/**
 * Guard against running tests against a production database.
 *
 * Used by test-support/run-tests.mjs (before any database-backed category),
 * by integration-tests/setup.js (Jest HTTP integration tests) and as a CI
 * self-check step. Contract: openspec testing/isolated-test-environment.
 *
 * CLI:
 *   node test-support/guard-env.cjs                      # check the environment
 *   node test-support/guard-env.cjs --require-env         # environment check,
 *                                                          fail if nothing to check
 *   node test-support/guard-env.cjs "<conn str>" ...      # check explicit strings
 * Any violation exits with code 1, before a test run touches the database.
 */

// Database names must say they are disposable: `review_test`,
// `tamir_balkan_import_test`, `..._tests`. Anything else (e.g. `tamir_balkan`)
// is rejected, so a mistaken production name can never reach a test run.
const TEST_DB_NAME = /(^|[_-])tests?$/i

function assertNonProduction(rawUrl, label = "DATABASE_URL") {
  if (!rawUrl) {
    throw new Error(`${label} is empty: refusing to run tests against an unset database`)
  }
  let url
  try {
    url = new URL(rawUrl)
  } catch {
    throw new Error(`${label} is not a valid connection string: refusing to run tests`)
  }
  const dbName = decodeURIComponent(url.pathname.replace(/^\/+/, ""))
  if (!TEST_DB_NAME.test(dbName)) {
    throw new Error(
      `${label} points at "${dbName}", which is not an isolated *_test database: refusing to run tests`
    )
  }
  return { host: url.hostname, dbName }
}

// Every environment variable that carries a database connection string.
function collectDatabaseUrls(env = process.env) {
  return Object.entries(env).filter(
    ([key]) => key === "DATABASE_URL" || /(^|_)DB_URL$/.test(key)
  )
}

/**
 * Throws on the first connection string that is not an isolated *_test database.
 * Returns the names that were checked; a run that touches no database has
 * nothing to guard and stays green.
 */
function assertEnvironmentSafe(env = process.env) {
  const checked = []
  for (const [key, value] of collectDatabaseUrls(env)) {
    assertNonProduction(value, key)
    checked.push(key)
  }
  return checked
}

function main() {
  const argv = process.argv.slice(2)
  const requireEnv = argv.includes("--require-env")
  const urls = argv.filter((arg) => !arg.startsWith("--"))
  let checked
  try {
    if (urls.length) {
      urls.forEach((url, index) => assertNonProduction(url, `argument ${index + 1}`))
      checked = [`${urls.length} argument(s)`]
    } else {
      checked = assertEnvironmentSafe(process.env)
      if (checked.length === 0 && requireEnv) {
        throw new Error("no DATABASE_URL or *_DB_URL found in the environment: nothing to check")
      }
    }
  } catch (error) {
    console.error(`guard-env: ${error.message}`)
    process.exitCode = 1
    return
  }
  console.log(`guard-env: OK (${checked.join(", ")})`)
}

if (require.main === module) main()

module.exports = {
  assertNonProduction,
  assertEnvironmentSafe,
  collectDatabaseUrls,
  TEST_DB_NAME,
}
