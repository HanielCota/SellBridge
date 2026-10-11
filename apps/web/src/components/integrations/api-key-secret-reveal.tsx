import {
  CodeSnippet,
  OneTimeSecretWarning,
  SecretField,
} from "@/components/integrations/secret-field";
import { apiKeyCurlExample } from "@/features/public-api/api-keys";

/**
 * The secret right after creation, with the one command that proves it works. Only rendered
 * in the browser after a click, so reading `window.location` is safe.
 */
export function ApiKeySecretReveal({ secret }: { secret: string }) {
  return (
    <div className="grid min-w-0 gap-5">
      <OneTimeSecretWarning>
        Copie e guarde a chave agora, num cofre de senhas ou nas variáveis de ambiente da sua
        integração. Por segurança, ela não será mostrada de novo.
      </OneTimeSecretWarning>
      <SecretField
        id="api-key-secret"
        label="Chave secreta"
        value={secret}
        copyLabel="Copiar chave"
      />
      <CodeSnippet
        id="api-key-curl"
        title="Teste no terminal"
        code={apiKeyCurlExample(window.location.origin, secret)}
        copyLabel="Copiar comando"
        wrap
      />
    </div>
  );
}
