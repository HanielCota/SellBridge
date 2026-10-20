import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState, type Dispatch, type SetStateAction } from "react";
import {
  requiredAttributesFor,
  evaluateCompleteness,
} from "@sellbridge/shared/supplier-panel-catalog-completeness";
import {
  DraftAutosaver,
  AUTOSAVE_DELAY_MILLISECONDS,
  type AutosaveState,
} from "@/features/supplier-panel/catalog/draft-autosaver";
import {
  completenessInput,
  panelFormValues,
  type PanelFormValues,
} from "@/features/supplier-panel/catalog/draft-form";
import { useUnsavedChanges } from "@/hooks/use-unsaved-changes";
import { errorMessage } from "@/lib/errors";
import {
  adminSaveSellerProductFn,
  sellerSaveProductFn,
  sellerProductFormFn,
} from "./products.functions";

export type SellerProductFormData = Awaited<ReturnType<typeof sellerProductFormFn>>;
interface EditorOptions {
  data: SellerProductFormData;
  productId: string;
  adminTenantId?: string | undefined;
  busy?: boolean | undefined;
}

function useLiveValue<TValue>(value: TValue) {
  const reference = useRef(value);
  useEffect(() => {
    reference.current = value;
  }, [value]);
  return reference;
}

function useProductDraftSaver(
  options: EditorOptions,
  values: PanelFormValues,
  reason: string,
  setValues: Dispatch<SetStateAction<PanelFormValues>>,
) {
  const [saved, setSaved] = useState(options.data.product);
  const [state, setState] = useState<AutosaveState>({ kind: "idle" });
  const [autosaver] = useState(
    () =>
      new DraftAutosaver<NonNullable<SellerProductFormData["product"]>>({
        base: { supplierId: options.data.sourceId, productId: options.productId },
        initialValues: values,
        initial: options.data.product,
        onState: setState,
        describeError: errorMessage,
        saveDraft: async () => {
          throw new Error("Saving is not ready yet.");
        },
      }),
  );
  useEffect(() => {
    autosaver.setSaveDraft(async ({ supplierId: _source, ...data }) =>
      options.adminTenantId === undefined
        ? sellerSaveProductFn({ data })
        : adminSaveSellerProductFn({ data: { ...data, tenantId: options.adminTenantId, reason } }),
    );
  }, [autosaver, options.adminTenantId, reason]);
  const canSave = options.adminTenantId === undefined || reason.trim().length >= 5;
  useSavedProductListener(autosaver, setSaved, setValues);
  useEffect(() => {
    autosaver.update(values);
    if (!canSave) return undefined;
    const timer = window.setTimeout(() => void autosaver.flush(), AUTOSAVE_DELAY_MILLISECONDS);
    return () => window.clearTimeout(timer);
  }, [autosaver, values, canSave]);
  return { saved, state, autosaver, canSave };
}

export function useSellerProductEditor(options: EditorOptions) {
  const [values, setValues] = useState(() => panelFormValues(options.data.product));
  const [reason, setReason] = useState("");
  const saver = useProductDraftSaver(options, values, reason, setValues);
  const valuesRef = useLiveValue(values);
  const busyRef = useLiveValue(options.busy ?? false);
  const dirty = saver.autosaver.hasUnsavedChanges(values) || options.busy === true;
  const canDiscard = useUnsavedChanges(
    dirty,
    () => saver.autosaver.hasUnsavedChanges(valuesRef.current) || busyRef.current,
  );
  const category = options.data.categories.find((item) => item.id === values.categoryId);
  const required = requiredAttributesFor(category?.slug);
  const report = evaluateCompleteness(completenessInput(values), required);
  return {
    values,
    saved: saver.saved,
    state: saver.state,
    dirty,
    reason,
    setReason,
    canSave: saver.canSave,
    canDiscard,
    report,
    required,
    change: (change: Partial<PanelFormValues>) =>
      setValues((current) => ({ ...current, ...change })),
    save: () => saver.autosaver.flush(),
  };
}
export type SellerProductEditor = ReturnType<typeof useSellerProductEditor>;

function useSavedProductListener(
  autosaver: DraftAutosaver<NonNullable<SellerProductFormData["product"]>>,
  setSaved: Dispatch<SetStateAction<SellerProductFormData["product"]>>,
  setValues: Dispatch<SetStateAction<PanelFormValues>>,
) {
  const client = useQueryClient();
  useEffect(() => {
    autosaver.setOnSaved((product, sentStock) => {
      setSaved(product);
      setValues((current) =>
        current.stock === String(sentStock) && product.stock !== sentStock
          ? { ...current, stock: String(product.stock) }
          : current,
      );
      void client.invalidateQueries({ queryKey: ["seller-products", "list"] });
      void client.invalidateQueries({ queryKey: ["admin-catalog"] });
    });
  }, [autosaver, setSaved, setValues, client]);
}
