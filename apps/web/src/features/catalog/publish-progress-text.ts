import type { PublishProgress } from "@sellbridge/shared/publish-progress";
import { formatDuration } from "@/features/support/response-time";

const MINUTE = 60_000;

/** "12 de 40 · 30%": what the bar shows next to it. */
export function progressCountText(progress: PublishProgress): string {
  return `${progress.done} de ${progress.total} · ${progress.percent}%`;
}

/** "calculando o tempo restante…", "menos de 1 min restante", "cerca de 4 min restantes" or "concluído". */
export function remainingTimeText(progress: PublishProgress): string {
  const remaining = progress.remainingMilliseconds;
  if (remaining === null) {
    return "calculando o tempo restante…";
  }
  if (remaining === 0 || progress.done >= progress.total) {
    return "concluído";
  }
  if (remaining < MINUTE) {
    return "menos de 1 min restante";
  }
  return `cerca de ${formatDuration(remaining)} restantes`;
}
