// H2 guard: a production release must be pinned to an explicit verified SHA handed
// to workflow_dispatch — never to whatever origin/main happens to point at when the
// deploy job starts. Production is manual-only: no automatic triggers in deploy.yml.
import { readFileSync } from 'node:fs'
import assert from 'node:assert/strict'

const read = relative => readFileSync(new URL(relative, import.meta.url), 'utf8')
const workflow = read('../.github/workflows/deploy.yml')
const script = read('../scripts/deploy-vps.sh')

// Ручной запуск: SHA приходит только из inputs.sha, автоматических триггеров нет.
assert.match(
  workflow,
  /VERIFIED_SHA: \$\{\{ inputs\.sha \}\}/,
  'deploy.yml must take the release SHA from the required workflow_dispatch input'
)
assert.doesNotMatch(
  workflow,
  /^\s*workflow_run:/m,
  'deploy.yml (production) must not have a workflow_run trigger: production releases are manual only'
)
assert.match(
  workflow,
  /required: true/,
  'deploy.yml must make the sha input required so a dispatch cannot silently deploy HEAD'
)
// Гейт на стороне GitHub: коммит из истории main + зелёный Verify именно на нём.
assert.match(
  workflow,
  /compare\/main\.\.\.\$VERIFIED_SHA/,
  'deploy.yml must prove the SHA is reachable from main before deploying'
)
assert.match(
  workflow,
  /actions\/workflows\/\$VERIFY_WORKFLOW\/runs\?head_sha=\$VERIFIED_SHA/,
  'deploy.yml must prove Verify finished successfully on the exact SHA being deployed'
)
// Check-suites как источник истины отравляет SHA чужими прогонами (staging-деплой на том
// же коммите), поэтому гейт читает запуски самого verify-воркфлоу.
assert.doesNotMatch(
  workflow,
  /gh api[^\n]*check-suites/,
  'deploy.yml must not read the check-suites API: unrelated workflow suites poison the SHA'
)
assert.match(
  workflow,
  /head_branch == "main" and \(\.event == "push" or \.event == "workflow_dispatch"\)/,
  'the gate must accept only Verify runs from main (push or manual), never PR runs'
)
assert.match(
  workflow,
  /\^\[0-9a-f\]\{40\}\$/,
  'deploy.yml must validate the SHA format before placing it in a remote command'
)
assert.match(
  workflow,
  /"tamir-deploy@\$VPS_HOST" deploy "\$VERIFIED_SHA"/,
  'deploy.yml must hand the pinned SHA to the remote deploy command'
)
// Гейт работает без checkout, поэтому gh не может развернуть свои плейсхолдеры
// владельца и репозитория: путь к API обязан собираться из github.repository явно.
assert.doesNotMatch(
  workflow,
  /\{owner\}\/\{repo\}/,
  'deploy.yml must not use gh path placeholders: the gate job has no checkout to expand them'
)
assert.match(
  workflow,
  /GH_REPO_PATH: \$\{\{ github\.repository \}\}/,
  'deploy.yml must export github.repository for the gate API calls'
)
assert.match(
  workflow,
  /repos\/\$GH_REPO_PATH\/compare\/main\.\.\.\$VERIFIED_SHA/,
  'the compare gate must address the current repository by $GH_REPO_PATH'
)
assert.match(
  workflow,
  /repos\/\$GH_REPO_PATH\/actions\/workflows\/\$VERIFY_WORKFLOW\/runs/,
  'the Verify-runs gate must address the current repository by $GH_REPO_PATH'
)
assert.doesNotMatch(
  script,
  /-verify "\$\{1:-origin\/main\}\^\{commit\}"/,
  'deploy-vps.sh must not fall back to the origin/main head'
)
assert.match(
  script,
  /\[\[ \$# -ne 1 \|\| ! \$1 =~ \^\[0-9a-f\]\{40\}\$ \]\]/,
  'deploy-vps.sh must require exactly one 40-hex SHA argument'
)
assert.match(
  script,
  /merge-base --is-ancestor "\$target" origin\/main/,
  'the pinned commit must still be contained in the current origin/main'
)
console.log('Deploy pin verified: production releases an explicit verified SHA, manually only')
