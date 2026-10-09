# Registro de decisões

## 2026-10-08 — Prettier no lugar do Oxfmt

Oxfmt está em 0.72 (beta, pré-1.0). Conforme a regra do projeto, usamos Prettier até o Oxfmt estabilizar.

## 2026-10-08 — lefthook para hooks de git

Um binário só, roda comandos em paralelo e dispensa husky + lint-staged.

## 2026-10-08 — Tenant = organization do Better Auth

Plugin organization; uma organização criada automaticamente por usuário no MVP.

## 2026-10-08 — Cálculo de lucro

Lucro por item = preço de venda − custo do fornecedor − taxa do marketplace − ajustes (devolução/reembolso). Taxa da plataforma configurável, inicialmente 0. Todos os valores em centavos (inteiros).

## 2026-10-08 — Região

UF + cidade derivadas do CEP. BrasilAPI como provedor principal, ViaCEP como fallback, cache em Postgres. Fornecedor aparece se cobre a UF ou a cidade.

## 2026-10-08 — Armazenamento de anexos

Interface `FileStorage`; implementação em disco local no desenvolvimento. S3/R2 depois.

## 2026-10-08 — Criptografia de tokens

AES-256-GCM com chave em `TOKEN_ENCRYPTION_KEY`.

## 2026-10-08 — TypeScript 7 e lint type-aware

O lint type-aware do Oxlint (oxlint-tsgolint) exige TypeScript 7. Tentaremos TS 7; se for incompatível com TanStack Start/Drizzle, voltamos para TS 5.x e deixamos o type-aware desligado.

## 2026-10-08 — Fluxo de git

Commits direto na `main` (pedido do usuário).

## 2026-10-08 — Revisão das decisões ao iniciar a Fase 0

- **TypeScript 7 confirmado.** `tsc --noEmit` (TS 7.0.2) funciona com TanStack Start, Drizzle e Better Auth. Lint type-aware ligado via `oxlint-tsgolint` (`options.typeAware` no `.oxlintrc.json`).
- **pnpm 12.** Scripts de build de dependências ficam bloqueados por padrão; liberados explicitamente em `allowBuilds` no `pnpm-workspace.yaml` (`esbuild`, `lefthook`).
- **Drizzle 0.45 (estável)** em vez do 1.0 RC que a documentação atual sugere. Migraremos quando o 1.0 sair do RC.
- **Validador das server functions:** a versão instalada do TanStack Start usa `.inputValidator()` (a página "build from scratch" ainda mostra `.validator()`). Seguimos os tipos instalados.
- **`.env` único na raiz**, carregado por `loadRootEnvironmentFile()` (`process.loadEnvFile`) no web e no worker, e por `node --env-file-if-exists` nos scripts do `packages/database`.

## 2026-10-08 — Papel de admin

Plugin `admin` do Better Auth. O e-mail listado em `ADMIN_EMAILS` recebe `role = "admin"` no cadastro (hook `databaseHooks.user.create.before`). Admin gerencia fornecedores e responde chamados.

## 2026-10-08 — Organização criada no cadastro

`databaseHooks.user.create.after` cria a organização do usuário e `databaseHooks.session.create.before` define `activeOrganizationId`. O `tenantMiddleware` das server functions exige essa organização e injeta `tenantId` no contexto.

## 2026-10-08 — Taxa da plataforma

No MVP vem de `PLATFORM_FEE_BASIS_POINTS` (basis points, padrão 0) em vez de uma tabela `platform_settings`. Vira tabela quando houver tela de configuração.

## 2026-10-08 — shadcn/ui

Preset `radix-nova` (Radix + Lucide). Componentes gerados em `src/components/ui/` são código vendorizado: ficam fora do Oxlint e do `check:no-else`, mas passam pelo typecheck estrito. Ajustes feitos para `exactOptionalPropertyTypes`: `dropdown-menu.tsx` (prop `checked`) e `sonner.tsx` (troca de `next-themes` pelo nosso `useTheme`).

## 2026-10-08 — Identidade visual

Neutra e própria do SellBridge (paleta neutra do shadcn, modo claro/escuro). Sem relação com a identidade do Envio Velox.

