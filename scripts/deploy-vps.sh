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
git fetch origin main
target=$(git rev-parse --verify "${1:-origin/main}^{commit}")
git merge-base --is-ancestor HEAD "$target" || {
  echo "Target does not include the source checkout's current commit." >&2
  exit 1
}
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
  env:{...oldApps[i].env, NODE_ENV:'production'}
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
(cd "$release_dir/backend" && npm ci --no-audit --no-fund && npm run build)
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
# Keep the source checkout aligned with the release; no reset/force or credentials changes.
git merge --ff-only "$target"
trap - ERR
bash "$source_dir/scripts/activate-release.sh" "$release_dir" "$backup_dir"
trap - ERR
echo "Deployment complete. Release: $release_dir Backup: $backup_dir"
