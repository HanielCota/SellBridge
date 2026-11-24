# 2026-11-23: Endereço de compra do revendedor (parte 2: passo a passo; parte 3a: liberação pela equipe)

Continua a [parte 1 de 18/11](../decisions.md) ("Endereço de compra do revendedor nunca no fornecedor"). Os revendedores travados reclamavam: a trava não dizia o que mudar, e a equipe não tinha como liberar um alarme falso. Guilherme aprovou o plano em dois PRs em 23/11/2026 ("Aprovo, começa o A").

- **Passo a passo no cartão da loja, em Lojas:**
  - diz qual fornecedor bateu;
  - mostra o endereço desse fornecedor (rua, número e CEP), para o revendedor achá-lo na lista do Mercado Livre;
  - lista os passos numerados até o botão "Já arrumei, conferir de novo", que passa a ser o botão cheio do cartão travado.
  - O aviso amarelo (endereço de compra igual ao de envio) e o de conta sem endereço de compra ganham os mesmos passos.
- **Pedido de liberação:** o cartão travado tem o link "Não é o endereço do fornecedor? Peça a liberação", que abre um chamado já com a loja, o assunto e um texto de exemplo.
- **Liberação pela equipe (Admin › cliente › Lojas conectadas):** a loja travada mostra "Compras indo para [fornecedor]" e o botão "Liberar: é alarme falso", que pede o motivo (de 5 a 300 caracteres).
  - Liberada, a loja volta a publicar, sai de "Precisa de você" e do sino.
  - O cartão do revendedor passa a dizer "Liberada pela equipe", com o motivo.
  - A ação entra no histórico do cliente e na Auditoria.
- **Até quando vale:** enquanto a conta continuar comprando no endereço do mesmo fornecedor. Se o endereço for corrigido e depois voltar para um fornecedor (o mesmo ou outro), a trava volta. Uma queda do Mercado Livre não mexe na liberação.
- **Privacidade:**
  - O endereço mostrado é o do fornecedor, que o revendedor já tem cadastrado na própria conta. O do revendedor continua nunca guardado.
  - O motivo da liberação fica só na tabela da conferência, nunca no log, porque texto livre pode trazer um endereço.
  - O painel inicial recebe só o veredito, sem o endereço do fornecedor.
- **Banco:** três campos novos em `store_buyer_address_checks`:
  - `released_at`: quando a equipe liberou;
  - `released_by`: quem liberou;
  - `release_note`: o motivo.

  Uma regra no banco só aceita liberação em loja travada e com motivo.

- **Descartado:**
  - **liberar para sempre:** deixaria passar um revendedor que depois pusesse de fato o endereço do fornecedor;
  - **guardar um resumo do endereço para comparar:** seria guardar dado pessoal.
- **Ainda não (PR B):** as advertências do revendedor, o botão do fornecedor para reportar compra pessoal no endereço dele, a revisão da equipe e a 3ª advertência tirando o fornecedor da loja. Os prints do Mercado Livre no passo a passo (decisão 4 de 18/11) entram quando o Guilherme mandar os da conta dele, com os dados borrados.
