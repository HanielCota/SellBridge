import { SIGNING_CODE_TTL_IN_MINUTES } from "../domain/contract-signing.ts";
import { renderNoticeEmail, type RenderedEmail } from "./layout.ts";

/** The code that confirms a contract signature; the code is the only secret in it. */
export function contractCodeEmail(
  input: { code: string; contractTitle: string },
  appUrl: string,
): RenderedEmail {
  return renderNoticeEmail(
    {
      subject: `Seu código para assinar: ${input.code}`,
      preview: `Use este código para assinar o ${input.contractTitle.toLowerCase()}.`,
      heading: input.code,
      paragraphs: [
        `Digite este código na tela para assinar o ${input.contractTitle.toLowerCase()} da SellBridge.`,
        `Ele vale por ${SIGNING_CODE_TTL_IN_MINUTES} minutos.`,
      ],
      footnote:
        "Se não foi você que pediu, ignore este e-mail: sem o código, nada é assinado. Nunca passe este código para ninguém.",
    },
    appUrl,
  );
}
