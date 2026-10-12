# Prompt: Fase Cliente 1 (corrigir os riscos, fechar as lacunas e preparar a base do P0)

> Cole este prompt numa sessão nova do Claude Code, na raiz do repositório, e escolha a **onda** na primeira linha.
> Fonte da verdade: [docs/reviews/2026-10-12-lacunas-cliente.md](../reviews/2026-10-12-lacunas-cliente.md). Os IDs B1…B20, A1…R6 e D1…D11 deste prompt se referem a esse relatório.
> Ao terminar cada onda, salve o andamento em `docs/reviews/AAAA-MM-DD-fase-cliente-1.md` e atualize o status de cada ID no relatório de lacunas (✅/🟡/❌).

---

**Onda:** `0` | `1` | `2` | `3` | `4` | `todas`

- `0`: estabilizar a árvore de trabalho.
- `1`: corrigir os bugs e riscos B1–B20.
- `2`: fechar as lacunas das funcionalidades que **já existem**: suporte, admin, publicação, pedidos, notificações, onboarding e dashboard.
- `3`: construir a **base** dos P0 novos (fornecedor, pedido ao fornecedor, pagamento, planos) atrás de interfaces e adapters mock.
- `4`: tornar visível o que ficou de fora: relatório, decisões e marcadores.
- `todas`: executa 0→4 em sequência, parando nos checkpoints.

Você é um engenheiro sênior full-stack trabalhando no SellBridge. O SellBridge é uma plataforma multi-tenant: revendedores publicam produtos de fornecedores regionais em marketplaces e acompanham pedidos e lucro. O cliente entregou um plano mestre e dois áudios. O relatório de lacunas traduz isso em perguntas, cada uma com o status atual conferido no código. Sua missão é **fechar o máximo de lacunas com segurança**. O que depende de decisão do cliente deve ficar **pronto para encaixar** (interface + mock + flag), nunca inventado.

## Princípios

1. **Leia o código antes de mudar.** O relatório aponta arquivo e linha, mas o código pode ter mudado: confira. Se um item já estiver resolvido, marque ✅ com a evidência e siga.
2. **Não invente regra de negócio.** Itens marcados ❓ com D1…D11 (taxa, gateway, custódia, frete, portal do fornecedor, matriz de planos, cargos) não recebem regra definitiva. Faça assim:
   - modele de forma configurável (basis points, enum, tabela de limites);
   - implemente um **adapter mock**, no padrão do marketplace mock (`packages/marketplaces/src/mock/`);
   - deixe atrás de uma flag de ambiente validada com Zod e desligada por padrão;
   - registre a suposição em `docs/decisions.md` com a etiqueta `PENDENTE CLIENTE (Dn)`;
   - no código, marque `// TODO(client:Dn): <o que falta decidir>`.
3. **Teste cada mudança.** Cada bug corrigido ganha um teste que falhava antes. Toda lógica de domínio nova (máquinas de estado, cálculo de split, limites de plano, reserva de estoque) vai para `packages/shared/src/domain` com testes unitários. Fluxos de tela ganham e2e quando mudam a jornada.
4. **Isolamento entre tenants é inegociável.** Toda tabela nova de tenant leva `tenant_id` indexado e é acessada por repositório que exige `tenantId`. Toda server function nova usa `tenantMiddleware` ou o middleware de permissão de staff. Escreva o teste de isolamento.
5. **Migrações seguras.** Nunca edite migration já aplicada. Gere novas com o drizzle-kit e confira o `_journal.json`. Dinheiro sempre em centavos inteiros.
6. **Severidade honesta no relatório.** "Parcial" é um resultado válido. Diga o que ficou de fora e por quê.

## Contexto do projeto

Leia a seção **"Contexto do projeto"** de [docs/prompts/revisao-completa.md](revisao-completa.md): stack, pastas, middlewares, API pública, worker, conectores. Leia também `docs/architecture.md`, `docs/decisions.md` e `docs/marketplaces/mercado-livre.md`. Para o Turborepo, siga o `AGENTS.md`.

**Regras da casa**

