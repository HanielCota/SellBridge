import { StarIcon } from "@phosphor-icons/react";
import { useState } from "react";
import { cn } from "@/lib/utils";

export const RATING_LABELS = ["Péssimo", "Ruim", "Regular", "Bom", "Excelente"] as const;

/**
 * Five native radios drawn as stars, so arrow keys and screen readers work as usual;
 * hovering previews the rating before the click. Shared by supplier reviews and support
 * ratings, so every 1–5 rating in the app looks and feels the same.
 */
export function StarInput({
  value,
  onChange,
  legend,
  name = "rating",
}: {
  value: number;
  onChange: (rating: number) => void;
  /** What is being rated, for screen readers ("Nota do fornecedor"). */
  legend: string;
  name?: string;
}) {
  const [hovered, setHovered] = useState(0);
  const shown = hovered || value;
  return (
    <fieldset className="space-y-1.5">
      <legend className="sr-only">{legend}</legend>
      <div className="flex gap-1" onPointerLeave={() => setHovered(0)}>
        {RATING_LABELS.map((label, index) => {
          const rating = index + 1;
          return (
            <label
              key={label}
              className="relative cursor-pointer rounded-lg p-1 transition-transform duration-100 ease-out has-focus-visible:ring-3 has-focus-visible:ring-ring/50 active:scale-90 motion-reduce:transition-none"
              onPointerEnter={() => setHovered(rating)}
            >
              <input
                type="radio"
                name={name}
                value={rating}
                checked={value === rating}
                onChange={() => onChange(rating)}
                // Transparent over the whole star, so the click lands on the native radio.
                className="absolute inset-0 cursor-pointer appearance-none opacity-0"
              />
              <span className="sr-only">
                {rating} {rating === 1 ? "estrela" : "estrelas"}: {label}
              </span>
              <StarIcon
                weight={rating <= shown ? "fill" : "regular"}
                className={cn("size-8", rating <= shown ? "text-amber-500" : "text-amber-500/70")}
                aria-hidden="true"
              />
            </label>
          );
        })}
      </div>
      <p className="h-5 text-sm text-muted-foreground" aria-hidden="true">
        {shown > 0 ? RATING_LABELS[shown - 1] : "Toque nas estrelas para dar a nota"}
      </p>
    </fieldset>
  );
}
