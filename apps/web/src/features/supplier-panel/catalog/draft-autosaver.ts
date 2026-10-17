import type { CatalogSaveDraftInput } from "@sellbridge/shared/supplier-panel-catalog-schemas";
import { parseDraft, type PanelFormValues } from "./draft-form";

export const AUTOSAVE_DELAY_MILLISECONDS = 800;

export type AutosaveState =
  | { kind: "idle" }
  | { kind: "needs-sku" }
  | { kind: "invalid"; errors: Record<string, string> }
  | { kind: "saving" }
  | { kind: "saved"; at: Date }
  | { kind: "conflict"; message: string }
  | { kind: "error"; message: string };

export interface StoredVersion {
  updatedAt: Date;
  stock: number;
}

export type SaveDraftResult<TProduct extends StoredVersion> =
  { saved: true; product: TProduct } | { saved: false; conflict: string };

interface AutosaverOptions<TProduct extends StoredVersion> {
  base: Pick<CatalogSaveDraftInput, "supplierId" | "productId">;
  initialValues: PanelFormValues;
  initial: StoredVersion | null;
  saveDraft: (input: CatalogSaveDraftInput) => Promise<SaveDraftResult<TProduct>>;
  onState: (state: AutosaveState) => void;
  describeError: (error: unknown) => string;
  now?: () => Date;
}

/**
 * Saves the form shortly after each change, one request at a time. Every save carries the
 * version and shelf count it was made over, so another tab's edit or a sale stops the autosave
 * with a message instead of being overwritten. Edits typed during a request follow it.
 */
export class DraftAutosaver<TProduct extends StoredVersion> {
  readonly #options: AutosaverOptions<TProduct>;
  #onSaved: (product: TProduct, sentStock: number) => void = () => {};
  #latest: PanelFormValues;
  #lastSent: string;
  #version: string | undefined;
  #expectedStock: number | undefined;
  #inFlight = false;
  #stopped = false;

  constructor(options: AutosaverOptions<TProduct>) {
    this.#options = options;
    this.#latest = options.initialValues;
    this.#lastSent = JSON.stringify(options.initialValues);
    this.#version = options.initial?.updatedAt.toISOString();
    this.#expectedStock = options.initial?.stock;
  }

  /** Records the newest values; the caller decides when to `flush` (after the debounce). */
  update(values: PanelFormValues): void {
    this.#latest = values;
  }

  /** Who hears about a stored save; replaced as the form re-renders. */
  setOnSaved(listener: (product: TProduct, sentStock: number) => void): void {
    this.#onSaved = listener;
  }

  async flush(): Promise<void> {
    const values = this.#latest;
    const serialized = JSON.stringify(values);
    if (this.#inFlight || this.#stopped || serialized === this.#lastSent) {
      return;
    }
    if (values.sku.trim() === "") {
      this.#options.onState({ kind: "needs-sku" });
      return;
    }
    this.#inFlight = true;
    let saved = false;
    try {
      saved = await this.#send(values, serialized);
    } catch (error) {
      this.#options.onState({ kind: "error", message: this.#options.describeError(error) });
    } finally {
      this.#inFlight = false;
    }
    // Edits typed while the request was out are saved right after it.
    if (saved && JSON.stringify(this.#latest) !== this.#lastSent) {
      await this.flush();
    }
  }

  /** One request; true when the values were stored. */
  async #send(values: PanelFormValues, serialized: string): Promise<boolean> {
    const options = this.#options;
    const parsed = parseDraft(values, this.#expectedStock);
    if (!parsed.ok) {
      options.onState({ kind: "invalid", errors: parsed.errors });
      return false;
    }
    options.onState({ kind: "saving" });
    const result = await options.saveDraft({
      ...options.base,
      values: parsed.values,
      expectedUpdatedAt: this.#version,
      expectedStock: this.#expectedStock,
    });
    if (!result.saved) {
      this.#stopped = true;
      options.onState({ kind: "conflict", message: result.conflict });
      return false;
    }
    this.#lastSent = serialized;
    this.#version = result.product.updatedAt.toISOString();
    this.#expectedStock = result.product.stock;
    options.onState({ kind: "saved", at: (options.now ?? (() => new Date()))() });
    this.#onSaved(result.product, parsed.values.stock);
    return true;
  }
}