- Sem `else`, com early return.
- `async/await` sem `.then` encadeado.
- Checagem explícita de null.
- **Zod em todas as bordas.**
- Dinheiro em centavos.
- Textos de produto em português.
- Código, commits e PRs em inglês (Conventional Commits curtos).
- `pnpm check:no-else`.
- Gráficos nunca podem encostar nem sair da área de plotagem. Confira a geometria em 4 larguras.

**Skills a carregar quando o trabalho se encaixar**

- `codebase-design`: novos módulos e seams (pagamento, pedido ao fornecedor, notificações).
- `better-auth-best-practices`: cargos, permissões, plugin admin/organization.
- `vercel-react-best-practices` e `apple-design`: telas.
- `playwright-best-practices`: e2e.
- `caveman-commit`: commits.

## Checagens obrigatórias ao fim de cada onda

`pnpm typecheck` · `pnpm lint` · `pnpm check:no-else` · `pnpm format:check` · `pnpm test` (com Postgres e Redis no ar via `pnpm services:up`) · `pnpm --filter @sellbridge/web build` · `pnpm test:e2e` nas specs afetadas. Se algo falhar, conserte antes de seguir. Não pule hooks.

---

## Onda 0: estabilizar a árvore

1. Rode `git status`. Há cerca de 78 arquivos modificados e arquivos novos fora do git (migrations 0009–0011 com snapshots, `schema/admin.ts`, `repositories/customer-care.ts`, `admin-composer.tsx`, `ticket-customer-panel.tsx`, `reply-templates.ts`, `customer-ranking.ts`, `customer-health.ts`, `e2e/sales.ts`, `public/marketplaces/`).
2. **B5:** o `_journal.json` reescreveu o `when` da migration 0007 (de `1791748800000` para `1791700000000`). Investigue pelo `git diff` e pelo histórico por que isso mudou. Restaure o valor original se a mudança não for necessária. Explique o risco para bancos que já aplicaram a 0007 antes da 0008.
3. Rode as checagens. **Antes de commitar, mostre o plano de commits (agrupados por tema) e espere minha confirmação.** Depois crie uma branch `feat/client-phase-1` a partir do resultado.

**Checkpoint 0:** árvore limpa, checagens verdes.

## Onda 1: bugs e riscos (B1–B20)

Corrija na ordem do relatório (🔴 → 🟢), **incluindo os riscos N1–N14 da seção ⟳** (trazidos pela `main`), um commit por bug ou grupo coeso, cada um com teste. Os 🔴 de N1–N4 entram junto com B1–B5. Notas por item:

- **B1, venda sem estoque:**
  - criar **reserva/baixa atômica** de estoque do fornecedor na venda (transação + `UPDATE … SET stock = stock - qty WHERE stock >= qty`), com devolução no cancelamento;
  - o sync passa a enviar o **disponível** e dispara um sync imediato dos anúncios afetados quando o estoque muda;
  - documentar em `decisions.md` a política de estoque compartilhado entre revendedores (primeiro que vende leva; estoque de segurança configurável).
- **B2, anúncio duplicado:** dedupe por (tenant, produto, loja) também no fluxo individual, com índice único se couber. Idempotência no `POST /items` do ML: antes de recriar, buscar o item por `seller_custom_field`/SKU, e gravar o `external_id` assim que a resposta chegar.
- **B3, webhook entre tenants:** decidir a regra (uma conta ML só pode estar conectada a um tenant: bloquear no OAuth callback com mensagem clara) e tornar a busca determinística.
- **B4, status do ML:** mapear todos os status de pedido do ML (incluindo `partially_refunded`, devoluções e claims) e ler o envio (`/shipments`) para shipped/delivered. Isso abre D-1 (veja a Onda 2).
- **B6, B7 e B19, admin:** introduzir **owner da plataforma** (vindo da `ADMIN_EMAILS`) e impedir que outro admin o rebaixe, bana ou remova. Desabilitar ou proteger os endpoints crus do plugin admin que não usamos (`create-user`, `remove-user`, `set-user-password`) ou auditá-los. Trocar o e-mail exige reverificação e passa pela auditoria.
- **B8, organização:** bloquear criação de organização e convite pela API enquanto não houver tela de equipe (hooks `organizationHooks`/`allowUserToCreateOrganization: false`), e reconferir a participação em `requireTenantSession`.
- **B9:** o sync ignora produto ou fornecedor inativo e fora da cobertura do tenant. Pausar o anúncio e notificar o revendedor.
- **B10:** custo desconhecido não pode virar 0 em silêncio. Marcar "custo pendente" e excluir do lucro, com aviso. Pedidos `pending` não contam como receita.
- **B11:** teto de corpo antes do `formData()`. Validar posse e status do ticket **antes** de gravar o arquivo. Rate limit nos uploads.
- **B12–B18, B20:** como descrito no relatório.

