# TAMASYA Hybrid Modular Architecture — PRD As-Built Closure Candidate

Date: 2 October 2026  
PRD authority: `PRD_TAMASYA.txt` v1.0, 15 September 2026 (included byte-for-byte in this candidate)  
Parent locked source: commit `639d811cf6ad4c336b7814f815bb02a76861d6f9`  
Candidate build: `20261002-prd-closure-r1`

## Scope decision

This candidate preserves the PRD architecture: PHP remains the canonical PMS, booking, financial, tax, accounting and authorization authority. Optional Node/worker/HQ services remain adjacent capabilities only. This is not a Node rewrite and does not revive the superseded experimental 0-PHP migration lineage.

## PRD phase status

| Phase | Software status in this candidate | Evidence boundary |
|---|---|---|
| 0 — Baseline Lock | COMPLETE from locked parent and retained regression gates | Full locked UAT remains the parent evidence; this candidate must re-run the same gate before final lock |
| 1 — Property Isolation | COMPLETE in software | Property/company scope, cross-property denial, audit and dedicated DB/HQ boundary covered by source + comprehensive UAT |
| 2 — Enterprise Read Model | COMPLETE in software | Signed/immutable snapshots, source revisions, checksum, HQ multi-property reconciliation and exports |
| 3 — Async Foundation | COMPLETE in software | Durable outbox/jobs, idempotency, ACK, retry/uncertain state, DLQ/health surfaces and optional worker contracts |
| 4 — VPS Profile | SOFTWARE IMPLEMENTED / CI SIMULATION REQUIRED | PHP-FPM image, Nginx, optional worker profile, non-root/read-only runtime and Compose configuration are CI-gated; target-host sizing remains commissioning evidence |
| 5 — Realtime / IoT | SOFTWARE IMPLEMENTED / EXTERNAL VALIDATION REQUIRED | Read-only revision SSE + fallback polling and device worker ACK contract are implemented; real device/provider/network capacity remains external validation |
| 6 — SaaS Scale | SOFTWARE FOUNDATION + CI SIMULATION / REAL HA PENDING | Horizontal API Compose profile, HQ separation, single-writer/no-retry contracts and two-node simulation are covered; real multi-fault-domain DB HA, object-store IAM, autoscaling and DR remain infrastructure commissioning |

## PRD performance closure in this candidate

The locked parent already used route chunks, revision signals and bounded polling, but several optional UI addons were still loaded by every PMS visit. This candidate closes that concrete shared-hosting gap without changing financial/business authority:

- Adds `assets/runtime-addon-loader.js` for route/capability lazy loading.
- Removes report, website, System Health, Guest Center, employee self-service and Growth-link addons from the eager shell.
- Keeps System Health operator-only and loads it on first open.
- Replaces canonical report center 600 ms pathname polling with SPA route events.
- Prevents opportunistic maintenance runs while the browser tab is hidden.
- Removes the same optional addons from Service Worker install precache; they are runtime-cached after use.
- Eager index asset budget is statically gated at <= 780000 uncompressed bytes. Current candidate measurement: 753404 bytes / 17 direct assets, down from approximately 928638 bytes before this closure wave.
- Browser UAT now verifies that report/website/System Health addons are not requested on the initial dashboard and are loaded when their capability is actually opened.

This budget is a deterministic software regression guard, not a claim about WAN transfer size or target-server p95 latency. Compression, cache state, PHP-FPM sizing, DB latency and real hosting capacity must still be measured on the deployment target.

## New PRD gates

The source gate now includes:

- `tests/prd-architecture-regression.mjs`
- `tests/prd-performance-regression.mjs`
- `tests/prd-deployment-regression.mjs`

GitHub Actions also includes a dedicated PRD deployment-profile simulation that:

1. validates property VPS, optional worker, horizontal SaaS, HQ and delivery Compose profiles;
2. builds the production PHP-FPM image;
3. verifies the container runs non-root with required PHP extensions;
4. verifies tests and live DB credentials are not copied into the image; and
5. reruns deployment architecture guards after image build.

The existing comprehensive UAT remains mandatory and is not weakened. It still covers financial/booking, Growth/Enterprise, Owner/Memo, workforce, public guest journey, concurrency, report/export, SMTP, Telegram, desktop/mobile browser, two-node failover/convergence, HQ multi-property, final database consistency and backup/restore.

## Final-lock rule

`20261002-prd-closure-r1` is a **candidate** until the modified source is pushed and every GitHub job passes from the same exact commit. A new final release lock may only be issued after:

- exact manifest verification passes;
- source/security/PRD regressions pass;
- PRD deployment-profile simulation passes;
- comprehensive MySQL/browser/two-node/HQ UAT passes with no weakened assertions; and
- the final ZIP is generated from that exact green commit and hashed.

Real provider/device/object-store/fault-domain validation remains commissioning evidence and must not be relabeled as GitHub-proven.
