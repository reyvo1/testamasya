# TAMASYA Enterprise RC1 — GitHub UAT harness

This harness is the portable Linux/GitHub-Actions successor of the RC1 evidence scenarios. It targets a **fresh disposable MySQL database only**. It must never point to production.

Coverage in the default comprehensive job:
- property setup + protected semantic bindings;
- POS exact-cent discount, operation-id replay, stock 409, void/refund idempotency;
- reservation/check-in/overlap, room charge, payment/overpayment, checkout + housekeeping;
- cash/bank/split payment and cancellation refund back to the original bank;
- maintenance room blocking and post-maintenance inspection;
- historical/backfill tax-by-date, split historical payments, document tax snapshot, unresolved-tax state, reported/closed period controls, edit/move-period net deltas;
- tax edge cases, transaction allocations, accounting reports, OTA settlement, offline historical sync/idempotency/conflict;
- authorization controls and protected system-generated ledger rows;
- canonical report integrity and JSON/CSV/XLSX/PDF export parity.

The workflow also runs all source regression suites and syntax/lint gates before the database UAT. Logs are uploaded as Actions artifacts even on failure.
