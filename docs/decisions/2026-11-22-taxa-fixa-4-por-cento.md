# 2026-11-22: Taxa do SellBridge fixa em 4%, sem campo no admin

**Decisão:** a taxa que o SellBridge fica de cada pagamento do revendedor ao fornecedor é fixa em 4% do preço dos produtos, escrita no código. O admin deixa de ter o cartão "Taxa do SellBridge nos pagamentos" em Configurações. Guilherme, 22/11/2026: "Remove do painel de admin aquela parte da taxa acho q n precisa colocar deixa fixo em 4%".

**Substitui:** a taxa editável no admin, decidida em 17/11/2026 (`docs/decisions.md`, "Taxa da plataforma", Guilherme: "Vamos de A então"), e o padrão de 4% enquanto nada fosse salvo (`2026-11-18-taxa-padrao-4-por-cento.md`). Continua valendo o registro de 21/11 (`2026-11-21-taxa-sobre-o-produto-e-extrato.md`): a taxa é só sobre o produto, sem frete, sai da parte do fornecedor e não aparece para o revendedor.

- **Onde:** `PAYMENT_FEE_BASIS_POINTS = 400` em `packages/shared/src/domain/shipment-payments.ts`. É a única origem da taxa: o pagamento novo ao fornecedor (que vira o split do Asaas) e o texto do fornecedor ("o SellBridge fica com 4%") leem esse valor.
- **Pagamentos já feitos não mudam:** cada pagamento continua guardando a taxa com que foi cobrado (`platform_fee_cents` e `platform_fee_basis_points`), e o extrato do fornecedor mostra esses valores guardados.
- **Se a produção tinha outra taxa salva no admin,** os pagamentos novos passam a ser de 4%, que é o pedido.
- **O banco fica como está:** a coluna `platform_settings.payment_fee_basis_points` não é mais lida nem escrita, mas não foi apagada neste PR. Uma limpeza futura pode apagá-la numa migração própria.
- **Mudar o valor** passa a ser uma mudança de código, com PR e revisão.

## Descartado

- **Manter o campo no admin com 4% salvo.** É um campo que ninguém precisa mexer e que muda dinheiro com um clique.
- **Apagar a coluna no mesmo PR.** Junta mudança de banco a uma mudança de tela; fica para uma limpeza separada.
