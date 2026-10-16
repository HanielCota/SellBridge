# Prompt: execução tela a tela do SellBridge (um item por vez)

## ⚡ Modo MVP (desde 2026-10-16, vale por cima das seções 4 e 6)

Meta do usuário: fechar o que falta **em 2 dias**, com o site em MVP, e ir refinando aos poucos depois. A divisão em 6 chats está em `docs/prompts/coordenacao.md`, seção 0.

**Paradas (substituem a seção 6.1):**

| Ponto                   | Quando                                                                            | Pacote                                                                                                                  |
| ----------------------- | --------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| ⏸A · Planos em lote     | uma vez, no começo, para **todos** os itens da fila do chat                       | por item: diagnóstico curto (arquivo:linha), partes, arquivos, testes, D0 em 1–2 linhas, riscos                         |
| ⏸B · Fechamento do item | uma vez por **item** (não por parte), depois que todas as partes estão commitadas | por parte: hash, testes novos com a saída da falha antes da correção, portões com números; 1–2 capturas por tela mudada |

- Sem ⏸2: o teste que falha continua obrigatório (escrever, rodar, ver falhar pelo motivo certo), mas a saída vai no pacote do ⏸B.
- Cada parte continua sendo **um commit local** com todos os portões de código verdes. O commit sai **sem esperar** o OK; o ⏸B aprova o item. Se vier `Ajuste`, a correção sai num commit novo.
- **Nunca** commit, merge ou push na `main`: tudo vai por branch e pull request, e o merge é do revisor no GitHub (regra de Git na seção 0 do `coordenacao.md`).
- Pare e pergunte só quando: a decisão é do cliente (❓Dn), o plano aprovado não serve, ou um portão não fecha.

**Portões no MVP:**

- C1–C6 sempre. C7: só os specs da área tocada, mais `accessibility.spec.ts` se a tela mudou. O e2e completo roda nas junções do principal (13h e 18h) e no fim.
- D1: 1 captura desktop e 1 celular, só no tema escuro. D2: 3 larguras (375, 768, 1440). D4 (lado a lado) e a ficha D0 completa só em **tela nova**; tela existente segue a irmã sem ficha.
- O design continua nativo (lista "Proibido" da seção 4.4 vale), mas acabamento fino (microanimação, esqueleto perfeito, densidade extra) vira item da lista "Refinar depois" no andamento do chat, não bloqueia.
- Revisão independente (4.6) só quando a parte mexe em auth, cargos, dinheiro ou migration.
- Segurança, isolamento entre tenants, Zod nas bordas e dinheiro em centavos **não** são relaxados.

**Fora do MVP (fase 2, registrado no andamento):** WhatsApp do 25 (D9), 31.b, 29 se a D8 não sair, 27.d e 27.e, 32.b e 32.c (viram nota de deploy).

## 0. Como o usuário vai usar (leia primeiro)

O usuário manda comandos curtos, geralmente pelo celular. Interprete assim:

| Mensagem do usuário                                          | O que você faz                                                                                                                               |
| ------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------- |
| `Leia docs/prompts/execucao-tela-a-tela.md e faça o item NN` | Lê este arquivo inteiro e executa o item NN (seção 6).                                                                                       |
| `Faça o item NN`                                             | Se este arquivo ainda não foi lido nesta sessão, leia-o inteiro antes. Depois executa o item NN.                                             |
| `Próximo`                                                    | Executa o primeiro item ⬜ da tabela de andamento, respeitando as dependências (seção 9).                                                    |
| `Status`                                                     | Lê `docs/reviews/execucao-progresso.md` e responde com a tabela de itens, a linha de base e os 3 próximos itens recomendados. Não muda nada. |
| `Mostre as telas do item NN`                                 | Gera ou reenvia as capturas daquele item (seção 4.3).                                                                                        |
| `Continue o item NN`                                         | Retoma o item a partir do bloco "Em andamento" do arquivo de andamento (seção 6.3): mesma parte, mesma etapa.                                |
| `OK` ou `Siga`                                               | Aprova o ponto de parada atual (seção 6.1) e segue até o próximo. Vale **só** para o ponto em que você está parado.                          |
| `Ajuste: <texto>`                                            | Refaz a etapa do ponto de parada atual considerando o texto, reapresenta e espera de novo.                                                   |
| `Pare`                                                       | Termina a etapa em curso, grava o bloco "Em andamento" e para. Não commita.                                                                  |

**Ritmo:** cada item (ou parte de item, seção 9.0) é executado **etapa por etapa** e para em **3 pontos de parada** obrigatórios para o usuário aprovar (seção 6.1). Fora desses pontos, siga sem perguntar, mas registre o fim de cada etapa.

**Regras de leitura:**

1. Sempre responda em **português do Brasil**, com detalhes (seção 7). Código, commits e PRs ficam em inglês.
2. **Antes de qualquer item**, leia, nesta ordem:
   1. `docs/reviews/execucao-progresso.md` (o que já foi feito);
   2. a seção do item neste arquivo;
   3. os IDs citados no relatório `docs/reviews/2026-10-12-lacunas-cliente.md`, começando pela seção "⟳ Atualização", que vale por cima das outras.
3. A memória entre sessões é **só** o arquivo de andamento e o git. Não suponha nada que não esteja lá.

---

## 1. Papel e objetivo

Você é um engenheiro sênior full-stack no **SellBridge**: plataforma multi-tenant em que revendedores publicam produtos de fornecedores regionais em marketplaces (hoje, Mercado Livre real e um marketplace simulado) e acompanham pedidos e lucro.

O objetivo de cada item é **fechar as lacunas listadas nele com qualidade de produção**: código correto, testado, consistente com o design existente e documentado. Um item meio feito e bem relatado (🟡) vale mais que um item "completo" sem verificação.

## 2. Princípios (valem para todos os itens)

1. **Confirme no código antes de mudar.** O relatório e este prompt citam arquivos e linhas que podem ter mudado. Para cada lacuna, ache a evidência atual (arquivo:linha). Se já estiver resolvida, registre ✅ com a evidência e não reimplemente.
2. **Não invente regra de negócio.** Um item com ❓Dn depende de uma decisão do cliente (lista na seção 8). Nesse caso:
   - implemente com valor configurável e adapter mock, atrás de uma flag de ambiente validada com Zod e **desligada por padrão**;
   - registre `PENDENTE CLIENTE (Dn)` em `docs/decisions.md`;
   - marque `// TODO(client:Dn): <o que falta decidir>` no código.

   Se nem isso for possível sem a resposta, **pare e pergunte**.

3. **Teste antes de corrigir.** Todo bug ganha um teste que falha antes da correção; mostre que falhava. Regras de domínio novas vão para `packages/shared/src/domain/`, com testes unitários.
4. **Isolamento entre tenants é inegociável.** Toda tabela de tenant tem `tenant_id` indexado e é acessada por repositório que exige `tenantId`. Toda server function usa `tenantMiddleware`, `adminMiddleware` ou `staffMiddleware(permissão)`. Toda funcionalidade nova com dados de tenant ganha um teste de isolamento.
5. **Reaproveite antes de criar.** Antes de qualquer componente, função ou tabela nova, procure no código algo que já faça isso (`Grep`/`Glob`). Duplicar um padrão existente conta como falha de design (seção 4.3).
6. **Mudança mínima e coesa.** Fique no escopo do item. Problema fora do escopo vai para a seção "Achados fora do escopo" do relatório e não é corrigido.
7. **Honestidade.** Nunca diga que algo passou sem ter rodado. Se um portão falhar ou não puder rodar, diga qual, por quê e o que fica pendente.

## 3. Contexto técnico

- **Monorepo:** pnpm + Turborepo. Para o Turborepo, siga o `AGENTS.md` da raiz.
  - `apps/web`: TanStack Start, React 19, TanStack Router/Query/Form, Better Auth 1.7, Drizzle, Recharts, Radix/shadcn, Tailwind v4.
  - `apps/worker`: BullMQ.
  - `packages/database`: schema em `src/schema/`, migrations em `migrations/`, repositórios em `src/repositories/`.
  - `packages/shared`: `src/domain/`, schemas Zod em `src/schemas/`, `src/runtime/`.
  - `packages/marketplaces`: Mercado Livre real, mock, Shopee e TikTok como stubs.
- **Leitura de contexto na primeira vez de cada sessão:**
  - a seção "Contexto do projeto" de `docs/prompts/revisao-completa.md`;
  - `docs/architecture.md`, `docs/decisions.md`, `docs/billing.md`, `docs/marketplaces/mercado-livre.md`.
