# Perfis de conta — fase 1 (base)

Aprovado em 2026-10-16. Modelo: uma **conta** (login) pode ter vários **perfis** (Vendedor, Fornecedor); a **equipe** SellBridge é conta própria, sem perfil. Glossário fixo: _Conta_ = login · _Perfil_ = Vendedor ou Fornecedor · _Cargo_ = função · _Titular_ = responsável pelo perfil.

A fase 1 prepara a base sem criar o fornecedor ainda: o perfil passa a viver na URL de cada aba, a conta ganha uma descrição única (`describeAccount`) e a ficha do usuário no admin passa a mostrar perfis e uma ação principal.

## Regras da fase 1

- Cada regra vira teste **antes** do código, e o teste precisa falhar sem a implementação.
- Branch nova a partir de `main` (`feat/account-profiles`); a árvore atual de `feat/client-phase-1` tem trabalho de outros chats e não entra aqui.
- Registrar o item em `docs/prompts/coordenacao.md` antes de começar (mexe em sessão e tenant, área compartilhada).
- Fora do escopo: cadastro e painel do fornecedor, supervisão, fila de pendências, modo "Ver como" só leitura (fases 2 e 3, abaixo).

## Etapa 0 — Spike (até meio dia)

Confirmar no TanStack Start instalado (`@tanstack/react-start` 1.169):

1. Um middleware de função com `.client()` consegue enviar o cabeçalho `x-sellbridge-profile` em toda chamada.
2. Em SSR (loaders), a função de servidor enxerga a URL da página (`?perfil=`) quando o cabeçalho não existe.

Resultado esperado: ordem de resolução **cabeçalho da aba → `?perfil=` da página → perfil ativo da sessão → primeiro perfil**. Se o item 2 falhar, a alternativa é passar `perfil` explicitamente nos loaders. Anotar a decisão em `docs/decisions.md`.

## Etapa 1 — Domínio (`packages/shared`)

Arquivo novo `packages/shared/src/domain/account-profile.ts`:

- `PROFILE_KINDS = ["seller", "supplier"]`, `PROFILE_STATUSES = ["active", "in_review", "paused", "suspended"]` e rótulos em pt-BR.
- `describeAccount(user, memberships)` → `{ staffRole, profiles: [{ id, slug, name, kind, memberRole, status }] }`.
- `primaryActionFor(account)` → uma ação só, escolhida pelo estado: e-mail não verificado → `resend_verification`; banida → `review_block`; saudável → `null`.
- Tom visual: o tipo de perfil é sempre neutro (ícone e texto); só o status tem cor.

Testes (`account-profile.test.ts`):

- `describes a reseller with one seller profile as titular`
- `never gives a staff account a seller or supplier profile`
- `picks resend verification as the primary action while the e-mail is unverified`
- `picks reviewing the block before anything else for a banned account`
- `has no primary action for a healthy account`
- `gives profile kinds a neutral tone and only statuses a color`

## Etapa 2 — Banco (`packages/database`)

- Coluna `organization.kind` (`text`, `not null`, default `'seller'`, check `in ('seller','supplier')`), com migração Drizzle e `additionalFields` do plugin de organização do Better Auth.
- Repositório `listProfilesOf(userId)`: perfis da conta com cargo e status.
- Seed: uma conta com **dois** perfis de vendedor, para os testes de abas (o fornecedor só chega na fase 2).

Testes:

- `lists only the profiles the user is a member of`
- `creates new organizations as seller profiles by default`

## Etapa 3 — Perfil por aba (problema 1: troca em uma aba vazava para as outras)

Hoje o tenant vem de `session.activeOrganizationId` (`apps/web/src/lib/server/tenant-session.ts`), compartilhado por todas as abas.

- `_app/route.tsx`: `?perfil=<slug>` validado com Zod e mantido em todos os links com `retainSearchParams(["perfil"])`.
- Middleware de função no cliente envia `x-sellbridge-profile` com o perfil da URL da aba.
- Função pura `resolveProfileId({ requested, sessionActive, memberships })` em `tenant-session.ts`:
  - perfil pedido e a pessoa é membro → usa esse perfil;
  - perfil pedido sem ser membro → `AppError` `profile_forbidden` (mensagem com o slug recebido);
  - nada pedido → perfil ativo da sessão, como hoje.
