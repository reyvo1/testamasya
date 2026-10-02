# TAMASYA Hybrid Modular Architecture — PRD As-Built Closure R4 Candidate

Date: 2 October 2026  
PRD authority: `PRD_TAMASYA.txt` v1.0, 15 September 2026  
Locked software parent: `639d811cf6ad4c336b7814f815bb02a76861d6f9`  
R1 GREEN commit: `a2889c5`  
R2 GitHub commit: `93311195790b17730dbee0199b5e66825e15dd4f`  
R3 GitHub commit: `2588681cae91be2823db7067db294545ada2ca30`  
Runtime build identity remains: `20261002-prd-closure-r1`

## R3 evidence result

R3 did **not** regress hotel business behavior. The source/security job remained GREEN and Full hotel finance/booking/UI/Telegram UAT remained GREEN with **731/731 PASS; 0 FAIL**.

The R3 runtime-storage root fix also worked: the GitHub log shows the one-shot `storage-init` completed successfully and `api`, `api2`, and `web` were created/started together on fresh `nocopy` volumes without the prior `state/_data/outbox: file exists` race.

The first new failure occurred later, during disposable MySQL bootstrap in the PRD deployment job:

`ERROR 1045 (28000): Access denied for user 'root'@'localhost' (using password: YES)`

## R4 database-readiness root cause

The PRD runtime smoke used `mysqladmin ping` as its readiness oracle. That command is suitable for mysqld process liveness, but it is not proof that the official MySQL container entrypoint has completed database/user bootstrap and that authenticated SQL is ready. The loop could therefore break while initialization was still in progress; the next authenticated schema-import command raced that lifecycle and failed.

R4 replaces process liveness with an authenticated database readiness contract rather than adding sleeps or retrying the failed query.

## R4 database-readiness contract

- `tests/uat_prd/mysql-authenticated-ready.sh` is the shared PRD MySQL readiness authority.
- Readiness requires TCP `SELECT 1` using the application account against the expected database.
- Attempts are bounded and dead/exited containers fail immediately.
- Timeout/failure outputs database container logs for diagnosis.
- Wrong application credentials are explicitly tested and must be rejected.
- SaaS runtime DB and HQ adapter DB share the same readiness contract.
- Canonical/HQ schema bootstrap uses the application/schema-owner account after authenticated readiness, not DBA/root credentials.
- SaaS bootstrap proves exactly 113 canonical tables and 5 triggers before API readiness is accepted.
- PRD auxiliary MySQL 8.4 image is digest-pinned for reproducible CI; changing it is an explicit upgrade event requiring regression/UAT.
- `deploy/README.md` documents the same rule for deployment engineering.

## PRD phase status if the exact R4 commit is GREEN

| Phase | Software status | Evidence boundary |
|---|---|---|
| 0 — Baseline Lock | COMPLETE | manifest + comprehensive same-commit GitHub UAT |
| 1 — Property Isolation | COMPLETE | cross-property denial, role/audit scope, separate HQ/property data boundaries |
| 2 — Enterprise Read Model | COMPLETE | signed snapshots, revisions/checksums, reconciliation, immutable report/export |
| 3 — Async Foundation | COMPLETE | durable outbox/jobs, idempotency, ACK/retry/uncertain/DLQ contracts |
| 4 — VPS Profile | SOFTWARE COMPLETE / TARGET SIZING COMMISSIONING | production non-root PHP-FPM image, authenticated DB readiness, serialized private storage init, worker/runtime smoke |
| 5 — Realtime / IoT | SOFTWARE COMPLETE / REAL DEVICE COMMISSIONING | real realtime process + origin/ticket/scope/outage checks; device ACK remains simulated |
| 6 — SaaS Scale | SOFTWARE COMPLETE IN CI / REAL HA COMMISSIONING | two PHP-FPM replicas + Nginx + MySQL, authenticated DB bootstrap, shared-state lifecycle, 96 concurrent DB reads, restart persistence, replica-loss degradation, retained fencing/concurrency/DR UAT |

## Performance closure retained

R1 remains the browser/shared-hosting performance change-set: optional heavy addons are lazy-loaded, the 600 ms report polling loop was removed, opportunistic maintenance is visibility-aware, and Service Worker install precache is reduced. Deterministic shell/module byte budgets remain gated.

## Storage/runtime closure retained

R3 remains the runtime storage lifecycle change-set: `state/uploads` use `nocopy`, one-shot initialization owns directory creation, runtime processes stay non-root, state/upload persistence is tested across replicas/restarts, and Nginx never replays an uncertain request to a second writer.

## Commissioning boundary

CI still does not prove a particular production VPS capacity, physical smart lock/RFID device, real SMTP/Telegram/provider delivery, managed object-storage IAM policy, WAN latency, multi-fault-domain shared storage, managed DB HA quorum/fencing, autoscaling or measured production RPO/RTO. Those are commissioning/infrastructure evidence, not unfinished canonical PMS business code.

## Final-lock rule

R4 remains a **candidate** until the exact R4 commit passes every GitHub job. Only that exact GREEN commit may be frozen as `TAMASYA PRD SOFTWARE FINAL`.