- **Cargos da equipe:** `agent` (atendente), `supervisor`, `admin`, em `packages/shared/src/domain/staff-access.ts`. Só `admin` tem os poderes do Better Auth (banir, entrar como cliente) e acesso a Clientes e Fornecedores. Revendedor é `user`.
- **Regras da casa** (o lint e o `check:no-else` cobram parte delas):
  - sem `else`, com early return;
  - `async/await` sem `.then` encadeado;
  - checagem explícita de null;
  - Zod em todas as bordas;
  - dinheiro em centavos inteiros;
  - funções de no máximo 60 linhas;
  - no máximo 4 parâmetros por função;
  - nenhuma asserção de tipo insegura (`as`);
  - textos de produto em português.
- **Skills:** carregue quando o trabalho se encaixar:
  - `codebase-design`: módulo novo ou mudança de estrutura;
  - `better-auth-best-practices`: auth e cargos;
  - `vercel-react-best-practices` e `apple-design`: qualquer tela;
  - `playwright-best-practices`: e2e;
  - `caveman-commit`: toda mensagem de commit.

### 3.1 Convenção de IDs (evita confusão)

| Formato                    | Significado                                                                                  | Exemplo                        |
| -------------------------- | -------------------------------------------------------------------------------------------- | ------------------------------ |
| `B1`–`B20` (sem hífen)     | Bugs do relatório                                                                            | B1 = estoque não baixa         |
| `B-1`–`B-15` (com hífen)   | Bloco B do relatório: fornecedores                                                           | B-6 = campos do produto        |
| `N1`–`N14`                 | Riscos trazidos pela `main` (seção ⟳)                                                        | N4 = fornecedor marca entregue |
| `FIS-1`–`FIS-6`            | Bloco N do relatório: fiscal e contabilidade (renomeado aqui para não colidir com os riscos) | FIS-2 = provedor de NF-e       |
| `A1`…`R6`, `J0`…`J17` etc. | Perguntas de cada bloco do relatório                                                         | A6 = página do pedido          |
| `D1`–`D11`                 | Decisões pendentes do cliente                                                                | D6 = fornecedor com login?     |

## 4. Portões de qualidade (avaliações e métricas pré-estabelecidas)

Um item **só é ✅** quando todos os portões aplicáveis passam. Rode-os **depois** da implementação e registre cada resultado com números no relatório.

### 4.1 Portões de código (sempre)

Rode da raiz do repositório:

| #   | Verificação                      | Comando                                                                                  | Meta                                                                 |
| --- | -------------------------------- | ---------------------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| C1  | Lint                             | `pnpm lint`                                                                              | 0 erros                                                              |
| C2  | Tipos                            | `pnpm typecheck`                                                                         | 0 erros                                                              |
| C3  | Formatação                       | `npx prettier --check .`                                                                 | ok (antes, `npx prettier --write <arquivos alterados>`)              |
| C4  | Sem `else`                       | `pnpm check:no-else`                                                                     | ok                                                                   |
| C5  | Testes unitários e de integração | `DATABASE_URL=postgres://sellbridge:sellbridge@localhost:5432/sellbridge_desk pnpm test` | 100% passando e contagem **≥ linha de base** do arquivo de andamento |
| C6  | Build                            | `pnpm --filter @sellbridge/web exec vite build`                                          | ok; regenera `apps/web/src/routeTree.gen.ts`, que deve ser commitado |
| C7  | E2E afetados                     | em `apps/web`: `DATABASE_URL=… npx playwright test <specs afetados> --workers=1`         | 100%                                                                 |

**Sobre o C7:**

- Rode sempre com `--workers=1`: em paralelo, a máquina estoura o tempo de alguns testes sem que haja bug.
- Uma falha só conta como regressão se acontecer também em série.
- `admin.spec.ts:49` depende de dados criados por outros specs quando o banco é novo.
- "Specs afetados" são os e2e que tocam as telas ou fluxos alterados, mais `accessibility.spec.ts` se alguma tela mudou.

### 4.2 Portões de migration (só se o item criar migration)

| #   | Verificação                | Como                                                                                                                                                         |
| --- | -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| M1  | Aplica do zero             | Banco novo, migrate completo, sem erro                                                                                                                       |
| M2  | Aplica sobre dados antigos | Banco no estado da migration anterior, com linhas inseridas à mão em formato antigo, depois só a nova. Confira com `psql` o efeito de todo SQL escrito à mão |
| M3  | Journal coerente           | O `when` da nova entrada em `migrations/meta/_journal.json` é maior que todos os anteriores                                                                  |

Para montar um banco num estado intermediário, aplique os arquivos `.sql` um a um:

```bash
docker exec -i sellbridge-postgres-1 psql -U sellbridge -d <banco> -v ON_ERROR_STOP=1 < migrations/NNNN_nome.sql
```

### 4.3 Portões de design (toda mudança visível)

**D1 — Capturas em 2x.** Escreva um script Playwright temporário **fora do repositório** (pasta temporária da sessão). Ele deve:

- carregar o Playwright via `createRequire("<raiz>/apps/web/package.json")`;
- usar `deviceScaleFactor: 2`;
- fazer login pela tela `/login`;
- gravar o tema com `localStorage["sellbridge-theme"] = "dark" | "light"` (via `addInitScript`);
- para telas da equipe, adicionar o cookie `sellbridge-admin-mode=on`.

Capture a tela principal e os estados relevantes (vazio, com dados, erro):

| Formato | Tamanho  | Temas          |
| ------- | -------- | -------------- |
| Desktop | 1440×900 | claro e escuro |
| Celular | 390×844  | claro e escuro |

Abra as capturas e revise você mesmo, criticamente, antes de dizer que passou.

**D2 — Transbordamento.** Nas larguras 320, 375, 414, 768, 1024, 1280, 1440 e 1920, meça via `page.evaluate`:

- `document.documentElement.scrollWidth === innerWidth` (sem rolagem lateral);
- nada sobrepõe o logo nem o menu da conta;
- no celular, o primeiro e o último elemento interativo ficam a pelo menos 16 px da borda.

Faça isso em modo normal e, se a tela for da equipe, em modo admin.

**D3 — Checklist visual.** Responda "sim" ou "não" para cada linha. Todo "não" é corrigido antes de fechar.

| #   | Regra                                                                                                                                                                                                                                                                                                                                                                                                                            | Referência obrigatória no código               |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------- |
| V1  | Fonte Manrope; tamanhos da escala do projeto (`text-caption`, `text-footnote`, `text-subhead`, `text-xs`, `text-sm`, `text-2xl` nos títulos)                                                                                                                                                                                                                                                                                     | `apps/web/src/styles.css`                      |
| V2  | Só tokens de cor do tema (`brand`, `brand-strong`, `brand-ink`, `brand-text`, `foreground`, `muted-foreground`, `card`, `muted`, `border`, `destructive`, `surface-grouped`, `field`, `field-border`, `chart-*`, `finance-cost`/`finance-fee`/`finance-refund`); nenhum hex novo. Exceção: âmbar em estrelas, notas internas e no tom de aviso (`TONE_DOT_CLASSES.warning` de `tone-status.tsx`, reaproveitado, nunca reescrito) | `styles.css`                                   |
| V3  | Superfícies: `surface-card rounded-3xl bg-card p-5`                                                                                                                                                                                                                                                                                                                                                                              | cartões existentes                             |
| V4  | Cartão selecionável: selecionado = `ring-2 ring-brand`; não usar bloco de cor invertida                                                                                                                                                                                                                                                                                                                                          | `catalog-product-card.tsx`, `listing-card.tsx` |
| V5  | Abas e filtros com pílula deslizante: `FilterTabs`, `SegmentedControl`, `TrackPill`; a opção ativa visível sem rolar no celular                                                                                                                                                                                                                                                                                                  | `apps/web/src/components/data/`                |
| V6  | Status = bolinha + texto (`ToneStatus`); a cor nunca carrega o significado sozinha; dois status juntos ficam empilhados                                                                                                                                                                                                                                                                                                          | `components/data/tone-status.tsx`              |
| V7  | Indicador numérico: rótulo `text-sm`, número `text-[30px] leading-none`, rodapé `text-xs`, `min-h-36`                                                                                                                                                                                                                                                                                                                            | `components/reports/kpi-tiles.tsx`             |
| V8  | Nota de 1 a 5: `StarInput` (entrada) e o padrão de estrelas existente (leitura)                                                                                                                                                                                                                                                                                                                                                  | `components/form/star-input.tsx`               |
| V9  | Popover ancorado no gatilho, como o sino                                                                                                                                                                                                                                                                                                                                                                                         | `components/layout/notification-bell.tsx`      |
| V10 | Toque: `active:scale-[0.96]` (0.98 em blocos grandes), `active:duration-100`, `motion-reduce:active:scale-100`                                                                                                                                                                                                                                                                                                                   | `components/layout/top-nav.tsx`                |
| V11 | Animação só de `transform`, `opacity` ou cor; deslizes com `cubic-bezier(0.32,0.72,0,1)`; toda animação tem alternativa `motion-reduce`                                                                                                                                                                                                                                                                                          | `components/data/track-pill.tsx`               |
| V12 | Toda tela com dados tem carregando (`Skeleton`), vazio (`EmptyState`) e erro (`ErrorState`)                                                                                                                                                                                                                                                                                                                                      | `components/feedback/`                         |
| V13 | Gráfico: nada encosta ou sai da área de plotagem, medido em 4 larguras                                                                                                                                                                                                                                                                                                                                                           | regra do usuário                               |
| V14 | Título da página com `PageHeader`; ação principal à direita; "voltar" como link fantasma no topo                                                                                                                                                                                                                                                                                                                                 | `components/layout/page-header.tsx`            |
| V15 | Textos em português claro, verbos diretos, sem jargão técnico para o revendedor                                                                                                                                                                                                                                                                                                                                                  | —                                              |
| V16 | Interação de superfície igual à das telas irmãs: `surface-interactive` em cartão clicável, `row-lift` em linha clicável                                                                                                                                                                                                                                                                                                          | `styles.css` (`@utility`)                      |
| V17 | Skeleton com a **mesma forma** do conteúdo final (mesmas colunas, alturas e cartões), não um bloco genérico                                                                                                                                                                                                                                                                                                                      | telas de referência (seção 4.4)                |
| V18 | Estado vazio com ícone, frase que explica e **ação** para sair dele (botão ou link), como nas telas de referência                                                                                                                                                                                                                                                                                                                | `components/feedback/empty-state.tsx`          |
| V19 | Densidade e hierarquia iguais ou superiores à referência: nada de tela "só título + texto + botão" quando a referência tem indicadores, agrupamento, metadados e status                                                                                                                                                                                                                                                          | ficha de referência (D0)                       |

