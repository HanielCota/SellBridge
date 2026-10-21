# Mudança de modelo: CPF na entrada, fornecedor de qualquer lugar, um fornecedor por loja

Data: 2026-10-14 · Branch: `feat/cpf-supplier-per-store` (juntada na `feat/client-phase-1`) · Status: **implementado, etapas 1 a 8**

| Etapa                        | Commit               | O que entrou                                                                   |
| ---------------------------- | -------------------- | ------------------------------------------------------------------------------ |
| 1. Base de dados             | `242a497`            | `store_connections.supplier_id`, endereço opcional, CPF único (migration 0025) |
| 2. Fim da trava por região   | `97d0748`            | catálogo, publicação, busca, API e sync sem CEP                                |
| 3. Onboarding                | `14e3104`, `9fb280a` | nome e CPF, depois o fornecedor da primeira loja (migration 0026)              |
| 4. Lojas                     | `279e6ff`, `1dd4647` | uma loja, um fornecedor; troca com prévia de impacto (migration 0027)          |
| 5. Diretório de fornecedores | `a6360cc`            | filtros de UF e cidade; "Vender este fornecedor"                               |
| 6. Admin, Clientes           | `1fc4c5c`            | fornecedor de cada loja, filtro, troca pelo admin, status do CPF               |
| 7. Admin, Fornecedores       | `0f8b55b`            | sem cobertura; lojistas vinculados; confirmação da desativação                 |
| 8. Textos, docs e limpeza    | este commit          | Termos, Privacidade, menu, código de região sem uso, seed, `decisions.md`      |

Ficou para decidir com o cliente: apagar a tabela `supplier_coverage` e as colunas de endereço de `tenant_profile`, que estão sem uso.

## 1. O pedido do cliente

Fonte: três áudios do cliente, de 14/10.

| Áudio                     | O que o cliente diz                                                                                                                                                                     |
| ------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Vendedores e fornecedores | O lojista abre loja na Shopee, no TikTok ou no Mercado Livre, escolhe um fornecedor **de qualquer região do Brasil**, vende os produtos dele, paga o fornecedor e o fornecedor entrega. |
| Fundamento da loja        | A premissa é vender **sem estoque**, não ligar o lojista a fornecedores **perto dele**. Quem mora no Acre pode vender de um fornecedor de Minas Gerais.                                 |
| CPF no início             | Na entrada, o lojista **digita o CPF e escolhe o fornecedor**. Ele pode ter várias lojas, mas **cada loja trabalha com um único fornecedor**.                                           |

## 2. Antes × depois

| Tema                               | Hoje                                             | Depois                                                      |
| ---------------------------------- | ------------------------------------------------ | ----------------------------------------------------------- |
| Entrada do lojista                 | CPF, depois endereço com CEP                     | CPF, depois escolha do fornecedor                           |
| Quais fornecedores ele pode vender | Só os que entregam na cidade ou no estado do CEP | Qualquer fornecedor ativo                                   |
| Estado e cidade do fornecedor      | Regra de bloqueio (`supplier_coverage`)          | Informação e filtro de busca                                |
| Loja × fornecedor                  | Uma loja publica produtos de vários fornecedores | **Cada loja tem um único fornecedor**                       |
| Estoque zerado "fora da região"    | Automático, ao trocar de CEP                     | Não existe mais                                             |
| CEP do comprador final no pedido   | Obrigatório                                      | **Continua igual**: o fornecedor precisa dele para entregar |

**Termos usados neste documento**

- **Lojista**: o cliente do SellBridge.
- **Loja**: uma conta de marketplace conectada (`store_connections`).
- **Fornecedor**: quem tem o estoque.
- **Comprador final**: quem compra no marketplace.

## 3. Regras de negócio novas

1. **R1. CPF obrigatório.** O CPF é validado pelos dígitos verificadores e informado uma vez, no onboarding. A equipe nunca vê o CPF completo, como já acontece hoje.
2. **R2. Sem restrição geográfica.** Qualquer lojista vende de qualquer fornecedor ativo.
3. **R3. Uma loja, um fornecedor.** Todo produto publicado numa loja é do fornecedor daquela loja. O sistema bloqueia publicar um produto de outro fornecedor nessa loja.
4. **R4. Vários fornecedores exigem várias lojas.** Cada fornecedor novo pede uma loja nova. O número de lojas segue o limite do plano: Gratuito 2, Pro 10, Business 50.
5. **R5. Trocar o fornecedor de uma loja** mostra antes o impacto ("N anúncios serão pausados"). Os anúncios do fornecedor anterior saem da loja; nenhum dado é apagado.

## 4. Etapas de implementação

Cada etapa é um commit atômico (Conventional Commits) e tem um critério de pronto que pode ser verificado. A ordem evita deixar telas quebradas no meio do caminho.

### Etapa 1. Base de dados

