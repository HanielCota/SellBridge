/** Why connecting a store failed, as the OAuth callback tells the stores page in the URL. */
export const STORE_CONNECT_ERROR_MESSAGES = {
  unknown_marketplace: "Marketplace desconhecido",
  unavailable: "Este marketplace ainda não está disponível",
  invalid_response: "Resposta de autorização inválida",
  cancelled: "A conexão foi cancelada no marketplace",
  expired: "A solicitação de conexão expirou. Tente conectar novamente.",
  marketplace: "O marketplace recusou a conexão. Tente de novo em instantes.",
  shop_in_use:
    "Esta loja já está conectada em outra conta do SellBridge. Desconecte-a lá antes de conectar aqui.",
  plan_limit: "Seu plano não permite mais lojas. Veja os planos em Assinatura.",
  supplier_unavailable:
    "Este fornecedor não está mais disponível. Escolha outro fornecedor para a nova loja.",
  impersonating: "Não é possível conectar lojas durante o acesso como cliente.",
  email_not_verified:
    "Confirme seu e-mail antes de conectar uma loja nova. Reenvie o link na Visão geral.",
  failed: "Não foi possível conectar a loja",
} as const;

export type StoreConnectErrorCode = keyof typeof STORE_CONNECT_ERROR_MESSAGES;

export const STORE_CONNECT_ERROR_CODES = [
  "unknown_marketplace",
  "unavailable",
  "invalid_response",
  "cancelled",
  "expired",
  "marketplace",
  "shop_in_use",
  "plan_limit",
  "supplier_unavailable",
  "impersonating",
  "email_not_verified",
  "failed",
] as const satisfies readonly StoreConnectErrorCode[];