**D4 — Comparação lado a lado.** Capture a tela de referência (D0) e a tela nova no mesmo tamanho e tema. Junte as duas numa imagem (ou envie em sequência) e escreva 3–5 diferenças objetivas. Toda diferença em que a tela nova fica **mais pobre** (menos hierarquia, menos estados, espaçamento diferente, componente genérico onde a referência usa um próprio) é corrigida antes de fechar.

### 4.4 Rigor de design (vale para toda mudança visível)

O usuário quer telas que **pareçam ter nascido junto com o SellBridge**, nunca uma versão simplificada. Design simplista conta como falha, mesmo com todos os outros portões verdes.

**D0 — Ficha de referência (antes de escrever qualquer JSX, na etapa 3).** Para cada tela ou componente que o item cria ou muda:

1. Escolha **pelo menos 2 referências internas** da tabela abaixo (confira que ainda existem). Abra e leia o código delas, não só o nome.
2. Preencha a ficha:

| Elemento novo | Referência (arquivo) | O que reaproveito (componente, estrutura, tokens, densidade, animação) | O que é novo e por quê |
| ------------- | -------------------- | ---------------------------------------------------------------------- | ---------------------- |

3. A ficha vai para o **ponto de parada 1** e só se implementa depois do OK.

**Referências internas por tipo de tela** (o padrão a seguir; se encontrar uma melhor, cite-a):

| Tipo de tela                     | Referências                                                                                                                                                                           |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Lista com filtros e status       | `routes/_app/publicacoes/index.tsx` + `components/listings/listing-card.tsx`, `listing-status-tabs.tsx`; `routes/_app/admin/chamados/index.tsx`                                       |
| Ficha ou detalhe                 | `routes/_app/admin/clientes/$userId.tsx` (`customer-timeline`, `customer-quick-view`, `health-ring`); `routes/_app/suporte/$ticketId.tsx`; `routes/_app/fornecedores/$supplierId.tsx` |
| Painel e indicadores             | `routes/_app/dashboard.tsx` + `components/reports/kpi-tiles.tsx`, `dashboard-hero.tsx`, `attention-panel.tsx`; `routes/_app/admin/chamados/metricas.tsx`                              |
| Dinheiro e lucro                 | `routes/_app/financeiro.tsx` + `components/financials/order-statement.tsx`, `profit-summary.tsx`; `components/catalog/price-receipt.tsx`; `components/data/money.tsx`                 |
| Formulário                       | `routes/_app/suporte/novo.tsx`, `routes/_app/perfil.tsx`, `components/form/floating-field.tsx`, `form-feedback.tsx`                                                                   |
| Fluxo em etapas                  | `routes/_app/onboarding.tsx` + `components/onboarding/setup-guide.tsx`; `routes/_app/publicacoes/nova.tsx`                                                                            |
| Diálogo e ação em massa          | `components/catalog/bulk-publish-dialog.tsx`, `components/listings/bulk-actions-bar.tsx`, `components/feedback/confirm-dialog.tsx`                                                    |
| Linha do tempo, envio e rastreio | `components/fulfillment/shipment-panel.tsx`, `components/admin/customer-timeline.tsx`                                                                                                 |
| Lojas e integrações              | `components/stores/store-list.tsx`, `grouped-list.tsx`, `marketplace-mark.tsx`; `components/integrations/*`                                                                           |
| Gráficos                         | `components/reports/cash-flow-chart.tsx`, `components/listings/sales-sparkline.tsx`, `components/ui/chart.tsx`                                                                        |
| Cartão de catálogo e produto     | `components/catalog/catalog-product-card.tsx`, `product-stock-line.tsx`, `components/suppliers/supplier-product-card.tsx`                                                             |

**Proibido (sinais de design simplista):**

- usar `components/ui/*` cru (Button, Card, Table, Tabs) onde já existe um componente do projeto para isso (`SectionCard`, `DataTable`, `FilterTabs`, `SegmentedControl`, `ToneStatus`, `Money`, `SmartDate`, `PageHeader`);
- tabela HTML ou lista de `div` simples onde as telas irmãs usam `DataTable` ou `grouped-list`;
- valor em dinheiro, data ou status formatado na mão em vez de `Money`, `SmartDate`, `ToneStatus`;
- cartão com só título e parágrafo quando a referência mostra metadados, status e ação;
- estado de carregando, vazio ou erro faltando, ou genérico;
- ícone ausente onde os irmãos usam ícone (mesma biblioteca e peso das telas vizinhas);
- espaçamento, raio ou sombra "parecidos" em vez dos utilitários do projeto;
- texto placeholder, "Lorem", "TODO" ou rótulo em inglês na tela.

**Quando nenhuma referência servir** (tela de um tipo novo): diga isso no ponto de parada 1, proponha a anatomia em tópicos (cabeçalho, blocos, estados, ações) com base no `apple-design` e nas regras V1–V19, e espere o OK antes de implementar.

### 4.5 Portões de acessibilidade (toda mudança visível)

| #   | Verificação                                                                                    |
| --- | ---------------------------------------------------------------------------------------------- |
| A1  | `apps/web/e2e/accessibility.spec.ts` passa nos dois temas. Rota nova entra na lista desse spec |
| A2  | Todo controle tem nome acessível (rótulo visível ou `aria-label`)                              |
| A3  | Erro de formulário que aparece depois de uma ação tem `role="alert"`                           |

### 4.6 Revisão independente (obrigatória em item grande)

**Item grande:** tem migration, mexe em auth, cargos ou dinheiro, ou altera mais de 10 arquivos.

Antes de fechar, rode um subagente revisor **somente leitura**. Dê a ele o diff do item e peça achados com cenário concreto em:

- autorização entre cargos e entre tenants;
- SQL (veja as armadilhas na seção 10);
- condições de corrida e concorrência;
- regressões de interface;
- consistência com os padrões das seções 4.3 e 4.4 (incluindo a ficha D0 aprovada).

Corrija os achados reais. No relatório, liste o que foi corrigido e o que foi descartado, com o motivo.

## 5. Ambiente

- **Banco de trabalho: `sellbridge_desk`** (isolado). O banco `sellbridge` é do usuário, tem uma migration órfã e **não pode ser alterado** sem pedido explícito. Se o isolado não existir ou estiver desatualizado:
  ```bash
  docker exec sellbridge-postgres-1 psql -U sellbridge -d sellbridge -c "create database sellbridge_desk;"
  cd packages/database
  DATABASE_URL=postgres://sellbridge:sellbridge@localhost:5432/sellbridge_desk node --import tsx src/migrate.ts
  DATABASE_URL=postgres://sellbridge:sellbridge@localhost:5432/sellbridge_desk node --env-file-if-exists=../../.env --import tsx src/seed/index.ts
  ```
