import { inputIdOf } from "@/features/supplier-panel/catalog/draft-form";
import type { PanelFormValues } from "@/features/supplier-panel/catalog/draft-form";
import {
  withColorPhotos,
  type GridFormState,
} from "@/features/supplier-panel/catalog/grid/grid-form-state";
import { ProductImages } from "../step-images";

function ColorPhotos({
  supplierId,
  grid,
  changeGrid,
}: {
  supplierId: string;
  grid: GridFormState;
  changeGrid: (update: (grid: GridFormState) => GridFormState) => void;
}) {
  if (grid.colors.length === 0) {
    return null;
  }
  return (
    <section aria-labelledby="grid-color-photos-title" className="grid gap-6">
      <div className="space-y-1">
        <h3 id="grid-color-photos-title" className="text-subhead font-semibold">
          Fotos de cada cor (opcional)
        </h3>
        <p className="text-footnote text-muted-foreground">
          Quem escolher a cor no anúncio vê as fotos dela. Uma cor sem fotos usa as fotos do
          produto.
        </p>
      </div>
      {grid.colors.map((color, index) => (
        <div key={color.key} className="grid gap-3">
          <h4 className="text-sm font-semibold">{color.name}</h4>
          <ProductImages
            supplierId={supplierId}
            images={color.imageUrls}
            inputId={`grid-color-${index}-photo`}
            label={`Fotos da cor ${color.name}`}
            onChange={(imageUrls) =>
              changeGrid((current) => withColorPhotos(current, color.key, imageUrls))
            }
          />
        </div>
      ))}
    </section>
  );
}

/**
 * The product's photos, shown in every colour, then each colour's own (optional): a buyer who
 * picks a colour sees its photos, and a colour without any shows the product's.
 */
export function GridPhotosStep({
  supplierId,
  values,
  errors,
  grid,
  onChange,
  changeGrid,
}: {
  supplierId: string;
  values: PanelFormValues;
  errors: Readonly<Record<string, string>>;
  grid: GridFormState;
  onChange: (change: Partial<PanelFormValues>) => void;
  changeGrid: (update: (grid: GridFormState) => GridFormState) => void;
}) {
  return (
    <div className="grid gap-8">
      <section aria-labelledby="grid-photos-title" className="grid gap-4">
        <div className="space-y-1">
          <h3 id="grid-photos-title" className="text-subhead font-semibold">
            Fotos do produto
          </h3>
          <p className="text-footnote text-muted-foreground">
            Aparecem em todas as cores. A primeira é a capa do anúncio.
          </p>
        </div>
        <ProductImages
          supplierId={supplierId}
          images={values.imageUrls}
          inputId={inputIdOf("imageUrls")}
          label="Fotos do produto"
          serverError={errors.imageUrls}
          onChange={(imageUrls) => onChange({ imageUrls })}
        />
      </section>
      <ColorPhotos supplierId={supplierId} grid={grid} changeGrid={changeGrid} />
    </div>
  );
}
