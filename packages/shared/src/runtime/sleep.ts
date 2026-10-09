import { setTimeout as delay } from "node:timers/promises";

export async function defaultSleep(milliseconds: number): Promise<void> {
  await delay(milliseconds);
}
