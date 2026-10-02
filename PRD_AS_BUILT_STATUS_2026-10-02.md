# TAMASYA Hybrid Modular Architecture — PRD As-Built Closure R3 Candidate

Date: 2 October 2026  
PRD authority: `PRD_TAMASYA.txt` v1.0, 15 September 2026  
Locked software parent: `639d811cf6ad4c336b7814f815bb02a76861d6f9`  
R1 GREEN commit: `a2889c5`  
R2 GitHub commit: `93311195790b17730dbee0199b5e66825e15dd4f`  
Runtime build identity remains: `20261002-prd-closure-r1`

## R2 evidence result

R2 did **not** fail a hotel business rule. The source/security gate and Full hotel finance/booking/UI/Telegram UAT completed GREEN. The new PRD deployment job failed during Docker container creation before the MySQL/runtime assertions could execute.

The exact failure was a fresh named-volume initialization race: `api` and `api2` were created concurrently against the same `state` volume while the image already contained `outbox`/`backups` directories. Docker automatic copy-up attempted parallel directory creation and failed with `state/_data/outbox: file exists`.

R3 treats this as an architecture/runtime-storage root cause. It does not add a retry or serialize API replicas manually.

## R3 storage/runtime contract

- `state` and `uploads` use named volumes with `nocopy=true`.
- `storage-init` is a one-shot service that prepares both mounted storage roots before API/worker/web startup.
- `storage-init` rejects symlinks and non-directory collisions; it never `rm -rf`s operator data.
- private state/outbox/backups are owned by `www-data` with private permissions.
- uploads are owned by `www-data` and remain readable by the Nginx container for explicitly allowed public-site assets.
- PHP-FPM and canonical worker remain non-root/read-only-rootfs runtime services.
- SaaS API replicas share the initialized same-host state/upload volumes in CI; the deployment guide explicitly states that ordinary Compose named volumes are **not** shared across hosts/fault domains.

## PRD phase status if the exact R3 commit is GREEN

| Phase | Software status | Evidence boundary |
|---|---|---|
| 0 — Baseline Lock | COMPLETE | manifest + comprehensive same-commit GitHub UAT |
| 1 — Property Isolation | COMPLETE | cross-property denial, role/audit scope, separate HQ/property data boundaries |
| 2 — Enterprise Read Model | COMPLETE | signed snapshots, revisions/checksums, reconciliation, immutable report/export |
| 3 — Async Foundation | COMPLETE | durable outbox/jobs, idempotency, ACK/retry/uncertain/DLQ contracts |
| 4 — VPS Profile | SOFTWARE COMPLETE / TARGET SIZING COMMISSIONING | production non-root PHP-FPM image, serialized private storage init, worker/runtime smoke |
| 5 — Realtime / IoT | SOFTWARE COMPLETE / REAL DEVICE COMMISSIONING | real realtime process + origin/ticket/scope/outage checks; device ACK remains simulated |
| 6 — SaaS Scale | SOFTWARE COMPLETE IN CI / REAL HA COMMISSIONING | two PHP-FPM replicas + Nginx + MySQL, shared-state lifecycle, 96 concurrent DB reads, restart persistence, replica-loss degradation, retained fencing/concurrency/DR UAT |

## Performance closure retained

R1 remains the browser/shared-hosting performance change-set: optional heavy addons are lazy-loaded, the 600 ms report polling loop was removed, opportunistic maintenance is visibility-aware, and Service Worker install precache is reduced. Deterministic shell/module byte budgets remain gated.

## New R3 execution evidence

The SaaS runtime smoke now intentionally recreates the original failure condition by starting two API replicas together on fresh volumes, then additionally validates writable boundaries, cross-replica state, public-upload sharing, worker lifecycle, restart persistence and one-replica loss. Nginx may quarantine a failed replica for **subsequent** requests but `fastcgi_next_upstream off` remains enforced so an uncertain request is never replayed to another potential writer.

Realtime process execution, HQ HTTPS delivery semantics and S3 SigV4 immutable object archive tests remain additive in the same GitHub job after the container runtime gate.

## Commissioning boundary

CI still does not prove a particular production VPS capacity, physical smart lock/RFID device, real SMTP/Telegram/provider delivery, managed object-storage IAM policy, WAN latency, multi-fault-domain shared storage, managed DB HA quorum/fencing, autoscaling or measured production RPO/RTO. Those are commissioning/infrastructure evidence, not unfinished canonical PMS business code.

## Final-lock rule

R3 remains a **candidate** until the exact R3 commit passes every GitHub job. Only that exact GREEN commit may be frozen as `TAMASYA PRD SOFTWARE FINAL`.
