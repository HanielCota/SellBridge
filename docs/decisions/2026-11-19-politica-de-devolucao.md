# 2026-11-19: Política de devolução (etapa 1, prazos e quem paga)

Quando o pacote volta, o fornecedor confere o produto e responde. Sem resposta no prazo, vale o que o revendedor contou. Escolhida pelo Guilherme em 18/11/2026 ("Vamos de B"); o plano foi aprovado com "Aprovo, pode codar".

- **Dois caminhos:**
  - **O pacote volta ao fornecedor:** o fornecedor responde até 1 dia antes do prazo do Mercado Livre ou, sem esse prazo, em 3 dias úteis.
  - **O pacote volta ao revendedor:** o revendedor reenvia em até 7 dias. O fornecedor tem 3 dias úteis a partir da chegada. Sem reenvio no prazo, a devolução se encerra sem crédito.
- **Dias úteis:** de segunda a sexta, no horário de Brasília. O prazo vence à meia-noite depois do último dia. Feriados ficam fora por enquanto.
- **Quem paga:**
  - defeito, avaria ou produto errado: o fornecedor devolve o custo e paga o frete da volta;
  - arrependimento ou não entregue: o fornecedor devolve o custo, e o revendedor paga o frete.
  - O revendedor fica com as tarifas do marketplace.
  - Sem motivo informado, conta como arrependimento.
- **Fotos:** defeito, avaria e produto errado pedem foto do revendedor. O fornecedor que discorda manda foto, e a devolução vai para a equipe decidir.
- **Estoque:** volta uma vez só, e só quando o fornecedor diz que dá para vender de novo. Volta só a unidade que tinha saído da prateleira. A coluna `stock_returned_at` impede a segunda volta.
- **Dinheiro:** cada devolução encerrada guarda o que o fornecedor deve (custo em `credited_cents` e frete em `supplier_owes_shipping_cents`). Mover o dinheiro é a etapa 2. Enquanto a devolução está aberta, o status continua `in_review`, e o pagamento ao fornecedor segue retido como antes.
- **Configuração:** o prazo do fornecedor fica na tela de configurações do admin, entre 1 e 5 dias úteis, com 3 como padrão.
- **Prazo vencido:** uma tarefa do worker encerra a cada 15 minutos as devoluções com prazo vencido.
- **Devoluções antigas:** as que já existiam seguem o fluxo de antes, decididas pela equipe. O mesmo vale para o fornecedor que a equipe opera sem conta própria.
- **Fora:**
  - mover o dinheiro (etapa 2);
  - cancelar no marketplace;
  - ler as reclamações do Mercado Livre: o prazo do Mercado Livre fica vazio até isso entrar;
  - Shopee e TikTok;
  - feriados.
