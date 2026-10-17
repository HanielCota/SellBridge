import type { PublishProgress } from "@sellbridge/shared/publish-progress";
import { progressCountText, remainingTimeText } from "@/features/catalog/publish-progress-text";
import { cn } from "@/lib/utils";

/**
 * "12 de 40 · 30%" over a bar, with the time left by the pace of the jobs already done
 * (item 14.b). Only the time left is announced: it changes by the minute, while the count
 * moves on every poll and would talk over the screen reader.
 */
export function ProgressWithEta({
  progress,
  label,
  className,
}: {
  progress: PublishProgress;
  label: string;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col gap-2", className)}>
      <progress
        className="h-1.5 w-full appearance-none overflow-hidden rounded-full bg-muted [&::-moz-progress-bar]:bg-brand [&::-webkit-progress-bar]:bg-muted [&::-webkit-progress-value]:rounded-full [&::-webkit-progress-value]:bg-brand"
        aria-label={label}
        max={Math.max(progress.total, 1)}
        value={progress.total === 0 ? 1 : progress.done}
      />
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 text-xs">
        <span className="font-medium text-foreground tabular-nums">
          {progressCountText(progress)}
        </span>
        <output className="text-muted-foreground tabular-nums">
          {remainingTimeText(progress)}
        </output>
      </div>
    </div>
  );
}
