#!/usr/bin/env bash
# Build a separate release; preserve the running applications until cutover.
set -Eeuo pipefail
umask 077
source_dir=/root/tamir_balkan
cd "$source_dir"
for command in git npm node pm2 pg_dump curl tar flock; do
  command -v "$command" >/dev/null || { echo "Required command missing: $command" >&2; exit 1; }
done
exec 9>/root/tamir-deploy.lock
flock -n 9 || { echo "Another deployment is running." >&2; exit 1; }
[[ -z "$(git status --porcelain --untracked-files=no)" ]] || {
  echo "Tracked source files have local changes. Commit them before deploying." >&2
  exit 1
}
# GitHub's SSH front end intermittently rejects this deploy key from the VPS
# (measured 2026-11-04: four consecutive "Permission denied (publickey)" failures on
# `git fetch origin main`, then a successful fetch within two minutes). The fetch is
# read-only, so repeating it is safe; only a run that fails every attempt is aborted.
fetch_ok=0
for attempt in 1 2 3 4 5 6 7 8 9 10 11 12; do
  if git fetch origin main; then
    fetch_ok=1
    break
  fi
  echo "git fetch origin main failed (attempt ${attempt}/12)." >&2
  if (( attempt < 12 )); then
    echo "Retrying in 15 seconds." >&2
    sleep 15
  fi
done
if (( fetch_ok == 0 )); then
  echo "git fetch origin main failed after 12 attempts; check the VPS deploy key and network." >&2
  exit 1
