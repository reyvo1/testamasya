#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
LOG="$ROOT/tests/uat_rc1/logs"
mkdir -p "$LOG"
MYSQL_A_ROOT=(mysql --protocol=TCP -h127.0.0.1 -P3306 -uroot -proot_ci_only)
MYSQL_B_ROOT=(mysql --protocol=TCP -h127.0.0.1 -P3307 -uroot -proot_ci_only)
DUMP=/tmp/tamasya-efc-node-seed.sql
A_DB=tamasya_rc1_node_a
B_DB=tamasya_rc1_node_b
A_CFG=/tmp/tamasya-efc-node-a-db.php
B_CFG=/tmp/tamasya-efc-node-b-db.php
A_URL=http://127.0.0.1:38186
B_URL=http://127.0.0.1:38187
SECRET='efc-two-node-shared-secret-0123456789abcdef'
CLUSTER='efc-two-node-hotel-cluster'

cleanup(){
  for p in /tmp/tamasya-efc-node-a.pid /tmp/tamasya-efc-node-b.pid; do
    if [[ -s "$p" ]]; then kill "$(cat "$p")" 2>/dev/null || true; fi
  done
}
reset_trust(){ "${MYSQL_A_ROOT[@]}" -e "SET GLOBAL log_bin_trust_function_creators=0" >/dev/null 2>&1 || true; "${MYSQL_B_ROOT[@]}" -e "SET GLOBAL log_bin_trust_function_creators=0" >/dev/null 2>&1 || true; }
trap 'reset_trust; cleanup' EXIT

mysqldump --protocol=TCP -h127.0.0.1 -P3306 -uroot -proot_ci_only --single-transaction --routines --triggers --no-tablespaces --set-gtid-purged=OFF tamasya_rc1_uat > "$DUMP"
"${MYSQL_A_ROOT[@]}" -e "DROP DATABASE IF EXISTS $A_DB; CREATE DATABASE $A_DB CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci; GRANT ALL PRIVILEGES ON $A_DB.* TO 'tamasya_ci'@'%'; FLUSH PRIVILEGES; SET GLOBAL log_bin_trust_function_creators=1;"
"${MYSQL_B_ROOT[@]}" -e "DROP DATABASE IF EXISTS $B_DB; CREATE DATABASE $B_DB CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci; GRANT ALL PRIVILEGES ON $B_DB.* TO 'tamasya_ci'@'%'; FLUSH PRIVILEGES; SET GLOBAL log_bin_trust_function_creators=1;"
"${MYSQL_A_ROOT[@]}" "$A_DB" < "$DUMP"
"${MYSQL_B_ROOT[@]}" "$B_DB" < "$DUMP"
"${MYSQL_A_ROOT[@]}" -e "SET GLOBAL log_bin_trust_function_creators=0"
"${MYSQL_B_ROOT[@]}" -e "SET GLOBAL log_bin_trust_function_creators=0"

for spec in "A:$A_DB" "B:$B_DB"; do
  IFS=: read -r side db <<<"$spec"
  if [[ "$side" == A ]]; then MYSQL_NODE=("${MYSQL_A_ROOT[@]}"); else MYSQL_NODE=("${MYSQL_B_ROOT[@]}"); fi
  "${MYSQL_NODE[@]}" "$db" -e "DELETE FROM node_cluster_events; DELETE FROM node_cluster_members; DELETE FROM node_cluster_state; DELETE FROM node_sync_outbox; DELETE FROM node_sync_conflicts; DELETE FROM node_sync_runs; DELETE FROM node_sync_nonces; DELETE FROM node_sync_receipts; UPDATE node_sync_settings SET node_id='uninitialized',node_role='local_backup',sync_enabled=1,last_primary_revision=0,local_mutation_counter=0,last_mirrored_local_counter=0,mutation_guard_ready=0,mirror_in_progress=0,mirror_started_at=NULL,local_security_initialized=0,last_push_at=NULL,last_pull_at=NULL,last_success_at=NULL,last_error=NULL WHERE id='system_default'; DELETE FROM request_operation_receipts; DELETE FROM user_sessions;"
