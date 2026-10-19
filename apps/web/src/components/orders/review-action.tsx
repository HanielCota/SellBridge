import { PencilSimpleIcon, StarIcon } from "@phosphor-icons/react";
import { useEffect, useRef } from "react";
import { CONTROL_HINTS } from "@/components/icons/action-icons";
import { Button } from "@/components/ui/button";
import { Hint } from "@/components/ui/hint";
import type { ReviewTarget } from "./review-dialog";

/**
 * Once a rating is saved, "Avaliar" (where the dialog returned focus) is replaced by the stars and
 * the edit button, and focus would fall to the page's top. It moves to the edit button instead,
 * only when nothing else holds it.
 */
function useFocusAfterRating(rated: boolean) {
  const editButton = useRef<HTMLButtonElement>(null);
  const wasRated = useRef(rated);
  useEffect(() => {
    const justRated = rated && !wasRated.current;
    wasRated.current = rated;
    if (justRated && document.activeElement === document.body) editButton.current?.focus();
  }, [rated]);
  return editButton;
}

/**
 * A supplier's review of one order: the rating, editable while the window is open, or the call to
 * rate it. The reviews tab and the order page use it alike.
 */
export function ReviewAction({
  target,
  canReview,
  onReview,
}: {
  target: ReviewTarget;
  canReview: boolean;
  onReview: (target: ReviewTarget) => void;
}) {
  const editButton = useFocusAfterRating(Boolean(target.review));
  if (target.review) {
    return (
      <div className="flex items-center gap-1">
        <span className="inline-flex items-center gap-1 text-sm font-medium tabular-nums">
          <StarIcon weight="fill" className="size-4 text-amber-500" aria-hidden="true" />
          <span aria-hidden="true">{target.review.rating}</span>
          <span className="sr-only">Sua nota: {target.review.rating} de 5</span>
        </span>
        {canReview ? (
          <Hint label={CONTROL_HINTS.editReview} openOnTap={false}>
            <Button
              ref={editButton}
              variant="ghost"
              size="sm"
              aria-label={`Editar avaliação de ${target.supplierName}`}
              className="text-muted-foreground hover:text-foreground"
              onClick={() => onReview(target)}
            >
              <PencilSimpleIcon aria-hidden="true" />
              <span aria-hidden="true">Editar</span>
            </Button>
          </Hint>
        ) : null}
      </div>
    );
  }
  if (!canReview) {
    return null;
  }
  return (
    <Hint label={CONTROL_HINTS.rateSupplier} openOnTap={false}>
      <Button
        size="sm"
        variant="outline"
        className="group/rate border-amber-500/30 bg-amber-500/[0.06] hover:border-amber-500/50 hover:bg-amber-500/15 group-hover/row:border-amber-500/45"
        onClick={() => onReview(target)}
      >
        <span className="relative size-4" aria-hidden="true">
          <StarIcon className="absolute inset-0 size-4 text-amber-500 transition-opacity duration-150 group-hover/rate:opacity-0" />
          {/* The filled star swings in with a little overshoot, like it just got picked. */}
          <StarIcon
            weight="fill"
            className="absolute inset-0 size-4 scale-50 text-amber-500 opacity-0 drop-shadow-[0_0_6px_rgb(245_158_11/0.6)] transition-[opacity,scale,rotate] duration-300 ease-[cubic-bezier(0.34,1.56,0.64,1)] group-hover/rate:scale-115 group-hover/rate:-rotate-[18deg] group-hover/rate:opacity-100 motion-reduce:transition-opacity motion-reduce:group-hover/rate:scale-100 motion-reduce:group-hover/rate:rotate-0"
          />
        </span>
        Avaliar
      </Button>
    </Hint>
  );
}