- Migration: coluna `supplier_id` em `store_connections`. Ela começa opcional, para as lojas que já existem, e tem índice e FK para `suppliers`.
- Os campos de endereço de `tenant_profile` (`cep`, `state`, `city`, `street`, `number`, `complement`) passam a ser opcionais e o sistema para de escrever neles. Nenhuma coluna é removida nesta fase.
- Repositório: `assignStoreSupplier`, `findStoreSupplier` e a checagem R3 em um único ponto, usado pela publicação e pela API pública.
- Migração dos dados existentes:
  - loja cujos anúncios são todos de um único fornecedor: recebe esse fornecedor automaticamente;
  - loja sem anúncios ou com anúncios de vários fornecedores: fica **"fornecedor pendente"**.

**Pronto quando:** `pnpm db:migrate` roda limpo sobre o seed, e os testes de repositório cobrem a atribuição automática e o caso pendente.

### Etapa 2. Fim da trava por região (servidor)

- Remover `requireTenantRegion` do catálogo, da publicação, da busca, dos relatórios e do endpoint `catalog` da API pública.
- Remover `coversRegion`, `coversTenantRegion`, `countListingsOutsideRegion` e o motivo `outside_region`.
- A sincronização de estoque deixa de mandar 0 por causa de região.
- Remover `previewRegionChange`, `updateTenantRegion` e `coverage-change.ts`.
- A busca de CEP (BrasilAPI/ViaCEP) e o `cep_cache` **ficam**: o pedido do comprador final usa os dois.

**Pronto quando:** um lojista sem endereço vê o catálogo inteiro e consegue publicar, e `pnpm typecheck` e `pnpm test` passam.

### Etapa 3. Onboarding do lojista

- Passo 1, **Seus dados**: nome completo e CPF. É o `HolderStep` atual, sem mudança.
- Passo 2, **Escolha seu fornecedor**: busca por nome, nicho, estado e cidade, com cartões no padrão da tela `/fornecedores`. A escolha fica salva como fornecedor da **primeira loja** que o lojista conectar.
- Remover o `AddressStep`, o `CepRow`, o link dos Correios e o `?cep=` do `/cadastro` (`cep-search-parameter.ts`).
- No `setup-progress`, a etapa "Informe sua região" vira duas: "Seus dados" e "Escolha um fornecedor".

**Pronto quando:** cadastro novo, CPF e fornecedor levam ao painel em até 2 telas, e o e2e `suppliers.spec` cobre esse caminho.

### Etapa 4. Lojas do lojista (`/lojas` e publicação)

- **Conectar loja:** quem já tem loja escolhe o fornecedor antes do OAuth. A primeira loja usa o fornecedor do onboarding.
- **Cartão da loja:** mostra o fornecedor vinculado e a ação "Trocar fornecedor", com a prévia de impacto da regra R5.
- **Loja com fornecedor pendente:** aparece um aviso no topo do painel e na loja ("Escolha o fornecedor desta loja para continuar publicando").
- **Publicar:** o seletor de lojas mostra só as lojas do fornecedor do produto. Quando nenhuma loja trabalha com esse fornecedor, aparece o atalho "Conectar uma loja para este fornecedor".
- **API pública:** `GET /v1/stores` passa a devolver `supplierId`, e publicar fora da regra R3 retorna `409` com um erro tipado.

**Pronto quando:** publicar um produto de outro fornecedor numa loja é recusado no servidor (teste), e a tela só oferece as lojas válidas.

### Etapa 5. Diretório de fornecedores (lado do lojista)

- O filtro "Só quem entrega no meu CEP" vira os filtros **Estado** e **Cidade**, que usam a localização do fornecedor.
- Saem os selos "entrega na sua região" e o bloqueio "fora da sua região" no detalhe do fornecedor.
- O detalhe do fornecedor ganha a ação **"Vender este fornecedor"**. Ela abre a conexão de uma loja nova já vinculada a ele.

**Pronto quando:** a tela não tem nenhuma menção a CEP ou região do lojista, e os filtros de estado e cidade funcionam juntos com a busca.

### Etapa 6. Admin: Clientes

**Lista (`/admin/clientes`)**

- A coluna "Lojas e região" vira **"Lojas e fornecedores"**: cada loja aparece com o selo do marketplace e o nome do fornecedor.
- Novo filtro **Fornecedor**, para ver todos os lojistas de um fornecedor.
- Novo indicador **"Fornecedor pendente"**, para as lojas vindas da migração.
- A busca continua por nome e e-mail. Não haverá busca por CPF: a equipe não vê o CPF.

**Detalhe (`/admin/clientes/$userId`)**