**Checkpoint 1:** tabela B1–B20 atualizada no relatório de andamento, com commit e teste de cada item.

## Onda 2: lacunas das funcionalidades existentes

Itens que **não dependem** de decisão do cliente. Para cada ID, entregue o mínimo completo: schema, repositório, server function, tela e teste.

### 2.1 Suporte (J1–J17) e cargos internos (K1–K5)

**A base já foi entregue em 2026-10-12** (veja a seção J do relatório e `decisions.md` de 2026-10-12):

- cargos `agent`/`supervisor`/`admin` com `staffMiddleware(permissão)`;
- filas, responsável, prioridade, tema e prazo de resposta (`awaiting_since`);
- `ticket_events`, `ticket_reads`, e-mail ao revendedor;
- encerramento e avaliação pelo cliente, job `ticket-auto-close`;
- métricas em `/admin/chamados/metricas`;
- botão "Suporte" no topo.

Não refaça isso. Confira que continua de pé e faça o que falta:

- **J5:** vínculo opcional do chamado com pedido, loja ou anúncio, com atalho "Falar com o suporte" nas telas de pedido, loja e anúncio com erro (o formulário já aceita `?categoria=&assunto=`).
- **J6:** horário comercial no cálculo do prazo (config) e prazo por plano, quando existir o bloco M.
- **J7:** avisar a equipe quando entra chamado novo ou resposta (e-mail ou push, pela camada `NotificationChannel` da 2.4).
- **J9:** templates de resposta em tabela, com CRUD para supervisor+, migrando `reply-templates.ts`.
- **K1–K3:** `owner` da plataforma acima de `admin` (B6, B7) e convite de pessoas da equipe pela interface, já com o cargo.
- **K4:** tela global de auditoria `/admin/auditoria`, com filtros e paginação, incluindo as ações de suporte.
- **K5:** durante a impersonation, gravar `impersonatedBy` nas ações sensíveis, logar o fim e bloquear chaves de API, webhooks, desconexão de loja e exclusão.

### 2.2 Publicação e anúncios (E1–E13, F1–F7)

- O servidor bloqueia publicar sem estoque. A massa aplica as mesmas validações do individual (B16).
- **Modelo único de taxa**, usado na prévia **e** no Financeiro (B17):
  - taxa por marketplace e categoria (tabela/config);
  - taxa da plataforma;
  - frete estimado opcional.

  O piso de preço passa a garantir uma **margem mínima configurável**, não só "acima do custo".

- **ML:**
  - confirmar a categoria prevista (mostrar as 3 sugestões);
  - formulário de atributos obrigatórios vindo de `/categories/{id}/attributes`;
  - escolha entre Clássico e Premium;
  - garantia;
  - falha na descrição vira erro visível (B13).
- **Erros do ML em português:** mapear os códigos comuns e incluir `cause[]`, com "o que fazer".
- **Progresso da publicação em massa:** "x de y", %, e tempo restante estimado pela média dos jobs (pedido do áudio 2). Componente reutilizável `ProgressWithEta`.
- **Anúncios:**
  - mostrar "sincronizando…" e a última sincronização (F2);
  - pausar e encerrar nativos no ML via conector (F3);
  - assinar o tópico `items` e ingerir o status do ML (F4);
  - página `/publicacoes/$listingId` com vendas, histórico e erros (F5);
  - ao desconectar a loja, oferecer "encerrar anúncios" (F6);
  - saúde da loja: último sync, último webhook, validade do token (F7).

### 2.3 Pedidos, rastreio e financeiro (A6–A8, A11, D-1, D-3, D-4, G1–G4, G7)

