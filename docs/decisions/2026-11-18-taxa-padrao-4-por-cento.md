# Taxa do SellBridge nos pagamentos: padrão de 4% (18/11/2026)

**Decisão:** a taxa que o SellBridge fica de cada pagamento do revendedor ao fornecedor passa a ter padrão de 4%. Decisão do Guilherme com a Central em 18/11/2026: "Fica 4% mesmo".

- **Quem paga:** o fornecedor, como antes. A taxa sai da parte dele, e o lucro do revendedor não muda.
- **Continua editável:** o admin muda a taxa em Configurações, como antes. O padrão vale só enquanto nenhuma taxa foi salva.
- **Taxa já salva continua como está:** quem já salvou uma taxa no admin (inclusive 1% ou 0%) segue com ela; só o padrão muda.
- **Onde:** `DEFAULT_PAYMENT_FEE_BASIS_POINTS` em `packages/shared/src/domain/shipment-payments.ts`, de 100 para 400 pontos-base.
- **Por que 4%:** é o percentual que o cliente pediu desde o começo (lacunas, bloco C, item C4). O 1% era um valor provisório do código.
- **Descartado:** manter 1% até o cliente responder (o cliente raramente responde, e a decisão agora é do Guilherme).
