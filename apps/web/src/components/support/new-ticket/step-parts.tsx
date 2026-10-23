import type { KeyboardEvent } from "react";
import { Button } from "@/components/ui/button";

/** Ids the flow moves focus to when a step opens, so screen readers hear the next question. */
export const STEP_HEADING_IDS = {
  topic: "new-ticket-topic",
  situation: "new-ticket-situation",
  description: "new-ticket-description",
  assistant: "new-ticket-assistant",
} as const;

export type StepHeadingId = (typeof STEP_HEADING_IDS)[keyof typeof STEP_HEADING_IDS];

/** Focuses a step's question once the step is on screen. */
export function focusStepHeading(id: StepHeadingId): void {
  requestAnimationFrame(() => document.getElementById(id)?.focus());
}

export function StepHeading({
  id,
  number,
  total,
  question,
  help,
}: {
  id: StepHeadingId;
  number: number;
  total: number;
  question: string;
  help?: string;
}) {
  return (
    <div>
      <p className="text-sm text-muted-foreground">
        Passo {number} de {total}
      </p>
      <h2 id={id} tabIndex={-1} className="text-base font-semibold outline-none">
        {question}
      </h2>
      {help === undefined ? null : <p className="text-sm text-muted-foreground">{help}</p>}
    </div>
  );
}

/** A step already answered: what was picked and a quiet way back to change it. */
export function AnsweredStep({
  number,
  answer,
  changeLabel,
  onChange,
}: {
  number: number;
  answer: string;
  changeLabel: string;
  onChange: () => void;
}) {
  return (
    <div className="flex items-center justify-between gap-3 border-b pb-2.5">
      <p className="min-w-0 text-sm">
        <span className="text-muted-foreground">{number}. </span>
        {answer}
      </p>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="shrink-0 text-muted-foreground"
        aria-label={changeLabel}
        onClick={onChange}
      >
        Alterar
      </Button>
    </div>
  );
}

const NEXT_KEYS = new Set(["ArrowRight", "ArrowDown"]);
const PREVIOUS_KEYS = new Set(["ArrowLeft", "ArrowUp"]);

/** How many options sit on the first row of a grid, read from where they are drawn. */
function columnsOf(options: readonly HTMLElement[]): number {
  const firstTop = options.at(0)?.offsetTop;
  return Math.max(1, options.filter((option) => option.offsetTop === firstTop).length);
}

function targetIndex(key: string, index: number, options: readonly HTMLElement[]): number | null {
  const columns = key === "ArrowDown" || key === "ArrowUp" ? columnsOf(options) : 1;
  if (NEXT_KEYS.has(key)) {
    return Math.min(options.length - 1, index + columns);
  }
  if (PREVIOUS_KEYS.has(key)) {
    return Math.max(0, index - columns);
  }
  if (key === "Home") {
    return 0;
  }
  if (key === "End") {
    return options.length - 1;
  }
  return null;
}

/**
 * Arrow keys move focus between the options of a step, as in a list; Enter, Space or a click
 * picks one. Picking opens the next step, which is why these are buttons and not radios: a
 * radio is picked by the arrows themselves, and the first key press would skip ahead.
 */
export function moveChoiceFocus(event: KeyboardEvent<HTMLElement>): void {
  const group = event.currentTarget.closest("fieldset");
  if (group === null) {
    return;
  }
  const options = Array.from(group.querySelectorAll<HTMLElement>(":scope > button"));
  const index = options.findIndex((option) => option === document.activeElement);
  if (index < 0) {
    return;
  }
  const next = targetIndex(event.key, index, options);
  if (next === null) {
    return;
  }
  event.preventDefault();
  options.at(next)?.focus();
}
