# Open pull request integration review

Date: 2026-10-27

Initial baseline: `e8e2f1658ddc259e390c91dc5a847e3d4b76a278` (`main`). The initial review covered 16 open pull requests, their changed server boundaries, database reads and writes, interface flows, migrations, and interactions when combined. The final acceptance pass below extends this to every PR through #145, including the two correction/integration PRs created during this review.

The first 15 ready PRs were authored by **Magalhaesz** in this repository. Each original head was merged into `codex/review-open-prs`; its commits and authorship remain in the ancestry. Draft #142 belongs to **GuiSatierf** and was initially kept separate. The initial review did not rewrite source branches, promote drafts, or merge into `main`. The product owner subsequently authorized accepting all PRs; the resulting integration is recorded below.

## Reviewed revisions

| PR                                                        | Reviewed head                              | Change                                                                   |
| --------------------------------------------------------- | ------------------------------------------ | ------------------------------------------------------------------------ |
| [#127](https://github.com/HanielCota/SellBridge/pull/127) | `4a4bc37bbb34f1fd77bf31419ba3d2dcf7ce6d58` | feat(web): split admin nav into reseller and supplier menus              |
| [#128](https://github.com/HanielCota/SellBridge/pull/128) | `138bfd970d6904995163d917191f437b642f3c2a` | feat(admin): pick a supplier's state by flag, name and code              |
| [#129](https://github.com/HanielCota/SellBridge/pull/129) | `76dcf0db7c17b4d3d8ccdb4ac05fd28298d3cad7` | feat: move dashboard hero shortcuts into the attention panel             |
| [#130](https://github.com/HanielCota/SellBridge/pull/130) | `3ee944a35a3bbef941655e9c56c0c5d3b858d572` | feat(support): give the supplier entry equal weight in the support card  |
| [#131](https://github.com/HanielCota/SellBridge/pull/131) | `ea4cedab3c77d2972ecfd573e6206569d1da6aea` | feat: show suppliers their sales on the panel home                       |
| [#132](https://github.com/HanielCota/SellBridge/pull/132) | `11544fb714818b6dff7bddaeb6087cd90fbc1c77` | feat(support): add health, today and hours panels to support performance |
| [#133](https://github.com/HanielCota/SellBridge/pull/133) | `ab4f42007b2af121e88ab1413a7cea0caf5a955b` | feat: add monthly reports with printable pages and spreadsheets          |
| [#134](https://github.com/HanielCota/SellBridge/pull/134) | `772c43a1c18c7f83a0396bc5eddd7a0136bad034` | feat: track parcels by role with a public buyer page                     |
| [#135](https://github.com/HanielCota/SellBridge/pull/135) | `bb143aee852ae54a6e5e63edf7ddbe63ef69dadb` | fix: return new support tickets to their origin page and widen the form  |
| [#136](https://github.com/HanielCota/SellBridge/pull/136) | `951b68779618de9283d1069fcefa5f50bd549f28` | feat: add talk-to-supplier to the listing and store menus                |
| [#137](https://github.com/HanielCota/SellBridge/pull/137) | `c3f9b1ee4e6634a5e2e0d3d499886932e8ad9e99` | docs: require commit, push and PR after every code change                |
| [#138](https://github.com/HanielCota/SellBridge/pull/138) | `38af4058575a92160105f70e86519d3855d1eb21` | feat: regroup the supplier home around what needs action                 |
| [#139](https://github.com/HanielCota/SellBridge/pull/139) | `885a4981aca39641a364a6fcf58d89f24e2fb45a` | feat(web): give suppliers a Mensagens tab for store conversations        |
| [#140](https://github.com/HanielCota/SellBridge/pull/140) | `0edf833c19eacbdb0b207a2502698af55f105ab8` | fix: close the two High findings of the 2026-10-27 full review           |
| [#141](https://github.com/HanielCota/SellBridge/pull/141) | `3918d3d95642eb0f3b3e523ab20e402bf2d277ca` | test(web): wait for hydration before the support verdict click           |

## Integration decisions

- The supplier's operational queue appears before its sales overview, as requested by the product owner. Both home proposals remain functional: health and flags, acceptance and dispatch actions, catalog fixes, sales filters, chart, totals, and exports. A sales-loading failure does not hide the operational queue.
- Seller shortcuts move into the attention panel while the shared dashboard heading remains configurable for supplier content.
- Supplier product actions include both import and download options. Inactive suppliers retain the existing restrictions on adding products.
- The extracted navigation components keep separate reseller/supplier menus, the messages tab, staff shipment tools, and the most specific active route. The supplier order badge combines pending acceptance and delivery alerts without counting a parcel twice.
- The support card keeps the revised hours and seller contact button; suppliers reach conversations from their messages tab.
- Reports and buyer tracking retain migrations 0055 and 0056, including their original migration metadata.

## Confirmed problems corrected

1. **Supplier report opened the reseller workspace.** The sales chart reused a download component with a hard-coded seller report destination. Its report destination is now explicit for suppliers. The browser regression failed with the old destination and passes with the supplier route.
2. **Supplier order updates left stale sales stages and navigation counts.** Accepting from home refreshed the queue, while the header and sales queries kept their previous values. Order writes now invalidate the order views, supplier home/sales data, and attention counts together. The browser regression first failed on the stale header count and now checks the queue, badge, and sales stage after acceptance.
3. **Combining supplier order badges dropped one PR's alerts.** A single supplier badge now counts the union of forwarded parcels and late/problem parcels, scoped to that supplier's organization. The database regression failed before the change and passes afterward, including overlap and another-workspace assertions.
4. **Customer CSV export silently omitted older profiles.** The loader sliced a capped 5,001-row result down to 5,000 and reported success. It now refuses incomplete exports with HTTP 422 and `no-store`, before recording a successful download. The HTTP regression returned 200 before the fix and 422 afterward.
5. **Merge compatibility gaps.** Restored the operational queue's photo helpers and tests, supplied the new support queue fields in monthly report fixtures, and combined both versions of shared heading/filter/catalog/support components.
6. **Outdated browser expectations and layout timing.** The supplier-header test now checks icons hidden below 1440px and visible from 1440px. It waits for the supplier workspace and fonts, then polls for zero clipped width after viewport changes. The support verdict test waits for hydration after a full reload. The original #139 CI had failed the icon and verdict tests; the focused local rerun passed them. The author subsequently pushed the icon expectation fix as `885a4981aca39641a364a6fcf58d89f24e2fb45a` and the hydration fix in #141; both original histories are included. Navigation assertions allow the new default sales filters and scope the supplier product link. The support-bubble overlap fixture isolates its injected control from real dashboard controls.

## Initial draft review: #142

[#142](https://github.com/HanielCota/SellBridge/pull/142), by **GuiSatierf**, was opened as a draft during validation. Reviewed head: `06e0e8f1369d0a9061e3f73bb0d46055e0a1e861`. All 24 changed files were inspected, including staff authorization, mode persistence, direct admin navigation, team avatars, and the test-only supplier account. No additional security defect was confirmed in those changed paths. This draft was excluded from the first integration; the final acceptance pass includes and validates it.

A `git merge-tree` compatibility probe reports conflicts in `apps/web/src/components/layout/top-nav.tsx` and `apps/web/src/components/layout/support-button.tsx`. Before integrating this draft:

- Port `TeamModeMenuEntry` into the extracted `mobile-nav.tsx`; the old inline `MobileNav` no longer exists. Keep the separate profile menus, current-profile counts, messages tab, and most-specific active route.
- Combine the shared round-button classes with `SupportHoursLine` and `SupportActions`; do not restore the older support card or duplicate the supplier messages entry.
- Recheck header geometry with the extra team button at all desktop widths, including supplier profiles and admin mode, then run the new team-entry tests with the existing navigation suite.
- Update the new README sentence saying `/admin/*` sends staff back to the sales dashboard. The same PR now enables team mode on direct staff navigation to an admin page, so that instruction contradicts its implementation.

These initial integration requirements are resolved in the final acceptance pass. The original commits and source branch remain intact.

## Final acceptance pass

The product owner explicitly authorized accepting every open PR, including #142. PR #143 passed all three GitHub CI checks and was merged into `main` as `d0667d667439b831f28dc0a6426a81374859798e`, which also marked #127–#141 as merged. GitHub merge commits preserve the original history and authorship.

The remaining work is combined on `codex/complete-open-pr-merges`:

| PR                                                        | Reviewed head                              | Author and dependency                                                           |
| --------------------------------------------------------- | ------------------------------------------ | ------------------------------------------------------------------------------- |
| [#142](https://github.com/HanielCota/SellBridge/pull/142) | `06e0e8f1369d0a9061e3f73bb0d46055e0a1e861` | GuiSatierf; team access, avatars, and supplier test account                     |
| [#144](https://github.com/HanielCota/SellBridge/pull/144) | `3b1f96e10a52e846ef9a2edfb75f6a23c078add5` | Magalhaesz; product classification; includes the author's updated main baseline |
| [#145](https://github.com/HanielCota/SellBridge/pull/145) | `59bfa2b282551fa221e91ab402e5ab38cba75857` | HanielCota; correction targeting #144, updated onto its latest head             |

- The team entry is ported into the extracted phone navigation while retaining separate profile menus, messages, supplier order counts, and staff shipment tools. The shared button classes coexist with the revised support card. README instructions now match direct navigation into the team area.
- An additional browser regression exercises team entry from a supplier profile with a long account name, verifies the header at 1024–1920px, and confirms that both profile menus remain accessible after entering team mode.
- #145 corrects confirmed false positives in #144: glue/paint/massage tools and medicine organizers were refused as weapons or medicines. Only recognized tool/storage names are excluded; another restricted item in the same listing still blocks submission. Seven new cases fail on the original implementation. After updating onto the author's latest #144 head, all 1,149 shared tests pass, together with lint, shared type checking, formatting, and the no-else check.
- The #142 integration passes all 3,452 unit/integration tests and its supplier-profile team-entry browser regression. The combined final tree passes all 3,469 unit/integration tests (root 7, shared 1,189, marketplaces 209, database 630, web 1,329, worker 105), format, lint, no-else, workspace type checking, and the production build.
- The complete browser suite for the combined final tree passes all 257 active scenarios on the first attempt in 11.1 minutes. Seven pre-existing own-catalog tests remain skipped. No failure or retry occurred. The earlier #143 GitHub browser run also passed all 250 active scenarios on its first attempt.
- Merge order is #145 into #144, then the final integration into `main`, with #142 promoted after validation. No force push, squash, or history rewrite is used.

## Validation

Validation uses disposable PostgreSQL/Redis instances, dummy credentials, read-only dependency mounts, and a bounded container with external networking disabled. Unit-test transform caches are redirected to writable scratch directories. No developer or production database is used.

- Format, lint, no-else check, workspace type checking, and production build pass.
- Unit/integration tests: 3,445 pass (root 7, shared 1,172, marketplaces 209, database 629, web 1,323, worker 105).
- Browser regressions cover supplier queue placement, acceptance and data refresh, supplier report navigation, and the CSV privacy assertions.
- Three additional browser tests pass for monthly reports: reseller rendering/printing/order CSV, supplier profile retention/product CSV, and admin report/team/ticket CSV with permission checks.
- Full browser suite: 249 passed, one supplier-header test passed on retry, and seven pre-existing own-catalog tests were skipped. After correcting the viewport measurement timing, the supplier-header regression passed five consecutive runs with retries disabled. All 250 active browser cases have passed.
- Production runtime smoke checks pass for database/Redis health, SSR/login, immutable static assets, disabled mock routes, and the request-body limit.
- Early full-browser attempts exhausted the first sandbox's process or scratch-disk budgets. The final full run used a fresh, larger disposable sandbox; those infrastructure failures are not omitted product-test failures.

The security checks in this review follow the changed authorization and data paths: profile membership, supplier ownership, staff permissions, buyer-token projection, CSV cell encoding, and the two marketplace guards from #140. The earlier audit report's unrelated follow-ups remain documented in its original report.
