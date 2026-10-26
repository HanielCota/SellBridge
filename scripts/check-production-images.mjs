import strictAssert from "node:assert/strict";
import { execFile } from "node:child_process";
import { randomBytes } from "node:crypto";
import { readFile } from "node:fs/promises";
import { promisify } from "node:util";
import { setTimeout as delay } from "node:timers/promises";

const execute = promisify(execFile);
const webImage = process.argv[2] ?? "sellbridge-runtime-web:ci";
const workerImage = process.argv[3] ?? "sellbridge-runtime-worker:ci";
const prefix = "sellbridge-runtime-" + randomBytes(6).toString("hex");
const names = {
  postgres: prefix + "-postgres",
  redis: prefix + "-redis",
  web: prefix + "-web",
  worker: prefix + "-worker",
};
const password = randomBytes(24).toString("hex");
const environment = {
  DATABASE_URL:
    "postgres://sellbridge:" + password + "@" + names.postgres + ":5432/sellbridge_runtime_test",
  REDIS_URL: "redis://" + names.redis + ":6379",
  APP_URL: "http://localhost:3000",
  BETTER_AUTH_URL: "http://localhost:3000",
  BILLING_UNLIMITED: "true",
  BETTER_AUTH_SECRET: randomBytes(32).toString("hex"),
  TOKEN_ENCRYPTION_KEY: randomBytes(32).toString("base64"),
};

async function docker(args, timeout = 120_000) {
  const result = await execute("docker", args, {
    encoding: "utf8",
    maxBuffer: 4 * 1024 * 1024,
    timeout,
  });
  return result.stdout.trim();
}

async function ensureImage(image) {
  try {
    await docker(["image", "inspect", "--format", "{{.Id}}", image]);
  } catch {
    await docker(["pull", image], 300_000);
  }
}

function parseStructuredLog(line) {
  try {
    return JSON.parse(line);
  } catch {
    return undefined;
  }
}

async function eventually(description, check) {
  const deadline = Date.now() + 90_000;
  let lastError;
  while (Date.now() < deadline) {
    try {
      return await check();
    } catch (error) {
      lastError = error;
      await delay(1_000);
    }
  }
  throw new Error(description + " did not become ready", { cause: lastError });
}

async function start(name, image, variables) {
  return docker([
    "run",
    "--pull",
    "never",
    "-d",
    "--name",
    name,
    "--network",
    prefix,
    ...Object.entries(variables).flatMap(([key, value]) => ["-e", key + "=" + value]),
    image,
  ]);
}

async function inspectRuntime() {
  const assert = (await import("node:assert/strict")).default;
  const fs = await import("node:fs");
  const path = await import("node:path");
  const { fileURLToPath } = await import("node:url");
  assert.equal(process.getuid(), 1000);
  for (const name of ["vitest", "tsc", "playwright", "prettier", "oxlint"]) {
    assert.equal(fs.existsSync("node_modules/.bin/" + name), false, name);
  }
  assert.equal(fs.existsSync("src/testing"), false);
  assert.equal(fs.existsSync("e2e"), false);
  for (const name of ["@sellbridge/database", "@sellbridge/marketplaces"]) {
    const source = path.dirname(fileURLToPath(import.meta.resolve(name)));
    assert.equal(fs.existsSync(path.join(source, "testing")), false, name);
  }
}

async function inspectWeb() {
  const assert = (await import("node:assert/strict")).default;
  const base = "http://127.0.0.1:3000";
  for (const path of ["/__e2e/consent", "/oauth/mock/autorizar"]) {
    assert.equal((await fetch(base + path)).status, 404, path);
  }
  const page = await fetch(base + "/");
  assert.equal(page.status, 200);
  const html = await page.text();
  const asset = html.match(/(?:src|href)="([^"]*\/assets\/[^"]+)"/)?.[1];
  assert.ok(asset, "The rendered document references a built asset");
  const response = await fetch(new URL(asset.replaceAll("&amp;", "&"), base));
  assert.equal(response.status, 200);
  assert.match(response.headers.get("cache-control") ?? "", /immutable/);
  const rejected = await fetch(base + "/api/auth/sign-in/email", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: "x".repeat(64 * 1024 + 1),
  });
  assert.equal(rejected.status, 413);
}