- **Serviços:** Postgres e Redis (`pnpm services:up`). Confira com `docker ps` antes de rodar testes.
- **Preview:**
  - use a configuração `sellbridge-desk` de `.claude/launch.json` (porta 3300, `DATABASE_URL` do banco isolado);
  - se ela não existir, crie-a: `pnpm --filter @sellbridge/web exec vite dev --port 3300 --strictPort`, com `APP_URL`, `BETTER_AUTH_URL` e `DATABASE_URL` no `env`;
  - o servidor de e2e usa outra porta (3100), então os dois convivem.
- **Contas de teste:**
  - crie pela tela `/cadastro` com e-mail `@sellbridge.test` e a senha de fixture de `apps/web/e2e/helpers.ts`;
  - para telas da equipe, promova no banco isolado: `update "user" set role='admin' where email='…';`;
  - a conta `marina.preview@sellbridge.test` (admin no banco isolado) tem três chamados de exemplo;
  - **nunca escreva senhas na resposta.**
- **Envio de imagens ao usuário:** se a ferramenta `SendUserFile` estiver disponível, envie as capturas por ela. Se não estiver, salve as imagens em `docs/reviews/capturas/item-NN/` (pasta fora do git: confira o `.gitignore`; se não estiver ignorada, use a pasta temporária) e informe os caminhos.

## 6. Fluxo obrigatório de cada item

Execute **uma parte por vez** (seção 9.0): partes pré-definidas, ou o item inteiro se ele não tiver partes. Siga as etapas na ordem e não pule nenhuma. Cada etapa tem um critério de saída **"Sai quando"**: só passe para a próxima quando todos os critérios forem verdadeiros. Ao terminar cada etapa:

- escreva **uma linha** no chat: `✔ Etapa N · <nome> — <o que concluiu>` (o usuário acompanha pelo celular);
- atualize o bloco "Em andamento" do arquivo de andamento (seção 6.3).

### 6.1 Pontos de parada (⏸)

Há 3 pontos de parada. Neles você **para, envia o pacote indicado e espera** `OK`/`Siga` ou `Ajuste: …`. Enquanto espera, não edita nada. Um OK vale só para aquele ponto, nunca para o seguinte. Se o usuário mandar `Ajuste`, refaça a etapa e reapresente o pacote inteiro.

| Ponto | Depois da etapa | Pacote que você envia                                                                                                                      |
| ----- | --------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| ⏸1    | 3 · Planejar    | tabela de diagnóstico, plano em tópicos, ficha de referência de design (D0), lista dos testes que vai escrever, riscos e dúvidas           |
| ⏸2    | 4 · Testes      | nome de cada teste novo, o que ele garante e a **saída real da falha** (trecho curto)                                                      |
| ⏸3    | 8 · Documentar  | `git diff --stat`, tabela de portões preenchida, achados da autorrevisão, 2–4 capturas (incluindo o lado a lado D4) e a mensagem do commit |

### 6.2 Etapas

1. **Preparar.**
   - Leia o arquivo de andamento. Se o bloco "Em andamento" aponta para outra parte não terminada, **pare e pergunte** se retoma aquela.
   - Rode `git status` e `git log --oneline -3`. Se houver mudanças não commitadas que não são desta parte, **pare e pergunte** o que fazer.
   - Confirme a branch `feat/client-phase-1`, o Docker (`docker ps`) e o banco `sellbridge_desk`.
   - Confira as dependências do item (seção 9). Se uma dependência obrigatória estiver ⬜, avise e pergunte se segue mesmo assim.
   - **Sai quando:** árvore limpa (ou pendência aprovada), branch certa, serviços no ar, dependências conferidas.
2. **Diagnosticar.** Para cada ID da parte, confirme no código e escreva a tabela "ID · situação hoje · evidência (arquivo:linha)".
   - **Sai quando:** todo ID tem evidência com arquivo:linha **lida nesta sessão**; IDs já resolvidos estão marcados ✅ com a prova; nenhuma linha diz "provavelmente".
3. **Planejar.** Em 3–8 tópicos: arquivos, tabelas, telas e testes que mudam. Se há ❓Dn, diga como fica configurável. Se a parte mexe em tela, preencha a **ficha de referência D0** (seção 4.4). Se, mesmo dividida, a parte ainda parecer grande demais (mais de ~15 arquivos ou duas migrations), proponha uma nova divisão.
   - **Sai quando:** todo arquivo a mudar está listado; cada regra nova tem lugar definido (domínio em `packages/shared/src/domain/`); a busca por algo reaproveitável foi feita e citada; a ficha D0 está preenchida.
   - **⏸1:** envie o pacote e espere.
4. **Escrever os testes que falham.** Rode e capture a falha.
   - **Sai quando:** cada critério do "Pronto quando" da parte tem ao menos um teste; todos falham **pelo motivo certo** (asserção, não erro de import ou de tipo); há teste de isolamento entre tenants se a parte toca dados de tenant.
   - **⏸2:** envie o pacote e espere.
5. **Implementar em fatias.** Faça uma fatia coesa por vez (domínio → repositório → server function → tela). Depois de cada fatia, rode `pnpm typecheck` e os testes daquele pacote.
   - **Sai quando:** os testes da etapa 4 passam; o typecheck está verde; não há código comentado, `console.log` nem TODO sem `client:Dn`.
6. **Autorrevisão contra erros comuns.** Leia o próprio diff (`git diff`) inteiro e confira cada linha desta lista. Corrija o que achar **antes** dos portões:
   - armadilhas da seção 10 (colunas sem qualificação, `Date` em `sql` cru, parâmetro em `CASE`, journal, finais de linha);
   - regras da casa: busque no diff `else`, `as`, `.then(`, `!.`, `any`, hex de cor, função acima de 60 linhas, mais de 4 parâmetros;
   - todo acesso a dado de tenant passa por `tenantId` vindo do contexto, nunca do input;
   - toda borda nova tem Zod; todo dinheiro em centavos inteiros;
   - todo texto de tela está em português e segue o V15;
   - toda tela segue a ficha D0 aprovada e não cai em nenhum item da lista "Proibido" (seção 4.4);
   - **Sai quando:** a lista foi percorrida e os achados foram corrigidos ou justificados. Guarde a lista de achados para o ⏸3.
7. **Rodar os portões** da seção 4 aplicáveis (C1–C7, M1–M3, D0–D4, A1–A3 e a revisão independente da seção 4.6 se a parte for grande). Corrija e rode de novo até passar, ou até concluir que não dá; nesse caso, a parte vira 🟡.
   - **Sai quando:** cada portão aplicável tem resultado **com número** (contagem de testes, larguras medidas, capturas feitas); nenhum portão diz "deve passar".
8. **Documentar.**
   - Atualize `docs/reviews/execucao-progresso.md`: tabela, linha de base (se a contagem de testes mudou) e uma entrada no Histórico.
   - Atualize a tabela da seção "⟳ Atualização" do relatório de lacunas com os IDs tratados (situação e evidência).
   - Registre escolhas de projeto em `docs/decisions.md`.
   - **Sai quando:** os três arquivos refletem o que foi feito.
   - **⏸3:** envie o pacote e espere.
9. **Commitar** (só depois do OK do ⏸3 e com todos os portões verdes).
   - Na branch `feat/client-phase-1`, um commit por parte, com mensagem gerada pela skill `caveman-commit` e o trailer `Co-Authored-By` usado no histórico do repositório.
   - Inclua o `routeTree.gen.ts` se mudou.
   - **Depois do commit, faça push da branch de trabalho e abra o PR para `main`** (ou atualize o PR já aberto da branch), conforme a regra de Git do `CLAUDE.md`. Nunca faça push, commit ou merge direto na `main`; nos chats B a F, quem faz o push é o principal.
   - Se algum portão falhou, **não commite**: deixe as mudanças na árvore e explique.
   - **Sai quando:** `git status` limpo, branch enviada, link do PR e hash anotados no andamento.
10. **Relatar** no formato da seção 7, enviar as capturas e limpar o bloco "Em andamento".

### 6.3 Retomada segura

O arquivo de andamento tem um bloco **"Em andamento"**, atualizado ao fim de **cada etapa**:

```markdown
## Em andamento

- Item/parte: 01.a · Reserva atômica e devolução
- Última etapa concluída: 4 · Testes (⏸2 aprovado em 2026-10-13 10:42)
- Próximo passo: etapa 5, fatia "repositório"
- Arquivos tocados: packages/database/src/repositories/orders.ts, …
- Decisões tomadas nos pontos de parada: …
- Pendências: …
```

`Continue o item NN` lê esse bloco, roda `git status` para confirmar que a árvore bate com "Arquivos tocados" e retoma do "Próximo passo". Se não bater, **pare e pergunte**. Quando a parte termina (etapa 10), o bloco volta a "_(nenhum)_".

## 7. Formato do relatório (sempre detalhado)

Use exatamente esta estrutura, com títulos, para ler bem no celular:

