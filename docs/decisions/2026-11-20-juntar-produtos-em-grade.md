# 2026-11-20: Juntar produtos que já existem numa grade

Fatia 4 das variações de cor e tamanho. Guilherme aprovou o plano em 20/11 pela Central ("mãos a obra então"). Vale só com `PRODUCT_GRID_ENABLED` ligada; desligada, o botão não aparece e o servidor responde "não encontrado".

- **Onde fica:** em Produtos, o botão "Juntar cores e tamanhos" abre a tela "Sugestões de grade". A equipe pode fazer pelo fornecedor com o "agir como cliente"; o registro guarda quem agiu (a pessoa da equipe, quando é ela).
- **Sugestões, só leitura:**
  - **Quando dois produtos entram juntos:** o mesmo nome antes da cor e do tamanho, a mesma categoria e as mesmas 3 primeiras letras do SKU.
  - **Os dois formatos de nome:** o do EnvioVelox e da planilha ("Tênis Casual - Preto 38", pelo último " - ") e o do Bling ("Tênis Casual Cor:Preto;Tamanho:38").
  - **Cor e tamanho:** a última palavra é o tamanho quando parece um (número, "33/34", P a GG); o resto é a cor. Quando não dá para ler, os campos ficam vazios e a tela pede "confira".
  - **O que fica de fora:** produto que já está numa grade, grupo de um produto só e grupo de mais de 50.
  - **Produto principal sugerido:** o mais completo (à venda, com dados da nota, mais fotos e mais ficha).
  - **Ordem das cores:** a do primeiro SKU de cada cor.
- **Juntar, uma grade por confirmação:** os produtos marcados viram as combinações de um modelo novo.
  - **Não muda:** o id de cada produto, o SKU, o estoque, o reservado, o custo, o preço sugerido, a situação e o "à venda". Anúncios e pedidos apontam para o mesmo produto e não percebem nada.
  - **Muda:**
    - o nome vira "Modelo - Cor Tamanho";
    - a descrição, a ficha (sem código de barras, cor e tamanho, que são de cada produto), o fiscal, a categoria, a garantia, o vídeo, o "produto sob encomenda" e o "somente transportadora" passam a ser os do produto principal, e a tela diz isso antes de juntar;
    - as fotos de uma cor juntam as fotos dos produtos dessa cor;
    - o código de barras e o peso de cada produto continuam dele.
- **Recusas:** juntar nunca muda a situação de ninguém. A tela mostra o motivo ao lado do produto e o botão espera.
  - Cor e tamanho repetidos, ou faltando onde os outros têm.
  - NCM, origem ou unidade diferentes do produto principal, comparados como a nota lê (com a origem e a unidade da Marca). Um modelo tem um fiscal só; o fornecedor corrige o produto antes. CEST e impostos seguem o principal.
  - Um produto à venda que perderia algo que tinha (foto, ficha obrigatória, dados da nota). Diferente do cadastro da grade, que tira de venda a combinação que ficou incompleta, aqui o grupo é recusado.
- **Abrir a grade juntada não salva nada:** numa grade já salva, a categoria do Mercado Livre que falta aparece como sugestão, com "Usar esta categoria". Antes, o formulário a preenchia sozinho, salvava e podia tirar de venda combinações aprovadas incompletas. Editar de verdade um campo exigido continua seguindo a regra da fatia 2 (aprovado incompleto vira rascunho). O produto simples tem o mesmo problema e ficou para uma tarefa separada.
- **Desfazer e separar:** o "antes" de cada produto fica guardado (`product_groupings` e `product_grouping_items`): nome, descrição, fotos, ficha, fiscal, categoria, garantia e vídeo.
  - **"Desfazer":** no aviso logo depois de juntar, por 10 segundos.
  - **"Separar de novo":** fica no cadastro da grade, sem prazo.
  - **Os dois fazem o mesmo:** cada produto volta ao "antes". Estoque, custo e preço continuam os de agora. Uma combinação criada depois de juntar vira produto simples com o nome da grade. O modelo é apagado; o registro fica, com quem separou e quando.
  - **Combinação apagada da grade:** a que nunca foi anunciada nem vendida e foi tirada da grade depois de juntar não volta.
  - **Fatia 5:** a grade com anúncio próprio não poderá ser separada. A recusa entra junto com o anúncio de grade, porque hoje o anúncio ainda não aponta para o modelo.
- **Descartado:**
  - Juntar sozinho, ou "juntar todos" de uma vez: errar em lote é caro, e o fornecedor confere cartão por cartão.
  - Escolher o fiscal do grupo na tela de juntar: o fornecedor corrige o produto antes.
  - Separar uma grade feita no cadastro ou pela planilha: ela não tem "antes".
