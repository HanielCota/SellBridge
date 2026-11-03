import type { ReactNode } from "react";
import type { StorySegment, StoryTone } from "@/features/support/performance-story";
import { cn } from "@/lib/utils";

const TONE_CLASSES: Record<StoryTone, string> = {
  strong: "font-medium text-foreground",
  good: "font-medium text-brand-text",
  bad: "font-medium text-destructive",
};

/** The one-line reading of the period: numbers stand out, good and bad news in their colors. */
export function Story({ segments }: { segments: readonly StorySegment[] }) {
  return (
    <p className="max-w-2xl text-lg leading-relaxed text-pretty text-muted-foreground">
      {segments.map((segment, index) => (
        <span key={index} className={segment.tone ? TONE_CLASSES[segment.tone] : undefined}>
          {segment.text}
        </span>
      ))}
    </p>
  );
}

/**
 * The top of the page, like the sales dashboard's: a large title with the dates it covers, an
 * action on the right and the summary line below.
 */
export function PerformanceHero({
  title,
  caption,
  back,
  action,
  story,
}: {
  title: string;
  caption: string;
  back?: ReactNode;
  action?: ReactNode;
  story: readonly StorySegment[];
}) {
  return (
    <section aria-label="Resumo do período" className="space-y-8 pb-2">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
        <div className={cn("space-y-2", back && "space-y-3")}>
          {back}
          {/* The size of every other page's title (PageHeader): at 56px it shouted over them. */}
          <h1 className="text-2xl font-semibold tracking-tight text-balance">{title}</h1>
          <p className="text-sm text-muted-foreground">{caption}</p>
        </div>
        {action}
      </div>
      <Story segments={story} />
    </section>
  );
}
