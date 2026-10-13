# Registro de decisões

## 2026-10-08: Prettier no lugar do Oxfmt

Oxfmt está em 0.72 (beta, pré-1.0). Pela regra do projeto, usamos Prettier até o Oxfmt estabilizar.

## 2026-10-08: lefthook para hooks de git

Um binário só, roda comandos em paralelo e dispensa husky + lint-staged.

## 2026-10-08: Tenant = organization do Better Auth

Plugin organization; uma organização criada automaticamente por usuário no MVP.

## 2026-10-08: Cálculo de lucro

Lucro por item = preço de venda − custo do fornecedor − taxa do marketplace − ajustes (devolução/reembolso). Taxa da plataforma configurável, inicialmente 0. Todos os valores em centavos (inteiros).

## 2026-10-08: Região

UF + cidade derivadas do CEP. BrasilAPI como provedor principal, ViaCEP como fallback, cache em Postgres. Fornecedor aparece se cobre a UF ou a cidade.

## 2026-10-08: Armazenamento de anexos

Interface `FileStorage`; implementação em disco local no desenvolvimento. S3/R2 depois.

## 2026-10-08: Criptografia de tokens

AES-256-GCM com chave em `TOKEN_ENCRYPTION_KEY`.

## 2026-10-08: TypeScript 7 e lint type-aware

O lint type-aware do Oxlint (oxlint-tsgolint) exige TypeScript 7. Tentaremos TS 7; se for incompatível com TanStack Start/Drizzle, voltamos para TS 5.x e deixamos o type-aware desligado.

## 2026-10-08: Fluxo de git

Commits direto na `main` (pedido do usuário).

## 2026-10-08: Revisão das decisões ao iniciar a Fase 0

- TypeScript 7 confirmado: `tsc --noEmit` (TS 7.0.2) funciona com TanStack Start, Drizzle e Better Auth. Lint type-aware ligado via `oxlint-tsgolint` (`options.typeAware` no `.oxlintrc.json`).
- pnpm 12: scripts de build de dependências ficam bloqueados por padrão; liberados explicitamente em `allowBuilds` no `pnpm-workspace.yaml` (`esbuild`, `lefthook`).
- Drizzle 0.45 (estável) em vez do 1.0 RC que a documentação atual sugere. Migraremos quando o 1.0 sair do RC.
- Validador das server functions: a versão instalada do TanStack Start usa `.inputValidator()` (a página "build from scratch" ainda mostra `.validator()`). Seguimos os tipos instalados.
- `.env` único na raiz, carregado por `loadRootEnvironmentFile()` (`process.loadEnvFile`) no web e no worker, e por `node --env-file-if-exists` nos scripts do `packages/database`.

## 2026-10-08: Papel de admin

Plugin `admin` do Better Auth. O e-mail listado em `ADMIN_EMAILS` recebe `role = "admin"` no cadastro (hook `databaseHooks.user.create.before`). Admin gerencia fornecedores e responde chamados.

Atualização (2026-10-11): o papel só vem com a posse do e-mail comprovada. No cadastro pelo Google, o provedor comprova e `user.create.before` já grava `admin`. No cadastro com senha, cada login de um e-mail de admin não verificado envia o link de confirmação (`session.create.after`). Quando o e-mail passa a verificado, pelo link ou por um login Google que vincula a conta, `user.update.after` promove a conta, apaga a senha e todas as sessões, e manda o link de redefinição. Confirmar o e-mail prova quem lê a caixa, não quem escolheu a senha: sem isso, quem cadastrasse primeiro um e-mail de admin herdaria o papel quando o dono clicasse no link. A migration `0007` rebaixa admins promovidos pela regra antiga sem e-mail verificado.

## 2026-10-08: Organização criada no cadastro

`databaseHooks.user.create.after` cria a organização do usuário e `databaseHooks.session.create.before` define `activeOrganizationId`. O `tenantMiddleware` das server functions exige essa organização e injeta `tenantId` no contexto.

## 2026-10-08: Taxa da plataforma

No MVP vem de `PLATFORM_FEE_BASIS_POINTS` (basis points, padrão 0) em vez de uma tabela `platform_settings`. Vira tabela quando houver tela de configuração.

## 2026-10-08: shadcn/ui

