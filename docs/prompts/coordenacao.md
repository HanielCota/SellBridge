# Coordenação entre os chats (versão de 2026-10-14, 5 chats)

> **Encerrada em 2026-10-14.** O usuário fechou os chats B, C, D e E e voltou a um chat só (pasta `SellBridge`, branch `feat/client-phase-1`, banco `sellbridge_desk`), que faz todos os itens que faltam. Este arquivo fica como histórico; a "senha da vez" das migrations não vale mais. As pastas `SellBridge-b`…`-e` e os bancos `sellbridge_desk_b`…`_e` só são apagados com o OK do usuário.

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
6. **Commits só locais**; o push é um só, no fim, quando o usuário pedir.

## 3. Os três ajustes (aprovados pelo usuário em 2026-10-14)

### 3.1 Migrations com "senha da vez"

Qualquer chat pode criar migration, um por vez:

1. **Pegue a senha:** crie o arquivo `C:\Users\Administrator\Projetos\migration-lock.txt` com uma linha `chat <X> · <data e hora> · <item>`. Se o arquivo já existe com outro chat, **espere** (não crie migration) e siga com outra fatia do item.
2. `git merge feat/client-phase-1` na sua branch. O número da nova migration é o próximo depois do último em `packages/database/migrations/meta/_journal.json` **da branch principal** (`git show feat/client-phase-1:packages/database/migrations/meta/_journal.json`).
3. Gere a migration (`drizzle-kit generate`), confira que o `when` dela é maior que todos os anteriores (portão M3) e rode M1 e M2.
4. Commite a migration e o journal **num commit só, separado** do resto do item (`feat(db): …`).
5. Mande mensagem ao principal (`SendMessage` para "SELLBRIDGE MOBILE") com o hash do commit. O principal faz `git cherry-pick <hash>` (ou junta a branch) na hora, aplica no banco dele e apaga o `migration-lock.txt`.
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
