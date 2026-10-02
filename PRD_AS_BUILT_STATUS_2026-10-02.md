# TAMASYA Hybrid Modular Architecture — PRD As-Built Closure R5 Candidate

Date: 2 October 2026  
PRD authority: `PRD_TAMASYA.txt` v1.0, 15 September 2026  
Locked software parent: `639d811cf6ad4c336b7814f815bb02a76861d6f9`  
R1 GREEN commit: `a2889c5`  
R2 GitHub commit: `93311195790b17730dbee0199b5e66825e15dd4f`  
R3 GitHub commit: `2588681cae91be2823db7067db294545ada2ca30`  
R4 GitHub commit / exact R5 parent: `e2a3f38a7225da8419a1ed823911bb14a77bdc96`  
Runtime build identity remains: `20261002-prd-closure-r1`

## R4 GitHub evidence result

R4 did not regress canonical hotel behavior. The source/syntax/security job remained GREEN and the comprehensive hotel finance/booking/UI/Telegram job remained GREEN with **731/731 PASS; 0 FAIL**.

R4 also proved the new authenticated database-readiness gate works. The PRD runtime log reached:

- `PASS authenticated MySQL readiness ... user=tamasya_ci`;
- `PASS MySQL readiness is authenticated and rejects wrong credentials`.

The first new failure happened only when `database_setup.sql` reached canonical trigger creation at line 2686:

`ERROR 1419 (HY000): You do not have the SUPER privilege and binary logging is enabled`

## R5 root cause — schema authority was incorrectly merged with runtime authority

R4 fixed readiness correctly but then made a deeper architecture mistake: it deliberately imported canonical schema with the same application account used by PHP runtime. That account can own ordinary data-plane operations, but canonical schema includes triggers and migrations. With binary logging enabled, MySQL correctly rejects trigger creation by a non-administrative runtime identity.

This was also inconsistent with the existing production provisioning contract in `deploy/provision_property.php`, which already says: apply provisioning/import schema using DBA authority and use the generated database user only for application runtime.

R5 fixes the authority model instead of granting `SUPER`, disabling binary logging, enabling `log_bin_trust_function_creators`, or adding a retry.

## R5 database authority contract

- `mysql-authenticated-ready.sh` remains the readiness authority: readiness is authenticated TCP `SELECT 1`, never process-only `mysqladmin ping`.
- New `mysql-bootstrap-runtime-boundary.sh` separates disposable migration/DBA authority from runtime application authority.
- MySQL PRD fixtures start without `MYSQL_USER`/`MYSQL_PASSWORD`, so Docker does not auto-create an overprivileged application user.
- Canonical schema/trigger creation is executed only by isolated migration authority.
- The runtime PMS account is created **after** schema bootstrap with only `SELECT,INSERT,UPDATE,DELETE` on one property database.
- HQ runtime is created after HQ schema bootstrap with only `SELECT,INSERT,UPDATE` on the HQ database.
- Runtime grants are inspected and forbidden privileges (`CREATE`, `ALTER`, `DROP`, `TRIGGER`, `GRANT OPTION`, `SUPER`, global administration) are rejected.
- Runtime DDL and `SET GLOBAL log_bin_trust_function_creators=1` are behaviorally tested and must fail.
- Wrong runtime passwords still must fail authentication.
- Root/migration credentials are not mounted into PHP-FPM, worker, realtime, or HQ application containers.
- The same production distinction is documented in `deploy/README.md`; shared hosting remains supported with an explicitly documented platform exception when only one DB identity is available.

## PRD phase status if the exact R5 commit is GREEN

| Phase | Software status | Evidence boundary |
|---|---|---|
| 0 — Baseline Lock | COMPLETE | manifest + comprehensive same-commit GitHub UAT |
| 1 — Property Isolation | COMPLETE | cross-property denial, role/audit scope, separate HQ/property data boundaries |
| 2 — Enterprise Read Model | COMPLETE | signed snapshots, revisions/checksums, reconciliation, immutable report/export |
| 3 — Async Foundation | COMPLETE | durable outbox/jobs, idempotency, ACK/retry/uncertain/DLQ contracts |
| 4 — VPS Profile | SOFTWARE COMPLETE / TARGET SIZING COMMISSIONING | non-root PHP-FPM, authenticated DB readiness, separated migration/runtime authority, serialized storage init, worker/runtime smoke |
| 5 — Realtime / IoT | SOFTWARE COMPLETE / REAL DEVICE COMMISSIONING | real realtime process + origin/ticket/scope/outage checks; device ACK remains simulated |
| 6 — SaaS Scale | SOFTWARE COMPLETE IN CI / REAL HA COMMISSIONING | two PHP-FPM replicas + Nginx + MySQL, least-privilege runtime DB identity, shared-state lifecycle, 96 concurrent reads, restart persistence, replica-loss degradation, retained fencing/concurrency/DR UAT |

## Performance and storage closure retained

R1 remains the shared-hosting/browser performance closure. R3 remains the storage lifecycle root fix (`nocopy`, one-shot storage init, non-root runtime, durable shared state, no cross-upstream request replay). R4 authenticated-readiness logic is retained. R5 changes only deployment/CI authority boundaries and documentation; it does not weaken hotel financial/business assertions.

## Commissioning boundary

CI still does not prove a particular production VPS capacity, physical smart lock/RFID device, real provider delivery, managed object-storage IAM policy, WAN latency, multi-fault-domain shared storage, managed DB HA quorum/fencing, autoscaling, or measured production RPO/RTO. Those remain target commissioning evidence, not unfinished canonical PMS business code.

## Final-lock rule

R5 remains a **candidate** until the exact R5 commit passes every GitHub job. Only that exact GREEN commit may be frozen as `TAMASYA PRD SOFTWARE FINAL`.
