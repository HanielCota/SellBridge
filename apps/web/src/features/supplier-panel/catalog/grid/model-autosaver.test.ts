import type { CatalogSaveModelDraftInput } from "@sellbridge/shared/supplier-panel-catalog-schemas";
import { describe, expect, it, vi } from "vitest";
import type { AutosaveState } from "../draft-autosaver";
import { panelFormValues } from "../draft-form";
import { EMPTY_GRID_FORM_STATE, withColorAdded, withCombinationChanged } from "./grid-form-state";
import { ModelAutosaver, type ModelFormSnapshot, type SaveModelResult } from "./model-autosaver";

const base = {
  supplierId: "00000000-0000-4000-8000-000000000001",
  modelId: "00000000-0000-4000-8000-000000000002",
};
const empty: ModelFormSnapshot = { values: panelFormValues(null), grid: EMPTY_GRID_FORM_STATE };
const titled: ModelFormSnapshot = { ...empty, values: { ...empty.values, title: "Tênis" } };
const storedAt = new Date("2026-11-19T12:00:00Z");

type Save = (input: CatalogSaveModelDraftInput) => Promise<SaveModelResult<{ updatedAt: Date }>>;

/** A save the test answers when it chooses (the project targets ES2023: no withResolvers). */
function deferredSave() {
  const handle: { resolve: (result: SaveModelResult<{ updatedAt: Date }>) => void } = {
    resolve: () => undefined,
  };
  const promise = new Promise<SaveModelResult<{ updatedAt: Date }>>((resolve) => {
    handle.resolve = resolve;
  });
  return {
    promise,
    resolve: (result: SaveModelResult<{ updatedAt: Date }>) => handle.resolve(result),
  };
}

function autosaver(save: Save, initialVersion: Date | null = null) {
  const states: AutosaveState[] = [];
  const saver = new ModelAutosaver({
    base,
    initial: empty,
    initialVersion,
    save,
    onState: (state) => states.push(state),
    describeError: () => "Não foi possível salvar",
  });
  return { saver, states };
}

describe("ModelAutosaver", () => {
  it("stores nothing for a new grid until it has a name", async () => {
    const save = vi.fn<Save>(async () => ({
      saved: true as const,
      model: { updatedAt: storedAt },
    }));
    const { saver, states } = autosaver(save);
    saver.update({ ...empty, values: { ...empty.values, description: "Couro" } });

    await saver.flush();

    expect(save).not.toHaveBeenCalled();
    expect(states.at(-1)).toEqual({ kind: "needs-title" });
  });

  it("sends the version it saw and keeps the one the server answers", async () => {
    const save = vi.fn<Save>(async () => ({
      saved: true as const,
      model: { updatedAt: storedAt },
    }));
    const { saver } = autosaver(save);
    saver.update(titled);
    await saver.flush();
    saver.update({ ...titled, values: { ...titled.values, title: "Tênis Casual" } });

    await saver.flush();

    expect(save).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ expectedUpdatedAt: undefined }),
    );
    expect(save).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ expectedUpdatedAt: storedAt.toISOString() }),
    );
  });

  it("does not save again when only the answer's bookkeeping changed", async () => {
    const save = vi.fn<Save>(async () => ({ saved: true, model: { updatedAt: storedAt } }));
    const { saver } = autosaver(save);
    const typed = { ...titled, grid: withColorAdded(EMPTY_GRID_FORM_STATE, "Preto", "c1") };
    saver.update(typed);
    await saver.flush();
    const answered = {
      ...typed,
      grid: {
        ...typed.grid,
        colors: typed.grid.colors.map((color) => ({ ...color, savedName: "Preto" })),
      },
    };

    saver.update(answered);
    await saver.flush();

    expect(save).toHaveBeenCalledTimes(1);
    expect(saver.hasUnsavedChanges(answered)).toBe(false);
  });

  it("stops saving after a conflict and says why", async () => {
    const save = vi.fn<Save>(async () => ({
      saved: false as const,
      conflict: "Mudou em outra janela",
    }));
    const { saver, states } = autosaver(save, storedAt);
    saver.update(titled);
    await saver.flush();
    saver.update({ ...titled, values: { ...titled.values, title: "Outro" } });

    await saver.flush();

    expect(save).toHaveBeenCalledTimes(1);
    expect(states.at(-1)).toEqual({ kind: "conflict", message: "Mudou em outra janela" });
  });

  it("shows a SKU another product uses on its field and saves again once it is changed", async () => {
    const save = vi
      .fn<Save>()
      .mockResolvedValueOnce({ saved: false, takenSkus: ["TEN-P"] })
      .mockResolvedValue({ saved: true, model: { updatedAt: storedAt } });
    const { saver, states } = autosaver(save);
    const pair = { colorKey: "c1", sizeKey: null };
    const colored = withColorAdded(EMPTY_GRID_FORM_STATE, "Preto", "c1");
    saver.update({ ...titled, grid: withCombinationChanged(colored, pair, { sku: "TEN-P" }) });
    await saver.flush();
    const refused = states.at(-1);

    saver.update({ ...titled, grid: withCombinationChanged(colored, pair, { sku: "TEN-PRETO" }) });
    await saver.flush();

    expect(refused).toEqual({
      kind: "invalid",
      errors: { "grid.c1.-.sku": "O SKU TEN-P já é de outro produto seu. Use outro código." },
    });
    expect(save).toHaveBeenCalledTimes(2);
    expect(states.at(-1)).toMatchObject({ kind: "saved" });
  });

  it("sends a SKU fixed while its refusal was still on the way", async () => {
    const refusal = deferredSave();
    const save = vi
      .fn<Save>()
      .mockImplementationOnce(async () => await refusal.promise)
      .mockResolvedValue({ saved: true, model: { updatedAt: storedAt } });
    const { saver, states } = autosaver(save);
    const pair = { colorKey: "c1", sizeKey: null };
    const colored = withColorAdded(EMPTY_GRID_FORM_STATE, "Preto", "c1");
    saver.update({ ...titled, grid: withCombinationChanged(colored, pair, { sku: "TEN-P" }) });
    const first = saver.flush();
    saver.update({ ...titled, grid: withCombinationChanged(colored, pair, { sku: "TEN-PRETO" }) });

    refusal.resolve({ saved: false, takenSkus: ["TEN-P"] });
    await first;

    expect(save).toHaveBeenCalledTimes(2);
    expect(save).toHaveBeenLastCalledWith(
      expect.objectContaining({
        grid: expect.objectContaining({
          combinations: [expect.objectContaining({ sku: "TEN-PRETO" })],
        }),
      }),
    );
    expect(states.at(-1)).toMatchObject({ kind: "saved" });
  });

  it("saves right away what was typed while a save was out", async () => {
    const pending = deferredSave();
    const save = vi
      .fn<Save>()
      .mockImplementationOnce(async () => await pending.promise)
      .mockResolvedValue({ saved: true, model: { updatedAt: storedAt } });
    const { saver } = autosaver(save);
    saver.update(titled);
    const first = saver.flush();
    saver.update({ ...titled, values: { ...titled.values, title: "Tênis Casual" } });

    pending.resolve({ saved: true, model: { updatedAt: storedAt } });
    await first;

    expect(save).toHaveBeenLastCalledWith(
      expect.objectContaining({ values: expect.objectContaining({ title: "Tênis Casual" }) }),
    );
  });
});
