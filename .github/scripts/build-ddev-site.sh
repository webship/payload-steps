#!/usr/bin/env bash
# Builds the site the suite runs against, in a DDEV project: an app made with
# the official installer (create-payload-app) from the official website
# template, on PostgreSQL from DDEV. DDEV has no project type for it, so the
# project is a generic one:
#
#   - Node.js 24 in the web image (baked in, so the server has it before the
#     container's daemons start), the app in app/;
#   - the installer run with the website template of the release (pages, posts,
#     media, categories, accounts, forms, search, redirects, SEO, live preview,
#     drafts), npm, PostgreSQL of DDEV (db / db / db), no coding-agent skill and
#     no git repository; no cloud account of any kind;
#   - the address of the site and a secret of its own for the preview, and the
#     roles of the accounts (site/payload-site.mjs config): the template's
#     accounts have none, so the build adds a "roles" field (Administrator,
#     Editor) and the access that reads it;
#   - the database schema from a migration (payload migrate:create, then
#     payload migrate): the server runs in production, where the schema is
#     never pushed;
#   - the accounts below, the template's own seed (what its dashboard's "Seed
#     your database" makes) and twelve more posts, through the app's Local API
#     (payload run), before the production build, so the pages built ahead
#     already show them;
#   - the app built for production (next build) and served by the web container
#     as a daemon (next start), the router sending the project's address to its
#     port (.ddev/config.payload.yaml).
#
# Settings (environment variables, all optional):
#   PROJECT_NAME      the DDEV project name                        (default payloadsteps)
#   SITE_DIR          the project folder                           (default a new temporary folder)
#   PAYLOAD_VERSION   the release to install, and the tag the      (default latest)
#                     template is taken from
#   ACCOUNT_PASSWORD  the password of the accounts below           (default dD.123123ddd)
#   ACCOUNTS_ONLY     1: build nothing, give the accounts of the site in SITE_DIR
#                     back their name, password and roles, and unlock them
#   SEED_ONLY         1: build nothing, put the template's seed and the sample
#                     posts of the site in SITE_DIR back, then build the front
#                     end again (the seed starts from an empty site: it deletes
#                     the pages, posts, media, categories and forms first)
#
# The accounts are configuration: this script creates them and cucumber.js names
# them; the features never create or delete one.
#   administrator  administrator@example.com  Administrator (the first account of the app)
#   editor         editor@example.com         Editor
#
# Nothing is installed that the installer does not add, and no telemetry is
# sent (telemetry: false in the app, NEXT_TELEMETRY_DISABLED in the container).
set -euo pipefail

PROJECT_NAME="${PROJECT_NAME:-payloadsteps}"
PAYLOAD_VERSION="${PAYLOAD_VERSION:-latest}"
ACCOUNT_PASSWORD="${ACCOUNT_PASSWORD:-dD.123123ddd}"
SITE_DIR="${SITE_DIR:-$(mktemp -d)}"
SCRIPT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../site" && pwd)/payload-site.mjs"
ROOT=/var/www/html
APP="${ROOT}/app"
PORT=3000

# The accounts travel as base64 of a JSON object on the standard input, so no
# password is written into a file of the project or onto a command line.
accounts_payload() {
  ACCOUNT_PASSWORD="$ACCOUNT_PASSWORD" node -e '
const p = process.env.ACCOUNT_PASSWORD;
const accounts = [
  { handle: "administrator", name: "Administrator Webship", email: "administrator@example.com", password: p, roles: ["administrator"] },
  { handle: "editor", name: "Editor Webship", email: "editor@example.com", password: p, roles: ["editor"] },
];
process.stdout.write(Buffer.from(JSON.stringify({ owner: accounts[0], accounts })).toString("base64"));'
}

# A verb of payload-site.mjs through the app's Local API, in production.
site_run() {
  ddev exec -d "$APP" "NODE_ENV=production ./node_modules/.bin/payload run webship-site.mjs $*" < /dev/null
}

# The accounts verbs, with the accounts on the standard input.
site_accounts() {
  printf '%s' "$(accounts_payload)" | ddev exec -d "$APP" "NODE_ENV=production ./node_modules/.bin/payload run webship-site.mjs accounts $*"
}

wait_for_server() {
  local code=""
  for attempt in $(seq 1 90); do
    code="$(ddev exec "curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:${PORT}/admin/login" < /dev/null 2>/dev/null | tr -d '\r' || true)"
    [ "$code" = "200" ] && return 0
    sleep 2
  done
  echo "The server did not answer (last status: ${code:-none}); the end of its log:" >&2
  ddev exec "supervisorctl tail -8000 webextradaemons:payload stderr; supervisorctl tail -8000 webextradaemons:payload" < /dev/null >&2 || true
  return 1
}

