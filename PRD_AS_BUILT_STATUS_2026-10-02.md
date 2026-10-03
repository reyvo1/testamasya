# TAMASYA Hybrid Modular Architecture — PRD As-Built Closure R8 Candidate

Date: 3 October 2026  
PRD authority: `PRD_TAMASYA.txt` v1.0, 15 September 2026  
Locked software parent: `639d811cf6ad4c336b7814f815bb02a76861d6f9`  
Exact R8 parent / R7 GitHub commit: `85d72c4ad70c8450899f3f92b517dc389c89e4b5`  
Runtime build identity remains `20261002-prd-closure-r1`; R8 is an authority-boundary root-fix wave, not a business release fork.

## R6 GitHub evidence

The exact R6 run kept source/security green and completed **682/682 business scenario assertions with 0 FAIL**. Browser ran 34 tests: 33 passed and one mobile POS lifecycle failed because the hotel date crossed midnight while the page stayed open: sale date became `2026-10-03` while `#sales-to` remained `2026-10-02`. Two-node/HQ evidence was subsequently absent only because later workflow steps were skipped after the browser failure.

The PRD SaaS job reached canonical database bootstrap but returned repeated HTTP 500. Source inspection found the smoke fixture omitted `APP_TIMEZONE`, `TAMASYA_PROPERTY_CODE`, and `TAMASYA_PROPERTY_NAME` although `api.php` explicitly requires those fields. R7 fixes that invalid fixture and preserves the response body/container logs on future readiness failure.

## R7 architecture correction

Runtime DB least privilege and canonical trigger verification are now one coherent authority chain. Migration/DBA authority imports and verifies exact canonical tables/trigger signatures, then records exact `database_setup.sql` SHA-256, release, patch and migration run in `schema_release_state`. Runtime remains DML-only. Direct trigger metadata wins when visible; deliberately hidden metadata may use only an exact matching migration-authority attestation. Missing/stale attestation or unclassified visibility remains fail-closed.

Production provisioning emits the attestation as a separate reviewed DBA step. Backup/restore guidance explicitly requires trigger-complete restore-grade evidence rather than weakening the verifier.

## R7 POS correction

POS automatic sales filters now follow the server-authoritative `businessDate` / `businessMonthStart` after bootstrap/focus refresh and on entry to the Sales view, including midnight and month rollover. Explicit custom historical periods remain custom. POS policy/client assets are cache-busted and included in the service-worker contract.

## Local deterministic evidence

All source-level suites are green: PHP 68/68, JS 21/21, Finance 9/9, Hybrid 33/33, Realtime 16/16, architecture 5/5, performance 7/7, deployment 7/7, scale 7/7, storage 7/7, DB readiness 8/8, DB authority 11/11, trigger metadata 5/5, browser harness 5/5, runtime schema authority 6/6, provisioning attestation 5/5, runtime config 4/4, POS business date 7/7, device 9, database TLS 4.

## PRD phase status if exact R7 commit is fully GREEN

| Phase | Software status | Remaining evidence boundary |
|---|---|---|
| 0 — Baseline Lock | COMPLETE | same-commit manifest/UAT |
| 1 — Property Isolation | COMPLETE | target deployment smoke |
| 2 — Enterprise Read Model | COMPLETE | target deployment smoke |
| 3 — Async Foundation | COMPLETE | target provider commissioning |
| 4 — VPS Profile | SOFTWARE COMPLETE / TARGET COMMISSIONING | real host sizing/ops |
| 5 — Realtime / IoT | SOFTWARE COMPLETE / REAL DEVICE COMMISSIONING | physical device/provider |
| 6 — SaaS Scale | SOFTWARE COMPLETE IN CI / REAL HA COMMISSIONING | real multi-fault-domain HA/DR |

## Final-lock rule

R7 remains a **candidate** until the exact R7 commit passes every GitHub job. If all jobs are GREEN, freeze that exact commit as `TAMASYA PRD SOFTWARE FINAL`; do not create another development wave merely to rename it.

## R7 GitHub evidence and R8 authority closure

The exact R7 GitHub run completed **731/731 hotel scenario assertions with 0 FAIL** and **34/34 Playwright tests PASS**. The horizontal SaaS PMS runtime also passed 113 canonical tables, 5 canonical triggers, exact source attestation, DML-only runtime, two API replicas, 96 concurrent DB reads, shared storage/worker, restart persistence and replica-loss degradation. The remaining PRD failure was isolated to HQ authority verification after the HQ SQL files imported successfully: MySQL exposed seven actual HQ tables while the verifier derived zero expected tables.

The root cause was not HQ application behavior. The authority parser recognized only backtick-quoted `CREATE TABLE` identifiers while HQ schemas use ordinary unquoted names. In addition, the shared bootstrap helper still assumed every database owned PMS `schema_release_state`; HQ deliberately does not. R8 fixes both layers together. The verifier now accepts quoted/unquoted/`IF NOT EXISTS`/schema-qualified identifiers and fails closed on a zero-object parse. The bootstrap boundary requires an explicit `property` or `hq` profile. Property PMS retains canonical release/source attestation; HQ retains strict object verification and ordered source-set digest evidence without inventing PMS metadata. Runtime privileges remain restricted, and HQ DELETE denial is behaviorally tested.

R8 adds a real parser/profile regression over the canonical PMS schema, HQ base/delivery schemas, HQ control-plane schema, mixed identifier fixtures, and empty-parser fail-closed behavior. No previous UAT or business assertion is removed or relaxed.

## R8 final-lock rule

R8 remains a **candidate** until the exact R8 commit passes every GitHub job. If all jobs are GREEN, freeze that exact commit as `TAMASYA PRD SOFTWARE FINAL`; do not change tested source merely to rename the release.
