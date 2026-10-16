import { MagnifyingGlassIcon } from "@phosphor-icons/react";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { MAX_SEARCH_LENGTH } from "@sellbridge/shared/schemas";

/** Text box with a magnifying glass, used by the search filters above lists. */
export function SearchInput({
  label,
  placeholder,
  // The lists cut a search at this length; stopping the typing here keeps the box and the
  // filter in agreement.
  maxLength = MAX_SEARCH_LENGTH,
  value,
  onValueChange,
  className,
  iconClassName,
  inputClassName,
}: {
  label: string;
  placeholder: string;
  maxLength?: number;
  value: string;
  onValueChange: (value: string) => void;
  className?: string;
  iconClassName?: string;
  inputClassName?: string;
}) {
  return (
    <div className={cn("relative", className)}>
      <MagnifyingGlassIcon
        className={cn(
          "pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground",
          iconClassName,
        )}
        aria-hidden="true"
      />
      <Input
        type="search"
        autoComplete="off"
        aria-label={label}
        placeholder={placeholder}
        maxLength={maxLength}
        className={cn("pl-9", inputClassName)}
        value={value}
        onChange={(event) => onValueChange(event.target.value)}
      />
    </div>
  );
}