# Serve the build: the daemon stopped, the port free (next start finishes its
# requests before it lets the port go), the daemon started again.
serve() {
  ddev exec "touch ${APP}/.ready" < /dev/null
  ddev exec "supervisorctl stop webextradaemons:payload" < /dev/null > /dev/null 2>&1 || true
  ddev exec "for i in \$(seq 1 20); do fuser ${PORT}/tcp >/dev/null 2>&1 || exit 0; sleep 1; done; fuser -k -TERM ${PORT}/tcp >/dev/null 2>&1; sleep 2; fuser -k -KILL ${PORT}/tcp >/dev/null 2>&1; exit 0" < /dev/null || true
  ddev exec "supervisorctl start webextradaemons:payload" < /dev/null
  wait_for_server
}

production_build() {
  ddev exec -d "$APP" "NODE_ENV=production npm run build" < /dev/null
}

mkdir -p "$SITE_DIR"
cd "$SITE_DIR"

if [ "${ACCOUNTS_ONLY:-}" = "1" ]; then
  cp "$SCRIPT" app/webship-site.mjs
  site_accounts add
  exit 0
fi
if [ "${SEED_ONLY:-}" = "1" ]; then
  cp "$SCRIPT" app/webship-site.mjs
  site_run seed
  site_run sample
  production_build
  serve
  exit 0
fi

# A generic project: no web server of DDEV's own, the database PostgreSQL 17,
# Node.js 24 (baked into the image below as well).
ddev config --project-type=generic --webserver-type=generic --docroot="" --project-name="$PROJECT_NAME" \
  --database=postgres:17 --nodejs-version=24

mkdir -p .ddev/web-build
cat > .ddev/config.payload.yaml <<YAMLEOF
# The app of this project. The web container serves no files of its own: the
# router sends ports 80 and 443 of the project's address to the app's server,
# which the web container runs as a daemon, in production, once the build has
# finished.
web_extra_exposed_ports:
  - name: payload
    container_port: ${PORT}
    http_port: 80
    https_port: 443
web_extra_daemons:
  - name: payload
    command: "bash -c 'while [ ! -f ${APP}/.ready ]; do sleep 2; done; cd ${APP} && export NODE_ENV=production && exec ./node_modules/.bin/next start -H 0.0.0.0 -p ${PORT}'"
    directory: ${ROOT}
web_environment:
  - NEXT_TELEMETRY_DISABLED=1
YAMLEOF
cat > .ddev/web-build/Dockerfile.payload <<'DOCKEREOF'
# Node.js 24 in the web image, so the app's server has it before the
# container's daemons start, on every restart and offline.
RUN N_PREFIX=/usr/local n install 24 && node --version
DOCKEREOF

ddev start -y

# The release: latest is read from the registry, so the template comes from the
# tag of the release the installer installs.
VERSION="$(ddev exec "npm view create-payload-app@${PAYLOAD_VERSION} version" < /dev/null | tr -d '\r' | tail -1)"
case "$VERSION" in
  [0-9]*.[0-9]*.[0-9]*) ;;
  *) echo "No release ${PAYLOAD_VERSION} of create-payload-app: ${VERSION}" >&2; exit 1 ;;
esac

# The app, with the official installer: the website template of the release,
# npm, PostgreSQL of DDEV (db / db / db), no coding-agent skill, no git
# repository.
ddev exec "rm -rf ${APP} && cd ${ROOT} && npx -y create-payload-app@${VERSION} --name app --template website --branch v${VERSION} --version ${VERSION} --db postgres --db-connection-string postgres://db:db@db:5432/db --use-npm --no-agent --no-git" < /dev/null

# The address, the secrets, the roles; the schema; the accounts, the seed, the
# sample posts; the types of the app; the production build.
cp "$SCRIPT" app/webship-site.mjs
ddev exec -d "$APP" "node webship-site.mjs config https://${PROJECT_NAME}.ddev.site" < /dev/null
ddev exec -d "$APP" "rm -rf src/migrations && NODE_ENV=production ./node_modules/.bin/payload migrate:create initial && NODE_ENV=production ./node_modules/.bin/payload migrate" < /dev/null
site_accounts add
site_run seed
site_run sample
ddev exec -d "$APP" "NODE_ENV=production ./node_modules/.bin/payload generate:types" < /dev/null
production_build
serve

SITE_URL="$(ddev describe -j | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>console.log(JSON.parse(s).raw.primary_url))")"
if [ -n "${GITHUB_ENV:-}" ]; then
  echo "LAUNCH_URL=$SITE_URL" >> "$GITHUB_ENV"
fi
INSTALLED="$(ddev exec "node -p \"require('${APP}/node_modules/payload/package.json').version\"" < /dev/null | tr -d '\r')"
echo "Built the Payload ${INSTALLED} site (website template) at $SITE_URL (admin: $SITE_URL/admin)"