Preset `radix-nova` (Radix + Lucide). Componentes gerados em `src/components/ui/` são código vendorizado: ficam fora do Oxlint e do `check:no-else`, mas passam pelo typecheck estrito. Ajustes feitos para `exactOptionalPropertyTypes`: `dropdown-menu.tsx` (prop `checked`) e `sonner.tsx` (troca de `next-themes` pelo nosso `useTheme`).

## 2026-10-08: Identidade visual

Neutra e própria do SellBridge (paleta neutra do shadcn, modo claro/escuro). Sem relação com a identidade do Envio Velox.

## 2026-10-08: Limitação conhecida do `check:no-else`

O scanner ignora comentários, strings e template literals. Regex literais contendo aspas (ex.: `/"/`) podem confundi-lo; nesse caso, extraia a regex para `new RegExp("...")`.

## 2026-10-08: Testes E2E e hidratação

Em dev, o primeiro carregamento demora a hidratar. Os testes navegam com `gotoHydrated()` (espera `networkidle`) antes de interagir com formulários.

## 2026-10-08: Fluxo de git (atualização)

Commits locais na `main`. Push para o GitHub só após confirmação do usuário.

## 2026-10-08: Fase 1 (região e fornecedores)

- Fluxo do CEP: cache em `cep_cache` (TTL de 30 dias), depois BrasilAPI e, em seguida, ViaCEP. A BrasilAPI responde 404 tanto para CEP inexistente quanto quando os provedores dela falham; por isso um 404 é confirmado no ViaCEP antes de virar "CEP não encontrado". As respostas dos provedores passam por Zod.
- Visibilidade de fornecedores: um fornecedor aparece se `supplier_coverage` cobre a UF inteira (`city` nulo) ou a cidade do tenant (comparação sem diferenciar maiúsculas). Acessar catálogo ou produto fora da região resulta em `NotFoundError`.
- O filtro de preço do catálogo usa o custo do fornecedor (valor de atacado), em centavos na URL.
- Loaders sem bloqueio: os loaders aguardam os dados só no SSR (`prefetchOnServer`). Nas navegações do cliente, a URL muda na hora e o componente mostra seu próprio carregamento (`keepPreviousData`), em vez de travar a mudança de filtro.
- Sessão sem organização ativa: a sessão do cadastro pode nascer antes da organização. O `tenantMiddleware` cai para a primeira organização do usuário e a grava como ativa.
- Seeds: dados determinísticos (PRNG com semente fixa). `pnpm database:seed` é idempotente; `pnpm database:seed -- --reset` limpa o domínio e recria. Contas: `demo@sellbridge.local / demo12345` (Belo Horizonte, 2 lojas simuladas, cerca de 6 meses de pedidos) e `admin@sellbridge.local / admin12345`. As imagens de produto vêm do picsum.photos e os logos do DiceBear: são placeholders de desenvolvimento.
- As lojas da conta demo usam o marketplace `mock`, porque não há tokens reais.
- Os testes de integração do banco rodam contra o Postgres real (`fileParallelism: false`). O CI sobe o Postgres no job de checagens.

## 2026-10-08: Fase 2 (lojas e publicação)