## 2026-10-08 — Limitação conhecida do `check:no-else`

O scanner ignora comentários, strings e template literals. Regex literais contendo aspas (ex.: `/"/`) podem confundi-lo; nesse caso, extraia a regex para `new RegExp("...")`.

## 2026-10-08 — Testes E2E e hidratação

Em dev, o primeiro carregamento demora a hidratar. Os testes navegam com `gotoHydrated()` (espera `networkidle`) antes de interagir com formulários.

## 2026-10-08 — Fluxo de git (atualização)

Commits locais na `main`. Push para o GitHub só após confirmação do usuário.

## 2026-10-08 — Fase 1: região e fornecedores

- **Fluxo do CEP:** cache em `cep_cache` (TTL de 30 dias), depois BrasilAPI e, em seguida, ViaCEP. A BrasilAPI responde 404 tanto para CEP inexistente quanto quando os provedores dela falham; por isso um 404 é confirmado no ViaCEP antes de virar "CEP não encontrado". As respostas dos provedores passam por Zod.
- **Visibilidade de fornecedores:** um fornecedor aparece se `supplier_coverage` cobre a UF inteira (`city` nulo) ou a cidade do tenant (comparação sem diferenciar maiúsculas). Acessar catálogo ou produto fora da região resulta em `NotFoundError`.
- **Filtro de preço do catálogo** usa o custo do fornecedor (valor de atacado), em centavos na URL.
- **Loaders sem bloqueio:** os loaders aguardam os dados só no SSR (`prefetchOnServer`). Nas navegações do cliente, a URL muda na hora e o componente mostra seu próprio carregamento (`keepPreviousData`), em vez de travar a mudança de filtro.
- **Sessão sem organização ativa:** a sessão do cadastro pode nascer antes da organização. O `tenantMiddleware` cai para a primeira organização do usuário e a grava como ativa.
- **Seeds:** dados determinísticos (PRNG com semente fixa). `pnpm database:seed` é idempotente; `pnpm database:seed -- --reset` limpa o domínio e recria. Contas: `demo@sellbridge.local / demo12345` (Belo Horizonte, 2 lojas simuladas, cerca de 6 meses de pedidos) e `admin@sellbridge.local / admin12345`. As imagens de produto vêm do picsum.photos e os logos do DiceBear: são placeholders de desenvolvimento.
- **Lojas da conta demo** usam o marketplace `mock`, porque não há tokens reais.
- **Testes de integração do banco** rodam contra o Postgres real (`fileParallelism: false`). O CI sobe o Postgres no job de checagens.

## 2026-10-08 — Fase 2: lojas e publicação

- **Interface única `MarketplaceConnector`** (`packages/marketplaces`): autorização OAuth, troca de código, renovação de token, publicação, atualização de estoque/preço, pedidos e verificação de webhook. Web e worker só falam com marketplaces por ela.
- **Conector mock completo e determinístico**: tela de consentimento própria (`/oauth/mock/autorizar`), tokens com validade de 6 h, publicação idempotente (o mesmo `idempotencyKey` gera o mesmo id externo) e gatilhos para testes: `[falha]` no título = recusa permanente, `[instavel]` = falha temporária, preço < R$ 5 = recusa, refresh token `mock-refresh-revoked` = loja expirada. Mercado Livre, Shopee e TikTok aparecem como "Em breve" até terem conector real.
- **OAuth**: `state` aleatório de uso único, gravado em `oauth_states` com tenant, marketplace e validade de 10 min. O callback só aceita o state do mesmo tenant e marketplace (proteção contra CSRF e replay). A tela de consentimento mock só redireciona para o nosso próprio callback (sem open redirect).
- **Tokens criptografados em repouso** com AES-256-GCM (IV aleatório + auth tag, formato `v1.iv.tag.dados`). Desconectar apaga os tokens.
- **Fila de publicação (BullMQ 6)**: o web só produz jobs; o worker processa. 5 tentativas com backoff exponencial a partir de 5 s. Erros não recuperáveis (`retryable: false`, payload inválido, publicação de outro tenant, loja desconectada) usam `UnrecoverableError` e não são repetidos. Enquanto há tentativas, o destino fica "Na fila" com o motivo visível; na última, vira "Erro" com botão de reprocessar. Token revogado marca a loja como "Acesso expirado".
- **Rate limit**: token bucket por loja no worker (5 req/s) mais o limiter global da fila (20 jobs/s). As requisições HTTP aos marketplaces usam `fetchWithRetry` (retry em 408/425/429/5xx, respeita `Retry-After`, backoff exponencial com jitter).
- **Renovação de tokens**: job scheduler `refresh-expiring-tokens` a cada 10 min renova tokens que expiram nos próximos 30 min.
- **Status em tempo quase real**: a tabela de publicações faz polling a cada 2 s enquanto há itens "Na fila" ou "Publicando".
- **Tabelas (TanStack Table 9)**: todas são dirigidas pelo servidor (paginação, filtros e ordenação nos search params), então usam `tableFeatures({})` sem features de cliente.
- **Worker com health check opcional** (`WORKER_HEALTH_PORT`), usado pelo Playwright para subir web + worker nos testes E2E.
- **Lucro estimado** no formulário de publicação usa taxa de 14% como referência; o valor real vem dos pedidos.

