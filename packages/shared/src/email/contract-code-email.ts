import { SIGNING_CODE_TTL_IN_MINUTES } from "../domain/contract-signing.ts";
import { renderNoticeEmail, type RenderedEmail } from "./layout.ts";

/**
 * The code that confirms a contract signature. The code stays out of the subject: the mailer logs
 * every subject, and phones show it on the locked screen.
 */
export function contractCodeEmail(
  input: { code: string; contractTitle: string },
  appUrl: string,
): RenderedEmail {
  return renderNoticeEmail(
    {
      subject: "Seu código para assinar o contrato do SellBridge",
      preview: `Use este código para assinar o ${input.contractTitle.toLowerCase()}.`,
      heading: input.code,
      paragraphs: [
        `Digite este código na tela para assinar o ${input.contractTitle.toLowerCase()} do SellBridge.`,
        `Ele vale por ${SIGNING_CODE_TTL_IN_MINUTES} minutos.`,
      ],
      footnote:
        "Se não foi você que pediu, ignore este e-mail: sem o código, nada é assinado. Nunca passe este código para ninguém.",
    },
    appUrl,
  );
}
