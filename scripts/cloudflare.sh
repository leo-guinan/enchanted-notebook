#!/usr/bin/env bash
# Set up and deploy the notebook on Cloudflare (Workers Free + Static Assets + D1). Safe to run again:
# every step checks before it creates anything. Used by .github/workflows/deploy.yml on each push to main.
#
#   CLOUDFLARE_API_TOKEN=… CLOUDFLARE_ACCOUNT_ID=… ANTHROPIC_API_KEY=… ADMIN_TOKEN=… bash scripts/cloudflare.sh
#   (or run `npx wrangler login` first and leave the two CLOUDFLARE_ variables unset)
#
# DOMAIN (default enchantednotebook.com) is attached as a custom domain when it's a zone on the account;
# until then the notebook answers at https://enchanted-notebook.<your-subdomain>.workers.dev
set -euo pipefail
cd "$(dirname "$0")/.."
DOMAIN="${DOMAIN:-enchantednotebook.com}"
W="npx --no-install wrangler"
d1id() { $W d1 list --json 2>/dev/null | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const l=JSON.parse(s||"[]");const d=l.find(x=>x.name==="enchanted-notebook");if(d)console.log(d.uuid)})'; }

echo "1/5 database"
ID="$(d1id)"
if [ -z "$ID" ]; then $W d1 create enchanted-notebook >/dev/null; ID="$(d1id)"; echo "    created D1 enchanted-notebook ($ID)"; else echo "    D1 enchanted-notebook exists ($ID)"; fi
[ -n "$ID" ] || { echo "could not find or create the D1 database" >&2; exit 1; }
node -e 'const f="wrangler.toml",fs=require("fs");fs.writeFileSync(f,fs.readFileSync(f,"utf8").replace(/database_id = "[^"]*"/,`database_id = "${process.argv[1]}"`))' "$ID"

echo "2/5 schema"
$W d1 migrations apply enchanted-notebook --remote

echo "3/5 domain"
if [ -n "${CLOUDFLARE_API_TOKEN:-}" ] && curl -fsS -H "Authorization: Bearer $CLOUDFLARE_API_TOKEN" "https://api.cloudflare.com/client/v4/zones?name=$DOMAIN" \
     | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>process.exit(JSON.parse(s).result?.length?0:1))'; then
  node -e 'const f="wrangler.toml",fs=require("fs");let t=fs.readFileSync(f,"utf8");if(!/^routes = /m.test(t))t=t.replace(/^# routes = .*$/m,`routes = [{ pattern = "${process.argv[1]}", custom_domain = true }]`);fs.writeFileSync(f,t)' "$DOMAIN"
  echo "    $DOMAIN is on this account: attaching it as a custom domain"
else
  echo "    $DOMAIN is not a zone on this account (or the token can't see it): deploying to workers.dev only"
fi

echo "4/5 deploy"
$W deploy

echo "5/5 secrets"
for s in ANTHROPIC_API_KEY ADMIN_TOKEN RATE_SALT; do
  if [ -n "${!s:-}" ]; then printf %s "${!s}" | $W secret put "$s" >/dev/null && echo "    $s set"; else echo "    $s not provided (skipped)"; fi
done
echo "done"
