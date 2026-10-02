#!/usr/bin/env bash
set -euo pipefail

CONTAINER="${1:?container name required}"
DB_NAME="${2:?database name required}"
ROOT_PASS="${3:?root password required}"
RUNTIME_USER="${4:?runtime user required}"
RUNTIME_PASS="${5:?runtime password required}"
RUNTIME_PRIVS="${6:?runtime privileges required}"
shift 6
SCHEMA_FILES=("$@")

[[ "$DB_NAME" =~ ^[A-Za-z0-9_]{1,64}$ ]] || { echo "unsafe database identifier: $DB_NAME" >&2; exit 64; }
[[ "$RUNTIME_USER" =~ ^[A-Za-z0-9_]{1,64}$ ]] || { echo "unsafe runtime user identifier: $RUNTIME_USER" >&2; exit 64; }
[[ "$RUNTIME_PASS" =~ ^[A-Za-z0-9._-]{8,128}$ ]] || { echo "CI runtime password contains unsupported characters" >&2; exit 64; }
case "$RUNTIME_PRIVS" in
  SELECT,INSERT,UPDATE,DELETE|SELECT,INSERT,UPDATE) ;;
  *) echo "unsupported runtime privilege profile: $RUNTIME_PRIVS" >&2; exit 64;;
esac
[[ ${#SCHEMA_FILES[@]} -ge 1 ]] || { echo "at least one schema file is required" >&2; exit 64; }
for schema in "${SCHEMA_FILES[@]}"; do
  [[ -f "$schema" && -r "$schema" ]] || { echo "schema file not readable: $schema" >&2; exit 66; }
done

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
READY="$ROOT/tests/uat_prd/mysql-authenticated-ready.sh"

# Schema/bootstrap authority is deliberately separate from application runtime.
# Root here represents a disposable CI migration/DBA authority; its credential is
# never mounted into the PHP-FPM, worker, realtime or HQ runtime containers.
"$READY" "$CONTAINER" "$DB_NAME" root "$ROOT_PASS" 60 1

for schema in "${SCHEMA_FILES[@]}"; do
  echo "Applying schema as isolated migration authority: $schema"
  docker exec -i -e MYSQL_PWD="$ROOT_PASS" "$CONTAINER" \
    mysql --protocol=TCP -h127.0.0.1 --connect-timeout=5 -uroot "$DB_NAME" < "$schema"
done

# Create the runtime identity only after schema bootstrap, then grant the minimum
# data-plane privileges needed by this runtime profile.  No CREATE/ALTER/DROP,
# TRIGGER, GRANT OPTION or global administrative privilege is granted.
docker exec -e MYSQL_PWD="$ROOT_PASS" "$CONTAINER" \
  mysql --protocol=TCP -h127.0.0.1 --connect-timeout=5 -uroot "$DB_NAME" -e "
    CREATE USER IF NOT EXISTS '${RUNTIME_USER}'@'%' IDENTIFIED BY '${RUNTIME_PASS}';
    ALTER USER '${RUNTIME_USER}'@'%' IDENTIFIED BY '${RUNTIME_PASS}';
    REVOKE ALL PRIVILEGES, GRANT OPTION FROM '${RUNTIME_USER}'@'%';
    GRANT ${RUNTIME_PRIVS} ON \`${DB_NAME}\`.* TO '${RUNTIME_USER}'@'%';
  "

"$READY" "$CONTAINER" "$DB_NAME" "$RUNTIME_USER" "$RUNTIME_PASS" 30 1

if docker exec -e MYSQL_PWD=definitely-wrong "$CONTAINER" \
    mysql --protocol=TCP -h127.0.0.1 --connect-timeout=3 -u"$RUNTIME_USER" "$DB_NAME" -e 'SELECT 1' >/dev/null 2>&1; then
  echo "runtime account unexpectedly accepted a wrong password" >&2
  exit 73
fi

GRANTS="$(docker exec -e MYSQL_PWD="$RUNTIME_PASS" "$CONTAINER" \
  mysql --protocol=TCP -h127.0.0.1 --batch --skip-column-names -u"$RUNTIME_USER" "$DB_NAME" -e "SHOW GRANTS FOR CURRENT_USER")"
printf '%s\n' "$GRANTS"

for forbidden in 'ALL PRIVILEGES' 'CREATE' 'ALTER' 'DROP' 'TRIGGER' 'GRANT OPTION' 'SUPER'; do
  if grep -Eiq "(^|[ ,])${forbidden}([ ,]|$)" <<<"$GRANTS"; then
    echo "runtime account contains forbidden privilege: $forbidden" >&2
    exit 74
  fi
done

# Prove the privilege boundary behaviorally as well as by SHOW GRANTS.  A runtime
# credential must not be able to mutate schema even though it can read/write data.
probe="__tamasya_runtime_ddl_probe"
if docker exec -e MYSQL_PWD="$RUNTIME_PASS" "$CONTAINER" \
    mysql --protocol=TCP -h127.0.0.1 --connect-timeout=3 -u"$RUNTIME_USER" "$DB_NAME" \
    -e "CREATE TABLE ${probe}(id INT PRIMARY KEY)" >/dev/null 2>&1; then
  docker exec -e MYSQL_PWD="$ROOT_PASS" "$CONTAINER" \
    mysql --protocol=TCP -h127.0.0.1 -uroot "$DB_NAME" -e "DROP TABLE IF EXISTS ${probe}" >/dev/null 2>&1 || true
  echo "runtime account unexpectedly created schema objects" >&2
  exit 75
fi

if docker exec -e MYSQL_PWD="$RUNTIME_PASS" "$CONTAINER" \
    mysql --protocol=TCP -h127.0.0.1 --connect-timeout=3 -u"$RUNTIME_USER" "$DB_NAME" \
    -e "SET GLOBAL log_bin_trust_function_creators=1" >/dev/null 2>&1; then
  echo "runtime account unexpectedly changed a global database variable" >&2
  exit 76
fi

echo "PASS schema bootstrap/runtime privilege separation: database=$DB_NAME runtime=$RUNTIME_USER privileges=$RUNTIME_PRIVS"
