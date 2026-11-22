/** The grid form's steps, in order: colours and sizes get a step of their own. */
export const GRID_FORM_STEPS = [
  { id: "category", label: "Categoria" },
  { id: "details", label: "Dados do produto" },
  { id: "options", label: "Cores e tamanhos" },
  { id: "images", label: "Imagens" },
  { id: "review", label: "Revisão" },
] as const;

export type GridFormStepId = (typeof GRID_FORM_STEPS)[number]["id"];

/** Asked per combination in a grid, so their issues point at the colours and sizes step. */
const COMBINATION_FIELDS: ReadonlySet<string> = new Set(["sku", "costCents", "stock", "grid"]);

/** The step that shows a field, so "Corrigir" and the step tabs land on the right one. */
export function gridStepOfField(field: string): GridFormStepId {
  if (field === "categoryId") {
    return "category";
  }
  if (field === "imageUrls" || field.startsWith("photos.")) {
    return "images";
  }
  if (COMBINATION_FIELDS.has(field) || field.startsWith("grid.")) {
    return "options";
  }
  return "details";
}