- O perfil ativo da sessão só muda numa troca explícita e passa a ser apenas o padrão para abas novas.
- Na troca de perfil: navegar com o novo `?perfil=` e limpar o cache do React Query (`removeQueries`), para nenhum dado do perfil anterior aparecer.
- Link para um perfil que não é da conta: tela "Este link é de outro perfil", com o botão "Ir para o meu perfil". Nunca tela de erro.

Testes Vitest (`tenant-session.test.ts`):

- `uses the profile sent by the tab instead of the session's active one`
- `refuses a profile the user is not a member of`
- `falls back to the session's active profile when the tab sends none`
- `does not change the session's active profile when a tab reads another one`

Testes Playwright (`apps/web/e2e/profile-tabs.spec.ts`):

- `keeps each tab on its own profile` (duas abas no mesmo contexto; troca na aba A, ação na aba B cai no perfil da aba B)
- `keeps the profile after reload and in a copied link`
- `shows the other-profile screen for a profile outside the account`
- `clears the previous profile's data when switching`

## Etapa 4 — Seletor de perfil no topo

- `components/layout/profile-switcher.tsx` no `top-nav`: nome do perfil + ícone do tipo.
- Com um perfil só, mostra o nome sem menu: menu vazio é fricção.
- "Ativar outro perfil" fica oculto até a fase 2 (sem botão desabilitado).
- Funciona por toque e por teclado; nada depende de passar o mouse.

Testes Playwright:

- `shows the active profile name in the header` (a 375, 768 e 1280 px)
- `opens the profile list only when there is more than one profile`

## Etapa 5 — Ficha do usuário no admin

`/admin/clientes/$userId`, reaproveitando `customer-access.tsx` e `customer-row-actions.tsx`:

- Lista de perfis: tipo neutro, cargo e status (ponto colorido + texto).
- **Uma** ação principal vinda de `primaryActionFor`; as demais em "Mais ações".
- Ação em andamento: o botão vira "Reenviando…" e ignora o segundo clique.
- Permissão perdida com a tela aberta: "Seu cargo mudou, esta ação não está mais disponível", em vez de erro genérico.

Testes Playwright (`apps/web/e2e/admin-account-profiles.spec.ts`):

- `offers resending verification first for an unverified customer`
- `lists every profile of the account with its status`
- `sends one request when the primary action is double-clicked`
- `explains a lost permission instead of showing a generic error`

## Pronto quando

- Todos os testes acima verdes; `pnpm turbo lint typecheck test` e `audit.ts --full` limpos.
- Verificação no navegador: duas abas com perfis diferentes, F5, link copiado, ficha no admin a 375 px.
- Commits atômicos (`feat:` por etapa, `test:` junto da etapa), push e PR para `main`, sem merge.

## Próximas fases (regras já aprovadas, viram testes quando a fase abrir)

**Fase 2 — Fornecedor**

- Escolha "Quero vender / Quero fornecer" no cadastro e "Ativar outro perfil" depois.
- Status: o fornecedor pausa e retoma sozinho; a suspensão é da equipe; motivo obrigatório nos dois.
- Pausar zera o estoque dos anúncios ligados e avisa os vendedores; pedidos já feitos continuam.
- O prazo de envio novo vale só para pedidos novos.
- CNPJ único entre fornecedores ativos; o fornecedor antigo assume o perfil por convite no e-mail de contato.
- O último titular não sai; para excluir a conta, os pedidos de fornecedor em andamento precisam terminar.
- Rascunho do cadastro salvo por etapa no servidor.

**Fase 3 — Supervisão e equipe**

- Revisão de preço: alta acumulada acima do limite configurável (proposta: 15%) em 30 dias; o preço aprovado continua valendo; a última edição substitui as anteriores.
- Análise com prazo configurável; passou do prazo, sobe na fila.
- Reprovação com motivo e botão "Reenviar".
- Ações da equipe com versão do registro ("Já aprovado por Carla há 1 min") e chave de idempotência.
- "Ver como" só leitura, garantido no servidor; "Agir como" com motivo de lista e tempo limitado.
- Desbloqueio mostra quem bloqueou e por quê; bloqueio por fraude só sai por um Administrador.
- Pedidos entre perfis do mesmo titular não contam para nota, ranking nem avaliações.
- Caixa "Pendências" da equipe.
