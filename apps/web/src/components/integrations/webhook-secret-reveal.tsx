import {
  CodeSnippet,
  OneTimeSecretWarning,
  SecretField,
} from "@/components/integrations/secret-field";

/** Same algorithm as docs/api.md and packages/shared/src/public-api/webhook-signature.ts. */
const VERIFICATION_SNIPPET = [
  'import { createHmac, timingSafeEqual } from "node:crypto";',
  "",
  '// header: valor de "SellBridge-Signature" (t=...,v1=...)',
  "// rawBody: o corpo exatamente como chegou, antes do JSON.parse",
  "export function isValidSignature(header, rawBody, secret) {",
  "  const parts = Object.fromEntries(",
  '    header.split(",").map((part) => part.trim().split("=", 2)),',
  "  );",
  "  const timestamp = Number(parts.t);",
  "  if (!Number.isInteger(timestamp) || !parts.v1) return false;",
  "  // Recusa assinaturas com mais de 5 minutos.",
  "  if (Math.abs(Date.now() / 1000 - timestamp) > 300) return false;",
  '  const expected = createHmac("sha256", secret)',
  "    .update(`${timestamp}.${rawBody}`)",
  "    .digest();",
  '  const received = Buffer.from(parts.v1, "hex");',
  "  return (",
  "    received.length === expected.length && timingSafeEqual(received, expected)",
  "  );",
  "}",
].join("\n");

/** The signing secret right after creation, with the code that checks each delivery. */
export function WebhookSecretReveal({ secret }: { secret: string }) {
  return (
    <div className="grid min-w-0 gap-5">
      <OneTimeSecretWarning>
        Guarde o segredo agora no servidor que recebe os eventos. Por segurança, ele não será
        mostrado de novo; se perder, exclua o webhook e crie outro.
      </OneTimeSecretWarning>
      <SecretField
        id="webhook-secret"
        label="Segredo de assinatura"
        value={secret}
        copyLabel="Copiar segredo"
      />
      <p className="text-sm text-muted-foreground">
        Cada entrega é um <code>POST</code> com o cabeçalho <code>SellBridge-Signature</code>: o
        HMAC-SHA256 de <code>{"${t}.${corpo}"}</code> com este segredo. Responda 2xx em até 10
        segundos; falhas são tentadas de novo por cerca de 11 horas.
      </p>
      <CodeSnippet
        id="webhook-verification"
        title="Verificação em Node.js"
        code={VERIFICATION_SNIPPET}
        copyLabel="Copiar código"
      />
    </div>
  );
}
