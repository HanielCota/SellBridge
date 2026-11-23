# 2026-11-19: As duas notas do fornecedor na venda à ordem

Parte 3 da NF-e em venda à ordem (decisão de 2026-11-18). Pedido da Central em 19/11/2026, com o "Sim, manda" do Guilherme.

- **Ordem:** a remessa (fornecedor → comprador, 5923/6923) só começa depois que a nota de venda do revendedor é encontrada, e a venda ao revendedor (5119/6119) só depois que a SEFAZ autoriza a remessa. Cada nota cita a anterior: a remessa leva a chave da nota do revendedor em `documentoReferenciado`; a venda leva a chave da remessa no texto da nota.
- **A remessa é feita direto no Bling (`POST /nfe`), sem pedido de venda:** ela leva a mercadoria até o comprador mas não é uma venda do fornecedor, então não gera contas a receber. A venda ao revendedor sai de um pedido de venda, como no modelo A (baixa o estoque e gera o contas a receber).
- **Valor das duas notas:** o custo do revendedor (o que ele paga ao fornecedor). O valor da remessa fica para o contador confirmar.
- **CFOP:** os quatro códigos ficam no cadastro fiscal do fornecedor, com 5923/6923 e 5119/6119 de padrão (5118/6118 para quem fabrica). Dentro ou fora do estado: na remessa, compara o estado do fornecedor com o do comprador; na venda, com o do revendedor. Antes de ir para a SEFAZ, cada linha é conferida contra esses códigos, como no modelo A.
- **Natureza de operação:** os números das duas naturezas (remessa e venda à ordem) ficam na conexão do Bling, porque só valem para aquela conta. A tela para escolher entra na parte 4; sem elas, a nota para com o aviso de escolher.
- **Nunca em dobro:** uma nota feita sem pedido de venda não tem número da loja para ser achada de novo. Antes de criar a remessa, o SellBridge procura uma nota pendente do mesmo comprador, com a mesma natureza, desde a data da venda, cujo texto tenha o número do pedido.
- **Quem fica em cada modelo:** a nota que o envio ganha primeiro decide o modelo, e ele não muda depois. Revendedor com CPF continua na nota direta mesmo com fornecedor em venda à ordem.
- **Telas, até a parte 4:** o fornecedor e o revendedor veem a remessa no lugar da nota direta (é a nota que vai na caixa). O e-mail de nota emitida sai só para ela.
- **Descartado:** fazer a remessa por pedido de venda (geraria um contas a receber que não existe) e guardar as naturezas no cadastro fiscal (o cadastro é salvo inteiro pela tela de Marca e não depende da conta do Bling).