done
cat >"$A_CFG" <<PHP
<?php
\$db_host='127.0.0.1'; \$db_port=3306; \$db_name='$A_DB'; \$db_user='tamasya_ci'; \$db_pass='tamasya_ci_only';
PHP
cat >"$B_CFG" <<PHP
<?php
\$db_host='127.0.0.1'; \$db_port=3307; \$db_name='$B_DB'; \$db_user='tamasya_ci'; \$db_pass='tamasya_ci_only';
PHP
chmod 600 "$A_CFG" "$B_CFG"

start_node(){
  local id="$1" kind="$2" initial="$3" self="$4" peer_id="$5" peer="$6" cfg="$7" db="$8" port="$9" pid="${10}" log="${11}"
  env APP_CREDENTIALS_FILE="$cfg" APP_EXPECTED_DB_NAME="$db" APP_REQUIRE_EXPECTED_DB_NAME=1 APP_URL="$self" APP_ALLOWED_ORIGINS="$self" \
    TAMASYA_NODE_MODE=flexible NODE_CLUSTER_ENABLED=1 NODE_SYNC_ENABLED=1 TAMASYA_CLUSTER_ID="$CLUSTER" TAMASYA_NODE_ID="$id" TAMASYA_NODE_KIND="$kind" TAMASYA_NODE_INITIAL_ROLE="$initial" \
    NODE_CLUSTER_PUBLIC_URL="$self" NODE_CLUSTER_PEER_ID="$peer_id" NODE_CLUSTER_PEER_URL="$peer" NODE_SYNC_PRIMARY_URL="$peer" NODE_SYNC_SELF_URL="$self" \
    NODE_SYNC_FORWARD_WHEN_ONLINE=1 NODE_SYNC_ALLOW_HTTP_LOCAL=1 NODE_SYNC_SHARED_SECRET="$SECRET" TAMASYA_ALLOWED_NODE_IDS="$peer_id" NODE_CLUSTER_LEASE_TTL_SECONDS=300 NODE_CLUSTER_LEASE_RENEW_WINDOW_SECONDS=90 \
    php -S "127.0.0.1:$port" -t "$ROOT" >"$log" 2>&1 &
  echo $! > "$pid"
}
wait_node(){
  local url="$1" log="$2"
  for i in {1..45}; do if curl -fsS "$url/index.html" >/dev/null; then return 0; fi; sleep 1; done
  cat "$log"; return 1
}
node_env(){
  local id="$1" kind="$2" initial="$3" self="$4" peer_id="$5" peer="$6" cfg="$7" db="$8"
  shift 8
  env APP_CREDENTIALS_FILE="$cfg" APP_EXPECTED_DB_NAME="$db" APP_REQUIRE_EXPECTED_DB_NAME=1 APP_URL="$self" APP_ALLOWED_ORIGINS="$self" \
    TAMASYA_NODE_MODE=flexible NODE_CLUSTER_ENABLED=1 NODE_SYNC_ENABLED=1 TAMASYA_CLUSTER_ID="$CLUSTER" TAMASYA_NODE_ID="$id" TAMASYA_NODE_KIND="$kind" TAMASYA_NODE_INITIAL_ROLE="$initial" \
    NODE_CLUSTER_PUBLIC_URL="$self" NODE_CLUSTER_PEER_ID="$peer_id" NODE_CLUSTER_PEER_URL="$peer" NODE_SYNC_PRIMARY_URL="$peer" NODE_SYNC_SELF_URL="$self" \
    NODE_SYNC_FORWARD_WHEN_ONLINE=1 NODE_SYNC_ALLOW_HTTP_LOCAL=1 NODE_SYNC_SHARED_SECRET="$SECRET" TAMASYA_ALLOWED_NODE_IDS="$peer_id" NODE_CLUSTER_LEASE_TTL_SECONDS=300 NODE_CLUSTER_LEASE_RENEW_WINDOW_SECONDS=90 "$@"
}

