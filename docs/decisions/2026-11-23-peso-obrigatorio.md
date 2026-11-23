# 2026-11-23: Peso obrigatório no produto novo e o peso com embalagem na conta do frete

**Decisão:** a conta do frete (o preço mínimo, o lucro das prévias e as checagens de prejuízo) passa a usar o **peso com embalagem** que o fornecedor digita na ficha ("Peso da embalagem", `SELLER_PACKAGE_WEIGHT`) e, sem ele, o peso do produto da nota fiscal. Produto novo de fornecedor só vai para a venda com um desses pesos. Produto que já estava à venda sem peso continua vendendo com a estimativa de até 0,5 kg.

É a primeira parte da "calculadora só" (Margot#974, PR 3 do lucro real), aprovada em 18/11/2026 ("Aprovo todas": "o peso passa a ser obrigatório no cadastro do fornecedor").

**Quem decidiu.** Guilherme, 23/11/2026, no chat da calculadora única, uma escolha por vez:

1. Produtos que já existem sem peso: "vamos de A" (continuam vendendo; o fornecedor vê que falta o peso e o revendedor vê que o frete é estimado; só o produto novo exige peso).
2. Qual peso conta: "A" (peso com embalagem, senão o do produto).

## Como funciona

- **Uma regra só:** `shippingWeightGrams` (`packages/shared/src/domain/shipping-weight.ts`). A mesma regra em SQL é `productWeightGrams` (`packages/database/src/repositories/sql/product-weight.ts`), que alimenta todas as telas e checagens de preço; um teste do banco confere que as duas leem cada texto do mesmo jeito. A leitura do texto digitado ("850 g", "850", "450,2") é a mesma que o envio ao Mercado Livre usa (`readPackageMeasure`).
- **Quem exige:** a coluna nova `supplier_products.weight_required` (migração 0114), falsa para os produtos que já existiam e verdadeira em todo produto que um fornecedor cria daqui em diante: pelo painel, pela planilha, pelo Bling, pela equipe e nas combinações de uma grade. O produto próprio de um revendedor não é cobrado, como já acontece com os dados da nota.
- **Produto novo sem peso** fica como rascunho, com o aviso "Informe o peso com embalagem para publicar". Apagar o peso de um produto novo já aprovado o tira da venda, como apagar o NCM.
- **Produto antigo sem peso:** continua à venda. O fornecedor vê, nas melhorias do produto, "Informe o peso com embalagem: sem ele, o frete dos revendedores é estimado para até 0,5 kg". O revendedor vê, embaixo da prévia de lucro (novo anúncio e Editar preço), "O peso do produto não foi informado: o frete foi estimado para um pacote de até 0,5 kg."
- **Bling:** o peso que o Bling manda já ia para o peso da embalagem; agora ele entra na conta.
- **Efeito nos preços:** a embalagem pesa mais que o produto, então alguns preços mínimos sobem um pouco. Isso só aparece quando o revendedor mexe no preço, reativa um anúncio ou (com a segunda parte) quando o custo muda. Nenhum anúncio é pausado por causa desta mudança.

## Descartado

- **Proibir anúncio novo de produto sem peso** (opção B) e **prazo de 30 dias** (opção C): travariam revendedores em produtos que já vendem enquanto o fornecedor não preenche.
- **Continuar só com o peso do produto** (opção B da segunda escolha): o frete seguiria mais barato que o cobrado pelo Mercado Livre e o produto do Bling seguiria sem peso na conta.
- **Exigir o peso pelo `fiscal_required` que já existe:** produtos criados depois da regra fiscal e antes desta sairiam da venda na próxima edição.