```markdown
## Item NN · <título> — ✅ concluído | 🟡 parcial | ⛔ bloqueado

### Resumo

2–4 frases em português simples: o que o revendedor ou a equipe ganham com este item.

### Diagnóstico (antes)

| ID | Situação encontrada | Evidência |
| B1 | o estoque nunca baixa na venda | packages/database/src/repositories/orders.ts:143 |

### O que foi feito

- Por arquivo ou módulo, o que mudou e por quê (uma linha cada).
- Migration: nome, o que cria ou altera e o SQL escrito à mão.
- Telas: quais mudaram e o que o usuário vê de diferente.

### Testes adicionados

- Nome do teste — o que garante (e que falhava antes).

### Portões

| Portão | Resultado |
| C1 lint | ✅ |
| C5 testes | ✅ 801/801 (base 782 → 801) |
| C7 e2e | ✅ support.spec (6), orders.spec (4), accessibility (2) |
| M1–M3 | ✅ / não se aplica |
| D0 ficha de referência | ✅ aprovada no ⏸1 (referências: …) |
| D1 capturas | ✅ 8 capturas (enviadas) |
| D2 transbordamento | ✅ 8 larguras, 0 rolagem |
| D3 checklist | ✅ V1–V19 (V13 não se aplica) |
| D4 lado a lado | ✅ 4 diferenças, 0 em que a tela nova fica mais pobre |
| Autorrevisão (etapa 6) | ✅ 3 achados corrigidos |
| A1–A3 | ✅ |
| Revisão independente | ✅ 3 achados: 2 corrigidos, 1 descartado (motivo) |

### Situação dos IDs (depois)

B1 ✅ · B-8 ✅ · B-9 🟡 (falta X porque Y)

### Decisões e pendências do cliente

- D4: como ficou configurado e qual flag controla.

### Achados fora do escopo

- Problemas vistos e não corrigidos, com arquivo:linha.

### Commit

`<hash>` <mensagem>

### Próximo recomendado

Item NN — por quê.
```

Depois do relatório, envie de 2 a 4 capturas: desktop escuro, desktop claro e celular da tela principal, mais o lado a lado com a referência (D4).

O título usa o ID da parte quando houver (`## Item 01.a · …`).

## 8. Decisões pendentes do cliente

Não decida nenhuma delas: implemente configurável e mock, conforme o princípio 2.

| ID  | Pergunta                                          | O código já assumiu                                   |
| --- | ------------------------------------------------- | ----------------------------------------------------- |
| D1  | Taxa de 4% sobre o valor do pedido?               | Nada                                                  |
| D2  | 4% além da mensalidade?                           | Só mensalidade (Stripe)                               |
| D3  | Gateway do split e da custódia                    | Stripe só na mensalidade                              |
| D4  | Quando libera o dinheiro ao fornecedor            | "Entregue" libera só a avaliação                      |
| D5  | Quem paga o frete; o envio sai do fornecedor?     | Dropshipping com etiqueta ME2 do revendedor           |
| D6  | Fornecedor tem login?                             | Não: link com token de 30 dias                        |
| D7  | O que é o menu "Clientes" do mockup               | Nada                                                  |
| D8  | Layout do mockup obrigatório (menu lateral)?      | Menu no topo mantido                                  |
| D9  | Canal de aviso: WhatsApp oficial, push ou os dois | Nenhum                                                |
| D10 | Matriz de planos                                  | 3 planos (Gratuito, Pro, Business) contra os 5 do PDF |
| D11 | Equipes e cargos internos                         | agent/supervisor/admin (a validar)                    |

## 9. Itens

**Legenda:** ⬜ a fazer · ❓Dn depende do cliente · ⛔ não iniciar sem pedido explícito. Os itens P0 vêm primeiro e podem ser feitos em qualquer ordem entre si, exceto onde houver "Depende de". A situação atual de cada item está **no arquivo de andamento**, não aqui.

Todo item tem, além do "Pronto quando" próprio, a definição de pronto comum: portões da seção 4 aplicáveis passando, documentação atualizada (etapa 8) e commit feito (etapa 9).

### 9.0 Partes pré-definidas

Os itens grandes já vêm divididos. **Cada parte é uma unidade completa:** passa pelas 10 etapas, tem os seus 3 pontos de parada e gera um commit. `Faça o item NN` começa pela primeira parte ⬜ do item; `Próximo` segue para a próxima parte ⬜. O "Pronto quando" do item vale para o conjunto; cada parte cobre a fatia dele indicada abaixo. Se o diagnóstico mostrar que uma divisão não faz sentido, proponha outra no ⏸1 e registre no andamento.

| Item | Partes                                                                                                                                                                                                                                                   |
| ---- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 01   | **a** reserva atômica na venda e devolução idempotente (domínio, repositório, teste de concorrência) · **b** sync disparado na mudança de estoque, "Estoque atualizado há X" (telas), política em `decisions.md` e e2e                                   |
| 02   | **a** bloqueio de duplicado no servidor e índice único, com mensagem e e2e · **b** limpeza de `creation_started_at`, Reprocessar que concilia antes e testes de timeout e 5xx do conector                                                                |
| 04   | **a** mapa completo de status de pedido e envio com fixtures · **b** reembolsos e devoluções como `order_adjustments` idempotentes · **c** reflexo no Financeiro e na linha do tempo do envio (tela)                                                     |
| 08   | **a** sync ignora inativos e fora da cobertura · **b** desativar pausa, sincroniza, notifica, audita e tem e2e                                                                                                                                           |
| 10   | **a** owner da plataforma e proteções · **b** endpoints crus do plugin admin e organização (`allowUserToCreateOrganization`, membership) · **c** troca de e-mail com reverificação e regras do "entrar como cliente". Revisão independente em cada parte |
| 13   | **a** erros do ML com `cause[]` traduzidos no conector · **b** estado de erro da descrição e reenviar, na tela                                                                                                                                           |
| 14   | **a** validações do servidor iguais às do fluxo individual e bloqueio sem estoque · **b** componente `ProgressWithEta` · **c** resultado honesto e telas do diálogo                                                                                      |
| 15   | **a** modelo único de taxa em `shared/domain` usado no Financeiro · **b** prévia, preço mínimo com margem mínima e telas                                                                                                                                 |
| 16   | **a** Stripe fora da transação · **b** cota por anúncios ativos, falha em produção sem Stripe e carência de `past_due` com aviso                                                                                                                         |
| 20   | **a** dados do pedido no servidor (consulta, schema, isolamento) · **b** tela `/pedidos/$orderId` · **c** filtros da aba Operação e avaliação dentro do pedido                                                                                           |
| 23   | **a** "sincronizando…", última sincronização e página `/publicacoes/$listingId` · **b** edição com envio ao ML · **c** pausar e encerrar nativos e tópico `items`                                                                                        |
| 25   | **a** camada `NotificationChannel` e fila com retentativa · **b** catálogo de eventos · **c** preferências, telefone com consentimento e tela · **d** e-mail do suporte no layout HTML                                                                   |
| 26   | **a** dados da conta e aceite de termos (também no Google) · **b** e-mail verificado antes de conectar loja · **c** etapas com porcentagem e tempo estimado                                                                                              |
| 27   | **a** vínculo do chamado e botão "Falar com o suporte" · **b** horário comercial no prazo · **c** aviso à equipe · **d** respostas prontas em tabela · **e** FAQ antes de abrir                                                                          |
| 28   | **a** convite com cargo · **b** auditoria global · **c** indicadores e ranking em SQL · **d** excluir conta, notas e plano do cliente                                                                                                                    |
| 29   | **a** dados do painel no servidor · **b** tela                                                                                                                                                                                                           |
| 30   | **a** exportar e excluir os próprios dados · **b** 2FA e senha vazada                                                                                                                                                                                    |
| 31   | **a** matriz configurável atrás de flag · **b** período de teste, página pública e tempo de casa                                                                                                                                                         |
| 32   | **a** alertas de erro · **b** backup e restore · **c** adapter S3/R2 · **d** health do Redis · **e** sync em paralelo por loja                                                                                                                           |

Itens sem linha nesta tabela são executados inteiros, como uma parte só.

### Item 00 · Preparação do dia (primeiro de cada sessão)

- **Fazer:**
  1. Ler o arquivo de andamento e a linha de base.
  2. `git status`. Se a linha 00 do andamento ainda diz "não commitados" e há mudanças na árvore (revisão de design de 12/10: `components/form/star-input.tsx`, `components/support/ticket-rating.tsx`, `components/orders/review-dialog.tsx`, `routes/_app/suporte/novo.tsx`, `routes/_app/admin/chamados/index.tsx`, `routes/_app/admin/chamados/metricas.tsx`, `components/layout/top-nav.tsx`, `routeTree.gen.ts`, `packages/shared/src/schemas/support.ts`, mais este prompt e o arquivo de andamento):
     - mostre o resumo do diff;
     - rode C1–C6;
     - **pergunte** se pode commitar como `style(web): align support screens with shared patterns` (código) e `docs: add screen-by-screen execution prompt` (docs).
  3. Garantir o banco isolado e o preview (seção 5).
  4. Rodar C5 e os e2e de suporte, admin, reviews e acessibilidade (`--workers=1`) e atualizar a linha de base no andamento.