- Interface única `MarketplaceConnector` (`packages/marketplaces`): autorização OAuth, troca de código, renovação de token, publicação, atualização de estoque/preço, pedidos e verificação de webhook. Web e worker só falam com marketplaces por ela.
- Conector mock determinístico: tela de consentimento própria (`/oauth/mock/autorizar`), tokens com validade de 6 h, publicação idempotente (o mesmo `idempotencyKey` gera o mesmo id externo) e gatilhos para testes: `[falha]` no título = recusa permanente, `[instavel]` = falha temporária, preço < R$ 5 = recusa, refresh token `mock-refresh-revoked` = loja expirada. Mercado Livre, Shopee e TikTok aparecem como "Em breve" até terem conector real.
- OAuth: `state` aleatório de uso único, gravado em `oauth_states` com tenant, marketplace e validade de 10 min. O callback só aceita o state do mesmo tenant e marketplace (proteção contra CSRF e replay). A tela de consentimento mock só redireciona para o nosso próprio callback (sem open redirect).
- Tokens criptografados em repouso com AES-256-GCM (IV aleatório + auth tag, formato `v1.iv.tag.dados`). Desconectar apaga os tokens.
- Fila de publicação (BullMQ 6): o web só produz jobs; o worker processa. 5 tentativas com backoff exponencial a partir de 5 s. Erros não recuperáveis (`retryable: false`, payload inválido, publicação de outro tenant, loja desconectada) usam `UnrecoverableError` e não são repetidos. Enquanto há tentativas, o destino fica "Na fila" com o motivo visível; na última, vira "Erro" com botão de reprocessar. Token revogado marca a loja como "Acesso expirado".
- Rate limit: token bucket por loja no worker (5 req/s) mais o limiter global da fila (20 jobs/s). As requisições HTTP aos marketplaces usam `fetchWithRetry` (retry em 408/425/429/5xx, respeita `Retry-After`, backoff exponencial com jitter).
- Renovação de tokens: job scheduler `refresh-expiring-tokens` a cada 10 min renova tokens que expiram nos próximos 30 min.
- Status em tempo quase real: a tabela de publicações faz polling a cada 2 s enquanto há itens "Na fila" ou "Publicando".
- Tabelas (TanStack Table 9): todas são dirigidas pelo servidor (paginação, filtros e ordenação nos search params), então usam `tableFeatures({})` sem features de cliente.
- Worker com health check opcional (`WORKER_HEALTH_PORT`), usado pelo Playwright para subir web + worker nos testes E2E.
- O lucro estimado no formulário de publicação usa taxa de 14% como referência; o valor real vem dos pedidos.

## 2026-10-08: Fase 3 (dashboard e financeiro)

- Fórmula de lucro por pedido (centavos): `receita − custo do fornecedor − taxa do marketplace − reembolsos + comissões − taxa da plataforma`. Pedidos cancelados e devolvidos não geram receita, custo nem taxa (o produto volta ao fornecedor); o valor devolvido aparece em "Devoluções" só para visibilidade. A regra vive em `computeOrderFinance` (`packages/shared/src/domain/finance.ts`) e é repetida em SQL nos relatórios; um teste de integração compara as duas.
- "Comissões" são os ajustes do tipo `commission`: bônus pagos pelo fornecedor ao revendedor (somam ao lucro).
- Fuso horário: períodos e agrupamentos usam dias de Brasília (`America/Sao_Paulo`, UTC−3 fixo desde 2019). Um pedido às 23h30 conta no mesmo dia, não no seguinte em UTC.
- Comparação: os KPIs comparam com o período anterior de mesmo tamanho. Períodos maiores que 45 dias agrupam o gráfico por semana. Intervalo personalizado de até 366 dias; um intervalo inválido na URL cai para os últimos 30 dias, sem erro.
- Agregações no Postgres (CTE por pedido + `generate_series` para preencher dias sem venda). As linhas do banco passam por Zod antes de entrar no app.
- CSV no padrão do Excel brasileiro: `;` como separador, vírgula decimal, BOM UTF-8, datas no fuso de Brasília. Células de texto são protegidas contra injeção de fórmula (prefixo `'`); números são escritos crus. Limite de 20 mil linhas por exportação. A rota exige sessão e usa os mesmos filtros da tela.
- Código de servidor fora do bundle: server functions só têm o handler removido do cliente. Helpers comuns que usam `env`/banco ficam em `src/lib/server/` (ex.: `report-scope.ts`), nunca exportados de arquivos `*.functions.ts`.

## 2026-10-08: Fase 4 (suporte, Mercado Livre, webhooks e sincronização)

