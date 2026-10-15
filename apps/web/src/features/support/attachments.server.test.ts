import { describe, expect, it, vi } from "vitest";
import { saveWithAttachments, storeAttachments } from "./attachments.server";

function fakeStorage() {
  return {
    put: vi.fn<(key: string, bytes: Uint8Array) => Promise<void>>(),
    get: vi.fn<(key: string) => Promise<Uint8Array | null>>(),
    delete: vi.fn<(key: string) => Promise<void>>().mockResolvedValue(undefined),
  };
}

const attachments = [
  {
    storageKey: "tickets/t1/a-print.png",
    fileName: "print.png",
    mimeType: "image/png",
    sizeBytes: 10,
  },
  {
    storageKey: "tickets/t1/b-nota.pdf",
    fileName: "nota.pdf",
    mimeType: "application/pdf",
    sizeBytes: 20,
  },
];

describe("saveWithAttachments", () => {
  it("keeps the files when the message is saved", async () => {
    const storage = fakeStorage();
    await expect(saveWithAttachments(storage, attachments, async () => "ok")).resolves.toBe("ok");
    expect(storage.delete).not.toHaveBeenCalled();
  });

  it("deletes every stored file when the save fails, and still reports the failure", async () => {
    const storage = fakeStorage();
    storage.delete.mockRejectedValueOnce(new Error("disco"));
    await expect(
      saveWithAttachments(storage, attachments, async () => {
        throw new Error("Chamado não encontrado");
      }),
    ).rejects.toThrow("Chamado não encontrado");
    expect(storage.delete.mock.calls.map(([key]) => key)).toEqual([
      "tickets/t1/a-print.png",
      "tickets/t1/b-nota.pdf",
    ]);
  });
});

const pdf = (fileName: string) => ({
  bytes: new Uint8Array([1]),
  fileName,
  mimeType: "application/pdf",
  sizeBytes: 1,
});

describe("storeAttachments", () => {
  it("deletes what it already wrote when a later file fails, and reports the failure", async () => {
    const storage = fakeStorage();
    storage.put.mockResolvedValueOnce(undefined).mockRejectedValueOnce(new Error("disco cheio"));
    await expect(storeAttachments(storage, "t1", [pdf("a.pdf"), pdf("b.pdf")])).rejects.toThrow(
      "disco cheio",
    );
    const [written] = storage.put.mock.calls.map(([key]) => key);
    expect(storage.delete.mock.calls.map(([key]) => key)).toEqual([written]);
  });
});
