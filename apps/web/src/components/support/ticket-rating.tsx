import { StarIcon } from "@phosphor-icons/react";
import { MAX_RATING } from "@sellbridge/shared/ticket-rules";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { FormErrorAlert } from "@/components/form/form-feedback";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { rateMyTicket } from "@/features/support/support.functions";
import { errorMessage } from "@/lib/errors";
import { cn } from "@/lib/utils";

const RATING_WORDS: readonly string[] = ["", "Ruim", "Fraco", "Ok", "Bom", "Excelente"];
const STARS = Array.from({ length: MAX_RATING }, (_, index) => index + 1);

/** Read-only stars, for a rating already given. */
export function RatingStars({ rating, className }: { rating: number; className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-0.5", className)}>
      <span className="sr-only">{`${rating} de ${MAX_RATING} estrelas`}</span>
      {STARS.map((star) => (
        <StarIcon
          key={star}
          weight={star <= rating ? "fill" : "regular"}
          className={cn("size-4", star <= rating ? "text-amber-500" : "text-muted-foreground/40")}
          aria-hidden="true"
        />
      ))}
    </span>
  );
}

function StarPicker({ value, onChange }: { value: number; onChange: (rating: number) => void }) {
  return (
    <fieldset className="flex items-center gap-3">
      <legend className="sr-only">Nota de 1 a {MAX_RATING}</legend>
      <div className="flex gap-1">
        {STARS.map((star) => (
          <label
            key={star}
            className="cursor-pointer rounded-lg p-1 transition-[scale] duration-150 active:scale-90 has-[:focus-visible]:ring-3 has-[:focus-visible]:ring-ring/40 motion-reduce:active:scale-100"
          >
            <input
              type="radio"
              name="rating"
              value={star}
              checked={value === star}
              onChange={() => onChange(star)}
              className="sr-only"
              aria-label={`${star} ${star === 1 ? "estrela" : "estrelas"}: ${RATING_WORDS[star] ?? ""}`}
            />
            <StarIcon
              weight={star <= value ? "fill" : "regular"}
              className={cn(
                "size-7 transition-colors",
                star <= value ? "text-amber-500" : "text-muted-foreground/50",
              )}
              aria-hidden="true"
            />
          </label>
        ))}
      </div>
      {/* The radio's own label already says the word to screen readers. */}
      <span className="text-sm text-muted-foreground" aria-hidden="true">
        {RATING_WORDS[value] ?? ""}
      </span>
    </fieldset>
  );
}

/** After the ticket closes, the reseller rates the help once (1 to 5, optional comment). */
export function TicketRatingForm({ ticketId }: { ticketId: string }) {
  const queryClient = useQueryClient();
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState("");
  const mutation = useMutation({
    mutationFn: () =>
      rateMyTicket({
        data: { ticketId, rating, ...(comment.trim() ? { comment } : {}) },
      }),
    onSuccess: async () => {
      toast.success("Obrigado pela avaliação!");
      await queryClient.invalidateQueries({ queryKey: ["tickets"] });
    },
  });
  return (
    <section
      aria-labelledby="rating-title"
      className="surface-card space-y-4 rounded-3xl bg-card p-5"
    >
      <div className="space-y-1">
        <h2 id="rating-title" className="font-semibold">
          Como foi o atendimento?
        </h2>
        <p className="text-sm text-muted-foreground">Sua nota ajuda a equipe a melhorar.</p>
      </div>
      <StarPicker value={rating} onChange={setRating} />
      {rating > 0 ? (
        <Textarea
          aria-label="Comentário (opcional)"
          placeholder="Quer contar mais alguma coisa? (opcional)"
          rows={2}
          maxLength={1000}
          value={comment}
          onChange={(event) => setComment(event.target.value)}
        />
      ) : null}
      <FormErrorAlert message={mutation.isError ? errorMessage(mutation.error) : null} />
      <Button
        disabled={rating === 0 || mutation.isPending}
        aria-busy={mutation.isPending}
        onClick={() => mutation.mutate()}
      >
        {mutation.isPending ? "Enviando..." : "Enviar avaliação"}
      </Button>
    </section>
  );
}
