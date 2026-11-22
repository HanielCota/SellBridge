import { toast } from "sonner";
import { FormErrorAlert } from "@/components/form/form-feedback";
import {
  withColorAdded,
  withColorRemoved,
  withColorRenamed,
  withCombinationChanged,
  withCombinationsFilled,
  withCombinationToggled,
  withSizeRemoved,
  withSizeRenamed,
  withSizesAdded,
  withOptionRestored,
  type GridFormState,
  type RemovedOption,
} from "@/features/supplier-panel/catalog/grid/grid-form-state";
import { GridCombinations } from "./grid-combinations";
import { GridFillForm } from "./grid-fill-form";
import { GridOptionList, type OptionShortcut } from "./grid-option-list";

const COLOR_SHORTCUTS: readonly OptionShortcut[] = [
  "Preto",
  "Branco",
  "Azul",
  "Vermelho",
  "Rosa",
  "Bege",
  "Cinza",
  "Marrom",
].map((name) => ({ label: name, names: [name] }));

const SMALLEST_SHOE_SIZE = 34;
const LARGEST_SHOE_SIZE = 44;
const SHOE_SIZES = Array.from({ length: LARGEST_SHOE_SIZE - SMALLEST_SHOE_SIZE + 1 }, (_, index) =>
  String(SMALLEST_SHOE_SIZE + index),
);

const SIZE_SHORTCUTS: readonly OptionShortcut[] = [
  { label: "Calçados: 34 a 44", names: SHOE_SIZES },
  { label: "Roupas: PP a GG", names: ["PP", "P", "M", "G", "GG"] },
  { label: "P, M e G", names: ["P", "M", "G"] },
  { label: "Tamanho único", names: ["Único"] },
];

type ChangeGrid = (update: (grid: GridFormState) => GridFormState) => void;

/**
 * Removing a colour or size takes its combinations along, so it can be undone for a while.
 * Undoing puts back only that option and its combinations: what was typed since stays.
 */
function removeWithUndo(
  grid: GridFormState,
  changeGrid: ChangeGrid,
  removal: { name: string; axis: RemovedOption["axis"]; key: string },
) {
  const after =
    removal.axis === "color"
      ? withColorRemoved(grid, removal.key)
      : withSizeRemoved(grid, removal.key);
  const gone = grid.combinations.length - after.combinations.length;
  const removed: RemovedOption = { axis: removal.axis, key: removal.key, before: grid };
  changeGrid(() => after);
  toast(
    gone === 0
      ? `${removal.name} saiu da grade`
      : `${removal.name} saiu da grade com ${gone === 1 ? "1 combinação" : `${gone} combinações`}`,
    {
      action: {
        label: "Desfazer",
        onClick: () => changeGrid((current) => withOptionRestored(current, removed)),
      },
    },
  );
}

function newKeys(names: readonly string[]) {
  return names.map((name) => ({ name, key: crypto.randomUUID() }));
}

interface ListProps {
  grid: GridFormState;
  errors: Readonly<Record<string, string>>;
  changeGrid: ChangeGrid;
}

function ColorList({ grid, errors, changeGrid }: ListProps) {
  return (
    <GridOptionList
      id="grid-colors"
      words={{
        noun: "cor",
        title: "Cores",
        description: "Cada cor pode ter as próprias fotos, na etapa Imagens.",
        placeholder: "Exemplo: Preto",
        addLabel: "Nova cor",
      }}
      options={grid.colors}
      shortcuts={COLOR_SHORTCUTS}
      errors={errors}
      errorKeyOf={(key) => `grid.color.${key}`}
      onAdd={(names) =>
        changeGrid((current) =>
          newKeys(names).reduce(
            (next, entry) => withColorAdded(next, entry.name, entry.key),
            current,
          ),
        )
      }
      onRename={(key, name) => changeGrid((current) => withColorRenamed(current, key, name))}
      onRemove={(key) =>
        removeWithUndo(grid, changeGrid, {
          name: grid.colors.find((color) => color.key === key)?.name ?? "A cor",
          axis: "color",
          key,
        })
      }
    />
  );
}

function SizeList({ grid, errors, changeGrid }: ListProps) {
  return (
    <GridOptionList
      id="grid-sizes"
      words={{
        noun: "tamanho",
        title: "Tamanhos",
        description:
          "Ficam em ordem sozinhos: 34, 35… ou PP, P, M, G. Dá para digitar vários: 38, 39, 40.",
        placeholder: "Exemplo: 38",
        addLabel: "Novo tamanho",
      }}
      options={grid.sizes}
      shortcuts={SIZE_SHORTCUTS}
      errors={errors}
      errorKeyOf={(key) => `grid.size.${key}`}
      onAdd={(names) => changeGrid((current) => withSizesAdded(current, newKeys(names)))}
      onRename={(key, name) => changeGrid((current) => withSizeRenamed(current, key, name))}
      onRemove={(key) =>
        removeWithUndo(grid, changeGrid, {
          name: `O tamanho ${grid.sizes.find((size) => size.key === key)?.name ?? ""}`.trim(),
          axis: "size",
          key,
        })
      }
    />
  );
}

/**
 * The grid step: the colours and the sizes, "Preencher todas" for what every combination shares,
 * then each combination with its own SKU, stock, cost, price and barcode.
 */
export function GridOptionsStep({ grid, errors, changeGrid }: ListProps) {
  return (
    <div className="grid gap-8">
      <ColorList grid={grid} errors={errors} changeGrid={changeGrid} />
      <SizeList grid={grid} errors={errors} changeGrid={changeGrid} />
      {grid.combinations.length === 0 ? null : (
        <GridFillForm
          combinationCount={grid.combinations.length}
          onFill={(fill) => changeGrid((current) => withCombinationsFilled(current, fill))}
        />
      )}
      <FormErrorAlert message={errors.grid ?? null} />
      <GridCombinations
        grid={grid}
        errors={errors}
        onToggle={(pair, sold) =>
          changeGrid((current) => withCombinationToggled(current, pair, sold))
        }
        onChange={(pair, change) =>
          changeGrid((current) => withCombinationChanged(current, pair, change))
        }
      />
    </div>
  );
}