- **Página `/pedidos/$orderId`** com linha do tempo de status, itens, comprador, endereço (o que o ML expõe), taxas, lucro e link para o marketplace.
- **`/pedidos` vira a central de pedidos:** filtros por status, loja e período, "precisa de ação". As avaliações viram uma ação dentro do pedido.
- **Job de reconciliação** usando `listOrders` (fallback do webhook).
- **Envios do ML:** tópico `shipments`, tabela `order_shipments` (código, transportadora, status, previsão, eventos), timeline de rastreio, **alerta de atraso** quando a previsão vence sem entrega.
- **Financeiro:**
  - confirmar `sale_fee` por unidade;
  - ingerir reembolsos e devoluções reais;
  - incluir o custo de frete do vendedor quando vier do ML;
  - forçar America/Sao_Paulo no `relative-time.ts`.

### 2.4 Notificações (H1–H8)

- **Camada `NotificationChannel`**, com os canais `in_app`, `email` (Resend, com template HTML de marca), `push` (stub) e `whatsapp` (stub, `TODO(client:D9)`), mais uma outbox com retentativa no padrão do `webhook-delivery`.
- **Catálogo de eventos:** venda paga (com valor e "organize seu pagamento"), loja expirada, erro de publicação, atraso de entrega, entregue, resposta de suporte, conquista. A venda `pending` não notifica como venda.
- **Preferências por evento × canal** salvas no servidor, com tela em `/perfil`.
- **Telefone/WhatsApp** no perfil, com opt-in registrado (data e versão do texto).

### 2.5 Onboarding com previsibilidade (I1–I4) e conta (L1, L2, L4)

- **Etapas:**
  1. dados da conta (telefone, CPF/CNPJ, empresa);
  2. região;
  3. loja;
  4. primeira publicação;
  5. primeira venda.

  Cada etapa mostra % e **tempo estimado** ("~2 min"), mais o total "sua loja fica pronta em ~X min". Pular e retomar explícitos.

- **Verificação de e-mail obrigatória** antes de conectar loja ou publicar.
- **Checkbox de aceite** de termos e privacidade, com versão e data gravadas (também no fluxo Google).

### 2.6 Dashboard (G6 sem depender de D8)

- Saudação "Olá, {nome}".
- KPIs de **produtos ativos** e **lojas conectadas**.
- **Pedidos recentes** com logo do marketplace e status.
- **Ações rápidas:** publicar produto, encontrar fornecedores, gerenciar pedidos, ver relatórios.
- **Rosca "Principais categorias"** por receita do período, respeitando a regra de gráficos.

Não troque o menu do topo por menu lateral sem D8.

**Checkpoint 2:** cada ID com status no relatório de andamento; e2e das jornadas novas (staff atribui e responde, cliente lê, encerra e avalia; lojista publica em massa e vê o progresso; pedido com rastreio).

## Onda 3: base dos P0 novos (atrás de interface + mock + flag)

Carregue `codebase-design`. Cada módulo tem uma interface pequena e profunda, a lógica de domínio em `shared/domain` com testes e um adapter mock.

### 3.1 Fornecedores (B-1…B-12, K6)

- **CRUD de fornecedor no admin:**
  - CNPJ, razão social, endereço, contato, WhatsApp;
  - prazo de envio em dias úteis, pedido mínimo, política de troca;
  - status `pendente/aprovado/suspenso`.
- **CRUD de produto:** fotos (storage de objetos via a interface `FileStorage`, adapter S3/R2 atrás de flag, R4), EAN/GTIN, marca, modelo, peso, dimensões, NCM, variações.
- **Importação por planilha CSV** com validação Zod e relatório de erros linha a linha.
- **"Atualizado há X"** do estoque visível para o revendedor. Descontinuar um produto pausa os anúncios e notifica.
- O **portal do fornecedor** (B-2, B-15) só tem o schema de papel `supplier` preparado, com `TODO(client:D6)`. Não construa as telas.

### 3.2 Pedido ao fornecedor (A1–A5, A9, A10)

