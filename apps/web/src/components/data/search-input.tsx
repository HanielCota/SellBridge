import { MagnifyingGlassIcon, XIcon } from "@phosphor-icons/react";
import { useRef } from "react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { MAX_SEARCH_LENGTH } from "@sellbridge/shared/schemas";

/**
 * Text box with a magnifying glass, used by the search filters above lists. The browser's own
 * clear button is hidden (native-controls.css), so a typed search gets this one instead.
 */
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
  const inputRef = useRef<HTMLInputElement>(null);
  const clear = () => {
    onValueChange("");
    inputRef.current?.focus();
  };
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
        ref={inputRef}
        type="search"
        autoComplete="off"
        aria-label={label}
        placeholder={placeholder}
        maxLength={maxLength}
        className={cn("pr-9 pl-9", inputClassName)}
        value={value}
        onChange={(event) => onValueChange(event.target.value)}
      />
      {value === "" ? null : (
        <Button
          type="button"
          variant="ghost"
          size="icon-xs"
          aria-label="Limpar busca"
          className="absolute top-1/2 right-1.5 -translate-y-1/2 rounded-full text-muted-foreground"
          onClick={clear}
        >
          <XIcon weight="bold" aria-hidden="true" />
        </Button>
      )}
    </div>
  );
}
