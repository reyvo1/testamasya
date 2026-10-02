# TAMASYA Hybrid Modular Architecture — PRD As-Built Closure R2 Candidate

Date: 2 October 2026  
PRD authority: `PRD_TAMASYA.txt` v1.0, 15 September 2026  
Locked software parent: commit `639d811cf6ad4c336b7814f815bb02a76861d6f9`  
PRD Closure R1 commit reported GREEN by operator: `a2889c5`  
Runtime build identity: `20261002-prd-closure-r1`  
R2 scope: execution/evidence closure only; production runtime files remain byte-identical to R1 except manifest/documentation/workflow/test additions.

## Scope decision

TAMASYA keeps the PRD architecture unchanged: PHP remains the canonical PMS, booking, financial, tax, accounting and authorization authority. Node/realtime/worker/HQ remain adjacent services. R2 does not revive the superseded experimental 0-PHP Node migration lineage and does not create a second financial writer.

The R1 GitHub run was reported GREEN by the operator in the active repository after commit `a2889c5`. The exact GitHub run artifact is not embedded in this local R2 package, so R2 still requires a same-commit GitHub run before it may be locked as the final PRD-software release.

## PRD phase status

| Phase | Software status after R2 is GREEN | Evidence boundary |
|---|---|---|
| 0 — Baseline Lock | COMPLETE | Locked parent regression plus exact source manifest and same-commit GitHub UAT |
| 1 — Property Isolation | COMPLETE | Cross-property denial, scoped roles/audit, separate HQ/property databases, comprehensive UAT |
| 2 — Enterprise Read Model | COMPLETE | Signed snapshots, revisions/checksums, multi-property reconciliation, immutable reports/exports |
| 3 — Async Foundation | COMPLETE | Durable outbox/jobs, idempotency, ACK, retry/uncertain state and DLQ/health contracts |
| 4 — VPS Profile | SOFTWARE COMPLETE / TARGET SIZING COMMISSIONING | R1 builds the non-root PHP-FPM image; R2 boots real PHP-FPM/Nginx horizontal runtime and executes DB-backed concurrent liveness requests |
| 5 — Realtime / IoT | SOFTWARE COMPLETE / REAL DEVICE COMMISSIONING | R2 executes the realtime CLI process end-to-end with ticket scope/origin/outage behavior. Device ACK contract remains CI-simulated; physical device/provider proof remains commissioning |
| 6 — SaaS Scale | SOFTWARE COMPLETE IN CI / REAL HA COMMISSIONING | R2 executes two API processes behind Nginx with MySQL, while retained UAT covers isolation, concurrency, two-node fencing/convergence and backup/restore. Real multi-fault-domain DB HA, cloud IAM/object store, autoscaling and provider capacity remain infrastructure commissioning |

## R1 performance closure retained

R1 remains the runtime performance change-set. It lazy-loads optional Report/Website/System Health/Guest/Employee/Growth addons, removes 600 ms report-path polling, makes opportunistic maintenance visibility-aware and reduces Service Worker install precache. The deterministic initial-shell budget remains gated by `tests/prd-performance-regression.mjs`.

R2 intentionally does not modify those runtime files. Its purpose is to prove more of the PRD scale/deployment paths by execution instead of static configuration inspection.

## R2 execution closure

R2 adds the following CI-executable evidence:

1. **Horizontal SaaS runtime smoke** — `tests/uat_prd/run_saas_runtime_smoke.sh`
   - boots the production PHP-FPM image twice (`api` + `api2`) behind the production SaaS Nginx config;
   - starts a disposable MySQL 8.4 database on the same Docker network and imports the canonical fresh schema;
   - requires `api.php?action=ping` to report DB-backed readiness;
   - executes 96 concurrent routed liveness reads with 12 workers; and
   - verifies `/deploy/` and `/tests/` stay inaccessible through the public proxy.

2. **Realtime process smoke** — `tests/uat_prd/realtime-process-smoke.mjs`
   - launches `services/realtime/server.mjs` as the real CLI process using a private config file;
   - proves healthz, signed ticket validation, allowed-origin enforcement and property-scope reduction;
   - proves an upstream outage becomes an `unavailable`/retryable event rather than fabricated data.

3. **HQ external adapter simulation** — `tests/uat_prd/hq_external_adapters.php` + `mock_https_services.py`
   - uses the production PHP image, MySQL 8.4, a temporary CA and a real local HTTPS socket;
   - verifies report-delivery HMAC/idempotency headers and exact HTTP-200 ACK semantics;
   - proves HTTP 202 and wrong ACKs become `uncertain` and are not automatically resent;
   - executes the S3 SigV4 adapter against an HTTPS mock and proves immutable conditional PUT, duplicate 412 handling and GET checksum read-back.

4. **Static guard** — `tests/prd-scale-runtime-regression.mjs`
   - locks the above simulations into the source gate so future releases cannot silently drop them.

These are deterministic CI simulations, not claims that a specific production VPS, physical smart lock, Telegram/email provider, public WAN, managed object store or multi-fault-domain database cluster has been commissioned.

## Definition of PRD software completion

After the R2 exact commit passes every GitHub job without weakened assertions, the software-side PRD roadmap can be marked **COMPLETE** for the architecture defined by PRD v1.0:

- shared-hosting PMS remains independently operational;
- PHP remains the single canonical financial/business authority;
- multi-property/HQ, async/outbox, offline/two-node, worker, realtime and horizontal API profiles have executable software evidence;
- isolation, concurrency, report parity, backup/restore and two-node safety remain in the comprehensive UAT; and
- external/physical/cloud fault-domain validation remains a commissioning gate rather than unfinished application code.

## Final-lock rule

R2 is still a **candidate** until its own exact commit is GREEN in GitHub. Do not label R2 FINAL from local checks alone. A final source ZIP/SHA must be generated only from the exact GREEN R2 commit (or from a byte-identical archive proven against that commit).