- Mercado Livre real atrás da mesma interface (`packages/marketplaces/src/mercado-livre`). Endpoints e campos conferidos na documentação oficial e resumidos em [docs/marketplaces/mercado-livre.md](marketplaces/mercado-livre.md). OAuth com PKCE (S256); o refresh token é de uso único e sempre substituído pelo novo. TODOs explícitos no código: modelo "User Products", atributos obrigatórios por categoria, idempotência de `POST /items` e semântica de `sale_fee`.
- Webhooks: a rota `POST /api/webhooks/:marketplace` valida a origem pelo conector, grava o evento bruto uma única vez (`unique (marketplace, external_event_id)`), enfileira e responde 200 imediatamente (o Mercado Livre exige resposta em 500 ms). Eventos inválidos são gravados para auditoria e respondidos com 401. O worker processa com até 5 tentativas; o `jobId` é o id do evento, então nunca há dois jobs para o mesmo evento.
- O Mercado Livre não assina notificações: aceitamos apenas o nosso `application_id` e o `user_id` de uma loja conectada, e o pedido é sempre buscado na API com o token da loja (o conteúdo do payload nunca é usado como dado). O mock usa HMAC-SHA256 (`x-mock-signature`).
- Pedidos vindos de marketplaces: upsert idempotente por `(loja, id externo)`. A primeira entrega cria pedido e itens (vinculando anúncio e custo do fornecedor pelo id externo do anúncio); as seguintes atualizam status, total e taxa. Itens de anúncios que não são nossos entram com custo zero para não perder receita.
- "Simular venda" (só lojas simuladas): gera um webhook assinado para o próprio endpoint, percorrendo o caminho real webhook → fila → worker → financeiro.
- Sincronização de estoque e preço: job a cada 15 min envia ao marketplace os anúncios publicados cujo estoque do fornecedor ou preço mudou desde o último envio (`synced_stock`, `synced_price_cents`).
- Suporte: anexos via `FileStorage` (disco local em `UPLOADS_DIR` no desenvolvimento), até 3 arquivos de 5 MB, tipo verificado pelo conteúdo (magic bytes de PNG, JPG, WEBP e PDF), nome sanitizado, chave sem dados do usuário e proteção contra path traversal. Download só pelo tenant dono ou admin, com `x-content-type-options: nosniff`. Resposta do revendedor reabre o chamado; resposta do admin marca "Respondido"; admin precisa reabrir um chamado encerrado para responder.
- Uploads multipart usam rotas HTTP (`/api/suporte/...`) em vez de server functions, com erros devolvidos como JSON `{ error }` e status HTTP derivado do código do `AppError`.
- Seed: as lojas simuladas da conta demo recebem tokens mock criptografados com `TOKEN_ENCRYPTION_KEY`, para que webhooks e sincronização funcionem também nelas.

## 2026-10-09: Padrões de código estritos

Aplicados os princípios descritos em [architecture.md](architecture.md) e reforçados pelo Oxlint: `max-lines-per-function` (60), `max-params` (4), `max-depth` (3), `max-nested-callbacks` (3), `id-length` (mínimo 2), `no-param-reassign`, `prefer-const`, `no-console`, `no-empty` e o plugin `promise` (`prefer-await-to-then`, `prefer-await-to-callbacks`).

- Erros por composição: as subclasses (`NotFoundError`, `MarketplaceError`...) viraram um único `AppError` com `code` e `details`, criado por fábricas. `instanceof` deu lugar a `hasErrorCode`/`isMarketplaceError`; a retentativa lê `details.retryable`.
- Nomes: `packages/db` virou `packages/database`; `env`, `db`, `deps`, `tx`, `ms`, `q`, `dir`, `fetchImpl` e `*Bps` foram escritos por extenso. `PLATFORM_FEE_BPS` virou `PLATFORM_FEE_BASIS_POINTS` (e `MOCK_LATENCY_MS` virou `MOCK_LATENCY_MILLISECONDS`); definir um nome antigo faz a inicialização falhar com a indicação do novo, em vez de ser ignorado em silêncio. Os scripts `db:*` viraram `database:*` (`db:up` virou `services:up`). Ficam como estão os nomes impostos por APIs externas (`q` do Mercado Livre, `deps` do TanStack Router, `env` do Playwright) e as colunas `*_enc` já migradas.
- "Sempre async" foi interpretado como "todo I/O é `async`/`await`, sem cadeias `.then()/.catch()`". Funções puras continuam síncronas.
- Overrides do lint ficam só por arquivo (o `.catch()` do Zod em `schemas/fallback.ts` e o tamanho dos blocos de teste). Nenhum comentário de desativação.
- Logger: escreve em `process.stdout`/`stderr`, respeita `LOG_LEVEL` (sem diferenciar maiúsculas) e mascara chaves sensíveis.
- Segredos fora do código: `MOCK_WEBHOOK_SECRET` deixou de ter padrão e é opcional. Sem ele, a loja simulada aparece como não configurada (produção só com marketplaces reais sobe normalmente). As senhas do seed vêm de `SEED_DEMO_PASSWORD`/`SEED_ADMIN_PASSWORD`, também lidas pelos testes E2E. O CI gera segredos efêmeros por execução.

## 2026-10-09: Build scripts de dependências

