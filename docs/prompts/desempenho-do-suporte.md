# Prompt: Desempenho do suporte (admin), v2

Mockup de referência (layout, conteúdo e cores; não é código):
https://claude.ai/artifact/PF9fzmm2wn1UTq86hkmHwo

Leia antes: `CLAUDE.md`, `docs/prompts/execucao-tela-a-tela.md` (seção 4.4) e a decisão do
formulário guiado de suporte em `docs/decisions.md` (2026-10-20).

O v2 corrige o v1 depois de uma revisão feita com a persona "Renata, coordenadora de suporte que
vai contratar". A revisão encontrou métricas injustas com quem pega casos difíceis, um ranking que
estimula fechar rápido, amostras pequenas sem aviso e taxa de avaliação escondida.

---

## Objetivo

Transformar `/admin/chamados/metricas` em **Desempenho do suporte**. A coordenação precisa
responder a três perguntas, nesta ordem:

1. **A equipe dá conta?** Quanto entra contra quanto sai, a fila agora e os horários de pico.
2. **A equipe resolve de verdade?** Rapidez, resolução sem retorno do cliente e nota.
3. **Quem precisa de apoio, e em quê?** Por pessoa, comparando de forma justa.

E também: **do que os clientes mais reclamam?** (tema + situação do formulário guiado).

## Quem é medido

- **Equipe**: cargos `agent` e `supervisor` de `STAFF_ROLES`, e `admin` só se respondeu ou
  resolveu algo no período. Contas bloqueadas aparecem só com dados no período.
- **Clientes**: nunca um a um. Agrupados por `organization.kind` (Revendedores / Fornecedores).
- Só chamados da plataforma (`platformTicketSql`). As conversas com fornecedor ficam fora.
- **Em experiência**: na equipe há menos de 90 dias, contando de `user.createdAt` (o convite
  cria a conta). Mostrar "entrou em DD/MM · em experiência".

## Regras de medição (todas em `packages/shared/src/domain/support-performance/`, testadas)

| Medida                 | Regra                                                                                                                                                                                                                                                                                                                                            |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Resolvido              | Um evento `status_changed → closed` no período. Um chamado reaberto e fechado de novo conta duas vezes.                                                                                                                                                                                                                                          |
| Quem resolveu          | Autor da última resposta pública da equipe (`isAdmin`, não interna) antes do encerramento. Vale também no encerramento automático. Sem resposta da equipe: conta só no total.                                                                                                                                                                    |
| Voltou                 | Reaberto em até **7 dias** depois do encerramento, **ou** o mesmo cliente (tenant) abriu outro chamado no mesmo tema e situação em até 7 dias **sobre a mesma coisa** (mesma loja, mesmo anúncio ou um pedido vinculado em comum; sem referência em comum não conta, porque pode ser outro pedido). "Sem reabrir" = resolvidos que não voltaram. |
| Primeira resposta      | Mediana de `firstResponseAt − createdAt` dos chamados abertos no período, em horas corridas. O prazo também é em horas corridas (`ticket-rules.ts`), então a régua é a mesma.                                                                                                                                                                    |
| Crédito da 1ª resposta | Autor da primeira resposta pública da equipe.                                                                                                                                                                                                                                                                                                    |
| No prazo               | 1ª resposta até `createdAt` + prazo da prioridade atual.                                                                                                                                                                                                                                                                                         |
| Nota                   | Evento `rated`, creditado a quem resolveu o encerramento que foi avaliado. Mostrar **taxa de avaliação** = notas ÷ resolvidos.                                                                                                                                                                                                                   |
| Dias ativos            | Dias (fuso de Brasília) com ao menos uma resposta pública da pessoa. "Resolvidos por dia ativo" compara quem tirou folga.                                                                                                                                                                                                                        |
| Comparação justa       | O "sem reabrir" de cada pessoa é comparado com o **esperado para a mistura de assuntos dela**: Σ(resolvidos da pessoa na situação × taxa da equipe na situação) ÷ resolvidos da pessoa.                                                                                                                                                          |
| Amostra mínima         | Menos de **5 resolvidos**: sem cor e sem situação; mostrar "poucos chamados". Porcentagens sempre com o número ao lado na dica ("82% de 17").                                                                                                                                                                                                    |

**Situação da pessoa** (uma palavra, nesta ordem):

1. "N fora do prazo" (vermelho): chamados com ela atrasados agora;
2. "Poucos chamados": abaixo da amostra mínima;
3. "Precisa de apoio" (âmbar): no prazo < 80% ou sem reabrir 5 p.p. abaixo do esperado;
4. "Acima da equipe" (verde): no prazo ≥ 92% e sem reabrir ≥ esperado + 3 p.p.;
5. "Na média".

## Acesso

- Permissão `support.metrics` (supervisor e admin), como hoje.
- **Sem aba nova no menu**, porque o modo admin já tem 12 abas. No topo de `/admin/chamados` e
  da página de desempenho entra um `FilterTabs` "Fila · Desempenho", que troca de rota e só
  aparece para quem tem `support.metrics`. Ele substitui o botão "Métricas".
