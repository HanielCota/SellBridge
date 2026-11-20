# 2026-11-19: Estoque do Bling atualizado sozinho

## O que foi decidido

O estoque dos produtos de um fornecedor com Bling tem um dono só: o Bling dele. O SellBridge acompanha esse número sozinho, pelos dois caminhos que os hubs de marketplace (Bling, Tiny, UpSeller, Anymarket) usam juntos:

1. **Aviso na hora.** O Bling avisa quando o estoque muda. O endereço é `POST /api/webhooks/bling` e os recursos são `stock` e `virtual_stock`. O SellBridge confere a assinatura e lê o saldo atual daquele produto.
2. **Conferência a cada 15 minutos.** Ela lê o saldo de todos os produtos ligados ao Bling e pega o aviso que se perdeu.

O número novo chega aos anúncios dos revendedores pela sincronização de estoque que já existe. O estoque de segurança continua valendo.

Decisão do Guilherme, no chat da Central: "Vamos pelo certo sem quebra galhos". Plano aprovado em 19/11/2026: "Aprova os dois" (opção A, em dois PRs).

## Como funciona

- **Ligação produto ↔ Bling:** pelo SKU, que é o `codigo` no Bling (`GET /produtos?codigos[]=`). Cada produto guarda o id do Bling (`supplier_products.erp_product_id`). Código repetido em dois produtos do Bling fica sem ligação. Combinação da grade é um produto com SKU próprio e entra igual.
- **O que muda:** só a coluna `stock`, com o `saldoVirtualTotal` do Bling (o estoque já descontadas as reservas do próprio Bling), arredondado para baixo e nunca negativo. Nome, fotos, ficha, preço e custo nunca são tocados.
- **O aviso é só o gatilho.** O número sempre vem de uma leitura de `GET /estoques/saldos`, com até 100 produtos por chamada. Assim, aviso fora de ordem ou repetido não importa. Uma leitura só grava se começou depois da última gravada (`erp_stock_read_at`), para uma leitura mais lenta não apagar uma mais nova.
- **Zerados:** o filtro de saldo do Bling responde por padrão só os positivos. O que não vier é perguntado de novo como zerado e depois como negativo. O que não vier em nenhum dos três saiu do Bling: perde a ligação, e o estoque fica como está.
- **Empresa:** o aviso traz o `companyId`. A conferência lê o da conta (`GET /empresas/me/dados-basicos`) e guarda em `supplier_erp_connections.erp_company_id`. Se o fornecedor conectar outra empresa do Bling, todas as ligações são refeitas pelo SKU.
- **Resposta ao Bling:** aviso com assinatura errada recebe 401. Qualquer aviso assinado recebe 200, mesmo um que o SellBridge não usa, porque o Bling desliga o webhook depois de 3 dias de recusas.
- **Um limitador só:** a cota do Bling é de 3 chamadas por segundo por conta, somando tudo. O site, o worker do Bling e o worker de notificações passaram a reservar a vez no mesmo lugar, no Redis. Se o Redis cair, cada processo espaça as próprias chamadas.

## O intervalo de 15 minutos

O Bling permite 3 chamadas por segundo e 120.000 por dia por conta (developer.bling.com.br/limites). A conferência gasta perto de 1 chamada por 100 produtos (até 3 quando há zerados), mais 1 para a empresa e as buscas por SKU dos produtos ainda sem ligação.

Exemplo: um fornecedor com 2.000 produtos gasta de 20 a 60 chamadas por rodada. Isso ocupa uns 20 segundos da cota e soma até ~5.800 por dia, menos de 5% do limite diário. Rodar mais vezes gastaria cota sem ganho, porque o aviso já cobre o tempo real. 15 minutos é também o ritmo da sincronização com os canais.

## Por enquanto, só para quem tem a nota pelo Bling ligada

Hoje, a venda feita pelo SellBridge só baixa o estoque no Bling quando a NF-e sai pelo SellBridge (o pedido de venda no Bling baixa o estoque). Para um fornecedor sem a nota, o Bling não fica sabendo dessas vendas. A próxima leitura "devolveria" as unidades vendidas, e o revendedor venderia o que não existe. Por isso, este primeiro passo liga o automático só para quem tem a nota pelo Bling ligada.

O passo 2 (PR seguinte) lança a saída no Bling do fornecedor quando o pacote é enviado e a nota não saiu pelo SellBridge (`POST /estoques`, operação S). É só a baixa de estoque, nunca pedido nem nota, e precisa de um teste para nunca dar baixa duas vezes na mesma venda. Com ele, o automático liga para todos.

## Falhas, na página Problemas

- Conexão com o Bling expirada: o estoque fica no último número e não zera.
- Conferência falhando 3 vezes seguidas.
- O Bling com menos unidades do que o SellBridge já vendeu e ainda não enviou.
- A conferência corrigiu estoque sem nenhum aviso do Bling nas últimas 24 horas. Isso é sinal de webhook desligado no aplicativo do Bling, e a mensagem diz onde religar.

