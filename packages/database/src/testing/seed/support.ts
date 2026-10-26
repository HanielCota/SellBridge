import { count, inArray } from "drizzle-orm";
import type { Database } from "../../client.ts";
import { ticketMessages, tickets } from "../../schema/index.ts";

const HOUR_MILLISECONDS = 3_600_000;

type TicketInsert = typeof tickets.$inferInsert;

interface SeedMessage {
  readonly fromSupport: boolean;
  readonly body: string;
  /** Hours after the ticket was opened. */
  readonly afterHours: number;
}

interface SeedTicket {
  /** E-mail of the reseller who opened it. */
  readonly openedBy: string;
  readonly subject: string;
  readonly category: NonNullable<TicketInsert["category"]>;
  readonly priority: NonNullable<TicketInsert["priority"]>;
  readonly openedHoursAgo: number;
  /** Closed tickets say so (with an optional rating); otherwise the last message decides. */
  readonly closed?: { readonly rating: number | null; readonly comment?: string };
  readonly messages: readonly SeedMessage[];
}

export interface SupportAuthor {
  readonly userId: string;
  readonly tenantId: string;
}

/** One ticket per status, priority and situation the support queue has to handle. */
const TICKETS: readonly SeedTicket[] = [
  {
    openedBy: "demo@sellbridge.local",
    subject: "Pedido não apareceu na lista depois da venda",
    category: "order",
    priority: "normal",
    openedHoursAgo: 30,
    messages: [
      {
        fromSupport: false,
        body: "Vendi um vestido ontem à noite na Ana Moda e o pedido ainda não apareceu aqui.",
        afterHours: 0,
      },
      {
        fromSupport: true,
        body: "Oi, Ana! A loja ficou alguns minutos sem sincronizar. Já reprocessamos e o pedido está na lista.",
        afterHours: 3,
      },
    ],
  },
  {
    openedBy: "bruno@sellbridge.local",
    subject: "Como mudar o preço de um anúncio já publicado?",
    category: "listing",
    priority: "normal",
    openedHoursAgo: 4,
    messages: [
      {
        fromSupport: false,
        body: "Quero subir o preço do tênis de corrida sem tirar o anúncio do ar. Tem como?",
        afterHours: 0,
      },
    ],
  },
  {
    openedBy: "carla@sellbridge.local",
    subject: "Loja Carla Pet desconectou sozinha",
    category: "store",
    priority: "high",
    openedHoursAgo: 52,
    messages: [
      {
        fromSupport: false,
        body: "Hoje cedo a Carla Pet apareceu como desconectada. Não mexi em nada.",
        afterHours: 0,
      },
      {
        fromSupport: true,
        body: "O marketplace pediu uma nova autorização. Pode reconectar pela página Lojas?",
        afterHours: 2,
      },
      {
        fromSupport: false,
        body: "Tentei reconectar, mas continua aparecendo que a loja precisa de nova autorização.",
        afterHours: 26,
      },
    ],
  },
  {
    openedBy: "daniel@sellbridge.local",
    subject: "Não sei qual fornecedor escolher",
    category: "account",
    priority: "low",
    openedHoursAgo: 10,
    messages: [
      {
        fromSupport: false,
        body: "Estou no cadastro e não sei qual fornecedor combina com a minha loja de roupas.",
        afterHours: 0,
      },
    ],
  },
  {
    openedBy: "bruno@sellbridge.local",
    subject: "Cobrança do plano veio duplicada",
    category: "payment",
    priority: "urgent",
    openedHoursAgo: 6,
    messages: [
      {
        fromSupport: false,
        body: "Apareceram duas cobranças do plano Pro no cartão este mês.",
        afterHours: 0,
      },
      {
        fromSupport: true,
        body: "Uma delas foi só uma pré-autorização do cartão e some em até 5 dias. Conferimos e há uma cobrança só.",
        afterHours: 1,
      },
    ],
  },
  {
    openedBy: "demo@sellbridge.local",
    subject: "Como imprimo a etiqueta do envio?",
    category: "order",
    priority: "normal",
    openedHoursAgo: 240,
    closed: { rating: 5, comment: "Resposta rápida e clara." },
    messages: [
      { fromSupport: false, body: "Onde fica a etiqueta para imprimir?", afterHours: 0 },
      {
        fromSupport: true,
        body: "No pedido, abra o envio e use Imprimir etiqueta. Ela já sai no formato do marketplace.",
        afterHours: 1,
      },
      { fromSupport: false, body: "Achei, obrigada!", afterHours: 2 },
    ],
  },
  {
    openedBy: "carla@sellbridge.local",
    subject: "Dúvida sobre a nota fiscal",
    category: "other",
    priority: "low",
    openedHoursAgo: 400,
    closed: { rating: null },
    messages: [
      { fromSupport: false, body: "Quem emite a nota fiscal da venda?", afterHours: 0 },
      {
        fromSupport: true,
        body: "A nota sai em nome do titular da conta, com o nome completo e o CPF do cadastro.",
        afterHours: 4,
      },
    ],
  },
];

