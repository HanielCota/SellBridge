# 2026-11-19: Grade pela planilha do painel e pelo catálogo do EnvioVelox

Fatia 3 da Margot#1058 (variações de cor e tamanho), no plano aprovado pela Central. Vale só com `PRODUCT_GRID_ENABLED` ligada; desligada, as duas planilhas ficam como antes.

- **A grade só nasce para SKUs novos.** Se uma linha do grupo já existe como produto separado, o grupo inteiro entra separado, com o título "Nome - Cor Tamanho", e a prévia avisa. Juntar produtos que já existem numa grade fica para a tela da fatia 4, sempre com confirmação. Assim, reimportar um catálogo antigo não muda nada do que já está cadastrado.
- **Planilha do painel (3a):** as colunas `codigo_modelo`, `cor` e `tamanho`. Linhas com o mesmo código formam uma grade.
  - O título, a descrição, a categoria, a ficha e o fiscal são comuns a todas as linhas do código. Uma célula em branco herda o valor das outras linhas; um valor diferente é erro, com o número da linha.
  - Cada linha tem o próprio SKU, custo, preço, estoque, código de barras e peso.
  - As fotos de uma linha são as fotos da cor dela.
  - A grade feita no formulário ganha um código automático, gerado do título.
- **Catálogo do EnvioVelox (3b):** o arquivo não traz código do modelo, então o grupo sai do próprio arquivo.
  - **Grupo:** as linhas com o mesmo "Nome produto" e com cor ou tamanho.
  - **Código:** gerado desse nome ("Tênis Casual Couro" vira `TENIS-CASUAL-COURO`).
  - **Tamanho:** "Único" conta como sem tamanho.
  - **Só vira grade com duas linhas ou mais.** Um produto com uma cor e um tamanho só continua um produto separado, como antes.
  - **Comum da grade:** o título e a descrição vêm da linha que tem anúncio da Shopee, se houver. As fotos de uma cor juntam as fotos de todos os tamanhos dela. Assim, linhas do mesmo produto nunca brigam entre si.
- **Descartado:**
  - Usar o "SKU de referência" da Shopee como código. Ele só existe quando a planilha da Shopee vem junto, então o mesmo produto ganharia códigos diferentes conforme o envio.
  - Transformar em grade uma linha sozinha com cor. Isso mudaria quase todo o catálogo atual, em que cada produto tem uma cor.
- **Limitação conhecida:** um arquivo do EnvioVelox com um só tamanho novo de um modelo que já existe cria um produto separado, não aumenta a grade. O catálogo do EnvioVelox sai sempre inteiro, então isso só acontece com um arquivo cortado à mão.
