import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const dockerfile = readFileSync(
  fileURLToPath(new URL("../../../Dockerfile", import.meta.url)),
  "utf8",
);

function stageStartCommand(stage: string): string {
  const start = dockerfile.indexOf(`AS ${stage}\n`);
  expect(start).toBeGreaterThan(-1);
  const nextStage = dockerfile.indexOf("\nFROM ", start);
  const body = dockerfile.slice(start, nextStage === -1 ? undefined : nextStage);
  const command = body.split("\n").find((line) => line.startsWith("CMD "));
  if (command === undefined) {
    throw new Error(`The ${stage} stage has no CMD`);
  }
  return command;
}

describe("worker container start", () => {
  it("applies the database migrations before the worker runs any job", () => {
    const command = stageStartCommand("worker");

    const migrateAt = command.indexOf("@sellbridge/database/src/migrate.ts &&");
    const workerAt = command.indexOf("src/index.ts");

    expect(migrateAt).toBeGreaterThan(-1);
    expect(workerAt).toBeGreaterThan(migrateAt);
  });
});