O pnpm 12 falha o `install` quando um pacote tem script de build não aprovado. Ficam liberados só `esbuild` e `lefthook`; o `msgpackr-extract` (acelerador nativo opcional do `msgpackr`, usado pelo BullMQ) fica explicitamente negado em `allowBuilds`: o fallback em JavaScript puro atende o volume do MVP e evita compilar código nativo no install.

## 2026-10-10: Score de fornecedor

Revendedores avaliam o fornecedor de cada pedido entregue (uma avaliação por pedido e fornecedor, tabela `supplier_reviews`). O score é global entre tenants, como a reputação de um marketplace, e os comentários aparecem sem identificar a loja. Regra pura em `@sellbridge/shared/supplier-score`, inspirada em:

- Mercado Livre: termômetro de 5 níveis (Crítico, Atenção, Regular, Bom, Excelente) sobre uma janela móvel de 90 dias e selo "Fornecedor destaque" (score ≥ 90, média ≥ 4,7 e pelo menos 30 pedidos finalizados).
- Amazon: estrelas de 1 a 5 divididas em positivas, neutras e negativas, e métricas operacionais com meta fixa (devolução até 3%, cancelamento até 2,5%).
- Shopee: marcações rápidas por aspecto (prazo, conformidade, embalagem, atendimento). Notas 4 e 5 oferecem elogios; notas de 1 a 3, reclamações.

Score (0–100) = estrelas convertidas para 0–100 (média bayesiana com 5 avaliações de 3,5 estrelas), menos uma penalidade operacional: cada métrica só tira pontos acima da meta, 5 pontos por múltiplo da meta excedido, até 15 por métrica (taxas suavizadas com 20 pedidos na metade da meta). Assim o nível sempre acompanha as estrelas exibidas e cancelamentos ou devoluções altos só puxam para baixo; o card mostra o motivo ("cancelamentos altos") e o selo de destaque exige as métricas dentro da meta. Com menos de 10 avaliações o fornecedor aparece como "Novo fornecedor". Só pedidos `delivered` dos últimos 60 dias podem ser avaliados ou ter a avaliação editada.

- Não há data de entrega nem de despacho nos pedidos, então atraso no envio fica só nas marcações das avaliações, não nas métricas.
- O seed atribui um perfil (`reputation`) a cada fornecedor, que define as estrelas e as taxas de cancelamento e devolução da conta demo.

## 2026-10-11: API pública v1

Integradores (ERPs, planilhas, sistemas próprios) passam a acessar os dados da organização por uma API REST. Guia de uso em [api.md](api.md); referência gerada em `/api/v1/docs`.

- **REST v1 dentro do `apps/web`.** As rotas ficam em `src/routes/api/v1` e reutilizam repositórios, regras e filas que o app já usa; um serviço separado duplicaria acesso a dados e deploy sem ganho no volume atual. Cada operação é descrita uma vez (`defineApiEndpoint`: escopo, schemas Zod de entrada e resposta, handler) e dessa descrição saem tanto a execução quanto o OpenAPI 3.1.
- **Chaves de API por organização, guardadas como SHA-256.** O segredo (`sb_live_` + 32 bytes aleatórios) aparece uma vez; o banco guarda só o hash e um prefixo visível. SHA-256 sem salt basta porque o segredo tem 256 bits de entropia (não há o que adivinhar) e permite achar a chave pelo hash a cada requisição. Não usamos plugin do Better Auth: a v1.7.7 não traz API keys no core, e precisamos de chaves da organização (não do usuário) com os nossos escopos. Escopos separam leitura de escrita; até 20 chaves ativas por organização; revogação e expiração valem na hora.
- **Paginação por página**, igual aos repositórios e às telas (`page`/`pageSize`, até 100). Só os eventos usam cursor (`after` = `sequence`), porque são lidos de forma incremental e crescem sem parar.
- **Limite de requisições e idempotência no Postgres**, sem infraestrutura nova: janela fixa de um minuto por chave (120 requisições, cabeçalhos `RateLimit-*` e `Retry-After`) e `Idempotency-Key` obrigatória em `POST`, com a primeira resposta guardada por 24 horas. Respostas 5xx liberam a chave para nova tentativa.
- **Eventos por outbox transacional.** O evento é gravado em `api_events`, com uma linha em `webhook_deliveries` por endpoint inscrito, na mesma transação da mudança (pedido, publicação): nunca há evento de algo que não aconteceu nem mudança sem evento. O worker varre as entregas pendentes e as envia (assinatura HMAC-SHA256 no cabeçalho `SellBridge-Signature`, com timestamp e tolerância de 5 minutos), com retentativas e backoff; `GET /events` serve de alternativa e de rede de segurança.
- **Erros em `application/problem+json`** (RFC 9457) com um `code` estável, `requestId` e `issues` por campo. Os textos para pessoas ficam em português, como no resto do produto.
- Versionamento pelo caminho: a v1 só recebe mudanças compatíveis (campos, parâmetros opcionais, eventos e códigos novos); qualquer quebra vira `/api/v2`.