- Sai o formulário de CEP (`CustomerRegionForm`, `adminUpdateCustomerRegion`, `updateCustomerRegionSchema`).
- O bloco "Dados de cadastro" mostra só o status do titular: **"CPF informado"** ou **"CPF pendente"**, sem o número.
- No bloco **Lojas**, cada loja mostra o fornecedor. A equipe pode **trocar o fornecedor de uma loja**, com a mesma prévia de impacto, registro em `recordAdminAction` (`store_supplier_changed`) e confirmação.
- O lembrete de onboarding (`onboarding-reminder.ts`) passa a cobrar "CPF pendente" e "sem fornecedor", e não mais "sem região".

**Pronto quando:** o admin vê e troca o fornecedor de uma loja, a ação aparece no histórico do cliente e o CPF nunca chega à resposta do servidor.

### Etapa 7. Admin: Fornecedores

- **Localização** (estado e cidade) passa a ser obrigatória no cadastro do fornecedor. Ela alimenta os filtros do lojista.
- O editor de cobertura (`coverage-fields.tsx`) sai da tela. A tabela `supplier_coverage` fica sem uso e só é removida numa migration posterior, depois da validação.
- O detalhe do fornecedor ganha o bloco **"Lojistas vinculados"**: número de lojas, lista com link para cada cliente e pedidos dos últimos 30 dias.
- **Desativar um fornecedor** com lojas vinculadas mostra o impacto ("N lojas de M lojistas ficarão sem fornecedor") e notifica esses lojistas.

**Pronto quando:** o fornecedor não tem mais campo de cobertura e o admin vê quem vende cada fornecedor.

### Etapa 8. Perfil, textos legais, documentação e limpeza

- **Perfil do lojista:** mostra o titular (nome e CPF com máscara) e não tem endereço. A troca de CPF é feita pelo suporte.
- **Termos** (`termos.tsx`): "fornecedores da sua região" vira "fornecedores de todo o Brasil".
- **Privacidade** (`privacidade.tsx`): deixa de citar o endereço do lojista e mantém o CPF e o endereço do comprador final.
- **Documentação:**
  - `docs/decisions.md`: nova decisão que substitui a regra de cobertura por CEP;
  - atualizar `README.md`, `docs/plan.md` e `docs/architecture.md`.
- **Testes:**
  - remover `saveAddress` dos helpers e2e;
  - atualizar `suppliers.spec` e `publishing.spec`;
  - remover os testes unitários de cobertura (`coverage-change`, `cep-search-parameter`, `region.test`);
  - manter os testes de CEP do pedido.
- **Seed:** cada loja demo recebe um fornecedor, e as linhas de cobertura saem.

**Pronto quando:** `grep -ri "região\|seu cep"` só encontra o fluxo do pedido do comprador final, e `pnpm lint typecheck test` e os e2e passam.

## 5. Decisões em aberto

Cada decisão tem uma recomendação. Elas são necessárias antes das etapas indicadas.

| #   | Pergunta                                                                     | Recomendação                                                                                                                                             | Afeta   |
| --- | ---------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- | ------- |
| D1  | O endereço do lojista some, ou fica opcional para nota fiscal e cobrança?    | Some do onboarding. Se a nota fiscal pedir, vira um campo no perfil depois.                                                                              | 1, 3, 8 |
| D2  | O CPF é único por conta?                                                     | Sim: um CPF por conta, para evitar várias contas gratuitas. A tela mostra uma mensagem clara e o caminho para o suporte.                                 | 1, 3    |
| D3  | O fornecedor é escolhido no onboarding ou só ao conectar a loja?             | No onboarding, como no áudio. Ele vale para a primeira loja.                                                                                             | 3, 4    |
| D4  | Lojas que hoje vendem de vários fornecedores                                 | Atribuição automática quando houver um só fornecedor. Nos outros casos, fica "pendente" com aviso e os anúncios continuam ativos até o lojista escolher. | 1, 4, 6 |
| D5  | A mesma conta de marketplace pode trocar de fornecedor quantas vezes quiser? | Sim, com a prévia de impacto. Sem limite de vezes nesta fase.                                                                                            | 4, 6    |

## 6. Roteiro de verificação

Feito no navegador após cada etapa. As telas são conferidas em 375, 768, 1280 e 1440 px, nos temas claro e escuro.

1. Cadastro novo: CPF inválido é recusado; CPF válido leva à escolha do fornecedor e depois ao painel.
2. Catálogo com um lojista sem endereço: todos os produtos aparecem e podem ser publicados.
3. Conectar uma segunda loja: o sistema pede o fornecedor; publicar um produto de outro fornecedor nessa loja é recusado.
4. Trocar o fornecedor de uma loja: a prévia mostra os anúncios afetados e, ao confirmar, eles saem da loja.
5. Admin, Clientes: a coluna "Lojas e fornecedores" e o filtro por fornecedor funcionam; a troca de fornecedor fica registrada; o CPF nunca aparece.
6. Admin, Fornecedores: a localização é obrigatória, o bloco "Lojistas vinculados" aparece e a desativação mostra o impacto.
7. Pedido do comprador final: o CEP de entrega continua funcionando, com preenchimento automático do endereço.