## 2026-10-08 — Fase 3: dashboard e financeiro

- **Fórmula de lucro por pedido** (centavos): `receita − custo do fornecedor − taxa do marketplace − reembolsos + comissões − taxa da plataforma`. Pedidos cancelados e devolvidos não geram receita, custo nem taxa (o produto volta ao fornecedor); o valor devolvido aparece em "Devoluções" só para visibilidade. A regra vive em `computeOrderFinance` (`packages/shared/src/finance.ts`) e é repetida em SQL nos relatórios; um teste de integração compara as duas.
- **"Comissões"** são os ajustes do tipo `commission`: bônus pagos pelo fornecedor ao revendedor (somam ao lucro).
- **Fuso horário:** períodos e agrupamentos usam dias de Brasília (`America/Sao_Paulo`, UTC−3 fixo desde 2019). Um pedido às 23h30 conta no mesmo dia, não no seguinte em UTC.
- **Comparação:** os KPIs comparam com o período anterior de mesmo tamanho. Períodos maiores que 45 dias agrupam o gráfico por semana. Intervalo personalizado de até 366 dias; um intervalo inválido na URL cai para os últimos 30 dias, sem erro.
- **Agregações no Postgres** (CTE por pedido + `generate_series` para preencher dias sem venda). As linhas do banco passam por Zod antes de entrar no app.
- **CSV** no padrão do Excel brasileiro: `;` como separador, vírgula decimal, BOM UTF-8, datas no fuso de Brasília. Células de texto são protegidas contra injeção de fórmula (prefixo `'`); números são escritos crus. Limite de 20 mil linhas por exportação. A rota exige sessão e usa os mesmos filtros da tela.
- **Código de servidor fora do bundle:** server functions só têm o handler removido do cliente. Helpers comuns que usam `env`/banco ficam em `src/lib/server/` (ex.: `report-scope.ts`), nunca exportados de arquivos `*.functions.ts`.

## 2026-10-08 — Fase 4: suporte, Mercado Livre, webhooks e sincronização