## 2026-10-12: Central de suporte (cargos, filas e prazos)

O suporte sai do "todo admin vê tudo" para uma central com cargos, filas e prazos.

**Cargos.** `user.role` ganha `agent` (atendente) e `supervisor` além de `user` e `admin`, registrados no plugin admin do Better Auth com controle de acesso (`lib/auth-roles.ts`).

- Só `admin` recebe os poderes do plugin (banir, entrar como cliente, mudar cargo).
- O que cada cargo pode no suporte fica em `@sellbridge/shared/staff-access` e é checado no servidor pelo `staffMiddleware(permissão)`:
  - atendente responde e faz triagem;
  - supervisor também passa chamados de outras pessoas e vê métricas;
  - admin também gerencia clientes.
- O "modo administrador" vale para toda a equipe, e o menu mostra só o que o cargo pode usar. `PENDENTE CLIENTE (D11)`: matriz inicial assumida; ajustar quando o cliente definir as equipes.

**Prazo de resposta.** O relógio é `tickets.awaiting_since`:

- começa na primeira mensagem do revendedor sem resposta;
- para em qualquer resposta pública do suporte, inclusive "encaminhado ao fornecedor", que mantém o chamado aberto;
- volta a correr na reabertura.

O prazo é `awaiting_since` mais as horas da prioridade: urgente 2, alta 8, normal 24, baixa 48 (`RESPONSE_TARGET_HOURS`). São horas corridas; horário comercial e SLA por plano ficam para quando houver planos.

**Responsável.** A primeira resposta pública de quem não tinha o chamado o atribui a essa pessoa. Atendentes só assumem um chamado sem dono ou devolvem o próprio.

**Leitura.** `ticket_reads` guarda até quando cada pessoa leu a conversa. O "não lido" do revendedor considera respostas públicas do suporte; o da equipe, mensagens do revendedor. O aviso de resposta no sino passou a usar isso em vez do status `answered`, que não avisava respostas enviadas com outro status.

**Histórico.** `ticket_events` registra mudanças de status, responsável, prioridade, tema e a avaliação. `actor_id` nulo significa automático. O id é sequencial para manter a ordem de mudanças feitas no mesmo instante.

**Encerramento.**

- O revendedor pode encerrar e avaliar de 1 a 5, uma vez por encerramento (reabrir zera a nota).
- O job `ticket-auto-close` (worker, de hora em hora) encerra chamados respondidos e sem retorno há 7 dias (`AUTO_CLOSE_AFTER_DAYS`).

**E-mail.** Cada resposta pública dispara um e-mail ao revendedor com o link do chamado, sem copiar o texto da resposta. Uma falha no envio não derruba a resposta.

## 2026-10-13: Ferramentas da página do chamado (revendedor)

A conversa do chamado ganhou contexto e atalhos para o revendedor.

- **Pedidos vinculados.** `ticket_orders` liga pedidos da mesma loja ao chamado. Vincular e desvincular entram no histórico (`order_linked`, `order_unlinked`). O suporte vê os pedidos ao lado da conversa.
- **Quem recebe e-mail.** `ticket_followers` guarda exceções: quem abriu o chamado recebe sem linha própria; uma linha com `notify = false` silencia alguém, e colegas da loja entram com `notify = true` (evento `follower_added`). A resposta pública do suporte manda um e-mail para cada seguidor ativo.
- **Histórico para o revendedor.** A conversa mostra as mudanças que importam a ele (quem assumiu, encerramento, reabertura, tema, pedidos, colegas). Mudanças de prioridade e devolução para a fila ficam só para a equipe.
- **Visto pelo suporte.** Vem de `ticket_reads` de quem é da equipe; nada novo é gravado.
- **Código curto.** `#A3F2C1` são os 6 primeiros hexadecimais do id (`ticketCode`), só para citar; a URL continua usando o id completo.
- **Rascunho.** A resposta não enviada fica no `localStorage` do navegador, por chamado. É conveniência: some em janela anônima e nunca vai ao servidor.
- **Imagens anexadas.** `?inline=1` abre a imagem no navegador para a prévia; só vale para tipos `image/*`, que já são verificados pelos bytes no envio.

