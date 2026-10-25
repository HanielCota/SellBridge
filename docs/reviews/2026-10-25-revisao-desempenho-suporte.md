# Revisão: Desempenho do suporte (2026-10-25)

Escopo: `feat/support-performance`. Foram duas revisões independentes, só leitura, sobre o diff contra `origin/main`. Depois as correções foram aplicadas nesta mesma branch.

- `docs/prompts/revisao-qualidade.md` (sete seções). Os cenários foram provados com um script contra `buildSupportPerformanceReport`.
- `docs/prompts/revisao-completa.md` em modo `diff` (quatro eixos).

Resultado: nenhum achado crítico. A segurança e a sanitização ficaram sem achados.

- A server function exige `support.metrics`.
- Todo o SQL bruto usa parâmetros ou constantes.
- O `situation_id` vem do catálogo do servidor.

## Achados e o que foi feito

| #                  | Sev.        | Achado                                                                                                   | Situação                                                                                                                                                                                   |
| ------------------ | ----------- | -------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Q1                 | Alta        | Os fechamentos feitos só pelo cliente entravam na taxa esperada e geravam "Precisa de apoio" sem motivo. | Corrigido: `teamBySubject` usa só encerramentos com `resolverId`. Teste: `does not let customers closing on their own raise the yardstick`.                                                |
| Q2                 | Alta        | Uma única primeira resposta fora do prazo bastava para "Precisa de apoio".                               | Corrigido: toda taxa precisa de amostra mínima (`comparable`). Teste: `does not flag someone over a single late first reply`.                                                              |
| Q3                 | Alta        | "No prazo" ignorava os chamados nunca respondidos.                                                       | Corrigido: `onTimeOf` conta os vencidos sem resposta como fora do prazo. Teste: `counts unanswered tickets past their deadline as late`.                                                   |
| Q6 / C1            | Média       | "Sem reabrir" contava como sucesso encerramentos que ainda não tinham completado os 7 dias.              | Corrigido: `noReopenOf` só usa encerramentos com mais de 7 dias, e o tile avisa quando ainda não há nenhum. Teste: `leaves closes younger than the 7-day window out`.                      |
| Q4                 | Média       | Duas definições de "média por pessoa".                                                                   | Corrigido: `overview.resolvedPerAgent` passa a ser a única, usada no tile, na tabela e no gráfico. Teste: `averages resolutions only over team members who resolved`.                      |
| Q5 / C3            | Média       | O filtro de origem não valia para as respostas.                                                          | Corrigido: `TeamReplyRow.origin` e `forOrigin`. Teste: `keeps replies to other customers out of active days`.                                                                              |
| Q7                 | Média       | A taxa de avaliação podia passar de 100%.                                                                | Corrigido: `ratedCloseAt` e limite em 1. Teste: `never reports more ratings than resolutions`.                                                                                             |
| Q8                 | Média       | Os baldes não batiam com o período (8 dias em "7 dias", primeira semana parcial com rótulo errado).      | Corrigido: `periodBounds` usa dias inteiros de Brasília, a primeira semana começa no primeiro dia do período e o tooltip mostra a data. Testes de calendário.                              |
| Q9                 | Média       | A frase da ficha recomendava treino por causa de um único chamado.                                       | Corrigido: exige amostra mínima e diferença mínima. Teste: `does not prescribe training over a single ticket`.                                                                             |
| Q10                | Média       | Os links de assunto não carregavam a origem nem tinham "Sem detalhe".                                    | Corrigido: a fila ganhou `origem` e `situacao=sem-detalhe`, com chips. Teste e2e e `subjectQueueSearch`.                                                                                   |
| Q11                | Média       | "Sem responsável" usava uma regra diferente da fila.                                                     | Corrigido: `queueRows` usa `activeAssigneeIdSql`.                                                                                                                                          |
| Q12                | Média       | Contas bloqueadas apareciam sempre.                                                                      | Corrigido: aparecem só se trabalharam no período. Teste: `hides blocked accounts`.                                                                                                         |
| Q13                | Média       | O atalho "precisa de apoio" perdia o período e a origem.                                                 | Corrigido: `attentionCopy(item, scope)`. Teste na story.                                                                                                                                   |
| Q14                | Média       | Dicas dos tiles sem link só abriam com mouse.                                                            | Corrigido: o tile recebe foco e abre a dica no toque.                                                                                                                                      |
| Q15                | Média       | Ao reabrir e fechar de novo sem nova resposta, o crédito voltava para quem tinha falhado.                | Corrigido: só contam respostas depois do encerramento anterior. Teste de banco que falha sem a correção.                                                                                   |
| Q16 / C4           | Média/Baixa | Varredura completa a cada carregamento.                                                                  | Corrigido: índices em `ticket_events(type, created_at)`, `ticket_messages(created_at)` e `tickets(created_at)` na 0052, e as respostas passam a ser buscadas só a partir do período atual. |
| C2                 | Baixa       | Trocar o tema não limpava `situation_id`.                                                                | Corrigido em `setTicketCategory`. Teste de banco que falha sem a correção.                                                                                                                 |
| C6                 | Baixa       | O seed criava contas de equipe com a senha de demo e o `--reset` não as removia.                         | Corrigido: usa a senha de admin e inclui as contas no reset.                                                                                                                               |
| C7                 | Baixa       | Comentário do schema fora do lugar.                                                                      | Corrigido.                                                                                                                                                                                 |
| Baixos (qualidade) | Baixa       | Itens de acabamento.                                                                                     | Corrigidos, um a um:                                                                                                                                                                       |

Correções dos itens baixos da revisão de qualidade:

- título do gráfico da ficha por dia ou por semana;
- "Melhor resultado" com amostra de 5;
- tile "Resolvidos" sem link enganoso;
- "Com a pessoa" da equipe soma os abertos;
- variação a partir de zero como número inteiro;
- dicas pelo `HintedText` em vez de `title`;
- anel de foco no link da página Equipe;
- chip com o nome da situação vindo de qualquer tema;
- aviso para `?pessoa=` fora do período;
- seed com repetição pela mesma loja.

Ficam abertos, com o motivo:

- **C5 (6 consultas em paralelo):** aceitável com o pool atual; rever se a tela ficar pesada.
- **C8 (`bucketOf` por linha):** custa milissegundos no volume atual.
- **Comentário de nota baixa perdido após reabrir:** é uma limitação do schema (`statusColumns` zera `ratingComment`); vai para a fase 2.
- **`ticket_messages.author_id` em cascade:** fica para um PR próprio, já registrado na spec.

## Checagens depois das correções

- **Typecheck, lint e formatação:** verdes.
- **Testes unitários e de banco:** verdes (8 de 8 tarefas: shared 1130, database 578, marketplaces 208, web 1179, worker 105).
- **E2E dos specs afetados:** 39 de 39 passaram (desempenho, suporte, equipe, relatórios, acessibilidade, admin).
- **E2E completo antes das correções:** 236 passaram e 1 falhou: `hint.spec.ts:81`, uma falha conhecida da `main` nesta máquina, sem relação com esta mudança.
