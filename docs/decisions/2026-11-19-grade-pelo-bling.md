# 2026-11-19: Grade pelas variações do Bling

Fatia 3c da Margot#1058 (variações de cor e tamanho), no plano aprovado pela Central. Vale só com `PRODUCT_GRID_ENABLED` ligada; desligada, a importação do Bling fica como antes.

- **Produto com variações ("V") vira grade:** cada variação vira uma combinação, quando todas as variações ativas são nomeadas só por cor e tamanho.
  - **De onde vêm a cor e o tamanho:** do nome da variação no Bling (`variacao.nome`, por exemplo "Cor:Preto;Tamanho:38"). Se a resposta não trouxer esse nome, eles vêm do que o nome completo da variação acrescenta ao nome do produto pai, como em "BABUCHE NUVEM Cor:MARINHO;Tamanho:33/34".
  - **Como os nomes são lidos:** sem diferença de acento nem de maiúscula. "Numeração" conta como tamanho.
  - **Código do modelo:** o código do produto pai no Bling. Sem código, `BLING-<id>`.
  - **Nome do modelo:** o nome do produto pai.
- **Variação de outra coisa entra separada, como antes, com aviso.** Isso vale para voltagem, sabor, uma opção repetida ou um valor longo demais. A prévia do Bling diz quantos produtos entram assim.
- **Dados comuns da grade:** a descrição, a marca, o peso da embalagem e o fiscal vêm da primeira variação que tiver o dado. As fotos de uma cor juntam as fotos de todos os tamanhos dela. O Bling costuma preencher esses dados só em algumas variações, e assim elas não brigam entre si.
- **Cada combinação recebe o id da própria variação no Bling (`erp_product_id`) logo depois da importação.** O produto simples recebe o id dele. A regra do estoque do Bling não muda:
  - um produto já ligado continua com a ligação que tem;
  - uma leitura mais velha não vale mais que uma mais nova;
  - se a ligação falhar, o estoque automático acha o mesmo SKU na conferência seguinte, a cada 15 minutos.
- **O resto é o mesmo da planilha:** valem as regras da fatia 3a (`2026-11-19-grade-pela-planilha-e-envio-velox.md`). A grade só nasce para SKUs novos. Uma grade que já existe ganha as combinações novas. Uma leitura grande, dividida em arquivos de 1.000 linhas, continua a mesma grade de um arquivo para o outro.
- **Descartado:** transformar em grade a variação de qualquer atributo. O SellBridge e os marketplaces só têm dois eixos, cor e tamanho; voltagem ou sabor na grade virariam anúncio errado.
