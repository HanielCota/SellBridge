# 2026-11-23: Anúncio da grade no Mercado Livre (variações, fatia 5)

Guilherme aprovou o plano das fatias 5 e 6 em 23/11 ("Pode começar"). Vale só com `PRODUCT_GRID_ENABLED` ligada; desligada, publicar uma grade responde "não encontrado".

- **No Mercado Livre:** modelo User Products, como a documentação oficial manda para contas com a tag `user_product_seller` (relida em 23/11: "User Products", "Preço por variação", "Estoque distribuído").
  - Cada cor e tamanho é um item próprio, todos com o mesmo `family_name`.
  - O ML junta os itens numa página pelos atributos comuns. O comprador escolhe ali a cor e o tamanho.
  - Cada item tem preço, estoque, SKU e fotos da cor próprios.
- **Do nosso lado, cada combinação publicada é uma publicação normal** (`listings` e `listing_targets`). A tabela nova `listing_families` junta as publicações de uma grade (`listings.family_id`): um registro por revendedor e modelo, com o nome da família.
  - Por isso a sincronização de estoque e preço, os pedidos, a reserva do tamanho certo, a pausa e o "tentar de novo" continuam iguais, sem código novo.
  - Muda o plano de 18/11, que previa `listings.model_id`, `listing_variants` e `listing_target_variants`. Aquele desenho obrigava a ensinar a sincronização, os pedidos e as telas a ler variantes dentro de um anúncio. Este chega ao mesmo resultado no ML.
- **Publicar depois o que faltava** (um tamanho que estava sem estoque, por exemplo): entra na mesma família, com o nome que ela já tem. Trocar o nome separaria os itens no ML.
- **Tamanho com anúncio avulso na loja** (decisão A de 18/11): fica fora da grade naquela loja, com o nome da loja no aviso. Nas outras lojas, entra.
- **Sem estoque:** o tamanho fica fora, com aviso. Pelo menos um tamanho precisa ter estoque.
- **Preço:** um preço para a grade e, se o revendedor quiser, um preço próprio por tamanho. O piso de lucro vale para cada tamanho, com as taxas do ML de cada um. Um tamanho que daria prejuízo recusa a grade inteira, antes de gravar qualquer coisa.
- **Limite do plano:** cada tamanho publicado numa loja usa uma vaga, igual a hoje e igual à contagem do ML (Guilherme, 23/11: "um por tamanho então").
- **Loja do ML sem `user_product_seller`:** a grade não é publicada nela, com aviso em português. Mandar itens soltos com título deixaria tamanhos espalhados em páginas diferentes.
- **"Separar de novo"** (fatia 4) é recusado quando algum revendedor já anuncia a grade como uma família. O modelo fica travado durante a checagem, então uma publicação que começa nessa hora espera.
- **Descartado:**
  - O anúncio clássico com `variations`: o ML não aceita mais em conta com a tag (erro 400) e obriga o mesmo preço em todas as variações.
  - Uma grade contar uma vaga só no plano: deixaria publicar milhares de itens no ML com o limite de 300.
- **Fica para a fatia 6:** as telas do revendedor (catálogo com o card do modelo, nova publicação da grade, publicação em massa, Publicações e venda manual).
- **Fica de fora:** a grade pela API pública, a Shopee e o TikTok, e a tabela de medidas (SIZE_GRID_ID). Se uma categoria de roupa exigir tabela de medidas, a validação dos atributos obrigatórios avisa na publicação.
