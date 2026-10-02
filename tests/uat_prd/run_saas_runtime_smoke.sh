#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
STACK="${TAMASYA_PRD_STACK:-tamasya-prd-r2-runtime}"
PRIVATE="${TAMASYA_PRD_PRIVATE_DIR:-/tmp/tamasya-prd-r2-runtime}"
PORT="${TAMASYA_PRD_HTTP_PORT:-38190}"
IMAGE="${TAMASYA_IMAGE:-tamasya-prd-ci:local}"
DB_CONTAINER="${STACK}-db"
NETWORK="${STACK}_default"
mkdir -p "$PRIVATE"
cat >"$PRIVATE/runtime.env" <<ENV
APP_ENV=test
APP_DEBUG=0
APP_CREDENTIALS_FILE=/run/secrets/db_credentials.php
APP_URL=http://127.0.0.1:${PORT}
APP_EXPECTED_DB_NAME=tamasya_prd_saas
APP_REQUIRE_EXPECTED_DB_NAME=1
DB_TLS_REQUIRED=0
ENV
cat >"$PRIVATE/db_credentials.php" <<PHP
<?php
\$db_host='${DB_CONTAINER}';\$db_port=3306;\$db_name='tamasya_prd_saas';\$db_user='tamasya_ci';\$db_pass='tamasya-ci-only';
PHP
cleanup(){
  docker rm -f "$DB_CONTAINER" >/dev/null 2>&1 || true
  (cd "$ROOT" && TAMASYA_STACK="$STACK" TAMASYA_PRIVATE_DIR="$PRIVATE" TAMASYA_HTTP_PORT="$PORT" TAMASYA_IMAGE="$IMAGE" docker compose -f deploy/compose.yaml -f deploy/compose.saas.yaml down -v --remove-orphans >/dev/null 2>&1 || true)
}
trap cleanup EXIT
cd "$ROOT"
TAMASYA_STACK="$STACK" TAMASYA_PRIVATE_DIR="$PRIVATE" TAMASYA_HTTP_PORT="$PORT" TAMASYA_IMAGE="$IMAGE" docker compose -f deploy/compose.yaml -f deploy/compose.saas.yaml up -d --no-build api api2 web
for _ in $(seq 1 30); do docker network inspect "$NETWORK" >/dev/null 2>&1 && break; sleep .25; done
docker run -d --rm --name "$DB_CONTAINER" --network "$NETWORK" \
  -e MYSQL_ROOT_PASSWORD=root-ci-only -e MYSQL_DATABASE=tamasya_prd_saas \
  -e MYSQL_USER=tamasya_ci -e MYSQL_PASSWORD=tamasya-ci-only mysql:8.4 >/dev/null
for _ in $(seq 1 60); do docker exec "$DB_CONTAINER" mysqladmin ping -uroot -proot-ci-only --silent >/dev/null 2>&1 && break; sleep 1; done
docker exec "$DB_CONTAINER" mysqladmin ping -uroot -proot-ci-only --silent
docker exec -i "$DB_CONTAINER" mysql -uroot -proot-ci-only tamasya_prd_saas < database_setup.sql
for _ in $(seq 1 60); do
  if curl -fsS "http://127.0.0.1:${PORT}/api.php?action=ping" >/tmp/tamasya-prd-r2-ping.json; then
    python3 - <<'PY' && break || true
import json
x=json.load(open('/tmp/tamasya-prd-r2-ping.json'))
assert x.get('success') is True and x.get('liveness') is True and x.get('ready') is True, x
PY
  fi
  sleep 1
done
python3 - <<'PY'
import json
x=json.load(open('/tmp/tamasya-prd-r2-ping.json'))
assert x.get('success') is True and x.get('liveness') is True and x.get('ready') is True, x
assert x.get('buildId')=='20261002-prd-closure-r1', x
print('PASS SaaS routed API+MySQL ping',x.get('requestId'),x.get('serverRevision'))
PY
running=$(TAMASYA_STACK="$STACK" TAMASYA_PRIVATE_DIR="$PRIVATE" TAMASYA_HTTP_PORT="$PORT" TAMASYA_IMAGE="$IMAGE" docker compose -f deploy/compose.yaml -f deploy/compose.saas.yaml ps --status running --services | sort | tr '\n' ' ')
for service in api api2 web; do grep -qw "$service" <<<"$running" || { echo "missing running service $service"; exit 1; }; done
PORT_ENV="$PORT" python3 - <<'PY'
import concurrent.futures,json,os,urllib.request
port=os.environ["PORT_ENV"]
def one(i):
    with urllib.request.urlopen(f"http://127.0.0.1:{port}/api.php?action=ping&probe={i}",timeout=10) as r:
        x=json.load(r)
    assert x.get("success") is True and x.get("ready") is True, x
    return x.get("requestId")
with concurrent.futures.ThreadPoolExecutor(max_workers=12) as ex:
    ids=list(ex.map(one,range(96)))
assert len(ids)==96 and all(ids), ids[:5]
print("PASS 96 concurrent DB-backed routed API reads")
PY
code=$(curl -sS -o /dev/null -w '%{http_code}' "http://127.0.0.1:${PORT}/deploy/README.md")
[[ "$code" == "403" || "$code" == "404" ]] || { echo "private deploy path exposed: $code"; exit 1; }
code=$(curl -sS -o /dev/null -w '%{http_code}' "http://127.0.0.1:${PORT}/tests/")
[[ "$code" == "403" || "$code" == "404" ]] || { echo "tests path exposed: $code"; exit 1; }
echo "PASS horizontal SaaS PHP-FPM/Nginx/MySQL runtime: api+api2+web, 96 concurrent DB-backed liveness reads, private paths denied"
