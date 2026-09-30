#!/usr/bin/env bash
# Builds the site and uploads it to your server.
#   DEPLOY_SERVER=user@your-server npm run deploy
set -euo pipefail

SERVER="${DEPLOY_SERVER:?Set DEPLOY_SERVER, e.g. DEPLOY_SERVER=vira@203.0.113.10 npm run deploy}"
WEB_ROOT="${DEPLOY_PATH:-/var/www/knittedstorybears}"

cd "$(dirname "$0")/.."
npm run build

rsync -avz --delete dist/ "$SERVER:$WEB_ROOT/"
ssh "$SERVER" "mkdir -p '$WEB_ROOT-caddy'"
rsync -avz deploy/caddy-redirects.caddy "$SERVER:$WEB_ROOT-caddy/redirects.caddy"

echo
echo "✔ Uploaded. If the redirects changed, reload Caddy on the server: sudo systemctl reload caddy"
