import {
  REVIEW_ASPECTS,
  REVIEW_COMMENT_MAX_LENGTH,
  isPraiseRating,
  REVIEW_TAG_LABELS,
  reviewTagSchema,
  tagsForRating,
  type ReviewAspect,
  type ReviewTag,
} from "@sellbridge/shared/schemas";
import {
  ChatsCircleIcon,
  CheckIcon,
  type Icon,
  PackageIcon,
  SealCheckIcon,
  TruckIcon,
} from "@phosphor-icons/react";
import { useId, useState } from "react";
import { StarInput } from "@/components/form/star-input";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useSaveReview } from "@/features/orders/use-save-review";
import { cn } from "@/lib/utils";

export interface ReviewTarget {
  orderId: string;
  externalOrderId: string;
  supplierId: string;
  supplierName: string;
  review: { rating: number; tags: string[]; comment: string } | null;
}

function knownTags(tags: readonly string[]): ReviewTag[] {
  return tags.flatMap((tag) => {
    const parsed = reviewTagSchema.safeParse(tag);
    return parsed.success ? [parsed.data] : [];
  });
}

/**
 * Each aspect keeps its icon and color on both sides, so praise and complaint read as the
 * same topic. `fill` paints the icon tile; `check` paints the selected check.
 */
const ASPECT_STYLES: Record<ReviewAspect, { icon: Icon; fill: string; check: string }> = {
  dispatch: { icon: TruckIcon, fill: "bg-sky-500", check: "border-sky-500 bg-sky-500" },
  conformity: {
    icon: SealCheckIcon,
    fill: "bg-violet-500",
    check: "border-violet-500 bg-violet-500",
  },
  packaging: { icon: PackageIcon, fill: "bg-amber-500", check: "border-amber-500 bg-amber-500" },
  support: { icon: ChatsCircleIcon, fill: "bg-rose-500", check: "border-rose-500 bg-rose-500" },
};

const TAG_HINTS: Record<ReviewTag, string> = {
  "dispatch:good": "Saiu dentro do combinado",
  "dispatch:bad": "Saiu depois do combinado",
  "conformity:good": "Igual às fotos e à descrição",
  "conformity:bad": "Não bate com as fotos ou a descrição",
  "packaging:good": "Protegido e bem embalado",
  "packaging:bad": "Produto danificado na entrega",
  "support:good": "Respondeu sem demora",
  "support:bad": "Sem retorno no tempo esperado",
};

/** Every tag is "aspect:verdict", so a tag without a known aspect is a bug, not a user error. */
function aspectOf(tag: ReviewTag): ReviewAspect {
  const aspect = REVIEW_ASPECTS.find((candidate) => tag.startsWith(`${candidate}:`));
  if (!aspect) {
    throw new Error(`Review tag without a known aspect: ${tag}`);
  }
  return aspect;
}

/** One row of a grouped list, Settings-style: colored icon tile, label, hint and a check. */
function TagOption({
  tag,
  isOn,
  isLast,
  onToggle,
}: {
  tag: ReviewTag;
  isOn: boolean;
  isLast: boolean;
  onToggle: (tag: ReviewTag) => void;
}) {
  const hintId = useId();
  const aspect = ASPECT_STYLES[aspectOf(tag)];
  const TagIcon = aspect.icon;
  return (
    <button
      type="button"
      aria-pressed={isOn}
      aria-describedby={hintId}
      onClick={() => onToggle(tag)}
      className={cn(
        "flex w-full items-center gap-3 pl-3.5 text-left transition-[background-color,transform] duration-150 ease-out outline-none focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:ring-inset active:scale-[0.99] motion-reduce:transition-none motion-reduce:active:scale-100",
        "disabled:cursor-not-allowed disabled:active:scale-100",
        isOn ? "bg-foreground/[0.06]" : "enabled:hover:bg-foreground/[0.04]",
      )}
    >
      <span
        className={cn(
          "flex size-8 shrink-0 items-center justify-center rounded-lg text-white",
          aspect.fill,
        )}
      >
        <TagIcon weight="fill" className="size-4.5" aria-hidden="true" />
      </span>
      <span
        className={cn(
          "flex min-h-14 flex-1 items-center gap-3 py-2 pr-3.5",
          isLast ? null : "border-b border-border/70",
        )}
      >
        <span className="flex-1">
          <span className="block text-sm font-medium tracking-[-0.01em] text-foreground">
            {REVIEW_TAG_LABELS[tag]}
          </span>
          <span id={hintId} className="block text-xs text-muted-foreground">
            {TAG_HINTS[tag]}
          </span>
        </span>
        <span
          className={cn(
            "flex size-5.5 shrink-0 items-center justify-center rounded-full border-[1.5px] transition-[background-color,border-color] duration-150 ease-out motion-reduce:transition-none",
            isOn ? cn(aspect.check, "text-white") : "border-foreground/25 text-transparent",
          )}
        >
          <CheckIcon weight="bold" className="size-3" aria-hidden="true" />
        </span>
      </span>
    </button>
  );
}

