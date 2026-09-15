#!/usr/bin/env bash
# Activate an already built release; recreate only the two store processes.
set -Eeuo pipefail
umask 077
release_dir=${1:?Release directory required}
backup_dir=${2:?Backup directory required}
export TAMIR_RELEASE="$release_dir"
test -f "$release_dir/frontend/.next/BUILD_ID"
test -f "$release_dir/backend/.medusa/server/package.json"
test -f "$backup_dir/ecosystem.config.cjs"
node - "$release_dir/ecosystem.config.cjs" <<'JS'
const config=require(process.argv[2])
for(const [name, folder] of [['tamir-backend','backend'],['tamir-frontend','frontend']]) {
  const apps=config.apps.filter(a=>a.name===name)
  if(apps.length!==1 || apps[0].cwd!==process.env.TAMIR_RELEASE+'/'+folder) throw Error('Unexpected release configuration: '+name)
}
if(config.apps.length!==2) throw Error('Unexpected applications in release configuration')
JS
rollback() {
  trap - ERR
  echo "Activation failed. Restoring previous applications." >&2
  pm2 delete tamir-backend >/dev/null 2>&1 || true
  pm2 delete tamir-frontend >/dev/null 2>&1 || true
  if pm2 start "$backup_dir/ecosystem.config.cjs"; then
    pm2 save
    echo "Previous configuration restored; verify application health." >&2
  else
    echo "Rollback failed. Backup: $backup_dir" >&2
  fi
  exit 1
}
trap rollback ERR
pm2 delete tamir-backend
pm2 delete tamir-frontend
pm2 start "$release_dir/ecosystem.config.cjs"
pm2 jlist | node -e '
let s="";process.stdin.on("data",c=>s+=c);process.stdin.on("end",()=>{
 const apps=JSON.parse(s);
 for(const [name,folder] of [["tamir-backend","backend"],["tamir-frontend","frontend"]]){
  const p=apps.find(a=>a.name===name);
  if(!p || p.pm2_env.pm_cwd!==process.env.TAMIR_RELEASE+"/"+folder) throw Error("Wrong working directory: "+name);
 }
});'
curl -fsS --retry 20 --retry-connrefused --retry-delay 2 --max-time 15 http://127.0.0.1:9000/health
curl -fsS --retry 10 --retry-connrefused --retry-delay 2 --max-time 30 -o /dev/null http://127.0.0.1:3000/robots.txt
curl -fsS --retry 5 --retry-delay 2 --max-time 60 -o /dev/null http://127.0.0.1:3000/sitemap.xml
curl -fsS --retry 5 --retry-delay 2 --max-time 30 -o /dev/null https://tamir.rs/robots.txt
curl -fsS --retry 5 --retry-delay 2 --max-time 60 -o /dev/null https://tamir.rs/sitemap.xml
curl -fsS --retry 5 --retry-delay 2 --max-time 15 https://api.tamir.rs/health
pm2 save
trap - ERR
echo "Activation complete: $release_dir"
