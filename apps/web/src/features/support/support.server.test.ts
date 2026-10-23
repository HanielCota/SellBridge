import { conflictError, notFoundError } from "@sellbridge/shared/errors";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  put: vi.fn<(key: string, bytes: Uint8Array) => Promise<void>>(),
  remove: vi.fn<(key: string) => Promise<void>>(),
  findTicketForMessage: vi.fn<(database: unknown, input: unknown) => Promise<unknown>>(),
  addTicketMessage: vi.fn<(database: unknown, input: unknown) => Promise<unknown>>(),
  createTicket: vi.fn<(database: unknown, input: unknown) => Promise<unknown>>(),
  requireTenantRequest: vi.fn<() => Promise<unknown>>(),
  requireStaffSession: vi.fn<() => Promise<unknown>>(),
  queueSupportReplyNotices: vi.fn<(database: unknown, input: unknown) => Promise<number>>(),
  queueNewTicketNotices: vi.fn<(database: unknown, ticketId: string) => Promise<number>>(),
}));

vi.mock("@/lib/server/storage", () => ({
  fileStorage: { put: mocks.put, get: vi.fn<() => Promise<null>>(), delete: mocks.remove },
}));
vi.mock("@/lib/server/database", () => ({ database: {} }));
vi.mock("@/lib/server/environment", () => ({
  environment: { APP_URL: "https://sellbridge.test" },
}));
vi.mock("@/lib/server/auth", () => ({ auth: { api: { getSession: vi.fn<() => null>() } } }));
vi.mock("@/lib/server/impersonation", () => ({
  recordImpersonatedCall: vi.fn<() => Promise<void>>(),
}));
vi.mock("@/lib/server/tenant-session", () => ({
  requireTenantRequest: mocks.requireTenantRequest,
  requireStaffSession: mocks.requireStaffSession,
}));
vi.mock("@sellbridge/database/repositories", () => ({
  addTicketMessage: mocks.addTicketMessage,
  createTicket: mocks.createTicket,
  findTicketForMessage: mocks.findTicketForMessage,
  getAttachment: vi.fn<() => Promise<null>>(),
  linkTicketAbout: vi.fn<() => Promise<void>>(),
  queueSupportReplyNotices: mocks.queueSupportReplyNotices,
  queueNewTicketNotices: mocks.queueNewTicketNotices,
  requireTicketAbout: vi.fn<() => Promise<unknown>>(),
}));
// A budget of two uploads keeps the limit test short; the real budgets are in the module.
vi.mock("@/lib/server/upload-rate-limit", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/server/upload-rate-limit")>();
  return {
    ...actual,
    supportUploads: actual.createUploadLimiter({ maxRequests: 2, windowMilliseconds: 60_000 }),
  };
});

const { handleAdminReply, handleCreateTicket, handleTenantReply } =
  await import("./support.server");

const TICKET_ID = "11111111-1111-4111-8111-111111111111";
let nextUser = 0;

function messageForm(fields: Record<string, string>, withFile = true): FormData {
  const form = new FormData();
  for (const [name, value] of Object.entries(fields)) {
    form.set(name, value);
  }
  if (withFile) {
    form.append("files", new File([new TextEncoder().encode("%PDF-1.7 nota")], "nota.pdf"));
  }
  return form;
}

function post(path: string, body: FormData | string, headers: Record<string, string> = {}) {
  return new Request(`https://sellbridge.test${path}`, {
    method: "POST",
    headers: { origin: "https://sellbridge.test", ...headers },
    body,
  });
}

const tenantReply = (form = messageForm({ body: "Segue a nota fiscal do pedido." })) =>
  handleTenantReply(post(`/api/suporte/chamados/${TICKET_ID}/mensagens`, form), TICKET_ID);

beforeEach(() => {
  vi.clearAllMocks();
  nextUser += 1;
  mocks.requireTenantRequest.mockResolvedValue({
    tenantId: "tenant-a",
    userId: `reseller-${nextUser}`,
    profileKind: "seller",
    impersonatedBy: null,
  });
  mocks.requireStaffSession.mockResolvedValue({ userId: `agent-${nextUser}`, role: "agent" });
  mocks.put.mockResolvedValue(undefined);
  mocks.remove.mockResolvedValue(undefined);
  mocks.addTicketMessage.mockResolvedValue({ status: "open" });
  mocks.queueSupportReplyNotices.mockResolvedValue(1);
});