## O que fica fora

- Preço, custo, nome, fotos e ficha. O custo segue a decisão de 18/11: vale em 3 dias, com aviso.
- Fornecedor sem Bling.
- A planilha continua gravando o estoque que vier nela. Num produto ligado, a próxima conferência põe de volta o número do Bling.

## Configuração (uma vez, no portal do Bling)

No aplicativo do SellBridge no Bling, aba Webhooks: cadastrar o servidor `https://<site>/api/webhooks/bling` e ligar o recurso **Estoque** (ações criado, alterado e excluído; versão v1). O de estoque virtual liga junto. O aplicativo precisa do escopo de estoque.

## Descartado

- **Gravar o saldo que vem no próprio aviso:** a ordem dos avisos não é garantida e o `date` tem resolução de segundos. Ler o saldo de agora custa uma chamada e não erra.
- **Só a conferência, sem aviso:** o estoque ficaria até 15 minutos atrasado em toda venda fora do SellBridge.
- **Um quarto limitador para a conferência:** os três que já existiam já estouravam juntos a mesma cota.

## Fontes (lidas em 19/11/2026)

- https://developer.bling.com.br/webhooks: recursos, conteúdo, assinatura `X-Bling-Signature-256`, novas tentativas por 3 dias e entrega sem ordem garantida.
- https://developer.bling.com.br/limites: 3 por segundo, 120.000 por dia, bloqueios de IP.
- https://developer.bling.com.br/aplicativos: o token vale 6 horas e o de renovação, 30 dias.
- OpenAPI oficial: `GET /estoques/saldos` (`idsProdutos[]` até 100, `filtroSaldoEstoque` com padrão 1), `GET /empresas/me/dados-basicos` e `POST /estoques`.

## Passo 2: a saída das vendas do SellBridge lançada no Bling

Decisão do Guilherme, repassada pela Central em 19/11/2026: "Aprova os dois" (opção A).

- **O que é lançado:** a saída do item vendido pelo SellBridge, no Bling do fornecedor, quando o pacote é enviado e a NF-e não saiu pelo SellBridge. É o mesmo momento em que o SellBridge baixa o próprio estoque. Usa `POST /estoques` com a operação `S`, o produto ligado e a quantidade, a partir do depósito padrão ativo do Bling (ou do único ativo). A observação diz "SellBridge: venda do pedido <número>". Nunca é criado pedido nem nota.
- **Quem entra:** pacote com nota pelo SellBridge não recebe saída, porque o pedido de venda daquela nota já baixa o estoque no Bling. Isso vale também para o pacote que a fila de notas ainda vai pegar (ela roda a cada 2 minutos, e o pacote pode ser enviado antes). Produto sem ligação com o Bling também não recebe. Só entram vendas enviadas depois que o recurso ligou (`supplier_erp_connections.stock_exits_since`), nunca as antigas. Uma saída travada (conexão perdida, depósito padrão faltando) é lançada quando destravar, por mais tempo que tenha esperado.
- **Nunca duas vezes:** o `POST /estoques` do Bling não aceita chave de idempotência e a API não lista os lançamentos feitos. Por isso, cada item tem uma linha em `erp_stock_exits`, com chave única e reservada antes da chamada.
  - Acesso recusado ou limite de chamadas: o Bling com certeza não registrou, então a reserva é desfeita e a próxima rodada tenta de novo.
  - Recusa do Bling (4xx): a linha fica como "falhou".
  - Resultado desconhecido (tempo esgotado, 5xx, ou um worker que parou no meio por mais de 10 minutos): a linha fica como "incerta".
  - Nos dois últimos casos, nada é mandado de novo, e a página Problemas mostra o produto, o pedido e a quantidade para a equipe conferir no Bling.
- **Enquanto a saída não chega ao Bling:** a conferência de estoque desconta do saldo do Bling as unidades das saídas ainda não lançadas, para o SellBridge não voltar a vender o que já saiu. As saídas "falhou" e "incerta" ficam com a equipe e não são descontadas.
- **Limite de chamadas:** se o Bling responder com o limite de chamadas, as outras saídas do mesmo fornecedor esperam a próxima rodada.
- **Ritmo:** a cada minuto, para a saída chegar ao Bling antes que a conferência de 15 minutos leia o saldo antigo.
- **Sem depósito padrão:** se o Bling tiver vários depósitos ativos e nenhum padrão, nada é lançado e Problemas pede para o fornecedor marcar um.
- **Com isso, o automático vale para todo fornecedor com o Bling conectado.** O cartão do Bling deixa de falar da nota.
- **Fora:** devolução e cancelamento depois do envio não lançam entrada no Bling; o fornecedor confere quando a mercadoria volta.
