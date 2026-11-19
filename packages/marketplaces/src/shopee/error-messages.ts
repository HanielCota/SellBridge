/**
 * Shopee refusals in the reseller's words: what happened, then what to do. The error names come
 * from the common errors of the v2 API reference (read on 2026-11-18). An error not listed here
 * gets a message naming it for support; Shopee's own words only go to the log (`client.ts`).
 */

const SUPPORT = "Fale com o suporte do SellBridge.";

const KNOWN_MESSAGES: Readonly<Record<string, string>> = {
  error_sign: `A Shopee recusou a assinatura do SellBridge. ${SUPPORT}`,
  invalid_partner_id: `A Shopee não reconheceu o aplicativo do SellBridge. ${SUPPORT}`,
  error_partner_key_expired: `A chave do aplicativo do SellBridge na Shopee venceu. ${SUPPORT}`,
  error_api_permission: `O SellBridge ainda não tem permissão na Shopee para esta ação. ${SUPPORT}`,
  error_api_call_restricted: `A Shopee restringiu o aplicativo do SellBridge. ${SUPPORT}`,
  source_ip_undeclared: `A Shopee bloqueou o endereço do servidor do SellBridge. ${SUPPORT}`,
  error_rate_limit: "A Shopee pediu para esperar um pouco. Tentaremos de novo em alguns minutos.",
  error_limit: "A Shopee atingiu o limite de chamadas do dia. Tentaremos de novo mais tarde.",
  shop_banned:
    "A loja está bloqueada na Shopee. Resolva o bloqueio na Central do Vendedor e conecte a loja de novo.",
};

/** Keeps only the characters an error name has, so the message never echoes arbitrary text. */
function errorName(error: string): string {
  return error.replace(/[^\w.]/g, "").slice(0, 60);
}

/** The refusal of a Shopee `error` in Portuguese; unknown names are given for support. */
export function explainShopeeError(error: string, httpStatus: number): string {
  const known = Object.hasOwn(KNOWN_MESSAGES, error) ? KNOWN_MESSAGES[error] : undefined;
  if (known !== undefined) {
    return known;
  }
  const name = errorName(error);
  if (name === "") {
    return `A Shopee respondeu com um erro inesperado (HTTP ${httpStatus}). Tente de novo em alguns minutos.`;
  }
  return `A Shopee recusou a operação (código ${name}). Fale com o suporte do SellBridge informando esse código.`;
}