try {
  await ensureImage("postgres:18-alpine");
  await ensureImage("redis:8-alpine");
  await docker(["network", "create", prefix]);
  await start(names.postgres, "postgres:18-alpine", {
    POSTGRES_USER: "sellbridge",
    POSTGRES_PASSWORD: password,
    POSTGRES_DB: "sellbridge_runtime_test",
  });
  await start(names.redis, "redis:8-alpine", {});
  await eventually("PostgreSQL", () =>
    docker([
      "exec",
      names.postgres,
      "pg_isready",
      "-h",
      "127.0.0.1",
      "-U",
      "sellbridge",
      "-d",
      "sellbridge_runtime_test",
    ]),
  );
  await eventually("Redis", async () => {
    strictAssert.equal(await docker(["exec", names.redis, "redis-cli", "ping"]), "PONG");
  });
  await start(names.web, webImage, environment);
  await eventually("Web database and Redis checks", async () => {
    const report = JSON.parse(
      await docker(["exec", names.web, "wget", "-q", "-O-", "http://127.0.0.1:3000/api/health"]),
    );
    strictAssert.deepEqual(report.checks, { database: "ok", redis: "ok" });
    strictAssert.equal(report.status, "ok");
  });
  const journal = JSON.parse(
    await readFile(
      new URL("../packages/database/migrations/meta/_journal.json", import.meta.url),
      "utf8",
    ),
  );
  const applied = await docker([
    "exec",
    names.postgres,
    "psql",
    "-U",
    "sellbridge",
    "-d",
    "sellbridge_runtime_test",
    "-Atc",
    "SELECT max(created_at) FROM drizzle.__drizzle_migrations;",
  ]);
  strictAssert.equal(Number(applied), journal.entries.at(-1).when);
  await start(names.worker, workerImage, environment);
  await eventually("Worker and Redis checks", async () => {
    const report = JSON.parse(
      await docker(["exec", names.worker, "wget", "-q", "-O-", "http://127.0.0.1:8080/health"]),
    );
    strictAssert.deepEqual(report.checks, { worker: "ok", redis: "ok" });
    strictAssert.equal(report.status, "ok");
  });
  for (const name of [names.web, names.worker]) {
    await eventually("Docker health check for " + name, async () => {
      const status = await docker(["inspect", "--format", "{{.State.Health.Status}}", name]);
      strictAssert.equal(status, "healthy");
    });
    await docker([
      "exec",
      name,
      "node",
      "--input-type=module",
      "-e",
      "(" + inspectRuntime.toString() + ")()",
    ]);
  }
  await docker([
    "exec",
    names.web,
    "node",
    "--input-type=module",
    "-e",
    "(" + inspectWeb.toString() + ")()",
  ]);
  const expectedQueues = JSON.parse(
    await docker([
      "exec",
      names.worker,
      "node",
      "--import",
      "tsx",
      "--input-type=module",
      "-e",
      'import { QUEUE_NAMES } from "@sellbridge/shared/queues"; console.log(JSON.stringify(Object.values(QUEUE_NAMES)));',
    ]),
  );
  // Exercise mixed plain-text and structured container output.
  await docker([
    "exec",
    names.worker,
    "node",
    "-e",
    'require("node:fs").writeFileSync("/proc/1/fd/1", "Packaging smoke banner\\n");',
  ]);
  const startup = (await docker(["logs", names.worker]))
    .split("\n")
    .map(parseStructuredLog)
    .find((entry) => entry?.event === "worker.started");
  strictAssert.ok(startup, "Worker emitted its structured startup event");
  strictAssert.deepEqual(startup?.queues.toSorted(), expectedQueues.toSorted());
  process.stdout.write(
    "Production images passed: migrations, web assets, body limits, and all worker queues.\n",
  );
} catch (error) {
  for (const name of [names.web, names.worker]) {
    const logs = await docker(["logs", "--tail", "30", name]).catch(() => "Container not started");
    process.stderr.write(name + ":\n" + logs + "\n");
  }
  throw error;
} finally {
  // Only uniquely named containers created by this invocation are eligible for cleanup.
  await Promise.allSettled(Object.values(names).map((name) => docker(["rm", "-f", "-v", name])));
  await docker(["network", "rm", prefix]).catch(() => undefined);
}
