# Chat paralelo E: admin da plataforma, suporte e avisos

Este chat roda **ao lado** de outros quatro (principal, B, C e D), numa cópia isolada do projeto. Leia este arquivo inteiro e depois [coordenacao.md](coordenacao.md), e siga os dois junto com `docs/prompts/execucao-tela-a-tela.md`, que continua sendo o prompt de execução (fluxo da seção 6, portões da seção 4, formato de relatório da seção 7, design da seção 4.4).

## 1. Onde você está

| O quê       | Valor deste chat (E)                                                                 |
| ----------- | ------------------------------------------------------------------------------------ |
| Pasta       | `C:\Users\Administrator\Projetos\SellBridge-e`                                       |
| Branch      | `feat/client-phase-1-e`                                                              |
| Banco       | `sellbridge_desk_e` (migrado e semeado)                                              |
| Redis (app) | `redis://localhost:6379/8`                                                           |
| Preview     | `sellbridge-e`, porta **3800** (entrada no `.claude/launch.json` da pasta principal) |
| E2E         | porta 3180, health 3181, Redis db 9 (já no `.env` desta pasta)                       |

- Nos comandos dos portões use sempre `DATABASE_URL=postgres://sellbridge:sellbridge@localhost:5432/sellbridge_desk_e`. **Nunca** use o banco `sellbridge` nem o de outro chat.
- A branch saiu da branch C depois da junção com a principal: itens 00–08 prontos, a auditoria de vícios de IA aplicada e a divisão por área em vigor.
- Nunca faça `cd` para a pasta de outro chat; use caminhos absolutos dentro desta pasta.

## 2. Seu escopo

Área: admin da plataforma, suporte e avisos (veja a tabela de [coordenacao.md](coordenacao.md)). Itens, nesta ordem, um por vez:

1. **Item 28** · Admin da plataforma (partes a–d da seção 9.0). Inclui a **auditoria das escritas do catálogo** que o chat C adiou no 08.b: `admin_audit_events` exige `userId`; crie a auditoria global (28.b) com migration pela "senha da vez" (seção 3.1 da coordenação) e registre nela as ações de `apps/web/src/features/admin-suppliers/suppliers.server.ts` (desativar, salvar, importar CSV), pedindo ao chat C só a menor mudança necessária nesse arquivo. Depende do item 10 (owner da plataforma), que é do chat B: se ainda não estiver pronto, comece pelas partes que não dependem dele (28.b, 28.c).
2. **Item 27** · Suporte: o que falta (partes a–e).
3. **Item 25** · Central de notificações ❓D9 (só o canal WhatsApp depende do cliente).
4. **Item 32** · Infraestrutura (sem tela: use o ajuste 3.2, uma parada só antes dos testes).

Correções de design da auditoria que são suas: U-7 ("Voltar" de detalhe feito de 4 jeitos; dar ao `PageHeader` um espaço para ele) e U-10 (Métricas do suporte rola 132 px no celular). Entram junto com o item que mexe na tela.

Pendente do chat C para você: o índice em `listings.supplier_product_id` (migration) pode entrar junto com a sua primeira migration, se o principal não tiver feito.

## 3. Regras deste chat (além das do prompt principal e da coordenação)

1. **Commit só local, nunca push nem PR.** Ao fechar cada item, `git merge feat/client-phase-1` e rode as migrations novas no `sellbridge_desk_e`.
2. **Andamento próprio:** registre em `docs/reviews/execucao-progresso-e.md` (crie a partir do modelo de `execucao-progresso-c.md`, só com os seus itens, a linha de base e o bloco "Em andamento"). Não edite o andamento dos outros chats.
3. Em `docs/decisions.md` e no relatório de lacunas, **acrescente no fim** ou mude só a linha do seu ID, sem realinhar tabelas.
4. Responda **sempre em português do Brasil**; código, commits e PRs em inglês (Conventional Commits curtos, skill `caveman-commit`, trailer `Co-Authored-By` do histórico).
5. **Design rigoroso:** toda tela segue a ficha D0 e a lista "Proibido" da seção 4.4, com capturas antes e depois (claro e escuro, computador e celular, contorno vermelho na área alterada) e a medição de transbordamento D2, em modo normal e em modo admin.
6. Antes de cada commit, revise os vícios de IA (helpers duplicados, código morto, comentários que repetem o código, imports fora do grupo, casts, textos técnicos ou em inglês na tela).
7. Dados de demonstração para capturas vão por script no scratchpad, no banco `sellbridge_desk_e`; nunca no seed.

## 4. Primeira mensagem esperada

Quando o usuário mandar `Comece`, faça o **Item 00** adaptado a este chat: confira branch, árvore limpa, `docker ps`, banco `sellbridge_desk_e` migrado e semeado, suba o preview `sellbridge-e`, rode o C5 com o banco E e registre a linha de base em `execucao-progresso-e.md`. Depois siga para o item 28 com `Próximo`.
