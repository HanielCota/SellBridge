import { BRAZILIAN_STATE_CAPITALS, parseState } from "@sellbridge/shared/brazilian-states";
import { useQuery } from "@tanstack/react-query";
import { type KeyboardEvent, useState } from "react";
import { FloatingTextField } from "@/components/form/floating-field";
import { stateCitiesQueryOptions } from "@/features/cities/cities.queries";
import { suggestCities } from "@/features/cities/city-suggestions";
import { cn } from "@/lib/utils";

interface FloatingCityFieldProps {
  id: string;
  label: string;
  value: string;
  /** The state picked beside it; its cities become the suggestions. */
  state: string;
  errors: readonly unknown[];
  onValueChange: (value: string) => void;
  onBlur: () => void;
}

/** The open list's keyboard: arrows move, Enter picks, Escape closes. */
function useSuggestionKeys(suggestions: readonly string[], pick: (city: string) => void) {
  const [activeIndex, setActiveIndex] = useState(-1);
  function moveBy(step: number) {
    const count = suggestions.length;
    setActiveIndex((index) => {
      if (index < 0) {
        return step > 0 ? 0 : count - 1;
      }
      return (index + step + count) % count;
    });
  }
  function onKeyDown(event: KeyboardEvent<HTMLInputElement>, close: () => void) {
    if (suggestions.length === 0) {
      return;
    }
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      moveBy(event.key === "ArrowDown" ? 1 : -1);
      return;
    }
    const active = suggestions[activeIndex];
    if (event.key === "Enter" && active !== undefined) {
      event.preventDefault();
      pick(active);
      return;
    }
    if (event.key === "Escape") {
      close();
    }
  }
  return { activeIndex, setActiveIndex, onKeyDown };
}

function CitySuggestions({
  listId,
  suggestions,
  activeIndex,
  capital,
  onPick,
}: {
  listId: string;
  suggestions: readonly string[];
  activeIndex: number;
  capital: string | null;
  onPick: (city: string) => void;
}) {
  return (
    <div
      id={listId}
      // oxlint-disable-next-line jsx-a11y/prefer-tag-over-role -- a native <datalist> is drawn by the OS and cannot match the form; this is the WAI-ARIA combobox list
      role="listbox"
      aria-label="Cidades sugeridas"
      className="absolute top-[3.75rem] right-0 left-0 z-50 origin-top animate-in overflow-y-auto rounded-xl border border-field-border bg-popover p-1 text-popover-foreground shadow-xl shadow-black/10 duration-100 fade-in-0 zoom-in-95"
    >
      {suggestions.map((city, index) => (
        // oxlint-disable-next-line jsx-a11y/click-events-have-key-events -- the input owns the keys (arrows, Enter), as the combobox pattern asks
        <div
          key={city}
          id={`${listId}-${index}`}
          // oxlint-disable-next-line jsx-a11y/prefer-tag-over-role -- an <option> only lives inside a native select or datalist
          role="option"
          tabIndex={-1}
          aria-selected={index === activeIndex}
          // Keeps focus in the input, so the pick lands before the field blurs.
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => onPick(city)}
          className={cn(
            "flex cursor-default items-center justify-between gap-2 rounded-lg px-2.5 py-2 text-sm text-foreground transition-[background-color] duration-100 select-none hover:row-lift",
            index === activeIndex ? "row-lift" : null,
          )}
        >
          <span className="truncate">{city}</span>
          {city === capital ? (
            <span className="shrink-0 text-xs text-muted-foreground">Capital</span>
          ) : null}
        </div>
      ))}
    </div>
  );
}

/**
 * Whether the list is open and which cities it shows. Closing forgets the highlighted row, so a
 * reopened list does not pick a stale city on Enter.
 */
function useCityList(
  cities: readonly string[],
  typed: string,
  capital: string | null,
  onPick: (city: string) => void,
) {
  const [isOpen, setIsOpen] = useState(false);
  const suggestions = isOpen ? suggestCities(cities, typed, capital) : [];
  const keys = useSuggestionKeys(suggestions, pick);
  function open() {
    keys.setActiveIndex(-1);
    setIsOpen(true);
  }
  function close() {
    setIsOpen(false);
    keys.setActiveIndex(-1);
  }
  function pick(city: string) {
    onPick(city);
    close();
  }
  return { suggestions, keys, open, close, pick };
}

/**
 * The city, typed freely, with the chosen state's cities suggested under it (capital first,
 * accents optional). Without a state, or while IBGE is out, it is a plain text field.
 */
export function FloatingCityField({
  id,
  label,
  value,
  state,
  errors,
  onValueChange,
  onBlur,
}: FloatingCityFieldProps) {
  const chosen = parseState(state);
  const cities = useQuery(stateCitiesQueryOptions(chosen)).data ?? [];
  const capital = chosen === null ? null : BRAZILIAN_STATE_CAPITALS[chosen];
  const { suggestions, keys, open, close, pick } = useCityList(
    cities,
    value,
    capital,
    onValueChange,
  );
  const listId = `${id}-suggestions`;
  const isListShown = suggestions.length > 0;
  const activeId =
    isListShown && keys.activeIndex >= 0 ? `${listId}-${keys.activeIndex}` : undefined;
  return (
    <div className="relative">
      <FloatingTextField
        id={id}
        label={label}
        autoComplete="address-level2"
        // oxlint-disable-next-line jsx-a11y/prefer-tag-over-role -- a typed field with suggestions is the WAI-ARIA combobox
        role="combobox"
        aria-expanded={isListShown}
        aria-controls={isListShown ? listId : undefined}
        aria-autocomplete="list"
        aria-activedescendant={activeId}
        value={value}
        errors={errors}
        onFocus={open}
        onBlur={() => {
          close();
          onBlur();
        }}
        onKeyDown={(event) => keys.onKeyDown(event, close)}
        onValueChange={(next) => {
          onValueChange(next);
          open();
        }}
      />
      {isListShown ? (
        <CitySuggestions
          listId={listId}
          suggestions={suggestions}
          activeIndex={keys.activeIndex}
          capital={capital}
          onPick={pick}
        />
      ) : null}
    </div>
  );
}
