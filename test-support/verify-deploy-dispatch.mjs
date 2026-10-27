// H3 guard: a manual workflow_dispatch run of the deploy workflow is only allowed
// from refs/heads/main, and the deploy job must sit behind the `production`
// environment so that environment protection rules and reviewers can apply.
import { readFileSync } from 'node:fs'
import assert from 'node:assert/strict'

const workflow = readFileSync(new URL('../.github/workflows/deploy.yml', import.meta.url), 'utf8')

assert.match(
  workflow,
  /github\.event_name == 'workflow_dispatch' &&\s+github\.ref == 'refs\/heads\/main'/,
  'workflow_dispatch must be guarded by github.ref == refs/heads/main'
)
assert.doesNotMatch(
  workflow,
  /github\.event_name == 'workflow_dispatch' \|\|/,
  'a bare workflow_dispatch condition must not let deploys run from any branch'
)
assert.match(
  workflow,
  /^ {4}environment: production$/m,
  'the deploy job must use the production environment so approval rules can be enforced'
)
console.log('Dispatch guard verified: deploys are main-only and run in the production environment')