/**
 * Always on screen, even before the rating: showing it only after the first star made the
 * centered dialog grow and jump, pulling the stars out from under the pointer. Until a
 * rating exists it previews the praise list, muted and inert.
 */
function TagPicker({
  rating,
  selected,
  onToggle,
}: {
  rating: number;
  selected: readonly ReviewTag[];
  onToggle: (tag: ReviewTag) => void;
}) {
  const isRated = rating > 0;
  const isPraise = !isRated || isPraiseRating(rating);
  return (
    <fieldset disabled={!isRated} className="group/tags space-y-2.5">
      <legend className="space-y-0.5">
        <span className="block text-sm font-medium">
          {isPraise ? "O que se destacou?" : "O que precisa melhorar?"}
        </span>
        <span className="block text-xs text-muted-foreground">
          {isRated ? "Opcional · marque quantos quiser" : "Dê a nota para marcar"}
        </span>
      </legend>
      <div className="overflow-hidden rounded-xl bg-muted/60 transition-opacity duration-200 ease-out group-disabled/tags:opacity-45 motion-reduce:transition-none">
        {tagsForRating(isRated ? rating : 5).map((tag, index, tags) => (
          <TagOption
            key={tag}
            tag={tag}
            isOn={selected.includes(tag)}
            isLast={index === tags.length - 1}
            onToggle={onToggle}
          />
        ))}
      </div>
    </fieldset>
  );
}

function CommentField({ value, onChange }: { value: string; onChange: (comment: string) => void }) {
  return (
    <div className="space-y-2">
      <Label htmlFor="review-comment">Comentário (opcional)</Label>
      <Textarea
        id="review-comment"
        value={value}
        maxLength={REVIEW_COMMENT_MAX_LENGTH}
        placeholder="Ajuda outros revendedores: prazo, qualidade, atendimento…"
        aria-describedby="review-comment-hint"
        onChange={(event) => onChange(event.target.value)}
      />
      <p id="review-comment-hint" className="text-xs text-muted-foreground">
        Aparece sem o nome da sua loja. {value.length}/{REVIEW_COMMENT_MAX_LENGTH}
      </p>
    </div>
  );
}

function ReviewForm({ target, onDone }: { target: ReviewTarget; onDone: () => void }) {
  const [rating, setRating] = useState(target.review?.rating ?? 0);
  const [tags, setTags] = useState<ReviewTag[]>(knownTags(target.review?.tags ?? []));
  const [comment, setComment] = useState(target.review?.comment ?? "");
  const [showRatingError, setShowRatingError] = useState(false);
  const mutation = useSaveReview(onDone);

  function changeRating(next: number) {
    setRating(next);
    setShowRatingError(false);
    // Praise and complaint tags never mix: switching sides drops the other side's tags.
    setTags((current) => current.filter((tag) => tagsForRating(next).includes(tag)));
  }

  function toggleTag(tag: ReviewTag) {
    setTags((current) =>
      current.includes(tag) ? current.filter((item) => item !== tag) : [...current, tag],
    );
  }

  return (
    <form
      noValidate
      className="space-y-5"
      onSubmit={(event) => {
        event.preventDefault();
        if (rating === 0) {
          setShowRatingError(true);
          return;
        }
        mutation.mutate({
          orderId: target.orderId,
          supplierId: target.supplierId,
          rating,
          tags,
          comment,
        });
      }}
    >
      <div>
        <StarInput legend="Nota do fornecedor" value={rating} onChange={changeRating} />
        {showRatingError ? (
          <p className="text-xs text-destructive">Escolha de 1 a 5 estrelas.</p>
        ) : null}
      </div>
      <TagPicker rating={rating} selected={tags} onToggle={toggleTag} />
      <CommentField value={comment} onChange={setComment} />
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onDone}>
          Agora não
        </Button>
        <Button type="submit" disabled={mutation.isPending}>
          {mutation.isPending ? "Enviando..." : "Enviar avaliação"}
        </Button>
      </DialogFooter>
    </form>
  );
}

/** Rates how the supplier handled one delivered order; reopening it edits the review. */
export function ReviewDialog({
  target,
  onOpenChange,
}: {
  target: ReviewTarget | null;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Dialog open={target !== null} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Como foi o fornecedor neste pedido?</DialogTitle>
          <DialogDescription>
            {target ? `${target.supplierName} · pedido ${target.externalOrderId}` : null}
          </DialogDescription>
        </DialogHeader>
        {target ? (
          <ReviewForm
            key={`${target.orderId}:${target.supplierId}`}
            target={target}
            onDone={() => onOpenChange(false)}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
