# Andamento do chat E (admin da plataforma, suporte e avisos)

Registro do chat E na divisão de 2026-10-16 ([coordenacao.md](../prompts/coordenacao.md), seção 0, Modo MVP), no formato de [execucao-progresso.md](execucao-progresso.md), que continua sendo do principal (só leitura aqui). Worktree `.claude/worktrees/client-e-8848ce`, branch `claude/client-e-8848ce` (criada de `feat/client-phase-1` em 79c5769), banco `sellbridge_desk_e`, Redis db 8, preview na 3800, e2e 3180 · 3181 · db 9.

## Em andamento

- Item/parte: ⏸A (planos de 25, 27.a–c e 28 em lote)
- Última etapa concluída: preparação (banco `sellbridge_desk_e` recriado do zero, migrate até 0031 e seed)
- Próximo passo: esperar o OK do ⏸A e começar pelo 25.a
- Arquivos tocados: —
- Decisões tomadas nos pontos de parada: —
- Pendências: o `.env` da worktree não pôde ser criado (regra de permissão bloqueia escrever `.env`); comandos rodam com as variáveis do banco E na linha de comando

## Linha de base

| Métrica                                        | Valor                    | Medido em  |
| ---------------------------------------------- | ------------------------ | ---------- |
| Testes unitários e de integração (`pnpm test`) | a medir no 25.a          | —          |
| Última migration (branch)                      | 0031_boundary_checks     | 2026-10-16 |
| Branch de trabalho                             | `claude/client-e-8848ce` | 2026-10-16 |

## Situação dos itens

Legenda: ✅ concluído · 🟡 parcial · ⬜ não iniciado · ⛔ bloqueado

| Item | Título                  | Situação | Commit | Notas                                                     |
| ---- | ----------------------- | -------- | ------ | --------------------------------------------------------- |
| 25   | Central de notificações | ⬜       | —      | Partes a, b, c, d; WhatsApp é fase 2 (D9)                 |
| 27   | Suporte: o que falta    | ⬜       | —      | Partes a, b, c; 27.d e 27.e são fase 2                    |
| 28   | Admin da plataforma     | ⬜       | —      | Partes a, b, c, d; inclui a auditoria do catálogo do 08.b |

Correções de design da auditoria que ficam com o E: U-7 ("Voltar" de detalhe e `PageHeader` com voltar) e U-10 (Métricas do suporte).

## Refinar depois

Acabamento que o Modo MVP deixa para depois (não bloqueia o item):

- _(nenhum ainda)_

## Histórico

Uma entrada por item concluído ou interrompido, a mais recente em cima.