## 2026-10-13: Reserva de estoque na venda (item 01.a)

O estoque do fornecedor é **compartilhado** por todos os revendedores que vendem o produto: o primeiro pedido pago leva as unidades. São duas contas em `supplier_products`:

- `stock`: a contagem da prateleira, como o fornecedor informa (formulário e CSV do admin). O admin continua digitando o número físico.
- `reserved_stock`: unidades presas por pedidos pagos que ainda não saíram do fornecedor.

O que o revendedor pode vender é `greatest(stock − reserved_stock, 0)` (`repositories/sql/available-stock.ts`, `availableUnits` no domínio). Catálogo, anúncios, publicação e o sync com os marketplaces usam sempre esse valor; nenhuma tela do revendedor lê `stock` direto. Assim, reimportar a contagem física nunca apaga uma reserva (o defeito que a revisão independente achou na primeira versão, que baixava `stock` direto).

Cada item do pedido guarda o que fez em `order_items.stock_state` (regra em `packages/shared/src/domain/stock-reservation.ts`), sempre na mesma transação que grava o pedido (`upsertMarketplaceOrder` → `applyStockMoves`):

- **Pago:** `pending`/`short` → `reserved` com `UPDATE … SET reserved_stock = reserved_stock + qtd WHERE stock − reserved_stock >= qtd`. A trava de linha do Postgres serializa vendas simultâneas. Sem saldo, o item fica `short` (pendência do revendedor) e é tentado de novo enquanto o pedido estiver pago.
- **Enviado/entregue:** a unidade saiu da prateleira (`consumed`): `stock − qtd` e, se estava reservada, `reserved_stock − qtd`. Vale tanto para o status vindo do marketplace quanto para o envio marcado pelo fornecedor no link (`syncOrderFromShipments`). Se o fornecedor enviou mais do que a contagem dizia, a prateleira fica negativa (ele "deve" unidades até a próxima contagem) e o disponível fica 0; uma devolução devolve exatamente o que saiu.
- **Cancelado/devolvido:** `reserved` solta a reserva; `consumed` volta para a prateleira (`stock + qtd`); `short` só fecha. Todo passo troca o estado com `WHERE stock_state = <anterior>`, então reenvios do marketplace nunca contam duas vezes.
- `released` é final (pedido reaberto não reserva de novo). `untracked` são itens gravados antes da migration 0017: nunca mexem no estoque.

Itens que não vêm de um anúncio nosso não mexem em estoque. O pedido nunca é recusado por falta de estoque: ele é gravado e a falta fica visível (telas e aviso na parte 01.b). A importação de CSV trava os produtos do fornecedor em ordem de id (`FOR NO KEY UPDATE`) antes de gravar, a mesma ordem das vendas, para que importação e venda esperem uma pela outra em vez de travar em deadlock. Os pedidos de demonstração do seed nascem `untracked`.

Limites conhecidos: pedidos pagos e ainda não enviados na data da migration ficam `untracked`, então não seguram estoque; o disponível fica acima do real até eles saírem (a contagem seguinte do fornecedor corrige). Se o fornecedor reimporta a contagem depois de enviar e antes de o pedido virar "enviado" aqui, a baixa do envio desconta de novo e o disponível fica menor até a próxima importação (erro para o lado seguro: nunca vende a mais). Se o produto devolvido volta mesmo ao fornecedor no dropshipping é pergunta ao cliente (ligada a D5); por enquanto "devolvido" devolve à prateleira.

## 2026-10-13: Sync imediato e estoque de segurança (item 01.b)

**Política de estoque compartilhado.** Um produto de fornecedor pode estar publicado por vários revendedores. O primeiro pedido **pago** leva as unidades (reserva atômica, item 01.a); os outros ficam com o item "em falta" e o aviso chega ao revendedor (item 01.c). Nenhum revendedor tem cota própria do estoque do fornecedor.