- Atalhos: em `/admin/equipe`, o nome de cada pessoa de suporte abre a ficha dela
  (`?pessoa=<id>`); no detalhe do chamado, o nome do responsável também.

## URL (Zod em `supportMetricsSearchSchema`)

`days` 7|30|90 (padrão 30) · `secao` geral|equipe|assuntos · `origem` todos|revendedor|fornecedor ·
`grafico` volume|resposta|horarios · `pessoa` id. **Não usar `perfil`**, que já troca o perfil
da sessão.

## Layout

O mockup é só referência. Montar com os componentes do app, que trazem a navbar, o tema e as
transições reais:

| Parte          | Componentes                                                                                                                                          |
| -------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| Topo           | `FilterTabs` Fila · Desempenho; título no padrão de `DashboardIntro`; frase-resumo de uma linha                                                      |
| Tiles          | Anatomia de `KpiTile`, com `DeltaBadge` e `Sparkline` de `components/reports/figures.tsx`                                                            |
| Gráfico        | Card como o de `CashFlowChart`: `ChartContainer` (Recharts), `CartesianGrid` horizontal, `TooltipCard`, cores `--chart-brand` e `--muted-foreground` |
| Cards de baixo | `BreakdownSection` e o padrão de `AttentionPanel`                                                                                                    |
| Hover          | `surface-card` / `surface-interactive`                                                                                                               |

- **Visão geral**:
  - 4 tiles: Resolvidos, Primeira resposta, Sem reabrir e Nota (esta com a taxa de avaliação).
  - O gráfico tem três vistas:
    - Volume: entrou × saiu, por dia em 7 dias e por semana em 30/90;
    - 1ª resposta: mediana por balde;
    - Horários: mapa dia da semana × hora dentro do horário do suporte (`SUPPORT_HOURS`) e uma
      coluna "fora".
  - 3 cards:
    - Assuntos que mais geram chamados;
    - Equipe, **sem número de posição**, ordenada por situação;
    - Precisa de você: fora do prazo, sem responsável, assunto disparando (+3 e +50%), pessoa
      precisando de apoio e "Outro problema" ≥ 20% de um tema.
- **Equipe**: tabela com Pessoa, Situação, Resolvidos, Por dia ativo, 1ª resposta, No prazo, Sem
  reabrir (com o esperado), Nota e Com a pessoa. Linha final com a equipe.
- **Assuntos**: tema e situações. Colunas: Chamados, Antes, Até resolver, Sem reabrir, Nota e
  Melhor resultado (só com amostra mínima). Chamados sem situação gravada aparecem como "Sem
  detalhe".
- **Ficha da pessoa**:
  - frase-resumo;
  - 4 tiles comparados à equipe;
  - linha de resolvidos por semana, com a média da equipe tracejada;
  - cards Agora, Por assunto (pessoa × equipe) e Avaliações de 1 a 3.
- Estados de carregando, erro e vazio. No celular tudo empilha e as tabelas rolam dentro do card.

## Dados

1. Migração nova: `tickets.situation_id text null` e índice
   `(tenant_id, category, situation_id, created_at)`.
2. `planSupportTicket` devolve o `situationId` validado; `createTicket` grava esse valor.
3. Repositório em módulos pequenos (`support-performance*.ts`). Ele busca linhas cruas do período
   atual e do anterior, e as regras puras em `shared` montam o relatório. O volume é baixo
   (centenas por mês); se crescer, levar a agregação para o SQL.
4. Substituir `getSupportMetrics`, sem deixar código morto.
5. Seed com 4 pessoas (uma em experiência), situações nos dois perfis, reaberturas, chamado novo
   repetido e notas baixas.

## Testes

- Vitest das regras: crédito de quem resolveu, voltou por reabertura e por chamado novo, nota
  para quem resolveu, mediana, esperado pela mistura de assuntos, amostra mínima, situação,
  dias ativos, origem e período anterior.
- Vitest do repositório com banco: linhas cruas, incluindo encerramento automático.
- Servidor: `situationId` gravado e recusado quando não pertence ao tema.
- Playwright: supervisor alterna Fila e Desempenho e as seções (URL); atendente não vê o seletor
  e é redirecionado; nome em Equipe abre a ficha. Gráficos medidos em 375, 768, 1280 e 1920 px,
  claro e escuro.

## Fora deste PR

- **PR separado (risco de dados)**: `ticket_messages.author_id` está com `on delete cascade`. Se a
  conta de um atendente for apagada (inclusive pela exclusão de conta da LGPD), as mensagens dele
  e o histórico de desempenho somem. Proposta: autor anulável com `set null` e "Pessoa removida"
  na tela.
- **Fase 2**: aviso no sino, limites configuráveis, atendente vendo a própria ficha, comparação
  por tempo de casa e exportar CSV.
- **Com a equipe (não é código)**: avisar que essas métricas existem; a situação "Precisa de
  apoio" é só para a coordenação.

## Revisão de 2026-10-25 (aplicada)

As revisões de qualidade e completa (modo `diff`) refinaram as regras acima. O relatório está em
`docs/reviews/2026-10-25-revisao-desempenho-suporte.md`; as regras finais estão em `docs/decisions.md`
(2026-10-25).