describe("support uploads write no file for a message that cannot be saved", () => {
  it("refuses a reply to another organization's ticket before writing the attachment", async () => {
    mocks.findTicketForMessage.mockResolvedValue(null);
    mocks.addTicketMessage.mockRejectedValue(notFoundError("Chamado não encontrado"));
    const response = await tenantReply();
    expect(response.status).toBe(404);
    expect(mocks.findTicketForMessage).toHaveBeenCalledWith(
      {},
      { ticketId: TICKET_ID, tenantId: "tenant-a" },
    );
    expect(mocks.put).not.toHaveBeenCalled();
  });

  it("refuses a team reply to a closed ticket before writing the attachment", async () => {
    mocks.findTicketForMessage.mockResolvedValue({ status: "closed" });
    mocks.addTicketMessage.mockRejectedValue(conflictError("Reabra o chamado antes de responder"));
    const form = messageForm({ kind: "reply", body: "Resolvido, confira o rastreio." });
    const response = await handleAdminReply(
      post(`/api/admin/chamados/${TICKET_ID}/mensagens`, form),
      TICKET_ID,
    );
    expect(response.status).toBe(409);
    expect(mocks.put).not.toHaveBeenCalled();
  });

  it("refuses a body over the limit before reading it", async () => {
    mocks.findTicketForMessage.mockResolvedValue({ status: "open" });
    const request = post(`/api/suporte/chamados/${TICKET_ID}/mensagens`, "x", {
      "content-length": String(200 * 1024 * 1024),
      "content-type": "multipart/form-data; boundary=x",
    });
    const response = await handleTenantReply(request, TICKET_ID);
    expect(response.status).toBe(400);
    expect(mocks.put).not.toHaveBeenCalled();
  });

  it("stores the files of a reply to the organization's own open ticket", async () => {
    mocks.findTicketForMessage.mockResolvedValue({ status: "open" });
    const response = await tenantReply();
    expect(response.status).toBe(201);
    expect(mocks.put).toHaveBeenCalledTimes(1);
  });
});

describe("support upload budget", () => {
  it("answers 429 once an account spent its budget, writing nothing more", async () => {
    mocks.findTicketForMessage.mockResolvedValue({ status: "open" });
    expect((await tenantReply()).status).toBe(201);
    expect((await tenantReply()).status).toBe(201);
    const refused = await tenantReply();
    expect(refused.status).toBe(429);
    expect(mocks.put).toHaveBeenCalledTimes(2);
  });
});

const textOnly = () => messageForm({ body: "Alguma novidade sobre o envio?" }, false);

describe("support upload budget, counted on files", () => {
  it("lets text-only replies through without spending the upload budget", async () => {
    mocks.findTicketForMessage.mockResolvedValue({ status: "open" });
    for (const status of [201, 201, 201]) {
      expect((await tenantReply(textOnly())).status).toBe(status);
    }
    expect((await tenantReply()).status).toBe(201);
    expect(mocks.put).toHaveBeenCalledTimes(1);
  });
});

const junkForm = () => {
  const form = messageForm({ body: "Segue o arquivo." }, false);
  form.append("files", new File([new TextEncoder().encode("isto não é um PDF")], "lixo.pdf"));
  return form;
};

describe("support upload budget against refused files", () => {
  it("spends the budget on any message with files, even when the files are refused", async () => {
    mocks.findTicketForMessage.mockResolvedValue({ status: "open" });
    expect((await tenantReply(junkForm())).status).toBe(400);
    expect((await tenantReply(junkForm())).status).toBe(400);
    expect((await tenantReply(junkForm())).status).toBe(429);
    expect(mocks.put).not.toHaveBeenCalled();
  });
});

const adminMessage = (kind: string) =>
  handleAdminReply(
    post(
      `/api/admin/chamados/${TICKET_ID}/mensagens`,
      messageForm({ kind, body: "Confira o rastreio." }, false),
    ),
    TICKET_ID,
  );

