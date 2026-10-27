// ESM facade over the shared isolated-environment guard (guard-env.cjs),
// so ESM tooling can `import { assertNonProduction } from "./test-support/guard-env.mjs"`.
import guard from "./guard-env.cjs"

export const assertNonProduction = guard.assertNonProduction
export const assertEnvironmentSafe = guard.assertEnvironmentSafe
export const collectDatabaseUrls = guard.collectDatabaseUrls
export const TEST_DB_NAME = guard.TEST_DB_NAME
