# TAMASYA Hybrid Modular Architecture — PRD As-Built Closure R6 Candidate

Date: 2 October 2026  
PRD authority: `PRD_TAMASYA.txt` v1.0, 15 September 2026  
Locked software parent: `639d811cf6ad4c336b7814f815bb02a76861d6f9`  
R1 GREEN commit: `a2889c5`  
R2 GitHub commit: `93311195790b17730dbee0199b5e66825e15dd4f`  
R3 GitHub commit: `2588681cae91be2823db7067db294545ada2ca30`  
R4 GitHub commit: `e2a3f38a7225da8419a1ed823911bb14a77bdc96`  
R5 GitHub commit / exact R6 parent: `321e42daa59eb491e3774dfddbce1d650344b689`  
Runtime build identity remains: `20261002-prd-closure-r1`

## R5 GitHub evidence — two independent failures, neither is a hotel financial/business regression

### PRD VPS/realtime/SaaS job

R5 successfully passed authenticated MySQL readiness, canonical schema import through isolated migration authority, runtime-user creation, wrong-password rejection, DML grant restriction, DDL denial and global-admin denial. The log then reported:

`unexpected canonical trigger count after migration-authority bootstrap: 0`

The same GitHub run independently proved the canonical database contains **113 tables and 5 triggers** in the comprehensive hotel UAT and again proved **5 source / 5 restored triggers** in the restore drill. Therefore the trigger was not missing.

Root cause: the PRD smoke asked the DML-only runtime user to query `information_schema.TRIGGERS`. MySQL filters trigger metadata based on privilege. R5 intentionally removed `TRIGGER` privilege from runtime, so `0` means "not visible to this credential", not "schema lost five triggers".

### Full hotel UAT job

All completed business scenario suites remained green, including finance, booking, backfill, tax/accounting, Growth/Enterprise, Owner/Memo business flow, workforce, public guest journey, concurrency, reports/exports, SMTP and Telegram/parity.

Browser Playwright ran **34 tests**: **33 PASS, 1 timeout**. The timeout occurred only in the generic standalone-page wiring sweep for `internal-memo.html`. The dedicated Internal Memo business test itself passed create/search/archive/restore.

Root cause: the generic sweep repeatedly used `page.locator('button').nth(i)` while button handlers are allowed to re-render dynamic containers. Internal Memo archive/restore re-renders `#memo-list`; the previously valid nth index can disappear and Playwright then waits for a locator that will never reappear until the 90-second test timeout. This is a harness locator race, not a memo business failure.

Because the browser step failed, the subsequent two-node and HQ steps in the same job were skipped, so the final evidence contract correctly reported those two evidence files as missing. No gate is being relaxed; R6 removes the locator race so those existing gates can execute again.

## R6 root fixes

### 1. Trigger authority / metadata visibility

- New `mysql-canonical-authority-verify.py` derives expected fresh tables and trigger signatures directly from the schema SQL files.
- `mysql-bootstrap-runtime-boundary.sh` now performs exact schema/trigger verification **before** creating the runtime identity, while migration/DBA metadata visibility intentionally exists.
- After runtime creation, CI proves `SHOW CREATE TRIGGER` is denied to runtime and then rechecks the trigger count from migration authority.
- SaaS runtime smoke no longer treats the runtime-visible trigger count as schema authority evidence. It still verifies the runtime can see all 113 canonical tables.
- `baseline_support.php` now distinguishes "metadata not visible with this credential" from "trigger actually missing". Strict baseline readiness remains fail-closed whenever trigger verification is unavailable.
- `database_verify.php` explicitly tells operators to use migration/DBA authority for strict trigger verification instead of granting `TRIGGER` to the runtime account merely to obtain a green status.
- Deployment guidance now documents the same boundary.

### 2. Browser wiring sweep / dynamic DOM race

- The standalone-page sweep snapshots the actual button `ElementHandle`s present at load time.
- It invokes every initially rendered button handler from that stable snapshot even if a handler re-renders its container.
- The test no longer re-queries unstable `button:nth(i)` indexes after each mutation.
- Existing 5xx, browser-error, control-inventory and business assertions remain intact.
- Dedicated Internal Memo create/search/archive/restore coverage is retained.

## R6 local deterministic evidence

- PHP regression: 68/68 PASS
- JavaScript regression: 21/21 PASS
- Finance: 9/9 PASS
- Hybrid: 33/33 PASS
- Realtime: 16/16 PASS
- PRD architecture: 5/5 PASS
- PRD performance: 7/7 PASS
- PRD deployment: 7/7 PASS
- PRD scale runtime: 7/7 PASS
- PRD storage runtime: 7/7 PASS
- PRD database readiness: 8/8 PASS
- PRD database authority: 10/10 PASS
- PRD trigger metadata: 5/5 PASS
- PRD browser harness: 5/5 PASS
- Device contract: 9 PASS
- Database TLS: 4 PASS
- Canonical authority verifier self-check: 113 tables / 5 triggers PASS

Docker and full browser/database runtime remain GitHub-owned evidence because this execution environment has no Docker daemon and no same-stack MySQL/Playwright service fixture.

## PRD phase status if exact R6 commit is GREEN

| Phase | Software status | Evidence boundary |
|---|---|---|
| 0 — Baseline Lock | COMPLETE | manifest + same-commit comprehensive GitHub UAT |
| 1 — Property Isolation | COMPLETE | cross-property denial, role/audit scope, separate HQ/property data boundaries |
| 2 — Enterprise Read Model | COMPLETE | signed snapshots, revisions/checksums, reconciliation, report/export integrity |
| 3 — Async Foundation | COMPLETE | durable outbox/jobs, idempotency, ACK/retry/uncertain/DLQ contracts |
| 4 — VPS Profile | SOFTWARE COMPLETE / TARGET COMMISSIONING | non-root PHP-FPM, authenticated readiness, strict schema authority + least-privilege runtime, storage init, worker smoke |
| 5 — Realtime / IoT | SOFTWARE COMPLETE / REAL DEVICE COMMISSIONING | real realtime process + scope/outage checks; physical devices remain commissioning |
| 6 — SaaS Scale | SOFTWARE COMPLETE IN CI / REAL HA COMMISSIONING | two API replicas + Nginx + MySQL, shared state, concurrency, restart/replica-loss, fencing/DR UAT |

## Final-lock rule

R6 remains a **candidate** until the exact R6 commit passes every GitHub job. If all jobs are GREEN, freeze that exact commit as `TAMASYA PRD SOFTWARE FINAL`; do not create another development wave merely for renaming.
