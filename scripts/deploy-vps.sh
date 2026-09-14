#!/usr/bin/env bash
# Run on the VPS. Uses the existing .env and PM2 processes; never changes credentials.
set -Eeuo pipefail
cd /root/tamir_balkan
for command in git npm node pm2 pg_dump curl tar; do
  command -v "$command" >/dev/null || { echo "Required command missing: $command" >&2; exit 1; }
done
if [[ -n "$(git status --porcelain --untracked-files=no)" ]]; then
  echo "Tracked server files have local changes. Review them before deploying." >&2
  exit 1
fi
backup_dir="/root/tamir-backups/$(date -u +%Y%m%dT%H%M%SZ)"
mkdir -p "$backup_dir"
chmod 700 "$backup_dir"
# Keep the database URL out of command-line arguments and output.
BACKUP_DIR="$backup_dir" node <<'JS'
const { readFileSync } = require('node:fs')
const { spawnSync } = require('node:child_process')
const dotenv = require('./backend/node_modules/dotenv')
const env = dotenv.parse(readFileSync('backend/.env'))
const db = new URL(env.DATABASE_URL)
const result = spawnSync('pg_dump', ['--format=custom', '--file', process.env.BACKUP_DIR + '/database.dump'], {
  stdio: 'inherit', env: { ...process.env, PGHOST: db.hostname, PGPORT: db.port || '5432', PGUSER: decodeURIComponent(db.username), PGPASSWORD: decodeURIComponent(db.password), PGDATABASE: decodeURIComponent(db.pathname.slice(1)), ...(db.searchParams.has('sslmode') ? { PGSSLMODE: db.searchParams.get('sslmode') } : {}) }
})
if (result.status !== 0) process.exit(result.status || 1)
JS
git rev-parse HEAD > "$backup_dir/previous-commit.txt"
tar --exclude=node_modules --exclude=.git --exclude=.medusa/server/node_modules -czf "$backup_dir/server-files.tar.gz" backend frontend
chmod 600 "$backup_dir"/*
git pull --ff-only
# Build while services are stopped: avoids serving mixed Next.js build assets.
pm2 stop tamir-frontend tamir-backend
trap 'echo "Deploy failed. Backup: $backup_dir. Services remain stopped; review the error before restarting." >&2' ERR
(cd backend && npm ci --no-audit --no-fund && npm run store-locales && npm run build)
(cd frontend && npm ci --no-audit --no-fund && npm run build)
pm2 restart tamir-backend tamir-frontend
pm2 save
curl --fail --silent --show-error --retry 12 --retry-connrefused --retry-delay 2 http://127.0.0.1:9000/health
curl --fail --silent --show-error --retry 12 --retry-connrefused --retry-delay 2 --output /dev/null http://127.0.0.1:3000/rs/catalog
pm2 list
echo "Deployment complete. Backup: $backup_dir"
