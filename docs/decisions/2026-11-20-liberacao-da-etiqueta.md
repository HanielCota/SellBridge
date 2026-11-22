# 2026-11-20: A equipe libera a etiqueta presa da venda à ordem

Na venda à ordem, a etiqueta do Mercado Livre espera as notas: a de venda do revendedor (no Mercado Livre, já lá) e a remessa autorizada do fornecedor, que vai na caixa. Quando uma nota não pode sair, a equipe SellBridge libera a etiqueta daquela parcela. Escolhido pelo Guilherme em 20/11/2026 ("Sim, equipe libera"), como a prática do mercado: trava com o motivo, liberação por quem tem permissão, com registro. As melhorias da revisão do PR 332 foram aprovadas no mesmo dia ("Sim, as cinco depois da parte 6").

- **Quando:** a nota trava de vez. Exemplos: o Bling do fornecedor desconectou, a SEFAZ recusou a remessa ou o revendedor perdeu o CNPJ.
- **Quem:** supervisor ou administrador (permissão `shipments.release_label`). O atendente vê a trava, mas não libera.
- **Como:** em Admin › Envios, no detalhe da parcela. O motivo é obrigatório, com pelo menos 10 letras, e a consequência aparece escrita antes do botão.
- **O que fica registrado:** na própria parcela, quem liberou, quando e por quê. A caixa da parcela mostra isso para a equipe.
- **O que a liberação faz:**
  - A parcela deixa de segurar a etiqueta.
  - Num carrinho do Mercado Livre, a etiqueta é uma só para todos os pedidos. Se outro pedido do carrinho ainda espera, a etiqueta continua presa, e a mensagem diz que é por outro pedido.
- **O que a liberação não faz:**
  - Não emite nota nenhuma nem libera parcela cujas notas já estão prontas. Nesse caso não há o que liberar, e o pedido é recusado.
  - Não pode ser desfeita nem sobrescrita: a primeira liberação vale.
- **Remessa no Mercado Livre:** abre só quando a nota do revendedor já está lá, e não apenas digitada. Uma parcela liberada com a nota só digitada sai sem a remessa até o revendedor enviar o XML; a remessa abre em seguida. Isso é intencional: a remessa citaria uma nota que o Mercado Livre não tem.
- **Para o revendedor:** a etiqueta presa diz o que falta e termina com "Se a nota não puder sair, fale com o suporte do SellBridge."
- **Descartado:**
  - liberar sozinho quando a nota trava, porque o pacote sairia sem a nota sem ninguém decidir;
  - só mostrar o motivo, sem liberação, porque o pacote ficaria parado por dias.
