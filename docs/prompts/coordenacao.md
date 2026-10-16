# Coordenação entre os chats (versão de 2026-10-16, 6 chats, modo MVP)

## 0. Divisão atual (2026-10-16, 6 chats, modo MVP) — vale por cima de tudo abaixo

Meta: fechar o que falta em 2 dias, site em MVP. Regras de paradas e portões no **Modo MVP** do topo de `execucao-tela-a-tela.md`. As regras de convivência da seção 2 e as migrations com "senha da vez" (3.1) continuam valendo.

### 0.0 Corte para entregar no sábado (aprovado pelo usuário em 2026-10-16, 16h40) — vale por cima da tabela abaixo

Meta nova: MVP fechado no **sábado, 17/10, à noite** (antes era domingo). Três mudanças:

1. **Saem do MVP (vão para a fase 2):** 23 inteiro, 31.a, 28.c, 28.d, 30.b e o design final (D-1, D-2, U-2, U-8, X-2). Quem estava no meio de uma parte cortada termina o commit em curso, se os portões já fecharem, e para.
2. **Paradas:** o usuário aprovou de uma vez o plano de todos os itens que sobraram (vale como ⏸A de todos). Não há ⏸B por item: cada parte é commitada quando C1–C6 e o C7 da área passam, e o chat manda a branch e o hash à "Execução tela a tela" sem esperar o OK. Só pare e pergunte se um portão não fecha, se a decisão é do cliente (❓Dn) ou se o plano não serve. A revisão do usuário é no PR, no fim; push e merge continuam como na regra de Git abaixo.
3. **Filas novas:**

| Chat                               | Itens, nesta ordem                                                                                                                                                                         |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Principal ("Execução tela a tela") | bug "pedidos para avaliar" (`attention-panel.tsx:86`, `notification-presenter.ts:117`) com teste de regressão; junções a cada aviso (sem esperar 13h e 18h); e2e completo na última junção |
| B                                  | 30.a (exportar e excluir os próprios dados)                                                                                                                                                |
| C                                  | 14.b, 14.c                                                                                                                                                                                 |
| D                                  | 26.a                                                                                                                                                                                       |
| E                                  | 27.c, 28.a, 28.b                                                                                                                                                                           |
| F                                  | 18 (CSV com atributos do ML; passa a ser dono de `admin-suppliers*` e do parser de CSV só para este item)                                                                                  |

| Chat                                   | Onde                                                         | Área (dono dos arquivos)                                                                                                                                                                                                                                                                   | Itens, nesta ordem                                                                                                                                                                                                      |
| -------------------------------------- | ------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Principal** ("Execução tela a tela") | pasta `SellBridge`, `feat/client-phase-1`, `sellbridge_desk` | Pedidos, envio, link do fornecedor; **junta** todas as branches às 13h e às 18h e roda o e2e completo                                                                                                                                                                                      | 21.c, "trocar de fornecedor num envio cancelado", bug "pedidos para avaliar" sem abrir a aba de avaliações, design final (D-1, D-2, U-2, U-8, X-2) na tarde do dia 2                                                    |
| **B** · contas e lojas                 | worktree atual                                               | como na divisão de 2026-10-15                                                                                                                                                                                                                                                              | 24, 30, fechar o 12 como "não se aplica" (o CPF tirou o endereço do admin)                                                                                                                                              |
| **C** · catálogo e dinheiro            | worktree atual                                               | como na divisão de 2026-10-15                                                                                                                                                                                                                                                              | 13.b, 14, 18, 23                                                                                                                                                                                                        |
| **D** · conta, planos e painel         | worktree nova, `sellbridge_desk_d`                           | `components/billing/*`, `features/billing/*`, `routes/_app/assinatura*`, `repositories/billing*`, webhook do Stripe, `components/onboarding/*`, `routes/_app/onboarding*`, `routes/_auth/*` (telas), `routes/_app/dashboard*`, `reports/dashboard-hero*`, `kpi-tiles*`, `attention-panel*` | 16, 26, 31.a (atrás de flag), 29 (se a D8 sair; senão, fase 2)                                                                                                                                                          |
| **E** · admin, suporte e avisos        | worktree nova, `sellbridge_desk_e`                           | `routes/_app/admin/*` (menos fornecedores), `components/admin/*`, `components/support/*`, `features/support/*`, `routes/_app/suporte/*`, `notification-bell*`, `features/notifications/*`, `repositories/notifications*`, `support*`, `customer*`                                          | 25 (sem WhatsApp), 27.a–c, 28                                                                                                                                                                                           |
| **F** · infra, só servidor             | worktree nova, `sellbridge_desk_f` (criar)                   | `apps/worker/src/index.ts`, health, storage, logs e alertas, `packages/database/migrations` (só limpezas), `scripts/seed*`, `shared/domain/cep*`                                                                                                                                           | 32.a, 32.d, 32.e; migration de limpeza da 0023 (loja viva duplicada); remover `supplier_coverage`, colunas de endereço do `tenant_profile`, `cep_cache`, `lookupCep` e `shared/domain/cep*` sem uso; seed mais completo |

