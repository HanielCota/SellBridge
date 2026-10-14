# Chat paralelo D: conta, planos e painel

Este chat roda **ao lado** de outros quatro (principal, B, C e E), numa cópia isolada do projeto. Leia este arquivo inteiro e depois [coordenacao.md](coordenacao.md), e siga os dois junto com `docs/prompts/execucao-tela-a-tela.md`, que continua sendo o prompt de execução (fluxo da seção 6, portões da seção 4, formato de relatório da seção 7, design da seção 4.4).

## 1. Onde você está

| O quê       | Valor deste chat (D)                                                                 |
| ----------- | ------------------------------------------------------------------------------------ |
| Pasta       | `C:\Users\Administrator\Projetos\SellBridge-d`                                       |
| Branch      | `feat/client-phase-1-d`                                                              |
| Banco       | `sellbridge_desk_d` (migrado e semeado)                                              |
| Redis (app) | `redis://localhost:6379/6`                                                           |
| Preview     | `sellbridge-d`, porta **3700** (entrada no `.claude/launch.json` da pasta principal) |
| E2E         | porta 3170, health 3171, Redis db 7 (já no `.env` desta pasta)                       |

- Nos comandos dos portões use sempre `DATABASE_URL=postgres://sellbridge:sellbridge@localhost:5432/sellbridge_desk_d`. **Nunca** use o banco `sellbridge` nem o de outro chat.
- A branch saiu da branch C depois da junção com a principal: itens 00–08 prontos, a auditoria de vícios de IA aplicada e a divisão por área em vigor.
- Nunca faça `cd` para a pasta de outro chat; use caminhos absolutos dentro desta pasta.

## 2. Seu escopo

Área: conta, planos e painel (veja a tabela de [coordenacao.md](coordenacao.md)). Itens, nesta ordem, um por vez:

1. **Item 16** · Riscos da assinatura (sem tela na maior parte: use o ajuste 3.2, uma parada só antes dos testes). Revisão independente obrigatória.
2. **Item 31** · Planos como no PDF ❓D10 (matriz atrás de flag, desligada por padrão).
3. **Item 26** · Onboarding previsível e conta completa (pode precisar de migration: siga a "senha da vez", seção 3.1 da coordenação).
4. **Item 29** · Painel do mockup do cliente ❓D8 (não troque o menu do topo).

Correções de design da auditoria que são suas: U-5 (Assinatura sem `PageHeader`, `<main>` duplicado, sem skeleton), X-5 (o painel se chama "Painel de vendas" no título e "Visão geral" no menu), U-2 do painel (skeleton com outra grade). Entram junto com o item que mexe na tela.

## 3. Regras deste chat (além das do prompt principal e da coordenação)

1. **Commit só local, nunca push nem PR.** Ao fechar cada item, `git merge feat/client-phase-1` e rode as migrations novas no `sellbridge_desk_d`.
2. **Andamento próprio:** registre em `docs/reviews/execucao-progresso-d.md` (crie a partir do modelo de `execucao-progresso-c.md`, só com os seus itens, a linha de base e o bloco "Em andamento"). Não edite o andamento dos outros chats.
3. Em `docs/decisions.md` e no relatório de lacunas, **acrescente no fim** ou mude só a linha do seu ID, sem realinhar tabelas.
4. Responda **sempre em português do Brasil**; código, commits e PRs em inglês (Conventional Commits curtos, skill `caveman-commit`, trailer `Co-Authored-By` do histórico).
5. **Design rigoroso:** toda tela segue a ficha D0 e a lista "Proibido" da seção 4.4, com capturas antes e depois (claro e escuro, computador e celular, contorno vermelho na área alterada) e a medição de transbordamento D2.
6. Antes de cada commit, revise os vícios de IA (helpers duplicados, código morto, comentários que repetem o código, imports fora do grupo, casts, textos técnicos ou em inglês na tela).
7. Dados de demonstração para capturas vão por script no scratchpad, no banco `sellbridge_desk_d`; nunca no seed.

## 4. Primeira mensagem esperada

Quando o usuário mandar `Comece`, faça o **Item 00** adaptado a este chat: confira branch, árvore limpa, `docker ps`, banco `sellbridge_desk_d` migrado e semeado, suba o preview `sellbridge-d`, rode o C5 com o banco D e registre a linha de base em `execucao-progresso-d.md`. Depois siga para o item 16 com `Próximo`.
