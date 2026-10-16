import { beforeEach, describe, expect, it, vi } from "vitest";
import { AppError } from "../runtime/errors.ts";

const logs = vi.hoisted(() => ({
  info: vi.fn<(event: string, fields: Record<string, unknown>) => void>(),
  error: vi.fn<(event: string, fields: Record<string, unknown>) => void>(),
}));
vi.mock("../runtime/logger.ts", () => ({ logger: logs }));
import { createMailer } from "./mailer.ts";

const email = { to: "fornecedor@exemplo.com.br", subject: "Novo pedido", text: "Olá" };
const from = "SellBridge <no-reply@sellbridge.local>";

beforeEach(() => {
  logs.info.mockReset();
  logs.error.mockReset();
});

async function failure(send: Promise<void>): Promise<AppError> {
  const error: unknown = await send.then(
    () => null,
    (reason: unknown) => reason,
  );
  if (!(error instanceof AppError)) throw new Error("expected an AppError");
  return error;
}

describe("createMailer", () => {
  it("prints the e-mail to the log in development when there is no key", async () => {
    const fetcher = vi.fn<typeof fetch>();
    await createMailer({ apiKey: undefined, from, production: false, fetch: fetcher })(email);
    expect(fetcher).not.toHaveBeenCalled();
    expect(logs.info).toHaveBeenCalledWith(
      "email.development_preview",
      expect.objectContaining({ subject: "Novo pedido", body: "Olá" }),
    );
  });

  it("refuses to send in production without a key", async () => {
    const error = await failure(createMailer({ apiKey: undefined, from, production: true })(email));
    expect(error.code).toBe("CONFIGURATION");
  });

  it("posts to Resend with the key and the sender, and never logs the recipient", async () => {
    const fetcher = vi.fn<typeof fetch>(async () => new Response("{}", { status: 200 }));
    await createMailer({ apiKey: "re_test", from, production: true, fetch: fetcher })(email);
    const [, init] = fetcher.mock.calls[0] ?? [];
    expect(new Headers(init?.headers).get("authorization")).toBe("Bearer re_test");
    expect(JSON.parse(typeof init?.body === "string" ? init.body : "")).toMatchObject({
      from,
      to: [email.to],
    });
    expect(JSON.stringify(logs.info.mock.calls)).not.toContain(email.to);
  });

  it.each([
    [422, false],
    [429, true],
    [503, true],
  ])("tells whether a %s answer is worth retrying", async (status, retryable) => {
    const fetcher = vi.fn<typeof fetch>(async () => new Response("{}", { status }));
    const error = await failure(
      createMailer({ apiKey: "re_test", from, production: true, fetch: fetcher })(email),
    );
    expect(error.code).toBe("EXTERNAL_PROVIDER");
    expect(error.details).toMatchObject({ retryable, status });
  });

  it("treats an unreachable provider as worth retrying", async () => {
    const fetcher = vi.fn<typeof fetch>(async () => {
      throw new TypeError("fetch failed");
    });
    const error = await failure(
      createMailer({ apiKey: "re_test", from, production: true, fetch: fetcher })(email),
    );
    expect(error.details).toMatchObject({ retryable: true, status: null });
  });
});