**Recursos dos chats novos** (o `.env` da worktree é cópia do principal com estes valores; o banco é recriado do zero com o migrate e o seed do `packages/database`, porque `_d` e `_e` estão em migrations antigas):

| Chat | Banco               | Redis do app | Preview | E2E (porta, health, Redis) |
| ---- | ------------------- | ------------ | ------- | -------------------------- |
| D    | `sellbridge_desk_d` | db 6         | 3700    | 3170 · 3171 · db 7         |
| E    | `sellbridge_desk_e` | db 8         | 3800    | 3180 · 3181 · db 9         |
| F    | `sellbridge_desk_f` | db 10        | 3900    | 3190 · 3191 · db 11        |

**Fluxo de junção no MVP:** cada chat, ao commitar uma parte, faz `git merge feat/client-phase-1` na própria branch, roda C1–C6 e manda ao principal (`SendMessage`) a branch e o hash. O principal junta em lote às 13h e às 18h (ou antes, se houver migration) e avisa os chats para juntarem de volta.

**Git: nunca direto na `main` (regra do usuário, 2026-10-16):**

- Ninguém faz commit, merge ou push na `main`. Ela só recebe mudanças por **pull request**, e quem faz o merge do PR é o revisor do usuário no GitHub. Nenhum chat aprova nem faz merge de PR, nem liga o auto-merge.
- Os chats B a F commitam só na própria branch e mandam o hash ao principal. **Só o principal faz push**, e só da `feat/client-phase-1`, depois dos portões e da revisão. O push atualiza o PR aberto dessa branch (hoje o #38), sem abrir outro.
- Trava local: `.git/hooks/pre-push` recusa qualquer push para `main` ou `master`, em todas as worktrees. Nunca contorne com `--no-verify`.

**Fase 2 (fora do MVP):** WhatsApp do 25 (D9), 31.b (D10), 29 sem a D8, 27.d, 27.e, 32.b e 32.c (nota de deploy), refinamentos anotados em "Refinar depois" de cada chat. Bloqueados: 33–37.

## 0.1 Divisão de 2026-10-15 (3 chats, histórico)

Depois de um dia em chat único, o usuário voltou a dividir, agora em **3 chats**, todos neste projeto. As regras das seções 2 e 3 continuam valendo. Nas seções 1 e 4, D e E não existem mais e B e C mudaram de pasta.

| Chat                                   | Onde                                                                                      | Área (dono dos arquivos)                                                                                                                                                                                                                                                                                                         | Itens, nesta ordem                                                                                                                                                       |
| -------------------------------------- | ----------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Principal** ("Execução tela a tela") | pasta `SellBridge`, branch `feat/client-phase-1`, banco `sellbridge_desk`                 | Pedidos, envio e link do fornecedor (`components/fulfillment/*`, `components/orders/*`, `routes/_app/pedidos*`, `routes/fornecedor/*`, `repositories/fulfillment*`, `order-*`). **Junta** as branches B e C e faz a revisão final                                                                                                | X-1 (em andamento), U-3, U-4, U-9, "trocar de fornecedor num envio cancelado", 22, 21 (atrás de flag até D6), correções das pastas antigas (ver Pendências do andamento) |
| **B**                                  | worktree própria em `.claude/worktrees/`, branch criada a partir de `feat/client-phase-1` | Segurança, contas e lojas (`lib/server/auth*`, `middleware*`, `tenant-session*`, `components/stores/*`, `features/stores/*`, `routes/_app/lojas*`, `integracoes*`, `profile/*`, `perfil*`, `privacidade*`, anexos em `features/support`)                                                                                         | 03, 10, 11, 12, 17, 19, 24, 30                                                                                                                                           |
| **C**                                  | worktree própria em `.claude/worktrees/`, branch criada a partir de `feat/client-phase-1` | Catálogo, publicação e dinheiro (`components/catalog/*`, `listings/*`, `financials/*`, `reports/*` menos o painel, `admin-suppliers/*`, `routes/_app/catalogo*`, `publicacoes/*`, `financeiro*`, `fornecedores/*`, `repositories/listings*`, `listing-*`, `reports*`, `suppliers*`, `admin-suppliers*`, `packages/marketplaces`) | 09 (falta o custo pendente), 13, 14, 15, 18, 23                                                                                                                          |

Ficam para depois (um chat assume quando terminar a sua lista, combinando com o principal): 16, 25, 26, 27, 28, 29, 31, 32.

**Recursos** (os bancos `sellbridge_desk_b` e `_c` já estão na migration 0023):

| Chat      | Banco               | Redis do app | Preview                  | E2E (porta, health, Redis) |
| --------- | ------------------- | ------------ | ------------------------ | -------------------------- |
| Principal | `sellbridge_desk`   | db 0         | `sellbridge-desk` · 3300 | 3100 · 3101 · db 1         |
| B         | `sellbridge_desk_b` | db 2         | 3500                     | 3150 · 3151 · db 3         |
| C         | `sellbridge_desk_c` | db 4         | 3600                     | 3160 · 3161 · db 5         |

Na primeira vez, cada chat cria o `.env` da sua worktree (copie o `.env` da pasta principal e troque `DATABASE_URL`, `REDIS_URL`, `APP_URL`, `BETTER_AUTH_URL` e acrescente `E2E_PORT`, `E2E_WORKER_HEALTH_PORT`, `E2E_REDIS_DB` conforme a tabela; `.env` não vai para o git) e, para o painel de preview, acrescenta no `.claude/launch.json` **da pasta principal** uma entrada `sellbridge-b` ou `sellbridge-c` com `pnpm -C <caminho da sua worktree> --filter @sellbridge/web exec vite dev --port <porta> --strictPort` e as variáveis do seu banco (o arquivo é local e ignorado pelo git).

**Fluxo de junção:** ao fechar cada item (depois do OK do ⏸3 e do commit), o chat faz `git merge feat/client-phase-1` na sua branch, roda os portões e manda ao principal, por `SendMessage`, a branch e o hash. O principal junta na `feat/client-phase-1`. Migrations seguem a "senha da vez" (seção 3.1), mandando o hash ao principal ("Execução tela a tela").

Vale por cima da divisão por número de item dos prompts `chat-paralelo-*.md`. O trabalho é dividido **por área do produto**: cada chat é dono de um conjunto de pastas e telas, e os itens seguem a área. Todos seguem `execucao-tela-a-tela.md` (etapas, pontos de parada, portões, design), com os ajustes da seção 3.

## 1. Quem é dono de quê

| Chat                              | Pasta · branch · banco                                         | Área (dono dos arquivos)                                                                                                                                                                                                                                                                                                                                                              | Itens que faltam                                                                          |
| --------------------------------- | -------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| **Principal (SELLBRIDGE MOBILE)** | `SellBridge` · `feat/client-phase-1` · `sellbridge_desk`       | Pedidos, envio e link do fornecedor: `components/fulfillment/*`, `components/orders/*`, `routes/_app/pedidos*`, `routes/fornecedor/*`, `repositories/fulfillment*`, `order-*`. **Integração:** junta as outras branches e faz a revisão final.                                                                                                                                        | 20.c, 22, "trocar de fornecedor num envio cancelado", 21 (atrás de flag até a decisão D6) |
| **C**                             | `SellBridge-c` · `feat/client-phase-1-c` · `sellbridge_desk_c` | Catálogo, publicação e dinheiro: `components/catalog/*`, `listings/*`, `financials/*`, `reports/*` (menos o painel), `admin-suppliers/*`, `routes/_app/catalogo*`, `publicacoes/*`, `financeiro*`, `fornecedores/*`, `repositories/listings*`, `listing-*`, `reports*`, `suppliers*`, `admin-suppliers*`, `packages/marketplaces`                                                     | 09, 15, 13, 14, 18, 23                                                                    |
| **B**                             | `SellBridge-b` · `feat/client-phase-1-b` · `sellbridge_desk_b` | Segurança, contas e lojas: `lib/server/auth*`, `middleware*`, `components/stores/*`, `features/stores/*`, `routes/_app/lojas*`, `integracoes*`, `profile/*`, `routes/_app/perfil*`, `privacidade*`, uploads (`features/support` só a parte de anexos, mudança mínima)                                                                                                                 | 03, 10, 11, 12, 17, 19, 30, 24                                                            |
| **D**                             | `SellBridge-d` · `feat/client-phase-1-d` · `sellbridge_desk_d` | Conta, planos e painel: `components/billing/*`, `features/billing/*`, `routes/_app/assinatura*`, `repositories/billing*`, `webhook.server` do Stripe, `components/onboarding/*`, `routes/_app/onboarding*`, `routes/_auth/*` (telas de cadastro e login; a configuração do Better Auth é do B), `routes/_app/dashboard*`, `reports/dashboard-hero*`, `kpi-tiles*`, `attention-panel*` | 16, 31, 26, 29                                                                            |
| **E**                             | `SellBridge-e` · `feat/client-phase-1-e` · `sellbridge_desk_e` | Admin da plataforma, suporte e avisos: `routes/_app/admin/*` (menos fornecedores), `components/admin/*`, `components/support/*`, `features/support/*`, `routes/_app/suporte/*`, `components/layout/notification-bell*`, `features/notifications/*`, `repositories/notifications*`, `support*`, `customer*`, infraestrutura do worker (`apps/worker/src/index.ts`, health, storage)    | 28 (inclui a auditoria do catálogo pendente do 08.b), 27, 25, 32                          |

Itens 33–37 continuam bloqueados (decisão do cliente). Ordem sugerida dentro de cada chat: a da coluna "Itens que faltam".

### Correções de design e UX da auditoria

Lista completa em [2026-10-13-auditoria-ia-design-ux.md](../reviews/2026-10-13-auditoria-ia-design-ux.md). Cada uma fica com o dono da tela e entra junto com o item que mexe nela:

- **Principal:** X-1 ("Cancelar envio" sem confirmação, prioridade), U-3, U-4 (com o 20.c), U-9.
- **C:** X-4 ("Reprocessar" vermelho), U-6 (admin de Fornecedores). U-1 já foi corrigido no 08.b.
- **B:** X-7 (anel de foco), X-8 (contraste).
- **D:** U-5 (Assinatura), X-5 (nome do painel), U-2 do painel (skeleton).
- **E:** U-7 ("Voltar" de detalhe e `PageHeader` com voltar), U-10 (Métricas do suporte, rolagem de 132 px no celular).
- **Só no fim, num chat, depois de juntar tudo:** D-1 (tokens de sucesso, aviso e informação), D-2 (escala de tamanhos), U-2 restante (skeletons), U-8 (toque de 44 px), X-2 (vazios com ação).

## 2. Regras de convivência

1. **Arquivo de outra área:** se um item precisar mudar um arquivo de outro dono, faça a menor mudança possível e anote em "Achados fora do escopo", ou peça ao dono (por mensagem entre sessões, `SendMessage`).
2. **Juntar cedo.** Ao fechar cada item (depois do commit), cada chat faz `git merge feat/client-phase-1` na própria branch e resolve os conflitos na hora, ficando com a versão do dono da área. O principal junta as outras branches sempre que receber aviso de um item fechado.
3. **Arquivos compartilhados só recebem acréscimo:** `docs/decisions.md`, o relatório de lacunas, `styles.css`, `package.json`, `schema/index.ts`. Acrescente no fim ou mude só a linha do seu ID; não reescreva seções nem realinhe tabelas inteiras.
4. **Andamento próprio:** cada chat registra no seu arquivo (`execucao-progresso.md`, `-b.md`, `-c.md`, `-d.md`, `-e.md`) e não edita o dos outros.
5. **Recursos isolados** (seção 4). Nunca rode testes contra o banco de outro chat, e nunca contra `sellbridge`.
6. **Commits na própria branch**; push só do principal, da `feat/client-phase-1` para o PR aberto. Nunca na `main` (seção 0).

## 3. Os três ajustes (aprovados pelo usuário em 2026-10-14)

### 3.1 Migrations com "senha da vez"

Qualquer chat pode criar migration, um por vez:

1. **Pegue a senha:** crie o arquivo `C:\Users\Administrator\Projetos\migration-lock.txt` com uma linha `chat <X> · <data e hora> · <item>`. Se o arquivo já existe com outro chat, **espere** (não crie migration) e siga com outra fatia do item.
2. `git merge feat/client-phase-1` na sua branch. O número da nova migration é o próximo depois do último em `packages/database/migrations/meta/_journal.json` **da branch principal** (`git show feat/client-phase-1:packages/database/migrations/meta/_journal.json`).
3. Gere a migration (`drizzle-kit generate`), confira que o `when` dela é maior que todos os anteriores (portão M3) e rode M1 e M2.
4. Commite a migration e o journal **num commit só, separado** do resto do item (`feat(db): …`).
5. Mande mensagem ao principal (`SendMessage` para "Execução tela a tela") com o hash do commit. O principal faz `git cherry-pick <hash>` (ou junta a branch) na hora, aplica no banco dele e apaga o `migration-lock.txt`.
6. Se o principal não estiver disponível, avise o usuário; não libere a senha sozinho.

### 3.2 Menos paradas em item sem tela

Para itens **só de servidor** (sem mudança visível), o ⏸1 e o ⏸2 viram uma parada só: plano, diagnóstico e os testes já escritos com a saída da falha. O ⏸3 (antes do commit) continua em todos os itens. Itens com tela mantêm os 3 pontos.

### 3.3 Recursos de cada chat

Cada chat tem pasta, branch, banco, Redis e portas próprios (seção 4), para que testes e servidores não se atrapalhem.

## 4. Recursos

| Chat      | Banco               | Redis do app | Preview (`.claude/launch.json` da pasta principal) | E2E (porta, health, Redis) |
| --------- | ------------------- | ------------ | -------------------------------------------------- | -------------------------- |
| Principal | `sellbridge_desk`   | db 0         | `sellbridge-desk` · 3300                           | 3100 · 3101 · db 1         |
| B         | `sellbridge_desk_b` | db 2         | `sellbridge-b` · 3500                              | 3150 · 3151 · db 3         |
| C         | `sellbridge_desk_c` | db 4         | `sellbridge-c` · 3600                              | 3160 · 3161 · db 5         |
| D         | `sellbridge_desk_d` | db 6         | `sellbridge-d` · 3700                              | 3170 · 3171 · db 7         |
| E         | `sellbridge_desk_e` | db 8         | `sellbridge-e` · 3800                              | 3180 · 3181 · db 9         |

O painel de preview só lê o `.claude/launch.json` da pasta principal; as entradas de B a E usam `pnpm -C <pasta>`. Os `.env` de cada pasta já apontam para o banco, o Redis e as portas acima (`E2E_PORT`, `E2E_WORKER_HEALTH_PORT`, `E2E_REDIS_DB`). Depois de juntar a branch principal, rode as migrations novas no seu banco (`node --import tsx src/migrate.ts` em `packages/database`, com o `DATABASE_URL` do seu banco).