- **Pronto quando:** árvore limpa (ou pendências explicadas), linha de base atualizada, preview no ar.

### P0 — Bugs e riscos que fazem perder dinheiro, dados ou segurança

#### Item 01 · Estoque: reserva e baixa na venda

- **Telas:** Catálogo, Publicações, Pedidos/Operação, Admin › Fornecedores.
- **IDs:** B1, B-8, B-9.
- **Hoje:** `supplier_products.stock` só muda pelo admin (`packages/database/src/repositories/admin-suppliers.ts`). O sync (`findTargetsNeedingSync` em `repositories/listings.ts`) envia o estoque cheio para todas as lojas de todos os revendedores, então dá para vender o mesmo item várias vezes.
- **Fazer:**
  1. Reserva atômica quando um pedido passa a "paid", na mesma transação em que o pedido é gravado (`upsertMarketplaceOrder` em `repositories/orders.ts`), com `UPDATE … SET stock = stock - qty WHERE id = … AND stock >= qty`. Falta de estoque gera uma pendência visível ao revendedor; o pedido não é recusado em silêncio.
  2. Devolução do estoque em cancelamento ou devolução, idempotente: nunca devolve duas vezes o mesmo pedido.
  3. Disparar o sync dos anúncios afetados quando o estoque muda (reserva, devolução ou edição do admin).
  4. Mostrar "Estoque atualizado há X" no card do catálogo e na página do fornecedor (B-9), usando `supplier_products.updated_at`.
  5. Registrar em `docs/decisions.md` a política de estoque compartilhado entre revendedores: o primeiro pedido pago leva, e um estoque de segurança fica configurável por variável.
- **Pronto quando:**
  - um teste com duas vendas concorrentes do último item reserva só uma;
  - cancelar devolve uma vez só;
  - um e2e de venda simulada reduz o estoque mostrado no catálogo.

#### Item 02 · Anúncio duplicado e publicação travada

- **Telas:** Publicações, Nova publicação.
- **IDs:** B2, N2, E9.
- **Hoje:**
  - o fluxo individual (`apps/web/src/features/listings/listing-commands.server.ts`) não verifica se o produto já está publicado naquela loja;
  - `creation_started_at` só é limpo numa recusa 4xx (`packages/marketplaces/src/mercado-livre/listings.ts`), então um timeout ou 5xx sem item criado deixa o alvo para sempre em modo "só conciliar" (`apps/worker/src/processors/publish-listing.ts`).
- **Fazer:**
  1. Bloquear no servidor uma nova publicação do mesmo produto na mesma loja, com mensagem clara, e índice único no banco se o modelo permitir.
  2. Quando a conciliação confirmar que o item **não** existe no ML, limpar `creation_started_at` para que a próxima tentativa crie de novo.
  3. O botão Reprocessar sempre concilia antes de criar.
- **Pronto quando:**
  - testes do conector cobrem timeout e 5xx: sem item criado, a nova tentativa cria; com item criado, concilia e não duplica;
  - um e2e de publicar duas vezes o mesmo produto termina bloqueado, com mensagem clara.

#### Item 03 · Mesma conta do Mercado Livre em dois revendedores

- **Tela:** Lojas.
- **IDs:** B3 (fecha também um atalho de N6).
- **Hoje:** `findConnectedStoreByShop` (`packages/database/src/repositories/webhooks.ts`) usa `findFirst` sem tenant. Uma conta do ML conectada em dois tenants faz o webhook cair no tenant errado.
- **Fazer:** no callback OAuth (`apps/web/src/features/stores/oauth.server.ts`), recusar conectar uma conta do ML já ligada a **outro** tenant, com mensagem em português; reconectar no mesmo tenant continua permitido. A busca do webhook fica determinística.
- **Pronto quando:** teste de repositório e de rota; um webhook nunca é atribuído a um tenant diferente do dono da conexão ativa.

#### Item 04 · Status completos do pedido e do rastreio do ML

- **Telas:** Pedidos/Operação, Financeiro.
- **IDs:** B4, A7, N13, G2.
- **Hoje:**
  - `ORDER_STATUS_MAP` (`packages/marketplaces/src/mercado-livre/orders.ts`) só conhece pending, paid e cancelled; `partially_refunded` vira "paid";
  - `applyMarketplaceShipment` (`repositories/fulfillment.ts`) ignora not_delivered, cancelled e devoluções;
  - reembolsos reais nunca viram `order_adjustments`.
- **Fazer:**
  1. Mapear todos os status relevantes de pedido e de envio do ML (consulte `docs/marketplaces/mercado-livre.md` e crie fixtures com payloads reais).
  2. Ingerir reembolsos e devoluções como `order_adjustments`, de forma idempotente.
  3. Refletir no Financeiro e na linha do tempo do envio.
- **Pronto quando:** testes com fixtures para cada status; o Financeiro desconta o reembolso; o envio mostra "não entregue" e "devolvido".

#### Item 05 · Migration 0008 pulada em bancos antigos

- **Tela:** nenhuma.
- **IDs:** B5, N1.
- **Hoje:** no `migrations/meta/_journal.json`, o `when` da 0007 (1791748800000) é maior que o da 0008 (1791725626634). O Drizzle só aplica migrations com `when` maior que o último gravado no banco, então um banco que aplicou a 0007 antes de a 0008 existir **pula a 0008** sem erro.
- **Fazer:** nova migration idempotente que garante tudo o que a 0008 cria (`CREATE TABLE IF NOT EXISTS`, `CREATE INDEX IF NOT EXISTS`, constraints protegidas por `DO $$ … IF NOT EXISTS … $$`), com comentário explicando o motivo. **Não edite** o journal das migrations antigas.
- **Pronto quando:**
  - M1 passa;
  - M2 passa assim: aplique 0000–0007 à mão, insira em `drizzle.__drizzle_migrations` as linhas dessas migrations com `created_at` = `when` do journal (a 0007 com 1791748800000), rode o migrate e confirme que os objetos da 0008 existem;
  - um banco novo aplica tudo sem erro.

#### Item 06 · Envio cancelado e reencaminhamento

- **Telas:** Pedidos/Operação, link do fornecedor.
- **IDs:** N3, A4, A10.
- **Hoje:**
  - `reconciledOrderStatus` (`repositories/fulfillment-status.ts`) exige todos os envios em shipped ou delivered, então um envio cancelado prende o pedido;
  - `forwardOrder` (`repositories/fulfillment.ts`) recusa reencaminhar se existe qualquer envio, até cancelado.
- **Fazer:**
  1. Envios cancelados não contam para o status do pedido.
  2. Permitir reencaminhar ao mesmo ou a outro fornecedor quando todos os envios daquele fornecedor estão cancelados.
  3. Avisar o revendedor no sino quando o fornecedor cancela.
- **Pronto quando:** testes de estado; e2e em que o fornecedor cancela pelo link, o revendedor vê o aviso e reencaminha.

#### Item 07 · Fornecedor não declara "entregue" sozinho

- **Tela:** link do fornecedor (`routes/fornecedor/pedido/$token.tsx`).
- **IDs:** N4, D-7.
- **Hoje:** `FULFILLMENT_NEXT.shipped = "delivered"` (`packages/shared/src/schemas/fulfillment.ts`) é permitido pelo token, e isso grava `deliveredAt` e libera a avaliação.
- **Fazer:** remover essa transição para quem age pelo token. "Entregue" passa a vir só do ML ou do revendedor, com a origem registrada em `shipment_events.actor`.
- **Pronto quando:** teste em que o token não consegue marcar entregue; o revendedor consegue; a atualização do ML consegue.
- **Bloqueia:** o item 34 (o pagamento não pode ser liberado por uma declaração do próprio fornecedor).

#### Item 08 · Produto ou fornecedor inativo, ou fora da região

- **Telas:** Admin › Fornecedores, Publicações.
- **IDs:** B9, N10, B-10.
- **Hoje:** `findTargetsNeedingSync` não filtra `active` nem a cobertura. Desativar um produto ou fornecedor no admin (`apps/web/src/features/admin/suppliers.server.ts`) não pausa os anúncios nem dispara sync, e as escritas do catálogo não são auditadas.
- **Fazer:**
  1. O sync ignora inativos.
  2. Desativar produto ou fornecedor pausa os anúncios ligados (estoque 0 no marketplace), dispara o sync e notifica cada revendedor afetado.
  3. Reativar não reativa sozinho: o revendedor decide.
  4. As escritas do catálogo entram em `admin_audit_events`.
