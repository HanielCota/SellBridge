import { cn } from "@/lib/utils";
import { type PasswordStrength, passwordStrength } from "@/lib/password-strength";

interface StrengthLevel {
  filledSegments: number;
  label: string;
  barClassName: string;
  textClassName: string;
}

const STRENGTH_LEVELS: Record<PasswordStrength, StrengthLevel> = {
  weak: {
    filledSegments: 1,
    label: "Senha fraca",
    barClassName: "bg-destructive",
    textClassName: "text-destructive",
  },
  medium: {
    filledSegments: 2,
    label: "Senha média",
    barClassName: "bg-amber-500",
    textClassName: "text-amber-700 dark:text-amber-400",
  },
  strong: {
    filledSegments: 3,
    label: "Senha forte",
    barClassName: "bg-brand-strong",
    textClassName: "text-brand-text",
  },
};

const SEGMENTS = [0, 1, 2] as const;

/** Each segment fills a little after the one before it, so the bar grows left to right. */
const SEGMENT_DELAY_MS = 70;

function StrengthSegment({ index, level }: { index: number; level: StrengthLevel }) {
  const isFilled = index < level.filledSegments;
  return (
    <span className="h-1 overflow-hidden rounded-full bg-muted">
      <span
        className={cn(
          "block h-full origin-left rounded-full transition-[scale,background-color] duration-300 ease-out motion-reduce:transition-none",
          level.barClassName,
          isFilled ? "scale-x-100" : "scale-x-0",
        )}
        style={{ transitionDelay: isFilled ? `${index * SEGMENT_DELAY_MS}ms` : "0ms" }}
      />
    </span>
  );
}

/**
 * Three bars under a new-password field that fill and change color as the password gets
 * stronger. Hidden while the field is empty; the label is announced politely as it changes.
 */
export function PasswordStrengthMeter({ password }: { password: string }) {
  const strength = passwordStrength(password);
  if (strength === null) {
    return null;
  }
  const level = STRENGTH_LEVELS[strength];
  return (
    <div className="flex animate-in items-center gap-3 px-1 duration-200 fade-in-0 motion-reduce:animate-none">
      <div className="grid flex-1 grid-cols-3 gap-1.5" aria-hidden="true">
        {SEGMENTS.map((index) => (
          <StrengthSegment key={index} index={index} level={level} />
        ))}
      </div>
      <output
        aria-live="polite"
        className={cn(
          "min-w-[5.5rem] text-right text-footnote font-medium transition-colors duration-300",
          level.textClassName,
        )}
      >
        {level.label}
      </output>
    </div>
  );
}
