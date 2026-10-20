import { useEffect, useState } from "react";
import { errorMessage } from "@/lib/errors";
import { supplierPanelSaveDraft } from "./catalog.functions";
import { AUTOSAVE_DELAY_MILLISECONDS, DraftAutosaver, type AutosaveState } from "./draft-autosaver";
import type { PanelFormValues } from "./draft-form";

export type { AutosaveState } from "./draft-autosaver";

type SaveResult = Awaited<ReturnType<typeof supplierPanelSaveDraft>>;
export type SavedProduct = Extract<SaveResult, { saved: true }>["product"];

interface AutosaveOptions {
  supplierId: string;
  productId: string;
  values: PanelFormValues;
  /** The stored product the form was opened with; null for a new one. */
  initial: SavedProduct | null;
  onSaved: (product: SavedProduct, sentStock: number) => void;
}

/** The server autosave of the step form (see `createDraftAutosaver`). */
export function useDraftAutosave({
  supplierId,
  productId,
  values,
  initial,
  onSaved,
}: AutosaveOptions) {
  const [state, setState] = useState<AutosaveState>({ kind: "idle" });
  const [autosaver] = useState(
    () =>
      new DraftAutosaver({
        base: { supplierId, productId },
        initialValues: values,
        initial,
        saveDraft: async (input) => await supplierPanelSaveDraft({ data: input }),
        onState: setState,
        describeError: errorMessage,
      }),
  );
  useEffect(() => {
    autosaver.setOnSaved(onSaved);
  }, [autosaver, onSaved]);
  useEffect(() => {
    autosaver.update(values);
    const timer = window.setTimeout(() => void autosaver.flush(), AUTOSAVE_DELAY_MILLISECONDS);
    return () => window.clearTimeout(timer);
  }, [autosaver, values]);
  return {
    state,
    retry: () => void autosaver.flush(),
    hasUnsavedChanges: (current = values) => autosaver.hasUnsavedChanges(current),
  };
}
