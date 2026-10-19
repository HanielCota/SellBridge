# Glossário de UX do SellBridge

Termos e tom de voz que todos os textos de tela, rótulos e legendas (tooltips) seguem. Termo novo entra aqui **antes** de ser usado. Plano do trabalho: [PLANO-UX-ICONES.md](PLANO-UX-ICONES.md).

## Tom de voz

- Tratamento por **você**, nunca "o senhor" ou "a senhora". Ex.: "Você lucrou R$ 5.437 no período".
- Frases curtas, no presente, dizendo o que a pessoa consegue fazer: "Veja seus pedidos e envie as etiquetas", não "Módulo de gestão de pedidos".
- Sem termos técnicos: nada de "sincronizar webhook", "SKU", "token", "API" em tela de revendedor ou fornecedor (a área de integrações é a exceção, pois é para quem pediu).
- Legenda (tooltip): uma frase de até ~80 caracteres, sem ponto final, começando por verbo ou pelo que aparece ali.
- Botão desabilitado: diga o motivo e o que fazer para liberar. Ex.: "Conecte uma loja para publicar este produto".
- Números e dinheiro no padrão brasileiro: R$ 1.234,56; datas como "16 de out." ou "16/10/2026".

## Áreas e perfis

| Termo               | Use para                                                                           | Não use                                                    |
| ------------------- | ---------------------------------------------------------------------------------- | ---------------------------------------------------------- |
| Revendedor          | Quem vende no marketplace usando o catálogo dos fornecedores (perfil "Revendedor") | vendedor, lojista, cliente (em tela do próprio revendedor) |
| Fornecedor          | Quem fornece os produtos e despacha os pedidos                                     | distribuidor, parceiro                                     |
| Equipe (SellBridge) | Quem trabalha na administração                                                     | admin, staff (em texto de tela)                            |
| Cliente             | Revendedor ou fornecedor visto pela equipe, na área de administração               | usuário, conta                                             |

## Catálogo e vendas

| Termo                       | Significado                                                              | Não use                                               |
| --------------------------- | ------------------------------------------------------------------------ | ----------------------------------------------------- |
| Produto                     | Item do catálogo de um fornecedor                                        | item, SKU, mercadoria                                 |
| Código                      | Identificação do produto dada pelo fornecedor (na busca)                 | SKU                                                   |
| Publicação                  | Produto publicado em uma loja do revendedor (aba "Publicações")          | listing                                               |
| Anúncio                     | A página do produto dentro do marketplace (o que o comprador vê)         | publicação, quando se fala do que está no marketplace |
| Loja                        | Conta do marketplace conectada ao SellBridge (ex.: Mercado Livre)        | integração, canal                                     |
| Pedido                      | Uma compra feita por um comprador no marketplace                         | venda, quando se fala de um pedido específico         |
| Vendas                      | Total ou contagem de pedidos em relatórios ("172 vendas no período")     | pedidos, em indicadores de faturamento                |
| Comprador                   | Quem comprou no marketplace                                              | cliente (reservado para a área de administração)      |
| Estoque                     | Quantidade disponível de um produto                                      | saldo, inventário                                     |
| Custo                       | Quanto o revendedor paga ao fornecedor pelo produto                      | preço de custo, CMV                                   |
| Preço                       | Quanto o comprador paga no anúncio                                       | valor de venda                                        |
| Lucro                       | Receita menos custo e taxas                                              | ganho, margem (margem é percentual)                   |
| Margem                      | Lucro em percentual do preço                                             | lucro                                                 |
| Saudável / baixa / prejuízo | Faixas da margem no preço: verde, amarelo, vermelho                      | boa, ruim                                             |
| Taxa do marketplace         | O que o Mercado Livre cobra por venda (média; muda com a categoria)      | comissão, fee                                         |
| Receita                     | Soma do que os compradores pagaram                                       | faturamento                                           |
| Ticket médio                | Valor médio de cada pedido no período (receita ÷ pedidos)                | ticket, valor médio por venda                         |
| Unidades                    | Quantidade de itens vendidos                                             | unid., qtd.                                           |
| Não conta como venda        | Pedido não pago, cancelado ou devolvido: fica fora da receita e do lucro | fora da receita, inválido                             |
| Repasse                     | Valor que o marketplace libera para o revendedor                         | saque, transferência                                  |

