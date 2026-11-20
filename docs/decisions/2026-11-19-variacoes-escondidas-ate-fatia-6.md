# 2026-11-19: Grade de cor e tamanho escondida até a fatia 6

Guilherme, 19/11, pela Central: "Sim, escondidas". Pediu sem gambiarra: o jeito de desligar tem de ser limpo e fácil de ligar depois.

- **O revendedor não vê nada com grade até a fatia 6.** Uma combinação só é oferecida pelo modelo, nunca sozinha. A regra mora numa condição só (`productOfferedInCatalog`, em `repositories/sql/sellable.ts`) e vale para:
  - o catálogo e a busca;
  - a página do produto;
  - as categorias;
  - o diretório de fornecedores;
  - a vitrine;
  - a venda manual;
  - a API pública.
- **Anúncios no ar continuam como estão.** A disponibilidade dos anúncios no ar usa a regra antiga (`productListable`), então um produto agrupado depois (fatia 4) continua vendendo onde já está anunciado. Na fatia 6, o catálogo ganha o card do modelo, e a venda manual passa a escolher o modelo e depois a combinação.
- **A função inteira fica desligada:** a variável `PRODUCT_GRID_ENABLED` do site, desligada por padrão. Desligada:
  - o fornecedor não vê a pergunta "Este produto tem cores ou tamanhos?";
  - todas as funções da grade respondem "não encontrado", mande o que mandar.

  Para ligar, basta pôr `PRODUCT_GRID_ENABLED=true`, sem mexer no código.

- **Proteções que valem já, ligada ou não:** o nome, as fotos, a ficha e o fiscal de uma combinação só mudam pelo modelo.
  - A planilha, o CSV e o Bling atualizam de uma combinação só o que é dela: custo, estoque, preço sugerido e se está à venda. A situação dela também fica como está.
  - O formulário da equipe e o formulário de produto simples recusam uma combinação, com uma mensagem que manda editar pela grade.
- **Salvar e publicar:**
  - O cadastro da grade salva sozinho enquanto o fornecedor digita: o modelo, as cores e os tamanhos, e um produto por combinação, em rascunho.
  - Uma combinação tirada da grade é apagada se nunca foi anunciada nem vendida; senão, só sai de venda, e a cor e o tamanho dela ficam na grade.
  - "Publicar" põe todas à venda de uma vez e, quando falta algo, diz o que falta em cada combinação. Uma combinação sem estoque não trava as outras, mas pelo menos uma precisa ter estoque.
- **Descartado:** esconder cada tela com um "se ligado" espalhado pelo código. Também não entrou um segundo jeito de marcar produto escondido no banco, porque a combinação já se reconhece pelo `model_id`.