**Sync na hora.** Sempre que o estoque muda, o worker recebe um pedido de sync imediato (`stock-price-sync`), além do agendamento de 15 em 15 minutos:

- pedido gravado pelo webhook que movimentou estoque (`upsertMarketplaceOrder` devolve `stockMoves`);
- envio marcado pelo revendedor, pelo link do fornecedor ou pelo rastreio do Mercado Livre (`features/fulfillment/shipments.server.ts`);
- edição e importação do admin (já existia; agora usa o mesmo `requestStockSync`).

Pedir o sync nunca derruba a gravação: se o Redis falhar, fica um aviso no log (`stock.sync_deferred`) e o agendamento envia a contagem minutos depois.

**Estoque de segurança.** `STOCK_SAFETY_UNITS` (worker, padrão 0, até 1000) tira N unidades vendáveis de cada produto do que vai para os marketplaces (`liveStock` no banco, `offeredUnits` no domínio, usados no sync e na publicação). O revendedor continua vendo o disponível real no SellBridge: a margem só protege contra contagens do fornecedor que atrasam em relação à prateleira.

**"Estoque atualizado há X".** O catálogo e a página do fornecedor mostram a data da última alteração do produto pelo admin (`supplier_products.updated_at`): contagem, preço ou dados do produto. Vendas não mexem nessa data (item 01.a). É um sinal de "quão fresco está o cadastro", não exatamente de quando a contagem foi conferida; uma coluna própria para a contagem fica para quando o fornecedor tiver acesso (D6).

**Limites conhecidos.** Cada pedido ou envio que mexe no estoque enfileira um sync; numa rajada de pedidos, o worker roda vários syncs seguidos, quase todos sem nada a enviar (a consulta é indexada e limitada a 200 anúncios, e um sync vazio não chama o marketplace). Deduplicar exigiria cuidado para não perder uma mudança que chega enquanto um sync já está lendo o estoque; fica para quando o volume pedir. O pedido de sync do worker espera no máximo 3 s pelo Redis, como o da web.

## 2026-10-13: Falta de estoque visível (item 01.c)

Um pedido pago cujo item ficou `short` (o fornecedor não tinha as unidades) aparece para o revendedor em dois lugares:

- **Sino**, aba Problemas: "Falta estoque para o pedido #X", com o produto e o que fazer ("Combine com ele ou cancele a venda."). O aviso é datado de quando a falta começou (`order_items.short_since`), então uma falta que chega depois de o revendedor abrir o sino conta como nova. Fica enquanto o pedido estiver pago e com item em falta: "Limpar tudo" não esconde falta aberta (é trabalho a fazer, não notícia). Some sozinho quando o estoque volta e o item é reservado, ou quando o pedido é cancelado. Lista um aviso por pedido, as faltas mais antigas primeiro. Por ora leva para `/pedidos`; o link direto vem com a página do pedido (item 20).
- **Pedidos › Operação**: o selo "Falta estoque" (`ToneStatus`, tom de aviso) empilhado sob o status do pedido.

O admin vê a reserva junto da prateleira na lista de produtos ("22 · 3 reservados"; se a prateleira ficou abaixo das reservas, "2 · 5 reservados · faltam 3"). A busca dos itens em falta usa o índice parcial `order_items_short_idx (tenant_id) WHERE stock_state = 'short'` (migration 0018, que também cria `short_since`), pequeno porque só guarda faltas abertas.

## 2026-10-13: Um anúncio por produto e loja (item 02.a)

Publicar de novo um produto numa loja que já tem anúncio dele é recusado no servidor: "Este produto já está publicado em {loja}. Edite o anúncio existente em Publicações." Publicar o mesmo produto em **outra** loja continua permitido. A regra vive em `createListingWithTargets`, que atende a publicação individual e a em massa.

**Por que trava de linha, e não índice único.** O produto está em `listings` e a loja em `listing_targets`, então o banco não consegue impor a regra sem copiar o produto para os destinos e migrar os dados existentes; e o encerramento de anúncio (item 23) vai precisar permitir republicar depois de encerrar. A transação trava as lojas de destino (`FOR UPDATE`, sempre em ordem de id) antes de conferir, então duas publicações simultâneas esperam uma pela outra e a segunda é recusada.

Na tela "Nova publicação", as lojas que já vendem o produto aparecem desativadas com "Já publicado aqui"; se todas já vendem, a tela diz isso e aponta para Publicações.
