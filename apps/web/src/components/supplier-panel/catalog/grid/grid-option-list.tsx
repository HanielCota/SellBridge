import { PlusIcon, TrashIcon } from "@phosphor-icons/react";
import { MAX_GRID_OPTION_LENGTH } from "@sellbridge/shared/product-grid";
import { useState, type FormEvent } from "react";
import { InlineFormError } from "@/components/form/inline-form-error";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { sameOptionName } from "@/features/supplier-panel/catalog/grid/grid-form-state";

export interface OptionShortcut {
  readonly label: string;
  readonly names: readonly string[];
}

interface OptionWords {
  /** "cor" or "tamanho", as the messages use it. */
  readonly noun: string;
  readonly title: string;
  readonly description: string;
  readonly placeholder: string;
  readonly addLabel: string;
}

interface GridOptionListProps {
  readonly id: string;
  readonly words: OptionWords;
  readonly options: readonly { key: string; name: string }[];
  readonly shortcuts: readonly OptionShortcut[];
  readonly errors: Readonly<Record<string, string>>;
  readonly errorKeyOf: (key: string) => string;
  readonly onAdd: (names: readonly string[]) => void;
  readonly onRename: (key: string, name: string) => void;
  readonly onRemove: (key: string) => void;
}

/** "38, 39, 40" adds three at once; blanks and repeats are dropped. */
function typedNames(text: string): string[] {
  return text
    .split(",")
    .map((name) => name.trim())
    .filter((name) => name !== "");
}

function addProblem(
  names: readonly string[],
  options: readonly { name: string }[],
  noun: string,
): string | null {
  if (names.length === 0) {
    return `Digite o nome da ${noun === "cor" ? "cor" : "medida"}. Exemplo: ${noun === "cor" ? "Preto" : "38"}`;
  }
  const tooLong = names.find((name) => name.length > MAX_GRID_OPTION_LENGTH);
  if (tooLong !== undefined) {
    return `Use até ${MAX_GRID_OPTION_LENGTH} letras (recebido: ${tooLong.length})`;
  }
  const repeated = names.find((name) =>
    options.some((option) => sameOptionName(option.name, name)),
  );
  return repeated === undefined ? null : `"${repeated}" já está na grade`;
}

function AddOptionForm({
  id,
  words,
  options,
  onAdd,
}: Pick<GridOptionListProps, "id" | "words" | "options" | "onAdd">) {
  const [text, setText] = useState("");
  const [problem, setProblem] = useState<string | null>(null);
  function add(event: FormEvent) {
    event.preventDefault();
    const names = typedNames(text);
    const found = addProblem(names, options, words.noun);
    setProblem(found);
    if (found !== null) {
      return;
    }
    setText("");
    onAdd(names);
  }
  return (
    <form className="grid gap-2" onSubmit={add} noValidate>
      <Label htmlFor={`${id}-new`}>{words.addLabel}</Label>
      <div className="flex gap-2">
        <Input
          id={`${id}-new`}
          value={text}
          onChange={(event) => setText(event.target.value)}
          placeholder={words.placeholder}
          autoComplete="off"
          aria-invalid={problem === null ? undefined : true}
        />
        <Button type="submit" variant="secondary">
          <PlusIcon aria-hidden="true" />
          Adicionar
        </Button>
      </div>
      <InlineFormError message={problem} />
    </form>
  );
}

function Shortcuts({
  shortcuts,
  options,
  onAdd,
}: Pick<GridOptionListProps, "shortcuts" | "options" | "onAdd">) {
  const open = shortcuts.filter((shortcut) =>
    shortcut.names.some((name) => !options.some((option) => sameOptionName(option.name, name))),
  );
  if (open.length === 0) {
    return null;
  }
  return (
    <div className="flex flex-wrap gap-2">
      {open.map((shortcut) => (
        <Button
          key={shortcut.label}
          type="button"
          variant="outline"
          size="sm"
          onClick={() =>
            onAdd(
              shortcut.names.filter(
                (name) => !options.some((option) => sameOptionName(option.name, name)),
              ),
            )
          }
        >
          <PlusIcon aria-hidden="true" />
          {shortcut.label}
        </Button>
      ))}
    </div>
  );
}

/**
 * The colours or the sizes of a grid: renamed in place (the combinations follow), removed with
 * their combinations, added one by one, several at once ("38, 39, 40") or by a shortcut.
 */
export function GridOptionList(props: GridOptionListProps) {
  const { id, words, options, errors, errorKeyOf, onRename, onRemove } = props;
  return (
    <section aria-labelledby={`${id}-title`} className="grid gap-4">
      <div className="space-y-1">
        <h3 id={`${id}-title`} className="text-subhead font-semibold">
          {words.title}
        </h3>
        <p className="text-footnote text-muted-foreground">{words.description}</p>
      </div>
      {options.length === 0 ? null : (
        <ul className="grid gap-2 sm:grid-cols-2">
          {options.map((option, index) => {
            const error = errors[errorKeyOf(option.key)] ?? null;
            const inputId = `${id}-${index}`;
            return (
              <li key={option.key} className="grid gap-1">
                <Label htmlFor={inputId} className="sr-only">
                  {`Nome da ${words.noun} ${index + 1}`}
                </Label>
                <div className="flex gap-2">
                  <Input
                    id={inputId}
                    value={option.name}
                    maxLength={MAX_GRID_OPTION_LENGTH}
                    onChange={(event) => onRename(option.key, event.target.value)}
                    aria-invalid={error === null ? undefined : true}
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={() => onRemove(option.key)}
                    aria-label={`Remover ${option.name} e as combinações dela`}
                  >
                    <TrashIcon aria-hidden="true" />
                  </Button>
                </div>
                <InlineFormError message={error} />
              </li>
            );
          })}
        </ul>
      )}
      <AddOptionForm {...props} />
      <Shortcuts {...props} />
    </section>
  );
}