- **Entidade `supplier_orders`** (um por fornecedor dentro da venda), com a máquina de estados do relatório (A2) em `shared/domain/supplier-order.ts`. Transições testadas, eventos gravados.
- **Gerada automaticamente** quando a venda fica paga. Recusa leva a: cancelar no marketplace (via conector, se suportado), estornar (via gateway) e notificar.
- **Prazo de envio do fornecedor** e alerta de atraso, alimentando a linha do tempo previsível (I5).
- **Aviso ao fornecedor** por e-mail via `NotificationChannel`, enquanto D6 não define o portal.

### 3.3 Pagamento, split e custódia (C1–C12)

- **Interface `PaymentGateway`:** `createCharge` (pix/cartão), `getCharge`, `refund`, `createSubaccount`, `releaseEscrow`, `verifyWebhook`.
  - Adapter **mock** completo: QR Pix falso, webhook assinado e tela de "pagar" simulada, no padrão do `/oauth/mock/autorizar`.
  - O adapter real fica para D3.
- **Split** em basis points (`PLATFORM_SPLIT_BASIS_POINTS`, padrão 400 = 4%), calculado em `shared/domain/split.ts` com testes de arredondamento em centavos. `TODO(client:D1/D2)`.
- **Máquina de estados do repasse:** `pendente → pago → retido → liberado | estornado | em_disputa`.
  - Liberação quando o pedido ao fornecedor chega a `entregue` + carência configurável (`TODO(client:D4)`).
  - Webhooks do gateway com idempotência (padrão `webhook_events`).
- **Extratos:** revendedor (pago/a pagar) e admin (splits, retidos, liberados). O fornecedor recebe por e-mail até D6.
- **Nunca** guardar dados de cartão.

### 3.4 Planos e recursos liberados por plano (M1–M8)

- **Tabelas `plans`** (seed com Start, Pro, Business, Black e Elite e preços do PDF) e **`plan_limits`** (lojas, anúncios, usuários, relatórios avançados, fiscal, IA, SLA de suporte), mais `subscriptions` (status, período, plano, `started_at` para tempo de casa).
- **Middleware `requirePlanFeature`** no servidor; os limites são checados na publicação e na conexão de loja. A matriz é `TODO(client:D10)`, com tudo liberado enquanto a flag `PLANS_ENFORCED` estiver desligada.
- **Cobrança recorrente** via `PaymentGateway` (mock). Upgrade e downgrade sem pró-rata real (TODO). A inadimplência vira estado, sem bloqueio ainda.
- **Admin:** ver e trocar o plano do cliente, com auditoria.

**Checkpoint 3:** demo ponta a ponta no ambiente local, toda no mock: venda no marketplace mock → pedido ao fornecedor → pagamento Pix mock com split → fornecedor "envia" → entregue → repasse liberado → notificações em cada etapa → linha do tempo previsível. Escreva um e2e para esse caminho.

## Onda 4: tornar visível o que ficou de fora

1. **Relatório de lacunas:** atualize cada ID com o status final e o commit ou arquivo da entrega.
2. **`docs/decisions.md`:** uma entrada por suposição `PENDENTE CLIENTE (Dn)`, com o que foi assumido e o que muda quando o cliente responder.
3. **Lista dos `TODO(client:…)`:** gere uma lista com `grep -rn "TODO(client:" apps packages` e cole no relatório de andamento, agrupada por Dn.
4. **Itens não iniciados** (fiscal N, IA O, Club P, portal do fornecedor, landing L8/Q6, menu lateral Q1, Shopee/TikTok/Amazon F8, monitoramento/backup R1–R3): para cada um, escreva em 3–5 linhas a proposta técnica, a dependência e a estimativa, como base dos próximos prompts. **Não implemente.**
5. **Resumo executivo** no topo do relatório de andamento:
   - o que mudou para o lojista;
   - o que mudou para o staff;
   - o que está atrás de flag;
   - as perguntas abertas ao cliente (D1–D11) ordenadas pelo quanto bloqueiam.

## Regras de parada

- Pare e pergunte antes de: commitar a árvore da Onda 0, rodar migração destrutiva, mudar um contrato da API pública v1 (`docs/api.md`), ou trocar o layout de navegação.
- Se uma correção da Onda 1 exigir decisão de produto que o relatório não cobre, implemente a opção mais conservadora (a que não perde dinheiro nem dados), registre em `decisions.md` e siga.
- Não implemente nada da lista "Fora de escopo" do relatório.
