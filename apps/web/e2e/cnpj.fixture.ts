import type { IncomingMessage, ServerResponse } from "node:http";
import { logger } from "@sellbridge/shared/logger";
import type { Plugin } from "vite";

/**
 * A local stand-in for BrasilAPI's CNPJ query (`GET /cnpj/v1/{cnpj}`), so browser tests and the
 * test site never ask the real service. A CNPJ answers what a test set through
 * `POST /__e2e/cnpj/test/answer`; any other CNPJ is "not found" (404), as BrasilAPI answers.
 */
export const CNPJ_FIXTURE_PREFIX = "/__e2e/cnpj";

/** The Receita size a test asks for; a micro company that is no MEI unless it says otherwise. */
const SIZE_FIELDS = {
  micro: { codigo_porte: 1, opcao_pelo_mei: false },
  small: { codigo_porte: 3, opcao_pelo_mei: null },
  other: { codigo_porte: 5, opcao_pelo_mei: null },
  mei: { codigo_porte: 1, opcao_pelo_mei: true },
  unknown: { codigo_porte: 0, opcao_pelo_mei: null },
} as const;
type CompanySizeAnswer = keyof typeof SIZE_FIELDS;

interface CompanyAnswer {
  readonly situation: "active" | "closed" | "down";
  readonly legalName: string;
  readonly size: CompanySizeAnswer;
}

const answers = new Map<string, CompanyAnswer>();
const MAX_BODY_BYTES = 10_000;

function json(response: ServerResponse, status: number, body: unknown): void {
  response.writeHead(status, { "content-type": "application/json" });
  response.end(JSON.stringify(body));
}

async function readJson(request: IncomingMessage): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk));
    size += buffer.length;
    if (size > MAX_BODY_BYTES) {
      throw new Error("CNPJ stand-in body too large");
    }
    chunks.push(buffer);
  }
  const parsed: unknown = JSON.parse(Buffer.concat(chunks).toString("utf8"));
  return typeof parsed === "object" && parsed !== null
    ? Object.fromEntries(Object.entries(parsed))
    : {};
}

function digitsOf(value: unknown): string {
  return typeof value === "string" ? value.toUpperCase().replace(/[^0-9A-Z]/g, "") : "";
}

function situationOf(value: unknown): CompanyAnswer["situation"] {
  if (value === "closed" || value === "down") {
    return value;
  }
  return "active";
}

function sizeOf(value: unknown): CompanySizeAnswer {
  const sizes = Object.keys(SIZE_FIELDS).filter((size): size is CompanySizeAnswer =>
    Object.hasOwn(SIZE_FIELDS, size),
  );
  return sizes.find((size) => size === value) ?? "micro";
}

function answerCompany(response: ServerResponse, cnpj: string): void {
  const answer = answers.get(cnpj);
  if (answer === undefined) {
    json(response, 404, { message: "CNPJ não encontrado", type: "not_found" });
    return;
  }
  if (answer.situation === "down") {
    json(response, 503, { message: "Serviço indisponível", type: "service_error" });
    return;
  }
  const active = answer.situation === "active";
  json(response, 200, {
    cnpj,
    razao_social: answer.legalName,
    situacao_cadastral: active ? 2 : 8,
    descricao_situacao_cadastral: active ? "ATIVA" : "BAIXADA",
    ...SIZE_FIELDS[answer.size],
  });
}

async function handle(request: IncomingMessage, response: ServerResponse): Promise<void> {
  const url = new URL(request.url ?? "/", "http://localhost");
  const path = url.pathname.slice(CNPJ_FIXTURE_PREFIX.length);
  if (request.method === "POST" && path === "/test/answer") {
    const body = await readJson(request);
    const cnpj = digitsOf(body.cnpj);
    answers.set(cnpj, {
      situation: situationOf(body.situation),
      legalName: typeof body.legalName === "string" ? body.legalName : "",
      size: sizeOf(body.size),
    });
    json(response, 200, { cnpj });
    return;
  }
  const match = /^\/v1\/([0-9A-Za-z]+)$/.exec(path);
  if (request.method === "GET" && match?.[1] !== undefined) {
    answerCompany(response, digitsOf(match[1]));
    return;
  }
  json(response, 404, { message: "Rota do substituto do CNPJ não encontrada" });
}

async function handleSafely(request: IncomingMessage, response: ServerResponse): Promise<void> {
  try {
    await handle(request, response);
  } catch (error) {
    logger.error("e2e.cnpj_fixture_failed", { error });
    json(response, 500, { message: "Falha no substituto do CNPJ" });
  }
}

export function cnpjFixture(): Plugin {
  return {
    name: "sellbridge-e2e-cnpj",
    configureServer(server) {
      server.middlewares.use((request, response, next) => {
        if (!(request.url ?? "").startsWith(CNPJ_FIXTURE_PREFIX)) {
          next();
          return;
        }
        void handleSafely(request, response);
      });
    },
  };
}
