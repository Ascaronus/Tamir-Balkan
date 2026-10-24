// H2 guard: a release must be pinned to the exact commit that passed Verify,
// never to whatever origin/main happens to point at when the deploy job starts.
import { readFileSync } from 'node:fs'
import assert from 'node:assert/strict'

const read = relative => readFileSync(new URL(relative, import.meta.url), 'utf8')
const workflow = read('../.github/workflows/deploy.yml')
const script = read('../scripts/deploy-vps.sh')

assert.match(
  workflow,
  /github\.event\.workflow_run\.head_sha \|\| github\.sha/,
  'deploy.yml must pin the verified run head_sha (workflow_dispatch falls back to github.sha)'
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
console.log('Deploy pin verified: workflow and script release an explicit verified SHA')