start_node efc-node-a local primary "$A_URL" efc-node-b "$B_URL" "$A_CFG" "$A_DB" 38186 /tmp/tamasya-efc-node-a.pid "$LOG/two-node-a.log"
start_node efc-node-b hosting standby "$B_URL" efc-node-a "$A_URL" "$B_CFG" "$B_DB" 38187 /tmp/tamasya-efc-node-b.pid "$LOG/two-node-b.log"
wait_node "$A_URL" "$LOG/two-node-a.log"; wait_node "$B_URL" "$LOG/two-node-b.log"
# Warm primary state, then let standby adopt exact fencing/lease and mirror canonical data.
curl -fsS "$A_URL/api.php?action=ping" >/dev/null
node_env efc-node-b hosting standby "$B_URL" efc-node-a "$A_URL" "$B_CFG" "$B_DB" php "$ROOT/node_sync_agent.php" | tee "$LOG/two-node-agent-initial.json"
EFC_NODE_A_URL="$A_URL" EFC_NODE_B_URL="$B_URL" EFC_NODE_A_DB_CONFIG="$A_CFG" EFC_NODE_B_DB_CONFIG="$B_CFG" EFC_NODE_A_DB_NAME="$A_DB" EFC_NODE_B_DB_NAME="$B_DB" python3 "$ROOT/tests/uat_rc1/scenario_two_node_hybrid_complete.py" --phase online-forward

# True primary outage: stop A; standby must stay fenced and refuse local business writes.
kill "$(cat /tmp/tamasya-efc-node-a.pid)"; wait "$(cat /tmp/tamasya-efc-node-a.pid)" 2>/dev/null || true; rm -f /tmp/tamasya-efc-node-a.pid
EFC_NODE_A_URL="$A_URL" EFC_NODE_B_URL="$B_URL" EFC_NODE_A_DB_CONFIG="$A_CFG" EFC_NODE_B_DB_CONFIG="$B_CFG" EFC_NODE_A_DB_NAME="$A_DB" EFC_NODE_B_DB_NAME="$B_DB" python3 "$ROOT/tests/uat_rc1/scenario_two_node_hybrid_complete.py" --phase primary-outage

# Recover A, mirror to B, perform checksum-gated planned switchover A -> B.
start_node efc-node-a local primary "$A_URL" efc-node-b "$B_URL" "$A_CFG" "$A_DB" 38186 /tmp/tamasya-efc-node-a.pid "$LOG/two-node-a-recovered.log"
wait_node "$A_URL" "$LOG/two-node-a-recovered.log"
node_env efc-node-b hosting standby "$B_URL" efc-node-a "$A_URL" "$B_CFG" "$B_DB" php "$ROOT/node_sync_agent.php" | tee "$LOG/two-node-agent-recovery.json"
EFC_NODE_A_URL="$A_URL" EFC_NODE_B_URL="$B_URL" EFC_NODE_A_DB_CONFIG="$A_CFG" EFC_NODE_B_DB_CONFIG="$B_CFG" EFC_NODE_A_DB_NAME="$A_DB" EFC_NODE_B_DB_NAME="$B_DB" python3 "$ROOT/tests/uat_rc1/scenario_two_node_hybrid_complete.py" --phase planned-switch

# A is now standby: run its agent against B and prove reverse mirror convergence.
node_env efc-node-a local primary "$A_URL" efc-node-b "$B_URL" "$A_CFG" "$A_DB" php "$ROOT/node_sync_agent.php" | tee "$LOG/two-node-agent-mirror-back.json"
EFC_NODE_A_URL="$A_URL" EFC_NODE_B_URL="$B_URL" EFC_NODE_A_DB_CONFIG="$A_CFG" EFC_NODE_B_DB_CONFIG="$B_CFG" EFC_NODE_A_DB_NAME="$A_DB" EFC_NODE_B_DB_NAME="$B_DB" python3 "$ROOT/tests/uat_rc1/scenario_two_node_hybrid_complete.py" --phase final
