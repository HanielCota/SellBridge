# Server resource pressure

The investigation found overlapping builds on the application host, frequent container
probes, and production images inheriting the complete development workspace. The worker
included the web application's dependencies and build tools. Image export and unpacking
accounted for most of the observed deployment time.

## Runtime packaging

The final Docker stages now start from the Node 24 Alpine runtime instead of the build
workspace. pnpm deploy --prod creates each application's portable production dependency
graph. The web image includes the built assets, server entry point, request-body middleware,
and migration package. The worker includes its own source and dependencies.

The tsx loader is an explicit production dependency where it is used. The small workspace
TypeScript configuration remains available, while root development tools stay in intermediate
stages. The runtime continues to use the non-root node account, persistent upload/archive
paths, and migrations before web startup. Synthetic adapters and datasets remain excluded.
The worker image enables its health server on port 8080 by default and honors
WORKER_HEALTH_PORT for both the listener and the probe.

BuildKit cache mounts retain package downloads and metadata across builds. Lockfile and
supply-chain policy checks remain enabled; a missing metadata cache may use the registry.

Local amd64 image sizes from Docker's uncompressed Size field:

| Target | Previous bytes |   New bytes | Reduction |
| ------ | -------------: | ----------: | --------: |
| Worker |  1,577,566,623 | 319,906,223 |     79.7% |
| Web    |  1,610,458,083 | 883,169,088 |     45.2% |

These sizes do not measure registry transfer size, application response time, or memory use.

## Host settings

The Coolify server's concurrent-build limit was reduced from two to one. Application
health-check intervals are being changed from five to thirty seconds, with the checks,
expected status codes, timeouts, and retry budgets retained. Saved health settings require
a rolling update before the running containers use them.

The concurrency limit prevents future build overlap. It does not cap the CPU of a single
build or eliminate other workloads on the shared server. No unrelated application was
stopped, and no database or storage cleanup was performed.

## Validation and rollout

The production-image check script starts the actual images with isolated PostgreSQL and
Redis containers and ephemeral credentials. It verifies migrations, web/database/Redis
health, rendered assets and immutable headers, request-body rejection, and all worker
queues. It also checks non-root execution and the absence of development executables and
application test adapters. Test billing is explicitly unlimited; real service credentials
are never read from the developer environment.
Missing service images have a separate download budget, and startup-event inspection tolerates
plain-text container banners alongside structured logs.

The same checks run in the new production-container CI job. Run locally after building both
targets:

    node scripts/check-production-images.mjs sellbridge-runtime-web:ci sellbridge-runtime-worker:ci

After deployment, verify the running image revisions and actual Docker health intervals,
then compare CPU and public health responses after the deployment queue settles. Measurements
taken during different builds must not be presented as an isolated health-interval speedup.

References: [Coolify deployment limits](https://coolify.io/docs/core/infrastructure/servers/manage-server),
[pnpm production deployment](https://github.com/pnpm/pnpm/blob/main/pnpm/docs/cli/deploy.md),
and [Docker build caches](https://docs.docker.com/build/cache/optimize/).
