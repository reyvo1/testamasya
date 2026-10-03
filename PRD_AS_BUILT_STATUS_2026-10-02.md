# TAMASYA Hybrid Modular Architecture — PRD As-Built Closure R7 Candidate

Date: 3 October 2026  
PRD authority: `PRD_TAMASYA.txt` v1.0, 15 September 2026  
Locked software parent: `639d811cf6ad4c336b7814f815bb02a76861d6f9`  
Exact R7 parent / R6 GitHub commit: `0b14263d6a6687299ab49c43a41fbacca14a1f61`  
Runtime build identity remains `20261002-prd-closure-r1`; R7 is a compatibility/root-fix wave, not a business release fork.

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