- **Mercado Livre real** atrás da mesma interface (`packages/marketplaces/src/mercado-livre`). Endpoints e campos conferidos na documentação oficial e resumidos em [docs/marketplaces/mercado-livre.md](marketplaces/mercado-livre.md). OAuth com PKCE (S256); o refresh token é de uso único e sempre substituído pelo novo. TODOs explícitos no código: modelo "User Products", atributos obrigatórios por categoria, idempotência de `POST /items` e semântica de `sale_fee`.
- **Webhooks**: rota `POST /api/webhooks/:marketplace` valida a origem pelo conector, grava o evento bruto **uma vez** (`unique (marketplace, external_event_id)`), enfileira e responde 200 imediatamente (o Mercado Livre exige resposta em 500 ms). Eventos inválidos são gravados para auditoria e respondidos com 401. O worker processa com até 5 tentativas; o `jobId` é o id do evento, então nunca há dois jobs para o mesmo evento.
- **Mercado Livre não assina notificações**: aceitamos apenas o nosso `application_id` e o `user_id` de uma loja conectada, e o pedido é sempre buscado na API com o token da loja (o conteúdo do payload nunca é usado como dado). O mock usa HMAC-SHA256 (`x-mock-signature`).
- **Pedidos vindos de marketplaces**: upsert idempotente por `(loja, id externo)`. A primeira entrega cria pedido e itens (vinculando anúncio e custo do fornecedor pelo id externo do anúncio); as seguintes atualizam status, total e taxa. Itens de anúncios que não são nossos entram com custo zero para não perder receita.
- **"Simular venda"** (só lojas simuladas): gera um webhook assinado para o próprio endpoint, percorrendo o caminho real webhook → fila → worker → financeiro.
- **Sincronização de estoque e preço**: job a cada 15 min envia ao marketplace os anúncios publicados cujo estoque do fornecedor ou preço mudou desde o último envio (`synced_stock`, `synced_price_cents`).
- **Suporte**: anexos via `FileStorage` (disco local em `UPLOADS_DIR` no desenvolvimento), até 3 arquivos de 5 MB, tipo verificado pelo conteúdo (magic bytes de PNG, JPG, WEBP e PDF), nome sanitizado, chave sem dados do usuário e proteção contra path traversal. Download só pelo tenant dono ou admin, com `x-content-type-options: nosniff`. Resposta do revendedor reabre o chamado; resposta do admin marca "Respondido"; admin precisa reabrir um chamado encerrado para responder.
- **Uploads multipart** usam rotas HTTP (`/api/suporte/...`) em vez de server functions, com erros devolvidos como JSON `{ error }` e status HTTP derivado do código do `AppError`.
- **Seed**: as lojas simuladas da conta demo recebem tokens mock criptografados com `TOKEN_ENCRYPTION_KEY`, para que webhooks e sincronização funcionem também nelas.

## 2026-10-09 — Padrões de código estritos

Aplicados os princípios descritos em [architecture.md](architecture.md) e reforçados pelo Oxlint: `max-lines-per-function` (60), `max-params` (4), `max-depth` (3), `max-nested-callbacks` (3), `id-length` (mínimo 2), `no-param-reassign`, `prefer-const`, `no-console`, `no-empty` e o plugin `promise` (`prefer-await-to-then`, `prefer-await-to-callbacks`).

- **Erros por composição:** as subclasses (`NotFoundError`, `MarketplaceError`...) viraram um único `AppError` com `code` e `details`, criado por fábricas. `instanceof` deu lugar a `hasErrorCode`/`isMarketplaceError`; a retentativa lê `details.retryable`.
- **Nomes:** `packages/db` virou `packages/database`; `env`, `db`, `deps`, `tx`, `ms`, `q`, `dir`, `fetchImpl` e `*Bps` foram escritos por extenso. `PLATFORM_FEE_BPS` virou `PLATFORM_FEE_BASIS_POINTS` e os scripts `db:*` viraram `database:*` (`db:up` virou `services:up`). Ficam como estão os nomes impostos por APIs externas (`q` do Mercado Livre, `deps` do TanStack Router, `env` do Playwright) e as colunas `*_enc` já migradas.
- **"Sempre async":** interpretado como "todo I/O é `async`/`await`, sem cadeias `.then()/.catch()`". Funções puras continuam síncronas.
- **Overrides do lint:** só por arquivo (o `.catch()` do Zod em `schemas/fallback.ts` e o tamanho dos blocos de teste). Nenhum comentário de desativação.
- **Logger:** escreve em `process.stdout`/`stderr`, respeita `LOG_LEVEL` e mascara chaves sensíveis.
- **Segredos fora do código:** `MOCK_WEBHOOK_SECRET` deixou de ter padrão; as senhas do seed vêm de `SEED_DEMO_PASSWORD`/`SEED_ADMIN_PASSWORD`, também lidas pelos testes E2E; o CI gera segredos efêmeros por execução.
