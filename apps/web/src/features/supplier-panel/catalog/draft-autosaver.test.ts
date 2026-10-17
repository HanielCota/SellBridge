import type { CatalogSaveDraftInput } from "@sellbridge/shared/supplier-panel-catalog-schemas";
import { describe, expect, it, vi } from "vitest";
import {
  DraftAutosaver,
  type AutosaveState,
  type SaveDraftResult,
  type StoredVersion,
} from "./draft-autosaver";
import { panelFormValues, type PanelFormValues } from "./draft-form";

const OPENED_AT = new Date("2026-10-16T12:00:00.000Z");
const SAVED_AT = new Date("2026-10-16T12:00:05.000Z");
const BLANK = panelFormValues();

function setup(initial: StoredVersion | null = null) {
  const states: AutosaveState[] = [];
  const saveDraft =
    vi.fn<(input: CatalogSaveDraftInput) => Promise<SaveDraftResult<StoredVersion>>>();
  const onSaved = vi.fn<(product: StoredVersion, sentStock: number) => void>();
  const autosaver = new DraftAutosaver({
    base: { supplierId: "s", productId: "p" },
    initialValues: BLANK,
    initial,
    saveDraft,
    onState: (state) => states.push(state),
    describeError: () => "Falhou",
    now: () => SAVED_AT,
  });
  autosaver.setOnSaved(onSaved);
  return { autosaver, saveDraft, onSaved, states };
}

function typed(change: Partial<PanelFormValues>): PanelFormValues {
  return { ...BLANK, sku: "A", ...change };
}

describe("DraftAutosaver", () => {
  it("does nothing until something changed, and waits for a SKU", async () => {
    const { autosaver, saveDraft, states } = setup();
    await autosaver.flush();
    autosaver.update({ ...BLANK, title: "Camiseta" });
    await autosaver.flush();
    expect(saveDraft).not.toHaveBeenCalled();
    expect(states).toEqual([{ kind: "needs-sku" }]);
  });

  it("holds a half-typed value and names the field", async () => {
    const { autosaver, saveDraft, states } = setup();
    autosaver.update(typed({ cost: "12," }));
    await autosaver.flush();
    expect(saveDraft).not.toHaveBeenCalled();
    expect(states.at(-1)).toEqual({
      kind: "invalid",
      errors: { costCents: "Valor inválido, revise o campo." },
    });
  });

  it("sends the version and shelf it saw, then the ones the server answered", async () => {
    const { autosaver, saveDraft, onSaved, states } = setup({ updatedAt: OPENED_AT, stock: 4 });
    saveDraft.mockResolvedValue({ saved: true, product: { updatedAt: SAVED_AT, stock: 3 } });
    autosaver.update(typed({ stock: "4" }));
    await autosaver.flush();
    autosaver.update(typed({ stock: "4", title: "Novo" }));
    await autosaver.flush();
    expect(
      saveDraft.mock.calls.map(([input]) => [input.expectedUpdatedAt, input.expectedStock]),
    ).toEqual([
      [OPENED_AT.toISOString(), 4],
      [SAVED_AT.toISOString(), 3],
    ]);
    expect(onSaved).toHaveBeenCalledWith({ updatedAt: SAVED_AT, stock: 3 }, 4);
    expect(states.at(-1)).toEqual({ kind: "saved", at: SAVED_AT });
  });

  it("saves edits typed while a request was out right after it", async () => {
    const { autosaver, saveDraft } = setup();
    saveDraft.mockImplementation(async () => {
      autosaver.update(typed({ title: "Digitado durante" }));
      return { saved: true, product: { updatedAt: SAVED_AT, stock: 0 } };
    });
    autosaver.update(typed({}));
    await autosaver.flush();
    expect(saveDraft).toHaveBeenCalledTimes(2);
    expect(saveDraft.mock.calls[1]?.[0].values.title).toBe("Digitado durante");
  });

  it("stops after a conflict instead of overwriting", async () => {
    const { autosaver, saveDraft, states } = setup();
    saveDraft.mockResolvedValue({ saved: false, conflict: "Alterado em outra janela" });
    autosaver.update(typed({}));
    await autosaver.flush();
    autosaver.update(typed({ title: "Mais uma" }));
    await autosaver.flush();
    expect(saveDraft).toHaveBeenCalledTimes(1);
    expect(states.at(-1)).toEqual({ kind: "conflict", message: "Alterado em outra janela" });
  });

  it("reports a failed request and retries the same values", async () => {
    const { autosaver, saveDraft, states } = setup();
    saveDraft.mockRejectedValueOnce(new Error("offline"));
    saveDraft.mockResolvedValue({ saved: true, product: { updatedAt: SAVED_AT, stock: 0 } });
    autosaver.update(typed({}));
    await autosaver.flush();
    expect(states.at(-1)).toEqual({ kind: "error", message: "Falhou" });
    await autosaver.flush();
    expect(saveDraft).toHaveBeenCalledTimes(2);
    expect(states.at(-1)?.kind).toBe("saved");
  });
});
