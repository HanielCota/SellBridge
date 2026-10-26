# Cache and synthetic data review

Scope: application queries, route preloading, server reference data, integrations, setup scripts,
and production packaging. This follows the performance changes merged in PR #124.

## Cache placement

| Data or layer                                                            | Decision                                                                                                 | Freshness and isolation                                                                                                                                         |
| ------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Product category taxonomy                                                | Added one process-local cache shared by supplier forms, seller forms, admin details and import templates | Five minutes, one entry, concurrent reads share the same promise. Database failures are not cached. Writes still validate category IDs against the database.    |
| IBGE city names                                                          | Replaced indefinite storage with a bounded cache and concurrent request coalescing                       | 24 hours for successful lists, 30 seconds for an empty fallback, at most 27 entries. The browser uses the same freshness windows and a finite retention period. |
| Route intent preloading                                                  | Delegate freshness to React Query with `defaultPreloadStaleTime: 0`                                      | Navigating to a preloaded route invokes its loader again; fresh queries are reused and stale queries can refetch.                                               |
| Catalog, supplier lists, reputation and reports                          | Keep the existing browser query cache                                                                    | Default 30-second freshness; current mutation invalidation and polling continue. There is no new server response cache for tenant data.                         |
| Fees and form reference state                                            | Keep their existing explicit query policies                                                              | Fees are deployment configuration. Editable form state remains separate from cached taxonomy.                                                                   |
| Stock, orders, fulfillment, financial calculations and publication state | Keep current database reads and background polling                                                       | A shared response cache would also need coordinated invalidation from worker jobs, webhook ingestion and app mutations. No such cache is introduced.            |
| Sessions, memberships, permissions, visits and profile selection         | Do not add a process-wide cache                                                                          | Revocation, expiry, role changes and per-tab profile authorization must continue to be checked.                                                                 |
| Static hashed assets and immutable image URLs                            | Keep existing HTTP caches                                                                                | Asset versions and content-addressed URLs already define cache identity.                                                                                        |

The new caches contain only shared reference data, never tokens, buyer addresses, tenant queries,
or authorization results. Each server replica maintains its own bounded cache; no Redis service
or additional external dependency is needed. Taxonomy changes made directly in the database become
visible within five minutes per process. A deployment restart also clears the caches.

The category integration test issues 20 simultaneous reads and verifies one database call, then
verifies another call after expiry. City tests cover concurrent reads, expiry and recovery after
an empty fallback. These are call-count and correctness checks, not an end-to-end latency claim.

## Removed application simulations

- Removed the simulated store consent route and its approval server functions.
- Removed the sale-generation server function, webhook sender, menu action and animation.
- Removed the simulated connector from the production registry and package entry point.
- Removed fabricated carrier histories. Tracking reports `not_connected` until a real provider
  exists; `CARRIER_TRACKING_PROVIDER=simulated` is rejected in every environment.
- Removed fixture-specific store-name rewriting and simulated store descriptions.
- Replaced normal demonstration seeding with category setup and an explicitly configured operator
  account. No fake customers, suppliers, catalog, sales, reviews or support history are created.
- Excluded test directories and test source files from Docker build contexts.

Shopee and TikTok Shop remain explicitly unavailable. Their adapters report that the integration
is not configured; they never synthesize successful marketplace operations. The FAQ assistant and
price/fee estimates are real local behavior, not external-service simulations.

## Historical data and migration

Migration `0054_retire_simulated_stores` invalidates old simulated OAuth states, disconnects
simulated stores, clears their tokens, pauses their listing targets, removes their listing URLs,
and finishes pending simulated webhook events. It does not delete historical orders or customer
records. The old database enum identifier remains readable for these records, but new OAuth and
webhook requests reject it and the public API omits its stores and targets.

Run the normal migration step before starting the updated app and worker. Existing images may
still contain executable simulation code, so the web and worker should be updated together.
An environment that explicitly set `CARRIER_TRACKING_PROVIDER=simulated` must change it to `off`.
The retired `MOCK_WEBHOOK_SECRET` and latency variables are no longer consumed.

## Test-only fixtures

Synthetic integration adapters live behind `@sellbridge/marketplaces/testing`; datasets live under
`packages/database/src/testing/seed`. Normal application modules never import either entry point.
`seed:test` requires `NODE_ENV=test`, an explicit `TEST_DATABASE_URL`, and a database name containing
`test` or `e2e`; it does not infer the application's database URL.

Playwright injects adapters with its own Vite configuration and worker launcher. Consent belongs
to test middleware outside the application route tree. Fixture sales are posted from the test
runner through the real webhook, queue, worker and persistence flow. These checks validate the
application's integration contract; they do not certify a real Mercado Livre sandbox connection.
The test Vite configuration refuses builds and production execution. Playwright also clears local
payment, email, marketplace and alert credentials before starting its test processes.

## Validation

- Formatting, lint, the no-else rule, and root/workspace TypeScript checks passed.
- 3,218 unit and integration tests passed: shared 1,132; marketplaces 208; database 582;
  web 1,184; worker 105; root scripts 7.
- The isolated migration regression verifies token removal, disconnected stores, paused targets,
  consumed OAuth states, completed webhook events, and unchanged real stores and order history.
- A fresh bootstrap created one configured operator and 12 categories, with zero suppliers,
  connected stores, orders or tickets. Repeating it retained the same operator.
- Test seeding correctly refused production mode and an ordinary database name before writing.
- The production build passed. Its server returned 200 for login and 404 for the removed consent
  route, the test-only consent middleware and the retired webhook endpoint. Generated assets
  contained none of the removed simulation entry points or test-adapter token code.
- The final complete Playwright run passed: 240 scenarios, zero failures, seven skipped by the
  existing seller-owned product feature gate. Focused tracking, stock and store-supplier checks
  also passed. The final run used isolated service settings and no source edits during execution.
