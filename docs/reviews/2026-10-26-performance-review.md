# Performance review — 2026-10-26

The review found unnecessary startup JavaScript, redundant database reads on common screens,
serial catalog reads, and a missing index for supplier shipment queries. The changes reduce
that work while keeping profile authorization and financial calculations intact.

## Scope and method

Reviewed browser startup and navigation, SSR loaders, query caching and polling, catalog and
product screens, orders and financial reports, authentication and profile boundaries, static
asset delivery, and the worker's publishing, synchronization, tracking and delivery paths.

Installed the locked dependencies and ran a production build with local PostgreSQL 18 and
Redis 8 in disposable containers. Browser measurements used Chromium, the seeded demo account,
and the production server on localhost. No production database or deployment was changed.
The query-plan experiment used 30,000 synthetic shipments, removed after the experiment.

The measurements and initial test totals below were collected against checkout `e1751546`.
The publication branch was subsequently rebased onto `734956d8` from `main`; the index migration
was renumbered to `0053` to preserve the migration history already merged upstream.

The table counts JavaScript resource entries and sums their `encodedBodySize` after hydration
and network idle on full page loads. KB means 1,000 bytes. A browser context was reused between
pages, so the byte totals describe the modules referenced by each document, including cached
resources; they are not a measurement of network transfer on every navigation. Login used a
fresh context. These are local measurements, not production latency guarantees.

## Implemented changes

1. **Split route loaders.** TanStack Start previously split components while importing loaders
   and their feature dependencies at startup. Even login loaded order and shipment UI code.
   Loader code now has its own lazy boundary. The router can load the selected page's loader
   and component concurrently, and existing link preloading still works.
2. **Use dedicated indicator queries.** The header previously called `listListingTargets` for
   one failed publication, paying for a joined and sorted page, its total, and an unrelated
   active-publication lookup. It now issues one scoped count. Setup progress replaces the same
   three-query list operation with one statement containing two short-circuiting `EXISTS`
   checks. The description-resend polling window is preserved.
3. **Share the dashboard's store read.** Its report and setup snapshot now await the same store
   promise, removing a duplicate database query. Together with the activity query, this removes
   three database statements from the dashboard handler.
4. **Reuse supplier catalog counts.** The catalog already computes counts for every status tab.
   That result now provides pagination's total too. Page rows and status counts run concurrently
   after checking the supplier, replacing four serial database statements with three statements
   across two dependent phases.
5. **Index supplier shipments.** Supplier workspaces read shipments across reseller tenants.
   The existing tenant index and order-first unique index did not cover that access path.
   Migration `0053_supplier_shipment_index` adds `(supplier_id, status)`. The synthetic experiment
   changed a sequential scan discarding 29,700 unrelated rows to an index scan returning the
   supplier's 300 rows. The representative local plans took 1.69 ms and 0.35 ms respectively;
   this is a query-plan experiment, not an end-to-end page speedup.
6. **Group synchronization batches in linear time.** The worker now appends to each store's
   local group instead of copying its entire accumulated array for every target. Store order,
   per-store sequencing, concurrency and rate limits stay the same.
7. **Settle saved onboarding data before navigating.** Saving product sources now waits for
   synchronous route invalidation, preventing a quick return from initializing the form with
   the old selection. The route refresh and setup-progress read run concurrently.

## Browser measurements

| Page         | JS resources before → after | Encoded JS KB before → after | Byte change |
| ------------ | --------------------------: | ---------------------------: | ----------: |
| Login        |                    113 → 66 |                399.8 → 300.6 |      −24.8% |
| Dashboard    |                   137 → 123 |                574.3 → 546.9 |       −4.8% |
| Catalog      |                   138 → 128 |                463.7 → 435.1 |       −6.2% |
| Own products |                   136 → 119 |                458.4 → 418.0 |       −8.8% |
| Publications |                   139 → 128 |                464.8 → 435.4 |       −6.3% |
| Orders       |                   136 → 144 |                458.5 → 459.4 |       +0.2% |
| Stores       |                   140 → 133 |                466.0 → 438.8 |       −5.8% |
| Financials   |                   139 → 131 |                577.5 → 553.6 |       −4.1% |
| Suppliers    |                   137 → 125 |                453.8 → 423.3 |       −6.7% |
| Integrations |                   141 → 132 |                485.3 → 449.2 |       −7.4% |
| Profile      |                   133 → 117 |                458.9 → 419.5 |       −8.6% |
| Support      |                   134 → 122 |                456.7 → 426.3 |       −6.7% |

All twelve production-page measurements completed without browser exceptions. Orders gains
additional loader chunks and approximately 0.9 KB; this is a measured tradeoff of moving feature
code out of global startup. The results do not establish that every interaction became faster.

A second experiment compared the original route configuration with the final build under
Chromium network throttling: 100 ms latency, 200,000 bytes/s download, 75,000 bytes/s upload,
warmed servers and a fresh browser context for each sample. Three alternating samples per
version measured navigation through the `html[data-hydrated]` marker. Median login hydration
fell from 3,688 ms to 2,995 ms (18.8%). The baseline was rebuilt from the original source using
the same locked dependencies. This small simulated-network sample is separate from production
user measurements and should not be generalized to every page.

## Existing behavior checked

- PDF parsing and OCR already load their large dependencies on demand.
- Production assets already support compression and immutable caching, including old assets
  retained across rolling releases.
- Search inputs already debounce server queries; main lists paginate on the server.
- Report reads already run concurrently and have tenant/date and order-item indexes.
- Stock synchronization already processes stores concurrently with bounded lanes and rate
  limits. Delivery jobs already batch work and use retries and leases.
- Authorization checks sessions and current memberships on server requests. Profile changes
  continue to clear client data belonging to the previous workspace.

## Validation and rollout

- Production build, workspace TypeScript checks, lint, changed-file formatting, the no-else
  check and `git diff --check` passed.
- 2,452 unit and integration tests passed: 749 shared, 199 marketplace, 491 database,
  907 web, 99 worker, and 7 root checks. Integration tests ran against a database separate
  from the browser worker's database.
- The final complete browser run passed 194 of 195 scenarios, including saved onboarding
  selections, draft persistence, profile isolation, publishing, financials and supplier access.
  The remaining team-invite test captured the dialog during its opening fade. It now waits
  for actual animation completion before auditing contrast, with the same accessibility rules,
  and passed its focused rerun. All 195 scenarios therefore have passing final coverage;
  the complete suite was not rerun after this test-only synchronization change.
- Added database regressions for tenant isolation, pending/published activity, failed counts
  and the description-resend window. Existing supplier catalog and migration tests passed.
- Stabilized the webhook retry fixture's simulated clock so PostgreSQL submillisecond default
  timestamps do not occasionally leave a just-created delivery outside its due window.

After rebasing onto `734956d8`, the production build, workspace and root TypeScript checks,
full-repository formatting, lint, no-else check and migrations passed again. Validation passed
3,212 unit and integration tests: 1,132 shared, 208 marketplace, 581 database, 1,179 web,
105 worker and 7 root checks. A timing-sensitive support fixture was also corrected to select
the internal note explicitly instead of assuming it sorts last when timestamps tie; the full
database suite then passed. The browser suite and performance measurements were not repeated
after the rebase and retain their original-checkout context above.

Apply migration `0053_supplier_shipment_index` with the normal database migration step before
measuring the supplier-query gain in a deployment. The frontend and worker changes require a
new build and restart. Production response times, database load and concurrent-user behavior
still need measurements in the deployed environment; localhost timings cannot establish the
cause of all reported production slowness.