- **Pronto quando:** teste de repositório; e2e em que o admin desativa um produto e o revendedor vê o anúncio pausado e o aviso.

#### Item 09 · Lucro correto

- **Telas:** Painel de vendas, Financeiro.
- **IDs:** B10, G4.
- **Hoje:** um item sem vínculo com produto entra com custo 0 (`repositories/orders.ts`), o que infla o lucro; pedidos `pending` contam como receita (`repositories/sql/counted-orders.ts`).
- **Fazer:** custo desconhecido vira "custo pendente": fica fora do lucro, com aviso na tela. Só pedidos pagos (e posteriores) contam como receita.
- **Pronto quando:** testes de relatório com os dois casos; captura do aviso de custo pendente.

#### Item 10 · Segurança de contas e da equipe

- **Telas:** Admin › Clientes, ficha do cliente.
- **IDs:** B7, B8, B19, B18/K5, N6.
- **Fazer:**
  1. `owner` da plataforma: contas de `ADMIN_EMAILS`. Outro admin não pode banir, rebaixar, remover nem trocar a senha de um owner.
  2. Desabilitar no plugin admin os endpoints que o app não usa (`create-user`, `remove-user`, `set-user-password`) ou exigir owner e auditar.
  3. Impedir criação de organização e convite pela API do plugin `organization()` (`allowUserToCreateOrganization: false` ou hook) e, em `requireTenantSession`, conferir que o usuário é membro da organização ativa.
  4. Troca de e-mail feita por admin exige reverificação e entra na auditoria.
  5. Durante o "entrar como cliente": registrar o admin nas ações sensíveis, registrar o fim da sessão e bloquear chaves de API, webhooks, desconexão de loja e exclusões.
- **Pronto quando:** testes de middleware e de rota com cada cargo; e2e em que um admin tenta rebaixar o owner e é recusado.
- **Revisão independente:** obrigatória.

#### Item 11 · Uploads seguros

- **Telas:** Suporte (anexos), Perfil (foto).
- **IDs:** B11, J17.
- **Hoje:** `request.formData()` lê o corpo inteiro antes de checar o tamanho, e os anexos são gravados antes de validar a posse e o status do chamado (`apps/web/src/features/support/support.server.ts`), o que deixa arquivos órfãos.
- **Fazer:** limite de tamanho do corpo antes de ler; validar posse e status **antes** de gravar o arquivo; limite de requisições nos uploads.
- **Pronto quando:** testes com corpo acima do limite e com chamado de outro tenant: nenhum arquivo gravado nos dois casos.

#### Item 12 · Admin muda a região e apaga o endereço

- **Tela:** ficha do cliente (`routes/_app/admin/clientes/$userId.tsx`).
- **IDs:** B12.
- **Hoje:** `adminUpdateCustomerRegion` (`apps/web/src/features/admin/customers.functions.ts`) grava só o que vem do CEP, e `saveTenantRegion` apaga rua, número e complemento.
- **Fazer:** preservar rua, número e complemento quando o CEP não muda a rua, ou exigir o endereço completo no formulário do admin.
- **Pronto quando:** teste de repositório; e2e na ficha do cliente.

#### Item 13 · Erros de publicação claros

- **Tela:** Publicações.
- **IDs:** B13, E11.
- **Hoje:** a falha ao gravar a descrição no ML é engolida (só log) e o anúncio fica "Publicado" sem descrição; os erros do ML chegam crus, sem o `cause[]`.
- **Fazer:** falha na descrição vira um estado de erro visível, com opção de reenviar; erros do ML com `cause[]` traduzidos para português, com uma frase de "o que fazer".
- **Pronto quando:** testes do conector com respostas reais de erro; captura do card com a mensagem amigável.

#### Item 14 · Publicação em massa: validação e progresso

- **Tela:** Catálogo (diálogo de publicar em massa, `components/catalog/bulk-publish-dialog.tsx`).
- **IDs:** B16, E8, E10, E12.
- **Fazer:**
  1. Aplicar as mesmas validações de título e descrição do fluxo individual.
  2. O servidor bloqueia publicar sem estoque.
  3. Criar o componente reutilizável `ProgressWithEta`: "x de y", porcentagem e tempo restante estimado pela média dos jobs já concluídos (pedido de previsibilidade do cliente).
  4. Resultado honesto: quantos foram criados, pulados (e por quê) e com falha.
- **Pronto quando:** testes; capturas do progresso em andamento e concluído, nos dois temas e no celular.

#### Item 15 · Uma regra só de taxa e margem

- **Telas:** Nova publicação, Catálogo, Financeiro.
- **IDs:** B17, E6, E7.
- **Hoje:** a prévia usa uma taxa fixa de 14% (`apps/web/src/features/listings/profit.ts`), e o Financeiro usa a taxa real mais a da plataforma (`repositories/reports.ts`). O lucro difere entre as telas.
- **Fazer:**
  - modelo único em `packages/shared/src/domain/`: taxa por marketplace e categoria, taxa da plataforma e frete estimado opcional, usado na prévia **e** no Financeiro;
  - preço mínimo com margem mínima configurável.
- **Pronto quando:** teste em que o mesmo pedido dá o mesmo lucro nas duas contas; capturas.

#### Item 16 · Riscos da assinatura

- **Tela:** Assinatura (`/assinatura`).
- **IDs:** N5, N7, N8, N9.
- **Fazer:**
  1. Tirar as chamadas ao Stripe de dentro da transação que trava a organização (`billing.server.ts`, `webhook.server.ts`).
  2. A cota conta só anúncios ativos por loja de destino.
  3. Em produção sem as variáveis do Stripe, falhar na inicialização ou exigir um modo explícito "sem limites".
  4. Carência configurável para `past_due`, com aviso ao cliente.
- **Pronto quando:** testes do billing; `docs/billing.md` atualizado.
- **Revisão independente:** obrigatória.

#### Item 17 · Link do fornecedor e diagnóstico de erros

- **Telas:** link do fornecedor, rota `/api/diagnostics/errors`.
- **IDs:** N11, N12.
- **Fazer:**
  - o token do fornecedor não aparece em query string nem em logs: POST ou cabeçalho para as ações, e etiqueta por rota sem gravar a URL em log;
  - o limite do endpoint de diagnóstico passa a ser por IP ou sessão, não global.
- **Pronto quando:** testes; nenhum token em URL de etiqueta ou em linha de log.

#### Item 18 · CSV com atributos do Mercado Livre

- **Tela:** Admin › Fornecedores › Importar CSV.
- **IDs:** N14, B-6.
- **Fazer:** colunas próprias de marca, modelo, GTIN/EAN, peso e dimensões (com migration se forem colunas novas no produto), validação linha a linha e prévia antes de confirmar.
- **Pronto quando:** teste do parser; e2e de importar um produto e publicá-lo sem erro de atributo obrigatório.

#### Item 19 · Pequenos de segurança e status

- **Telas:** Login, Lojas.
- **IDs:** B20, B15.
- **Fazer:**
  - o parâmetro `redirect` aceita só caminho interno: recusar `//host` e esquemas;
  - uma falha de refresh que não é de autenticação marca a loja com um estado de atenção visível no card.
- **Pronto quando:** testes; captura do card da loja com o estado de atenção.

### P1 — Funcionalidades, tela por tela

#### Item 20 · Página do pedido

- **Tela nova:** `/pedidos/$orderId`.
- **IDs:** A6, A11, D-3.
- **Fazer:**
  - página com linha do tempo de status, itens, comprador, endereço, taxas, lucro, envios com rastreio e link para o pedido no ML;
  - filtros de loja e de período na aba "Operação";
  - avaliação do fornecedor como ação dentro do pedido.
- **Pronto quando:** e2e; capturas; rota incluída no `accessibility.spec.ts`.

#### Item 21 · Encaminhamento automático e aviso ao fornecedor ❓D6

- **Telas:** Pedidos, link do fornecedor.
- **IDs:** A1, A3, A5.
- **Depende de:** item 25, para o aviso por e-mail. Se ele não estiver feito, use um e-mail simples via `apps/web/src/lib/server/mailer.ts` e anote a troca futura.
- **Fazer:**
  1. Encaminhar automaticamente quando o pedido fica pago, atrás de uma flag desligada por padrão.
  2. Mandar e-mail ao fornecedor com o link.
  3. Prazo de aceite e de envio por fornecedor, com alerta de atraso para o revendedor.
- **Pronto quando:** testes; a flag documentada em `docs/decisions.md`.

#### Item 22 · Rastreio automático e previsão de entrega