## Envio e atendimento

| Termo               | Significado                                                         | Não use                                  |
| ------------------- | ------------------------------------------------------------------- | ---------------------------------------- |
| Envio               | Despacho de um pedido pelo fornecedor                               | fulfillment, remessa                     |
| Operar pedido       | Abrir o pedido para encaminhar, imprimir etiquetas e acompanhar     | gerenciar, processar                     |
| Atrasado            | Prazo de aceite, despacho ou entrega já passou (ícone de relógio)   | vencido, overdue                         |
| Loja simulada       | Loja de teste do SellBridge: os pedidos dela não são reais          | loja mock, sandbox                       |
| Etiqueta            | Etiqueta de envio do pedido                                         | label, rótulo                            |
| Código de rastreio  | Código para acompanhar a entrega                                    | tracking                                 |
| Chamado             | Pedido de ajuda aberto no Suporte                                   | ticket                                   |
| Suporte             | Onde se fala com a equipe do SellBridge                             | ajuda, central, help desk                |
| Avisos              | Notificações do sino                                                | notificações, alertas (em texto de tela) |
| Avaliação           | Nota e comentário deixados pelo comprador                           | review, feedback                         |
| Score               | Nota de 0 a 100 do fornecedor, pelas avaliações dos últimos 90 dias | reputação, ranking                       |
| Fornecedor destaque | Score 90 ou mais, nota 4,7 ou mais e pelo menos 30 pedidos          | top, premium                             |
| Novo fornecedor     | Fornecedor com menos de 10 avaliações, ainda sem score              | sem nota                                 |
| Meta                | Limite de devoluções ou cancelamentos; acima dele o score cai       | target, limite                           |

## Ações (verbos padronizados)

| Ação                                | Verbo na tela      | Observação                                                   |
| ----------------------------------- | ------------------ | ------------------------------------------------------------ |
| Procurar                            | Buscar             | "Buscar pedidos, produtos e lojas"                           |
| Baixar um arquivo pronto            | Baixar             | "Baixar etiqueta", "Baixar modelo CSV"                       |
| Gerar arquivo a partir de dados     | Exportar           | "Exportar relatório" (ícone diferente de "Baixar")           |
| Enviar arquivo                      | Importar / Anexar  | Importar = planilha de produtos; Anexar = arquivo em chamado |
| Mudar dados                         | Editar             |                                                              |
| Apagar de vez                       | Excluir            | Sempre com confirmação                                       |
| Tirar de uma lista sem apagar       | Remover            |                                                              |
| Copiar para a área de transferência | Copiar             | "Copiar link", "Copiar código" (mesmo ícone)                 |
| Ver a lista completa de um resumo   | Ver tudo           | Seta ↗; a legenda diz para onde vai                          |
| Mudar o jeito de mostrar um gráfico | Gráfico            | Ícone de gráfico, não de engrenagem                          |
| Pôr produtos à venda numa loja      | Publicar           | Um ícone só (avião de papel), para um produto ou vários      |
| Desmarcar tudo o que foi marcado    | Limpar             | X; no celular só o X, com legenda                            |
| Ver fornecedores                    | Ver por fornecedor | Ícone de fábrica                                             |
| Criar um pedido de teste            | Simular venda      | Sempre dizer que é teste e não cobra ninguém                 |
| Registrar a próxima etapa do envio  | Marcar como …      | "Marcar como aceito", nunca só o nome da etapa no botão      |
| Repetir algo que falhou             | Tentar de novo     |                                                              |
| Voltar a um estado anterior         | Restaurar          | ícone diferente de "Tentar de novo"                          |
| Sair da conta                       | Sair               | ícone exclusivo; "Desconectar loja" usa outro                |