fi
# The release must be the exact commit that passed CI; a bare branch head is refused,
# because origin/main can move between the verified run and the start of this deploy.
if [[ $# -ne 1 || ! $1 =~ ^[0-9a-f]{40}$ ]]; then
  echo "Usage: deploy-vps.sh <40-hex commit SHA that passed CI>. Refusing to deploy an unpinned origin/main head." >&2
  exit 1
fi
target=$(git rev-parse --verify "$1^{commit}" 2>/dev/null) || {
  echo "Verified commit $1 is unknown to this repository; it may have been replaced by a force-push." >&2
  exit 1
}
git merge-base --is-ancestor "$target" origin/main || {
  echo "Verified commit $target is not part of the current origin/main." >&2
  exit 1
}
git merge-base --is-ancestor HEAD "$target" || {
  echo "Target does not include the source checkout's current commit." >&2
  exit 1
}
# The SSH wrapper runs whichever copy of this script is already on the machine, while the
# release tree is built from "$target". If the checkout lags behind, the steps that get executed
# are the old ones and a step added in "$target" never runs, so a green workflow would not prove
# the new step happened. Sync the checkout to "$target" and re-exec this script from that commit,
# the same way deploy-staging.sh does. Re-exec is safe this early: nothing has been created or
# changed yet, and the lock survives it because flock stays held on descriptor 9 across exec.
clone_head="$(git rev-parse HEAD)"
if [[ "$clone_head" != "$target" ]]; then
  if [[ "${TAMIR_DEPLOY_RESYNC:-0}" == "1" ]]; then
    echo "Checkout HEAD ${clone_head:0:12} still does not equal $target after syncing." >&2
    exit 1
  fi
  # Refuse to re-exec unless this process really holds the lock on descriptor 9.
  flock -n 9 || { echo "Deployment lock on descriptor 9 is not held; refusing to re-exec." >&2; exit 1; }
  git checkout -q --force --detach "$target" || {
    echo "Could not move the source checkout $source_dir to $target." >&2
    exit 1
  }
  echo "Checkout synced ${clone_head:0:12} -> ${target:0:12}; restarting this script from that commit."
  TAMIR_DEPLOY_RESYNC=1 exec bash "$source_dir/scripts/deploy-vps.sh" "$target"
fi
release_id="$(date -u +%Y%m%dT%H%M%SZ)-${target:0:12}"
release_dir="/root/tamir-releases/$release_id"
backup_dir="/root/tamir-backups/$release_id"
mkdir -p "$release_dir" "$backup_dir"
export TAMIR_SOURCE="$source_dir" TAMIR_RELEASE="$release_dir" TAMIR_BACKUP="$backup_dir"
pm2 jlist > "$backup_dir/pm2.json"
git rev-parse HEAD > "$backup_dir/source-commit.txt"
git archive "$target" | tar -x -C "$release_dir"
# A database snapshot is required before a release. Never print connection secrets.
node <<'JS'
const fs = require('node:fs')
const path = require('node:path')
const { spawnSync } = require('node:child_process')
const root = process.env.TAMIR_SOURCE, release = process.env.TAMIR_RELEASE, backup = process.env.TAMIR_BACKUP
const dotenv = require(path.join(root, 'backend/node_modules/dotenv'))
const processes = JSON.parse(fs.readFileSync(path.join(backup, 'pm2.json')))
const names = ['tamir-backend', 'tamir-frontend']
const oldApps = names.map(name => {
  const matches = processes.filter(p => p.name === name)
  if (matches.length !== 1 || matches[0].pm2_env.status !== 'online') throw Error('Expected one online process: ' + name)
  const p = matches[0].pm2_env
  return { name, script: p.pm_exec_path, args: p.args, cwd: p.pm_cwd,
    interpreter: p.exec_interpreter, exec_mode: 'fork', instances: 1,
    env: p.env || {} }
})
fs.writeFileSync(path.join(backup, 'ecosystem.config.cjs'), 'module.exports = ' + JSON.stringify({ apps: oldApps }, null, 2))
for (const app of ['backend', 'frontend']) {
  fs.mkdirSync(path.join(backup, app), {recursive:true})
  for (const name of ['.env', '.env.local', '.env.production', '.env.production.local']) {
    const file = path.join(root, app, name)
    if (fs.existsSync(file)) {
      fs.copyFileSync(file, path.join(release, app, name))
      fs.copyFileSync(file, path.join(backup, app, name))
    }
  }
}
const envFile = path.join(root, 'backend/.env')
if (!fs.existsSync(envFile)) throw Error('Missing backend/.env')
const env = dotenv.parse(fs.readFileSync(envFile))
const runningBackend = oldApps[0]
const databaseUrl = runningBackend.env.DATABASE_URL || env.DATABASE_URL
const db = new URL(databaseUrl)
const result = spawnSync('pg_dump', ['--format=custom', '--file', path.join(backup, 'database.dump')], {
  stdio:'inherit', env:{...process.env, PGHOST:db.hostname, PGPORT:db.port || '5432',
  PGUSER:decodeURIComponent(db.username), PGPASSWORD:decodeURIComponent(db.password),
  PGDATABASE:decodeURIComponent(db.pathname.slice(1)),
  ...(db.searchParams.has('sslmode') ? {PGSSLMODE:db.searchParams.get('sslmode')} : {})}
})
if (result.status !== 0) process.exit(result.status || 1)
// Preserve the active runtime's uploads, not an empty directory from a new build.
// The source checkout/previous release must be kept: it owns these media paths.
const backendCwd = runningBackend.cwd
const runtimeDir = fs.existsSync(path.join(backendCwd, '.medusa/server/package.json'))
  ? path.join(backendCwd, '.medusa/server') : backendCwd
const media = {}
for (const name of ['static', 'private-static']) {
  const livePath = path.join(runtimeDir, name)
  const sourcePath = path.join(root, 'backend', name)
  if (fs.existsSync(livePath)) media[name] = fs.realpathSync(livePath)
  else if (fs.existsSync(sourcePath)) media[name] = fs.realpathSync(sourcePath)
  else {
    fs.mkdirSync(sourcePath, {recursive:true})
    media[name] = sourcePath
  }
}
fs.writeFileSync(path.join(backup, 'media-paths.json'), JSON.stringify(media, null, 2))
const newApps = names.map((name, i) => ({
  name, script: 'npm', args: 'start',
  cwd:path.join(release, i === 0 ? 'backend' : 'frontend'),
  interpreter:'none', exec_mode:'fork', instances:1,
  // This script deploys only tamir.rs. Override stale PM2 values before both
  // next build (NEXT_PUBLIC_* is inlined) and startup; staging has its own script.
  env:{...oldApps[i].env, NODE_ENV:'production',
    ...(name === 'tamir-frontend' ? {NEXT_PUBLIC_SITE_URL:'https://tamir.rs'} : {})}
}))
fs.writeFileSync(path.join(release, 'ecosystem.config.cjs'), 'module.exports = ' + JSON.stringify({apps:newApps}, null, 2))
JS
# Snapshot public and private uploads while keeping the live files in place.
node <<'JS'
const fs=require('node:fs'), path=require('node:path'), {spawnSync}=require('node:child_process')
const paths=JSON.parse(fs.readFileSync(path.join(process.env.TAMIR_BACKUP,'media-paths.json')))
for(const [name, dir] of Object.entries(paths)) {
  const r=spawnSync('tar',['-czf',path.join(process.env.TAMIR_BACKUP,name+'.tar.gz'),'-C',dir,'.'],{stdio:'inherit'})
  if(r.status!==0) process.exit(r.status || 1)
}
JS
trap 'echo "Build/preparation failed. Existing PM2 processes were not stopped. Backup: $backup_dir" >&2' ERR
(cd "$release_dir/backend" && npm ci --no-audit --no-fund)
node "$release_dir/scripts/check-review-config.cjs"
node <<'JS'
const path=require('node:path'), {spawnSync}=require('node:child_process')
const config=require(path.join(process.env.TAMIR_RELEASE,'ecosystem.config.cjs'))
const app=config.apps.find(app=>app.name==='tamir-backend')
const r=spawnSync('npm',['run','build'],{cwd:app.cwd,env:{...process.env,...app.env},stdio:'inherit'})
if(r.status!==0) process.exit(r.status || 1)
JS
(cd "$release_dir/frontend" && npm ci --no-audit --no-fund && npm run lint -- --quiet)
node <<'JS'
const fs=require('node:fs'), path=require('node:path'), {spawnSync}=require('node:child_process')
const config=require(path.join(process.env.TAMIR_RELEASE,'ecosystem.config.cjs'))
const app=config.apps.find(app=>app.name==='tamir-frontend')
const r=spawnSync('npm',['run','build'],{cwd:app.cwd,env:{...process.env,...app.env},stdio:'inherit'})
if(r.status!==0) process.exit(r.status || 1)
JS
(cd "$release_dir/frontend" && npm test)
node <<'JS'
const fs=require('node:fs'), path=require('node:path')
const paths=JSON.parse(fs.readFileSync(path.join(process.env.TAMIR_BACKUP,'media-paths.json')))
for(const [name, dir] of Object.entries(paths)) {
  for(const root of ['backend', 'backend/.medusa/server']) {
    const dest=path.join(process.env.TAMIR_RELEASE,root,name)
    if(fs.existsSync(dest) && fs.readdirSync(dest).length) throw Error('Unexpected generated media: '+dest)
    fs.rmSync(dest,{recursive:true,force:true})
    fs.symlinkSync(dir,dest,'dir')
  }
}
JS
# Additive review schema, after verification and before switching any live process.
node <<'JS'
const path = require('node:path'), { spawnSync } = require('node:child_process')
const config = require(path.join(process.env.TAMIR_RELEASE, 'ecosystem.config.cjs'))
const app = config.apps.find(app => app.name === 'tamir-backend')
const result = spawnSync('npx', ['--no-install', 'medusa', 'exec', './src/scripts/setup-reviews.ts'], {
  cwd: app.cwd, env: { ...process.env, ...app.env }, stdio: 'inherit'
})
if (result.status !== 0) process.exit(result.status || 1)
// Registration now depends on email. Verify SMTP before activating the release.
const smtp = spawnSync('npx', ['--no-install', 'medusa', 'exec', './src/scripts/check-email.ts'], {
  cwd: app.cwd, env: { ...process.env, ...app.env }, stdio: 'inherit'
})
if (smtp.status !== 0) process.exit(smtp.status || 1)
// Widen measurement columns only after all build and SMTP checks have passed.
const decimals = spawnSync('npx', ['--no-install', 'medusa', 'exec', './src/scripts/setup-decimal-attributes.ts'], {
  cwd: app.cwd, env: { ...process.env, ...app.env }, stdio: 'inherit'
})
if (decimals.status !== 0) process.exit(decimals.status || 1)
JS
trap - ERR
# Use the activation checks belonging to the selected, verified release.
bash "$release_dir/scripts/activate-release.sh" "$release_dir" "$backup_dir"
# Advance the source checkout only after the new release is live: activate-release.sh
# rolls the PM2 apps back on failure, and main on the VPS must then still point at the
# previous release. No reset/force or credentials changes.
git merge --ff-only "$target"
# Keep only the newest 14 release backups (name: <UTC timestamp>-<sha>). This glob
# cannot match manual files such as cleanup-test_test-*.sql or backend.env.bak-*,
# which stay untouched.
ls -1dt /root/tamir-backups/[0-9]*T[0-9]*Z-*/ 2>/dev/null | tail -n +15 | while IFS= read -r old; do
  echo "Pruning old backup: $old"
  rm -rf -- "$old"
done
# Repair existing imported text/URLs only once the new redirect-capable release is live.
node <<'JS'
const path = require('node:path'), { spawnSync } = require('node:child_process')
const config = require(path.join(process.env.TAMIR_RELEASE, 'ecosystem.config.cjs'))
const app = config.apps.find(app => app.name === 'tamir-backend')
const result = spawnSync('npx', ['--no-install', 'medusa', 'exec', './src/scripts/normalize-rozetka-products.ts'], {
  cwd: app.cwd, env: { ...process.env, ...app.env, ROZETKA_NORMALIZE_APPLY: 'true' }, stdio: 'inherit'
})
if (result.status !== 0) process.exit(result.status || 1)
// Hand-written Search Console copy (the "Crawled - currently not indexed" fix) goes in BEFORE
// prepare-english-store.ts: it marks the rows seo_locked, and that is what stops the machine
// translator from replacing them again. SEO_DATA_FILE is relative to the backend cwd, and both
// scripts skip rows that are already locked, so a re-deploy costs nothing.
const seoPasses = [
  ['./src/scripts/set-category-seo.ts', 'src/scripts/data/seo-categories-2026-11.json'],
  ['./src/scripts/set-product-seo.ts', 'src/scripts/data/seo-twins-2026-11.json'],
]
for (const [script, dataFile] of seoPasses) {
  const seo = spawnSync('npx', ['--no-install', 'medusa', 'exec', script], {
    cwd: app.cwd, env: { ...process.env, ...app.env, SEO_APPLY: 'true', SEO_DATA_FILE: dataFile }, stdio: 'inherit'
  })
  if (seo.status !== 0) process.exit(seo.status || 1)
}
const english = spawnSync('npx', ['--no-install', 'medusa', 'exec', './src/scripts/prepare-english-store.ts'], {
  cwd: app.cwd, env: { ...process.env, ...app.env }, stdio: 'inherit'
})
if (english.status !== 0) process.exit(english.status || 1)
JS
trap - ERR
echo "Deployment complete. Release: $release_dir Backup: $backup_dir (kept last 14 release backups)"