- **Telas:** Pedidos, página do pedido.
- **IDs:** D-1, D-4, I6.
- **Depende de:** item 04 (status completos).
- **Fazer:** assinar o tópico `shipments` do ML e criar um job de atualização periódica; mostrar a previsão de entrega; avisar o atraso antes de acontecer.
- **Pronto quando:** testes com fixtures; captura da previsão e do aviso de atraso.

#### Item 23 · Anúncios completos

- **Telas:** Publicações e a página nova `/publicacoes/$listingId`.
- **IDs:** F1–F5.
- **Fazer:**
  1. Editar título, descrição, fotos e estoque, com envio ao ML.
  2. Mostrar "sincronizando…" e a última sincronização (`sync_attempted_at` e `sync_error` já existem).
  3. Pausar e encerrar de forma nativa no ML.
  4. Status vindo do ML (tópico `items`).
  5. Página do anúncio com vendas e histórico.
- **Pronto quando:** testes; capturas.

#### Item 24 · Saúde das lojas

- **Tela:** Lojas.
- **IDs:** F6, F7, F9.
- **Fazer:** mostrar o último sync, o último webhook e a validade do token; mandar e-mail quando a loja expira; ao desconectar, oferecer encerrar os anúncios.
- **Pronto quando:** testes; capturas.

#### Item 25 · Central de notificações ❓D9 (só o canal WhatsApp)

- **Telas:** sino, Perfil › Notificações.
- **IDs:** H1–H8.
- **Fazer:**
  1. Camada `NotificationChannel` com in-app, e-mail (layout HTML de `apps/web/src/lib/server/email-layout.ts`), push (stub) e WhatsApp (stub com `TODO(client:D9)`), fila e retentativa no padrão do `webhook-delivery`.
  2. Catálogo de eventos: venda paga (com valor e "organize seu pagamento"), atraso, entregue, loja expirada, erro de publicação, resposta do suporte.
  3. Preferências por evento e por canal, salvas no servidor.
  4. Telefone com consentimento registrado (data e versão do texto).
  5. O e-mail de resposta do suporte passa a usar o layout HTML.
- **Pronto quando:** testes; captura da tela de preferências.

#### Item 26 · Onboarding previsível e conta completa

- **Telas:** Cadastro, `/onboarding`.
- **IDs:** I1–I4, L1, L2, L4.
- **Fazer:**
  - etapas com porcentagem e tempo estimado, e o total ("sua loja fica pronta em ~X min");
  - dados da conta (telefone, CPF/CNPJ, empresa);
  - e-mail verificado antes de conectar loja;
  - aceite de termos com versão e data gravadas, também no login pelo Google.
- **Pronto quando:** testes; capturas; e2e de cadastro atualizado.

#### Item 27 · Suporte: o que falta

- **Telas:** Suporte (lojista e equipe).
- **IDs:** J5, J6, J7, J9, J16.
- **Fazer:**
  1. Ligar o chamado a pedido, loja ou anúncio, com botão "Falar com o suporte" nessas telas (o formulário já aceita `?categoria=&assunto=`).
  2. Horário comercial no cálculo do prazo.
  3. Avisar a equipe quando entra chamado novo.
  4. Respostas prontas em tabela, com cadastro para supervisor e admin, migrando `apps/web/src/features/support/reply-templates.ts`.
  5. FAQ simples antes de abrir o chamado.
- **Pronto quando:** testes; capturas; e2e de suporte atualizado.

#### Item 28 · Admin da plataforma

- **Telas:** Admin › Equipe, Admin › Auditoria, Admin › Visão geral.
- **IDs:** K2, K4, K7, K8, K9, K11.
- **Depende de:** item 10 (owner).
- **Fazer:**
  1. Convite de pessoa da equipe já com o cargo.
  2. Auditoria global em `/admin/auditoria`, com filtros e paginação.
  3. Indicadores da plataforma (GMV, MRR, clientes ativos, churn) a partir de `billing_accounts` e pedidos.
  4. Excluir conta, com auditoria; notas sobre o cliente.
  5. Ver e trocar o plano do cliente.
  6. Ranking de clientes calculado em SQL.
- **Pronto quando:** testes; capturas.

#### Item 29 · Painel do mockup do cliente ❓D8 (só o menu lateral)

- **Tela:** Painel de vendas.
- **IDs:** G6, Q5, Q8.
- **Fazer:**
  - saudação "Olá, nome";
  - indicadores de produtos ativos e de lojas conectadas (formato V7);
  - pedidos recentes com logo do marketplace e status;
  - ações rápidas;
  - rosca de categorias (V13).

  **Não** troque o menu do topo por menu lateral.

- **Pronto quando:** capturas; D2 nas 8 larguras.

#### Item 30 · LGPD e proteção da conta

- **Telas:** Perfil, Privacidade.
- **IDs:** L5, L6.
- **Fazer:** exportar e excluir os próprios dados; 2FA opcional; checagem de senha vazada.
- **Pronto quando:** testes; capturas.

#### Item 31 · Planos como no PDF ❓D10

- **Telas:** Assinatura e uma página pública de planos.
- **IDs:** M1, M3, M7, M8.
- **Fazer:** matriz configurável de recursos por plano (os 5 planos do PDF atrás de flag, mantendo os 3 atuais como padrão), período de teste, página pública de planos e registro de tempo de casa (base do Club).
- **Pronto quando:** testes; `docs/billing.md` atualizado.

#### Item 32 · Infraestrutura

- **Tela:** nenhuma.
- **IDs:** R1, R3, R4, R5.
- **Fazer:**
  1. Alertas de erro (Sentry ou similar), atrás de variável.
  2. Rotina de backup documentada e testada (um restore de verdade).
  3. Adapter S3/R2 para o `FileStorage`.
  4. Health check do Redis.
  5. Sync em paralelo por loja.
- **Pronto quando:** testes; `docs/deploy-assets.md` ou um doc novo atualizado.

#### Item 33 · Shopee ⛔

- **IDs:** F8.
- Só com credenciais de parceiro da Shopee. Sem elas, não comece.

### P2/P3 — Só com decisão do cliente (⛔ não iniciar sem pedido explícito)

| Item | Assunto                                      | IDs         | Depende de                                       | Base possível quando autorizado                                                   |
| ---- | -------------------------------------------- | ----------- | ------------------------------------------------ | --------------------------------------------------------------------------------- |
| 34   | Pagamento ao fornecedor com split e custódia | C1–C11      | D1–D4 e item 07                                  | Interface `PaymentGateway` com mock, split em basis points, estados do repasse    |
| 35   | Conquistas digitais e Club                   | P1–P6       | Decisão do cliente; item 31 para o tempo de casa | Selos (1ª venda, 100 pedidos, R$ 50 mil, R$ 100 mil) por job; brindes só no admin |
| 36   | IA assistente                                | O1–O4       | Decisão do cliente                               | Começar por "melhorar título e descrição" e "explicar o Financeiro"               |
| 37   | Fiscal e contabilidade                       | FIS-1–FIS-6 | Decisão contábil                                 | —                                                                                 |

### Fora do escopo (nunca implementar)

Banco próprio, transportadora própria, IA própria, marketplace próprio para o consumidor final.

## 10. Armadilhas conhecidas (aprendidas em 12/10)

1. **Drizzle e colunas sem qualificação:** num `select` de uma tabela só, o Drizzle escreve as colunas sem o nome da tabela. Dentro de um `sql` cru com subconsulta, `"id"` passa a apontar para a tabela de dentro. Use aliases e `"tabela"."coluna"` explícitos.
2. **Datas em `sql` cru:** um `Date` dentro de um template `sql` cru não é serializado pelo driver. Use `${data.toISOString()}::timestamptz`.
3. **Parâmetros em `CASE`:** números como parâmetro dentro de `CASE … THEN $1` viram texto. Use `sql.raw` com constantes do código.
4. **Journal das migrations:** o pre-commit (lefthook, `stage_fixed`) reinclui o arquivo inteiro. Não dá para dividir o journal entre commits; migration e journal vão no mesmo commit.
5. **Windows:**
   - o Python grava `\r\n`: use `open(..., newline="\n")`;
   - heredoc no Git Bash quebra com aspas e `$`: prefira escrever scripts em arquivo e rodá-los;
   - caminhos com `$` (como `$ticketId.tsx`) precisam de aspas simples.
6. **Testes de banco em paralelo:** os pacotes rodam ao mesmo tempo no mesmo banco. Testes que dependem de tempo devem usar datas fixas no passado (como em `support.test.ts`) e conferir só os próprios registros, nunca totais globais.
7. **E2E de radios visualmente escondidos:** use `check({ force: true })` ou clique no rótulo.
8. **Cabeçalho:** em modo admin há até 9 abas. Qualquer item novo no topo precisa passar no D2 em modo admin (o layout compacto está em `LAYOUTS` de `top-nav.tsx`).
