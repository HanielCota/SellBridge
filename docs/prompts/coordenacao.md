# Coordenação entre os chats (a partir de 2026-10-13)

Vale por cima da divisão por número de item de `chat-paralelo-c.md` e do prompt do chat B. O trabalho passa a ser dividido **por área do produto**: cada chat é dono de um conjunto de pastas e telas, e os itens seguem a área. Todos continuam seguindo `execucao-tela-a-tela.md` (etapas, pontos de parada, portões, design).

## 1. Quem é dono de quê

| Chat                              | Pasta e branch                           | Área (dono dos arquivos)                                                                                                                                                                                                                                                               | Itens                                                                                                                             |
| --------------------------------- | ---------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| **Principal (SELLBRIDGE MOBILE)** | `SellBridge` · `feat/client-phase-1`     | Pedidos, envio e link do fornecedor: `components/fulfillment/*`, `components/orders/*`, `routes/_app/pedidos*`, `routes/fornecedor/*`, `repositories/fulfillment*`, `order-*`. **Todas as migrations.**                                                                                | 20.c, 21, 22, "trocar de fornecedor num envio cancelado", **28** (inclui a auditoria do catálogo pendente do 08.b), 25, 26, 29–32 |
| **C**                             | `SellBridge-c` · `feat/client-phase-1-c` | Catálogo, Publicações, Financeiro, Assinatura e admin de Fornecedores: `components/catalog/*`, `listings/*`, `financials/*`, `reports/*`, `billing/*`, `admin-suppliers/*`, `repositories/listings*`, `listing-*`, `reports*`, `billing*`, `admin-suppliers*`, `packages/marketplaces` | 08.b, 09, 13, 14, 15, 16, 18, **23**                                                                                              |
| **B**                             | `SellBridge-b` · `feat/client-phase-1-b` | Lojas, contas, segurança, uploads e suporte: `components/stores/*`, `profile/*`, `support/*`, `admin/*` (clientes e chamados), `lib/server/auth*`, `middleware*`, `features/stores/*`, `features/support/*`                                                                            | 03, 11, 12, 17, 19, **10**, depois 24 e 27                                                                                        |

Mudanças em relação à divisão anterior: o **10** sai do C e vai para o B (é segurança de contas); o **23** vai para o C (é a mesma tela dos itens 13 e 14); o **28** fica no principal (precisa de migration).

### Correções de design e UX da auditoria

A lista completa está em [2026-10-13-auditoria-ia-design-ux.md](../reviews/2026-10-13-auditoria-ia-design-ux.md). Cada correção fica com o dono da tela e entra junto com o item que mexe nela, ou logo depois:

- **Principal:** X-1 ("Cancelar envio" sem confirmação, prioridade), U-3 (abas de Pedidos), U-4 (tela de Operação, junto com o 20.c), U-9 (link do fornecedor).
- **C:** U-1 (rolagem lateral em Publicações), X-4 ("Reprocessar" vermelho), U-5 (Assinatura), U-6 (admin de Fornecedores).
- **B:** U-7 ("Voltar" de detalhe e `PageHeader` com voltar), X-7 (anel de foco), U-10 (Métricas do suporte, rolagem lateral de 132 px no celular).
- **Só no fim, num chat, depois de juntar tudo:** D-1 (tokens de sucesso, aviso e informação), D-2 (escala de tamanhos), U-2 (skeletons), U-8 (toque de 44 px), X-2 (vazios com ação). Atravessam o sistema inteiro e conflitariam com todos.

## 2. Regras de convivência

1. **Arquivo de outra área:** se um item precisar mudar um arquivo de outro dono, faça a menor mudança possível e anote em "Achados fora do escopo", ou peça ao dono.
2. **Migrations só no principal.** Quem precisar de tabela ou coluna pede ao principal; nunca crie migration em C ou B.
3. **Juntar cedo.** Ao fechar cada item (depois do commit), o chat C e o B fazem `git merge feat/client-phase-1` na própria branch e resolvem os conflitos na hora. As branches estão no mesmo repositório; nada de push. O principal junta C e B quando quiser e antes da revisão final.
4. **Arquivos compartilhados só recebem acréscimo:** `docs/decisions.md`, o relatório de lacunas, `styles.css`, `package.json`. Acrescente no fim ou mude só a linha do seu ID; não reescreva seções nem realinhe tabelas inteiras.
5. **Andamento próprio:** cada chat registra no seu arquivo (`execucao-progresso.md`, `-b.md`, `-c.md`) e não edita o dos outros.
6. **E2E isolado:** cada worktree usa `E2E_PORT`, `E2E_WORKER_HEALTH_PORT` e `E2E_REDIS_DB` do próprio `.env` (commit `57706a5`). Principal 3100/3101 db 1, B 3150/3151 db 3, C 3160/3161 db 5.
7. **Commits só locais**; o push é um só, no fim, quando o usuário pedir.
