#!/usr/bin/env node
/**
 * Discovery runner for the backend Node test suite (backend/tests).
 *
 * Finds every `*.test.cjs` and `*.integration.cjs` in backend/tests, splits
 * them into "needs a database" and "no database" categories and runs each
 * category with `node --test`. New test files are picked up automatically —
 * nothing has to be appended to .github/workflows/verify.yml.
 *
 * Usage (from backend/ or via `npm --prefix backend run test:cjs -- ...`):
 *   node test-support/run-tests.mjs              # every category
 *   node test-support/run-tests.mjs --no-db      # only category without DB
 *   node test-support/run-tests.mjs --db-only    # only DB-backed category
 *   node test-support/run-tests.mjs --list       # show discovery, run nothing
 *   node test-support/run-tests.mjs --junit-dir=reports   # JUnit XML per category
 *   node test-support/run-tests.mjs --reverse    # run each category backwards
 *                                          # (proves no hidden order coupling)
 *
 * Database category is refused (exit 2) unless every connection string in the
 * environment passes assertNonProduction (test-support/guard-env.mjs).
 */
import { readdirSync, readFileSync, mkdirSync, existsSync, statSync } from "node:fs"
import { spawnSync } from "node:child_process"
import { dirname, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { assertEnvironmentSafe } from "./guard-env.mjs"

const here = dirname(fileURLToPath(import.meta.url))
const backendRoot = resolve(here, "..")
const testsDir = join(backendRoot, "tests")

const DB_URL_MARKER = /_DB_URL|postgres(ql)?:\/\//

/**
 * A file needs a database when its name says so (`*.integration.cjs`) or when
 * its source reads a connection string. Content sniffing keeps newly added
 * `*.test.cjs` files that need PostgreSQL in the right category without any
 * workflow edit.
 */
function categorize(fileName) {
  if (fileName.endsWith(".integration.cjs")) return true
  const source = readFileSync(join(testsDir, fileName), "utf8")
  return DB_URL_MARKER.test(source)
}

function discover({ reverse = false } = {}) {
  const files = readdirSync(testsDir)
    .filter((f) => /\.(test|integration)\.cjs$/.test(f))
    .sort()
  if (reverse) files.reverse()
  return files.map((f) => ({ file: f, path: join(testsDir, f), needsDb: categorize(f) }))
}

function guardDatabaseEnv() {
  const checked = assertEnvironmentSafe(process.env)
  console.log(`[run-tests] environment guard OK (${checked.length || "no"} connection strings checked)`)
}

function runCategory(label, tests, junitDir) {
  const paths = tests.map((t) => t.path)
  console.log(`\n[run-tests] ${label}: ${tests.length} file(s)`)
  for (const t of tests) console.log(`  - ${t.file}`)
  const args = ["--test"]
  let xmlPath = null
  if (junitDir) {
    mkdirSync(junitDir, { recursive: true })
    xmlPath = join(junitDir, `node-${label}.xml`)
    args.push("--test-reporter=junit", `--test-reporter-destination=${xmlPath}`)
  }
  args.push(...paths)
  let result = spawnSync(process.execPath, args, { cwd: backendRoot, stdio: "inherit" })
  if (junitDir && (!existsSync(xmlPath) || statSync(xmlPath).size === 0)) {
    // Fallback for Node builds without the junit reporter: keep the run green
    // or red on its own merits, and leave a machine-readable TAP file behind.
    console.log(`[run-tests] junit reporter unavailable for "${label}", falling back to TAP`)
    const tapPath = join(junitDir, `node-${label}.tap`)
    result = spawnSync(
      process.execPath,
      ["--test", "--test-reporter=tap", `--test-reporter-destination=${tapPath}`, ...paths],
      { cwd: backendRoot, stdio: "inherit" }
    )
  }
  if (result.error) {
    console.error(`[run-tests] failed to start ${label}: ${result.error.message}`)
    return 1
  }
  return result.status ?? 1
}

function main() {
  const argv = process.argv.slice(2)
  const junitArg = argv.find((a) => a.startsWith("--junit-dir="))
  const junitDir = junitArg ? resolve(backendRoot, junitArg.slice("--junit-dir=".length)) : null
  const reverse = argv.includes("--reverse")
  const all = discover({ reverse })
  const db = all.filter((t) => t.needsDb)
  const plain = all.filter((t) => !t.needsDb)

  if (argv.includes("--list")) {
    for (const t of all) console.log(`${t.needsDb ? "db " : "---"} ${t.file}`)
    console.log(`total: ${all.length} (db: ${db.length}, no-db: ${plain.length})`)
    return 0
  }

  const dbOnly = argv.includes("--db-only")
  const noDb = argv.includes("--no-db")
  const suffix = reverse ? "-rev" : ""
  let code = 0
  if (!dbOnly && plain.length) code = Math.max(code, runCategory(`no-db${suffix}`, plain, junitDir))
  if (!noDb && db.length) {
    try {
      guardDatabaseEnv()
    } catch (error) {
      console.error(`[run-tests] refusing to run database tests: ${error.message}`)
      return 2
    }
    code = Math.max(code, runCategory(`db${suffix}`, db, junitDir))
  }
  return code
}

process.exitCode = main()