function hoursAfter(openedAt: number, hours: number): Date {
  return new Date(openedAt + hours * HOUR_MILLISECONDS);
}

/** Status and the support timestamps the queue and the metrics read, as the app sets them. */
function ticketState(seed: SeedTicket, openedAt: number, supportUserId: string) {
  const last = seed.messages.at(-1);
  const lastAt = hoursAfter(openedAt, last?.afterHours ?? 0);
  const firstReply = seed.messages.find((message) => message.fromSupport);
  const firstResponseAt =
    firstReply === undefined ? null : hoursAfter(openedAt, firstReply.afterHours);
  const assigneeId = firstReply === undefined ? null : supportUserId;
  if (seed.closed !== undefined) {
    const rating = seed.closed.rating;
    return {
      status: "closed" as const,
      awaitingSince: null,
      firstResponseAt,
      assigneeId,
      closedAt: lastAt,
      rating,
      ratingComment: seed.closed.comment ?? null,
      ratedAt: rating === null ? null : lastAt,
      updatedAt: lastAt,
    };
  }
  const answered = last?.fromSupport === true;
  return {
    status: answered ? ("answered" as const) : ("open" as const),
    awaitingSince: answered ? null : lastAt,
    firstResponseAt,
    assigneeId,
    updatedAt: lastAt,
  };
}

async function insertTicket(
  database: Database,
  seed: SeedTicket,
  author: SupportAuthor,
  support: SupportAuthor,
): Promise<void> {
  const openedAt = Date.now() - seed.openedHoursAgo * HOUR_MILLISECONDS;
  const [ticket] = await database
    .insert(tickets)
    .values({
      tenantId: author.tenantId,
      createdById: author.userId,
      subject: seed.subject,
      category: seed.category,
      priority: seed.priority,
      createdAt: new Date(openedAt),
      ...ticketState(seed, openedAt, support.userId),
    })
    .returning({ id: tickets.id });
  if (ticket === undefined) {
    throw new Error(`Falha ao criar o chamado "${seed.subject}"`);
  }
  await database.insert(ticketMessages).values(
    seed.messages.map((message) => ({
      ticketId: ticket.id,
      authorId: message.fromSupport ? support.userId : author.userId,
      isAdmin: message.fromSupport,
      body: message.body,
      createdAt: hoursAfter(openedAt, message.afterHours),
    })),
  );
}

/**
 * Support tickets from the seeded resellers, answered by the admin. Idempotent: skipped when
 * any of those tenants already has a ticket.
 */
export async function seedSupportTickets(
  database: Database,
  authors: ReadonlyMap<string, SupportAuthor>,
  support: SupportAuthor,
): Promise<number> {
  const tenantIds = [...new Set([...authors.values()].map((author) => author.tenantId))];
  const [existing] = await database
    .select({ total: count() })
    .from(tickets)
    .where(inArray(tickets.tenantId, tenantIds));
  if ((existing?.total ?? 0) > 0) {
    return 0;
  }
  const seeded = TICKETS.flatMap((seed) => {
    const author = authors.get(seed.openedBy);
    return author === undefined ? [] : [{ seed, author }];
  });
  for (const { seed, author } of seeded) {
    await insertTicket(database, seed, author, support);
  }
  return seeded.length;
}