describe("support reply notices", () => {
  it("queues the e-mail to the store when the team replies", async () => {
    mocks.findTicketForMessage.mockResolvedValue({ status: "open" });
    expect((await adminMessage("reply")).status).toBe(201);
    await vi.waitFor(() =>
      expect(mocks.queueSupportReplyNotices).toHaveBeenCalledWith(
        {},
        expect.objectContaining({ ticketId: TICKET_ID }),
      ),
    );
  });

  it("keeps internal notes away from the store", async () => {
    mocks.findTicketForMessage.mockResolvedValue({ status: "open" });
    expect((await adminMessage("note")).status).toBe(201);
    expect(mocks.queueSupportReplyNotices).not.toHaveBeenCalled();
  });

  it("still saves the reply when queuing the e-mail fails", async () => {
    mocks.findTicketForMessage.mockResolvedValue({ status: "open" });
    mocks.queueSupportReplyNotices.mockRejectedValue(new Error("banco fora"));
    expect((await adminMessage("reply")).status).toBe(201);
  });
});

describe("new ticket notice", () => {
  it("queues the e-mail to the support team once the ticket is saved", async () => {
    mocks.createTicket.mockResolvedValue({ ticketId: TICKET_ID });
    mocks.queueNewTicketNotices.mockResolvedValue(2);
    const form = messageForm(
      { category: "payment", situation: "payout-missing", body: "O repasse da semana não caiu." },
      false,
    );
    const response = await handleCreateTicket(post("/api/suporte/chamados", form));
    expect(response.status).toBe(201);
    await vi.waitFor(() => expect(mocks.queueNewTicketNotices).toHaveBeenCalledWith({}, TICKET_ID));
  });

  it("derives the priority and the subject from what the customer picked", async () => {
    mocks.createTicket.mockResolvedValue({ ticketId: TICKET_ID });
    mocks.queueNewTicketNotices.mockResolvedValue(1);
    const form = messageForm(
      { category: "payment", situation: "payout-missing", body: "O repasse da semana não caiu." },
      false,
    );
    expect((await handleCreateTicket(post("/api/suporte/chamados", form))).status).toBe(201);
    expect(mocks.createTicket).toHaveBeenCalledWith(
      {},
      expect.objectContaining({
        priority: "high",
        subject: "O dinheiro de uma venda não caiu: O repasse da semana não caiu.",
      }),
    );
  });

  it("refuses a situation that does not belong to the topic", async () => {
    const form = messageForm(
      {
        category: "payment",
        situation: "store-disconnected",
        body: "O repasse da semana não caiu.",
      },
      false,
    );
    expect((await handleCreateTicket(post("/api/suporte/chamados", form))).status).toBe(400);
    expect(mocks.createTicket).not.toHaveBeenCalled();
  });
});

function planForm(assistantAnswerId: string): FormData {
  return messageForm(
    {
      category: "account",
      situation: "plan",
      body: "Quero mudar para o plano anual.",
      assistantAnswerId,
    },
    false,
  );
}

describe("support assistant answer on a new ticket", () => {
  it("keeps the answer the customer read for the team", async () => {
    mocks.createTicket.mockResolvedValue({ ticketId: TICKET_ID });
    mocks.queueNewTicketNotices.mockResolvedValue(1);
    const response = await handleCreateTicket(
      post("/api/suporte/chamados", planForm("seller-plan")),
    );
    expect(response.status).toBe(201);
    expect(mocks.createTicket).toHaveBeenCalledWith(
      {},
      expect.objectContaining({
        assistantNote: expect.stringMatching(/^Como mudar o plano ou o cartão\n1\. /),
      }),
    );
  });

  it("opens the ticket without a note when the answer id is not this profile's", async () => {
    mocks.createTicket.mockResolvedValue({ ticketId: TICKET_ID });
    mocks.queueNewTicketNotices.mockResolvedValue(1);
    const response = await handleCreateTicket(
      post("/api/suporte/chamados", planForm("supplier-import")),
    );
    expect(response.status).toBe(201);
    expect(mocks.createTicket).toHaveBeenCalledWith(
      {},
      expect.objectContaining({ assistantNote: undefined }),
    );
  });
});
