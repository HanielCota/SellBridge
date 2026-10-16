# Chat paralelo C: itens 08 a 18 sem migration

Este chat roda **ao lado** do chat principal (e do chat B), numa cópia isolada do projeto. Leia este arquivo inteiro antes de qualquer coisa e siga-o junto com `docs/prompts/execucao-tela-a-tela.md`, que continua sendo o prompt de execução (fluxo da seção 6, portões da seção 4, formato de relatório da seção 7, design da seção 4.4).

## 1. Onde você está

| O quê       | Valor deste chat (C)                                              | Não mexa (outros chats)                                          |
| ----------- | ----------------------------------------------------------------- | ---------------------------------------------------------------- |
| Pasta       | `C:\Users\Administrator\Projetos\SellBridge-c`                    | `SellBridge` (principal) · `SellBridge-b` (chat B)               |
| Branch      | `feat/client-phase-1-c`                                           | `feat/client-phase-1` · `feat/client-phase-1-b`                  |
| Banco       | `sellbridge_desk_c` (migrado até a 0021 e semeado)                | `sellbridge_desk` · `sellbridge_desk_b` · **nunca** `sellbridge` |
| Redis (app) | `redis://localhost:6379/4`                                        | db 0 (principal) · db 2 (B)                                      |
| Preview     | `.claude/launch.json` → `sellbridge-c`, porta **3600**            | 3300 / 3400 (principal) · 3500 (B)                               |
| E2E         | porta 3160, health 3161, Redis db 5 (já no `.env` deste worktree) | 3100/3101 db 1 (principal) · 3150/3151 db 3 (B)                  |

- O `.env` desta pasta já aponta para o banco, o Redis e as portas acima. Nos comandos dos portões use sempre `DATABASE_URL=postgres://sellbridge:sellbridge@localhost:5432/sellbridge_desk_c` (o prompt principal cita `sellbridge_desk`: aqui é `sellbridge_desk_c`).
- A branch saiu do commit `b68dbe5` do chat principal, com os itens 00, 01, 02, 04, 05 e 06 prontos.

## 2. Seu escopo

Faça só estes itens do prompt de execução, nesta ordem, um por vez, com os 3 pontos de parada (⏸1 plano e folha D0, ⏸2 testes falhando, ⏸3 antes do commit):

1. **Item 08** · Produto ou fornecedor inativo, ou fora da região
2. **Item 09** · Lucro correto
3. **Item 10** · Segurança de contas e da equipe
4. **Item 13** · Erros de publicação claros
5. **Item 14** · Publicação em massa: validação e progresso
6. **Item 15** · Uma regra só de taxa e margem
7. **Item 16** · Riscos da assinatura
8. **Item 18** · CSV com atributos do Mercado Livre

Os outros itens são de outros chats: o **principal** faz o 07, depois do 20 em diante e o item novo "trocar de fornecedor num envio cancelado"; o **chat B** faz 03, 11, 12, 17 e 19. Não faça itens fora da sua lista.

## 3. Regras deste chat (além das do prompt principal)

1. **Sem migration.** Nenhum dos seus itens deveria precisar. Se precisar, **pare e pergunte**. O motivo é o item 05: migrations criadas em chats diferentes colidem na numeração, no `_journal.json` e na ordem do `when`, e o Drizzle pula sem erro a que ficar com `when` menor.
2. **Commit só local, nunca push nem PR.** O usuário pede o push uma única vez, no fim de tudo; antes disso o chat principal junta esta branch na dele e faz a revisão final.
3. **Andamento próprio:** registre em `docs/reviews/execucao-progresso-c.md` (crie a partir do modelo de `execucao-progresso.md`, só com os seus 8 itens e o bloco "Em andamento"). **Não edite** `docs/reviews/execucao-progresso.md`: é do chat principal.
4. Em `docs/decisions.md` e no relatório de lacunas (`docs/reviews/2026-10-12-lacunas-cliente.md`), **acrescente no fim** ou mude só a linha do seu ID; não reescreva seções, para a junção das branches ser simples.
5. Responda **sempre em português do Brasil**; código, commits e PRs em inglês (Conventional Commits curtos, skill `caveman-commit`, trailer `Co-Authored-By` do histórico).
6. **Design rigoroso:** nada de tela simplista. Toda tela segue a ficha D0 e a lista "Proibido" da seção 4.4, reaproveita as referências internas (`ToneStatus`, `CustomerTimeline`, cards de Publicações) e vem com capturas antes e depois (claro e escuro, computador e celular, contorno vermelho na área alterada) e a medição de transbordamento (D2).
7. Ao fim de cada etapa, uma linha curta; nos pontos de parada, mande as imagens das mudanças com `SendUserFile` quando houver tela.
8. Antes de cada commit, faça a revisão de vícios de IA (helpers duplicados, código morto, comentários que repetem o código, imports fora do grupo, casts e checagens implícitas, textos técnicos ou em inglês na tela) e corrija o que achar.
9. Dados de demonstração para capturas vão por script no scratchpad, no banco `sellbridge_desk_c`; nunca no seed.

## 4. Primeira mensagem esperada

Quando o usuário mandar `Comece`, faça o **Item 00** adaptado a este chat: confira branch, árvore limpa, `docker ps`, banco `sellbridge_desk_c` migrado e semeado (já está), suba o preview `sellbridge-c`, rode o C5 com o banco C e registre a linha de base em `execucao-progresso-c.md`. Depois siga para o item 08 com `Próximo`.
