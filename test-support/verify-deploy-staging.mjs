// H4 guard: the staging pipeline may execute code on the privileged self-hosted
// runner (root, behind NAT) ONLY through triggers that GitHub itself controls:
//   * workflow_run of a green Verify push on main — the workflow file and the code
//     both come from the default branch, never from an unverified PR;
//   * manual workflow_dispatch with an explicit SHA, gated the same way as prod.
// A pull_request trigger here would run arbitrary PR code as root on the staging box.
import { readFileSync } from 'node:fs'
import assert from 'node:assert/strict'

const read = relative => readFileSync(new URL(relative, import.meta.url), 'utf8')
const workflow = read('../.github/workflows/deploy-staging.yml')
const script = read('../scripts/deploy-staging.sh')

assert.doesNotMatch(
  workflow,
  /^\s*pull_request:/m,
  'deploy-staging.yml must never trigger on pull_request: unverified PR code must not reach the self-hosted runner'
)
assert.doesNotMatch(
  workflow,
  /^\s*push:/m,
  'deploy-staging.yml must not trigger on raw push: the chain must go through a green Verify run'
)
assert.match(
  workflow,
  /workflows: \["Verify storefront and backend"\][\s\S]*?branches: \[main\]/,
  'the automatic trigger must be the Verify workflow completing on main'
)
assert.match(
  workflow,
  /github\.event\.workflow_run\.conclusion == 'success'[\s\S]*?github\.event\.workflow_run\.event == 'push'[\s\S]*?github\.event\.workflow_run\.head_branch == 'main'/,
  'the automatic trigger must require a green push-Verify on main'
)
assert.match(
  workflow,
  /workflow_dispatch:[\s\S]*?sha:[\s\S]*?required: true/,
  'manual re-deploy must require an explicit sha input'
)
// Тот же гейт происхождения, что и у прод-деплоя: SHA из истории main + зелёный Verify на нём.
assert.match(
  workflow,
  /compare\/main\.\.\.\$TARGET_SHA/,
  'the gate job must prove the SHA is reachable from main'
)
assert.match(
  workflow,
  /commits\/\$TARGET_SHA\/check-suites/,
  'the gate job must prove Verify finished successfully on the exact SHA'
)
assert.match(
  workflow,
  /needs: gate/,
  'the runner job must depend on the gate job so a failed or skipped gate stops the deploy'
)
assert.doesNotMatch(
  workflow,
  /actions\/checkout/,
  'the runner job must not checkout PR-supplied code: it uses the long-lived clone on the machine'
)
assert.match(
  workflow,
  /runs-on: \[self-hosted, linux, x64, tamir-staging\]/,
  'the deploy must target the HP Mini staging runner by label'
)
assert.match(
  workflow,
  /^ {4}environment: staging$/m,
  'the staging deploy must run in the staging environment so protection rules apply'
)
assert.match(
  workflow,
  /bash "\$STAGING_REPO_DIR\/scripts\/deploy-staging\.sh" "\$TARGET_SHA"/,
  'the runner must invoke the staging deploy script with the gated SHA'
)
// Server-side defense in depth: even a compromised gate cannot escape main history.
assert.match(
  script,
  /\[\[ \$# -ne 1 \|\| ! \$1 =~ \^\[0-9a-f\]\{40\}\$ \]\]/,
  'deploy-staging.sh must require exactly one 40-hex SHA argument'
)
assert.match(
  script,
  /git merge-base --is-ancestor "\$target" origin\/main/,
  'deploy-staging.sh must verify ancestry against the freshly fetched origin/main'
)
console.log('Staging deploy guard verified: green-Verify-only triggers, gated SHA, no PR code on the runner')
