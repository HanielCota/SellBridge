import type {
  CatalogModelRef,
  CatalogSaveModelDraftInput,
} from "@sellbridge/shared/supplier-panel-catalog-schemas";
import type { AutosaveState } from "../draft-autosaver";
import type { PanelFormValues } from "../draft-form";
import { parseModelDraft } from "./grid-form-draft";
import type { GridFormCombination, GridFormState } from "./grid-form-state";

/** What the grid form edits: the model's shared values and the grid itself. */
export interface ModelFormSnapshot {
  readonly values: PanelFormValues;
  readonly grid: GridFormState;
}

export interface StoredModelVersion {
  readonly updatedAt: Date;
}

export type SaveModelResult<TModel extends StoredModelVersion> =
  { saved: true; model: TModel } | { saved: false; conflict: string };

/** What one stored save carried, so the form can match the answer back to what it typed. */
export interface SentModel {
  readonly snapshot: ModelFormSnapshot;
  readonly combinations: readonly GridFormCombination[];
}

interface ModelAutosaverOptions<TModel extends StoredModelVersion> {
  base: CatalogModelRef;
  initial: ModelFormSnapshot;
  initialVersion: Date | null;
  save: (input: CatalogSaveModelDraftInput) => Promise<SaveModelResult<TModel>>;
  onState: (state: AutosaveState) => void;
  describeError: (error: unknown) => string;
  now?: () => Date;
}

/**
 * What the supplier typed, without what the form learned from the server (the name a colour or
 * size is saved under, the stored stock): taking in a save's answer is not a new edit to send.
 */
function typedContent(snapshot: ModelFormSnapshot): string {
  return JSON.stringify({
    values: snapshot.values,
    colors: snapshot.grid.colors.map(({ savedName: _saved, ...color }) => color),
    sizes: snapshot.grid.sizes.map(({ savedName: _saved, ...size }) => size),
    combinations: snapshot.grid.combinations.map(
      ({ savedStock: _saved, ...combination }) => combination,
    ),
  });
}

/**
 * Saves the grid form shortly after each change, one request at a time, like the single product
 * form: every save carries the version it was made over, so another tab's edit stops the
 * autosave with a message instead of being overwritten. Edits typed during a request follow it.
 */
export class ModelAutosaver<TModel extends StoredModelVersion> {
  readonly #options: ModelAutosaverOptions<TModel>;
  #onSaved: (model: TModel, sent: SentModel) => void = () => {};
  #latest: ModelFormSnapshot;
  #lastSent: string;
  #version: string | undefined;
  #inFlight = false;
  #stopped = false;

  constructor(options: ModelAutosaverOptions<TModel>) {
    this.#options = options;
    this.#latest = options.initial;
    this.#lastSent = typedContent(options.initial);
    this.#version = options.initialVersion?.toISOString();
  }

  update(snapshot: ModelFormSnapshot): void {
    this.#latest = snapshot;
  }

  setOnSaved(listener: (model: TModel, sent: SentModel) => void): void {
    this.#onSaved = listener;
  }

  hasUnsavedChanges(snapshot: ModelFormSnapshot = this.#latest): boolean {
    return typedContent(snapshot) !== this.#lastSent;
  }

  async flush(): Promise<void> {
    const snapshot = this.#latest;
    const serialized = typedContent(snapshot);
    if (this.#inFlight || this.#stopped || serialized === this.#lastSent) {
      return;
    }
    // A model is created on its first save: an untitled form left open stores nothing.
    if (this.#version === undefined && snapshot.values.title.trim() === "") {
      this.#options.onState({ kind: "needs-title" });
      return;
    }
    this.#inFlight = true;
    let saved = false;
    try {
      saved = await this.#send(snapshot, serialized);
    } catch (error) {
      this.#options.onState({ kind: "error", message: this.#options.describeError(error) });
    } finally {
      this.#inFlight = false;
    }
    if (saved && typedContent(this.#latest) !== this.#lastSent) {
      await this.flush();
    }
  }

  async #send(snapshot: ModelFormSnapshot, serialized: string): Promise<boolean> {
    const options = this.#options;
    const parsed = parseModelDraft(snapshot.values, snapshot.grid);
    if (!parsed.ok) {
      options.onState({ kind: "invalid", errors: parsed.errors });
      return false;
    }
    options.onState({ kind: "saving" });
    const result = await options.save({
      ...options.base,
      values: parsed.values,
      grid: parsed.grid,
      expectedUpdatedAt: this.#version,
    });
    if (!result.saved) {
      this.#stopped = true;
      options.onState({ kind: "conflict", message: result.conflict });
      return false;
    }
    this.#lastSent = serialized;
    this.#version = result.model.updatedAt.toISOString();
    options.onState({ kind: "saved", at: (options.now ?? (() => new Date()))() });
    this.#onSaved(result.model, { snapshot, combinations: parsed.sent });
    return true;
  }
}
