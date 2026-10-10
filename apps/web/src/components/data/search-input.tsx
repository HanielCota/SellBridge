import { MagnifyingGlassIcon } from "@phosphor-icons/react";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";

/** Text box with a magnifying glass, used by the search filters above lists. */
export function SearchInput({
  label,
  placeholder,
  value,
  onValueChange,
  className,
  iconClassName,
  inputClassName,
}: {
  label: string;
  placeholder: string;
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
        aria-label={label}
        placeholder={placeholder}
        className={cn("pl-9", inputClassName)}
        value={value}
        onChange={(event) => onValueChange(event.target.value)}
      />
    </div>
  );
}
