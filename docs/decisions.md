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

## 2026-10-13: Criação incerta destrava depois de 10 minutos (item 02.b)

Um timeout ou 5xx em `POST /items` não diz se o anúncio foi criado, então o marcador `creation_started_at` fica e a tentativa seguinte só concilia. Antes, ele nunca saía: sem anúncio encontrado, a publicação ficava em erro para sempre. Agora a ausência só conta como prova depois de uma janela de 10 minutos desde o marcador (o tempo para a busca de itens do vendedor mostrar um anúncio recém-criado). Dentro da janela, nada é criado e o erro pede para aguardar e reprocessar; depois dela, o conector chama `creationAbsent`, o worker limpa o marcador e a criação segue. Se o anúncio aparece, é adotado como antes.

**Por que 10 minutos.** É uma estimativa do atraso de indexação, não um número documentado pelo Mercado Livre; aprovada pelo usuário no ⏸1. Uma janela menor libera antes e aumenta o risco de anúncio duplicado. A conta usa o relógio do conector (`now`), o mesmo que os testes fixam.

## 2026-10-13: Status do pedido e do envio do Mercado Livre (item 04.a)

O mapa segue as tabelas oficiais (`gerenciamento-de-vendas`, `gerenciamento-de-envios`), com um exemplo de resposta por status em `packages/marketplaces/src/mercado-livre/fixtures/`.

- **Pedido com `fraud_risk_detected`** fica pendente mesmo pago: o Mercado Livre manda não enviar, e pendente é o estado que já impede encaminhar ao fornecedor. Status desconhecido também fica pendente, agora com log.
- **Envio: dois status novos, só do marketplace.** "Não entregue" (`not_delivered`) e "Devolvido" (`not_delivered` com subestado de devolvido). Ninguém os escolhe à mão: a atualização manual só avança para a próxima etapa ou cancela, e cancelar deixa de valer depois do despacho. Registrar uma ocorrência num envio "Não entregue" continua permitido. Antes do despacho (`pending`, `handling`, `ready_to_ship`) o Mercado Livre não muda nada: as etapas do fornecedor são mais precisas.
- **Entregue, Devolvido e Cancelado são finais** (`SETTLED_FULFILLMENT_STATUSES`): uma leitura atrasada não reabre o envio. Depois do despacho, o envio não pode mais ser cancelado pela tela (`DISPATCHED_FULFILLMENT_STATUSES`).
- **O pedido não muda por um envio que não chegou.** Ele só sobe para enviado ou entregue quando todos os envios sobem; reembolso e devolução no dinheiro são o item 04.b.
- **Hosted View.** A visão completa de `GET /orders/{id}/shipments` foi descontinuada no fim de setembro de 2026, e com ela a consulta de envio e a etiqueta quebrariam em loja real. Agora a lista traz só `{ id, type }`, e o envio de venda (`forward`) é lido em `GET /shipments/{id}`.
- **Migration 0019** amplia a regra `order_shipments_status_check` para os dois status novos. O plano previa não precisar de migration; a regra no banco só apareceu no teste.

## 2026-10-13: Reembolsos e devoluções do Mercado Livre (item 04.b)

- **Reembolso.** O pedido do Mercado Livre informa, em cada pagamento, quanto já voltou ao comprador (`transaction_amount_refunded`). A soma vira um único ajuste por pedido, marcado com `marketplace_key = 'refund'` (migration 0020, índice único por pedido e chave). Cada sincronização atualiza esse ajuste para o total mais recente; sincronizar de novo não soma dinheiro. Quando a fonte não informa o valor, o último conhecido fica. Ajustes lançados à mão (chave nula) nunca são tocados.
- **Como o reembolso conta** segue a regra de lucro da fase 3: num pedido que ainda conta receita, desconta do lucro (`refund`); num pedido devolvido, que não conta receita, aparece em "Devoluções" (`return`); num cancelado, sai.
- **Pedido devolvido.** O Mercado Livre não tem status de pedido "devolvido": o pedido segue pago. Viramos o pedido para devolvido quando todo envio de venda voltou ao vendedor, ou quando o pacote de devolução do comprador chega. Uma sincronização posterior não o devolve a "pago"; só o cancelamento muda. Consultar o envio de um pedido devolvido não faz nada.
- **Estoque na devolução (decisão do usuário no ⏸1).** As unidades que já saíram não voltam sozinhas à prateleira do fornecedor: no Mercado Livre a devolução vai para o endereço do vendedor, que é o revendedor. O item é encerrado (`settle`); o fornecedor ajusta a contagem quando receber o produto. Unidades só reservadas continuam liberadas, e o cancelamento continua devolvendo à prateleira.

## 2026-10-13: Envio com selo e linha do tempo (item 04.c)

- O status do envio usa o mesmo `ToneStatus` do status do pedido, com a mesma paleta (`FULFILLMENT_TONES`): aguardando em cinza, etapas em andamento em azul, entregue em verde, não entregue em âmbar, devolvido em vermelho como o pedido devolvido, cancelado em cinza.
- O histórico do envio segue a linha do tempo do cliente no admin (`CustomerTimeline`): trilho, ponto na cor do status, "por {quem}", nota em cinza e data relativa; o mais recente em cima. O painel é o mesmo na operação do revendedor e no link do fornecedor.
- A nota gravada nas leituras do Mercado Livre deixou de mostrar o status cru em inglês ("Consulta do marketplace: not_delivered"): o rótulo do status já diz o que houve, e a nota só traz um código de rastreio quando ele chega.
- O Financeiro não mudou: reembolso e devolução já tinham lugar no detalhe do pedido, no resumo, nos gráficos e no CSV; o 04.b passou a alimentá-los com dados do Mercado Livre.

## 2026-10-13: Reparo da migration 0008 pulada (item 05)

No `_journal.json`, o `when` da 0007 é maior que o da 0008, e o Drizzle só aplica migrations mais novas que a última registrada: um banco que recebeu a 0007 antes de a 0008 existir pulou a 0008 sem erro e ficou sem as tabelas da API pública. A 0021 (`0021_repair_public_api.sql`, escrita à mão) repete tudo o que a 0008 cria, cada comando protegido (`IF NOT EXISTS`, `pg_constraint`, `duplicate_object`), então não faz nada onde a 0008 rodou. O journal das migrations antigas não foi editado. Nenhuma migration entre a 0009 e a 0020 toca essas tabelas, por isso o reparo pode vir no fim.

`src/migrations.test.ts` cria bancos descartáveis no mesmo servidor: M1 aplica tudo do zero duas vezes; M2 aplica 0000–0007 à mão, registra a 0007 com o `when` do journal, roda o migrate e confere tabelas, índices, chaves estrangeiras e colunas iguais às de um banco novo.

## 2026-10-13: Envio cancelado e reencaminhamento (item 06)

- **Envio cancelado não conta** para o status do pedido (`reconciledOrderStatus` ignora os cancelados): com dois fornecedores, um cancelado e o outro entregue, o pedido fica entregue. Se só sobram cancelados, o pedido segue pago, esperando reencaminhamento.
- **Reencaminhar ao mesmo fornecedor** (`reforwardShipment`): reabre o envio cancelado de um pedido pago com os mesmos itens e endereço, um link novo (o antigo deixa de valer) e o status "Aguardando fornecedor". O cancelamento e o motivo ficam no histórico. Reaproveita a linha do envio porque há um envio por fornecedor e pedido (`order_shipments_order_supplier_idx`).
- **Trocar de fornecedor fica para um item próprio** (decisão do usuário no ⏸1): o item do pedido está preso ao produto de um fornecedor, e trocar pede escolher um produto equivalente e recalcular custo, margem e estoque.
- **Aviso no sino** (`shipment_cancelled`, aba Problemas): só quando quem cancelou foi o fornecedor, com o motivo que ele escreveu. Como a falta de estoque, é trabalho a fazer: "Limpar tudo" não o esconde, e ele some quando o envio é reencaminhado ou o pedido deixa de estar pago.

## 2026-10-13: O fornecedor não declara a entrega (item 07)

Pelo link, o fornecedor avança até "Enviado" e registra ocorrências, mas não marca "Entregue": a entrega grava `deliveredAt`, libera a avaliação do revendedor e, no item 34, vai liberar o pagamento do próprio fornecedor, então não pode depender da palavra dele. A regra vive no servidor (`writeShipmentStatus` recusa `delivered` quando quem age é o fornecedor: "A entrega é confirmada pelo marketplace ou pelo revendedor."), e a tela do link segue: depois de "Enviado", no lugar do botão aparece essa frase (`ShipmentPanel` com `actsAs="supplier"`). Quem confirma é o Mercado Livre (leitura do envio) ou o revendedor (painel do pedido); o histórico guarda a origem em `shipment_events.actor`.

## 2026-10-13: Dados da página do pedido (item 20.a)

`getOrderPage` (`repositories/order-page.ts`) junta, para um pedido da conta, o que a página `/pedidos/$orderId` mostra: o pedido com itens e ajustes (`getOrderDetail`), o dinheiro pela mesma regra do Financeiro (`computeOrderFinance`, com a taxa da plataforma do ambiente), a linha do tempo de status e a avaliação de cada fornecedor do pedido. Os envios ficam com a própria consulta do painel (`getFulfillmentDetail`), que a página já usa. Pedido de outra conta responde "não encontrado".

- **Linha do tempo** vem de `order_status_changes` (migration 0022): uma linha por status, gravada na mesma transação da venda (na data da venda) e de cada mudança, pela sincronização ou pelos envios. Não usa `api_events`, que o worker apaga depois de 30 dias: o histórico de um pedido antigo sumiria ou começaria no meio. A migration copiou o que ainda havia nos eventos; pedido sem nenhuma linha aparece como um passo só, no status atual e na data do pedido.
- **Avaliação** usa `canReviewOrder`, a regra da aba de avaliações, para as duas telas dizerem o mesmo do mesmo pedido.
- **Link para a venda no Mercado Livre** (`marketplaceOrderUrl`): `mercadolivre.com.br/vendas/{id}/detalhe`, só para número de pedido numérico; loja simulada não tem link. O endereço não está na documentação lida e fica a homologar com a conta de teste.

Revisão do item 07 (13/10): a trava depende de quem age (`"reseller" | "supplier"`, pelo escopo da conta ou do link), não do rótulo exibido no histórico; os rótulos (`SHIPMENT_ACTORS`) e a frase de quem confirma a entrega (`DELIVERY_CONFIRMED_BY`) vivem num lugar só, em `shared/schemas/fulfillment.ts`, e o aviso de envio cancelado do item 06 usa a mesma constante. Na tela do link, a frase vem antes da ocorrência e diz "a loja que fez a venda, ou o rastreio do Mercado Livre", sem o jargão "marketplace". Fica para depois (com o item 22): lembrar o revendedor de confirmar a entrega de um envio parado em "Enviado" numa loja sem rastreio automático.

## 2026-10-13: Página do pedido (item 20.b)

`/pedidos/$orderId` segue o esqueleto da página de chamado: link de volta, título com o selo de status, coluna principal e cartões laterais. A rota de Pedidos passou para `pedidos/index.tsx` para caber a página.

- **Coluna principal:** itens (quantidade × preço e custo) e o envio, que é o mesmo `OrderOperations` do diálogo "Operar pedido" (encaminhar, painel com linha do tempo, link do fornecedor, reencaminhar). O número do pedido fica com quem mostra: o título do diálogo, o cabeçalho da página. Pedido bloqueado (pendente, cancelado, devolvido) sem envio mostra só o aviso, sem o formulário de encaminhar.
- **Lateral:** "Dinheiro" com o `OrderBreakdown` do Financeiro (o tipo passou a aceitar só os campos de dinheiro, que a linha do relatório e a página têm) e "Andamento do pedido" no desenho das outras linhas do tempo, o mais recente em cima. O primeiro passo usa a data da venda, não a hora em que a sincronização a gravou.
- **No celular** o resumo (dinheiro e andamento) vem logo depois do título: no HTML ele vem antes da coluna principal, e o grid o leva para a direita no computador.
- **Cortado do plano D0:** o cartão "Entrega" repetia o endereço que o painel do envio já mostra.
- **Como se chega:** o número do pedido na aba Operação é link para a página, e os avisos de falta de estoque e de envio cancelado abrem a página do pedido.
- **Acertos no painel do envio, que valem também para o diálogo:** os botões de impressão quebram linha em vez de transbordar em 320 px, e o bloco do link do fornecedor some quando o envio está encerrado e não há link novo (deixava um vão).
- O transbordo de ~21 px em 1024 px vem do menu da conta no cabeçalho, igual em todas as páginas; ficou como tarefa separada.

## 2026-10-14: Filtros da Operação e avaliação dentro do pedido (item 20.c)

- **Filtros no endereço:** a aba (`view`) e os filtros da Operação (`opQuery`, `stage`, `period`, `from`, `to`, `store`, `opPage`) vivem na URL de `/pedidos` (`operationsUrlSearchSchema`), com nomes próprios para não colidir com os da aba Avaliações (`query`, `page`). O número do pedido abre a página com `?back=operations`, e o "← Pedidos" então volta no histórico: a lista reaparece com a busca, a etapa, o período e a página de antes. Vindo de um aviso ou de um link, o mesmo botão leva a `/pedidos`.
- **Período "Tudo" é o padrão da Operação:** a fila de trabalho não pode esconder um pedido antigo parado. Os demais períodos são os dos relatórios (7, 30, 90 dias, 6 meses, personalizado), resolvidos no servidor por `resolvePeriod` sobre a data da venda. `PeriodFilters` (relatórios) passou a aceitar a lista de períodos (`presets`) e o rótulo "Tudo"; os relatórios seguem iguais.
- **Busca sem botão:** a Operação usa o `SearchInput` com o mesmo atraso das outras listas. Uma busca que chega depois de abrir um pedido não puxa a tela de volta (a rota confere o endereço atual antes de navegar).
- **Avaliação no pedido:** cartão "Avaliação" na lateral, com o mesmo botão e diálogo da aba Avaliações (`ReviewAction`, agora compartilhado) e a mesma regra (`canReviewOrder`). Sem entrega, diz "Disponível depois da entrega". Salvar uma nota atualiza a página do pedido e a lista.
- **Lista vazia:** estado vazio do sistema ("Nenhum pedido encontrado"), no lugar da frase solta abaixo da lista.

## 2026-10-14: Limites numéricos e de tamanho (auditoria)

- **Pedidos do Mercado Livre fora da faixa são recusados**, com o webhook marcado como falho em vez de gravar errado: valores negativos ou acima de R$ 21.474.836,47 (o teto da coluna `integer` de centavos), quantidade fora de 1..1.000.000, data da venda que não é um instante ISO e id numérico além de 2^53. A soma de taxas ou de reembolsos que não cabe na coluna também recusa o pedido. Sem `payments` no pedido, o reembolso conta como "não informado" e o último valor fica.
- **Reembolso do marketplace limitado ao total do pedido:** o total do ML inclui o frete pago pelo comprador, que não é receita aqui.
- **Status não volta para trás com atualização atrasada:** pedido enviado ou entregue não volta a "pendente", e entregue não volta a "enviado". Voltar a "pago" continua possível (envio não entregue volta à fila de trabalho, regra do 04.c); cancelamento e devolução continuam valendo.
- **Relatórios multiplicam custo e preço por quantidade em `bigint`:** um item de R$ 1 milhão com 22 unidades derrubava todos os relatórios da conta.
- **Publicação em massa respeita o teto de R$ 1.000.000,00** do anúncio avulso e recusa a chamada listando os produtos acima dele.
- **Ocorrências por envio:** até 100 registros no histórico de um envio; depois disso o link do fornecedor só avança a etapa.
- **Corpos de requisição** (API pública, webhook do ML, webhook do Stripe) são lidos com contagem de bytes, também sem `Content-Length`. Evento rejeitado do ML grava o corpo só até 2 KB; acima disso, só o tamanho. O caractere nulo é recusado na API pública (400), retirado das buscas e dos eventos guardados.
- **Datas na tela em horário de São Paulo** (`relative-time.ts`), também quando o servidor renderiza em UTC.

## 2026-10-14: Revisão de qualidade (sanitização, async, performance, segurança, lógica, padrões do navegador)

Prompt reutilizável em `docs/prompts/revisao-qualidade.md`.

- **Link do fornecedor depois do fim:** com o envio encerrado (entregue, devolvido, cancelado) ou o pedido cancelado ou devolvido, o link mostra o histórico, mas não o endereço do comprador nem os botões de imprimir; a etiqueta do marketplace é recusada pelo link. As duas server functions públicas do link passaram a usar o mesmo filtro de erros das outras (`publicMiddleware`): erro de banco nunca chega ao anônimo com consulta e parâmetros.
- **Encaminhar só pelo botão:** Enter num campo de endereço não envia mais o formulário (um botão de envio desativado vem primeiro e absorve o envio implícito do navegador).
- **Página além do fim na Operação:** o servidor mostra a última página com pedidos, nunca uma lista vazia sem paginação.
- **Cartão "Avaliação":** diz por que não dá para avaliar: antes da entrega, prazo de 60 dias encerrado, ou pedido sem venda (cancelado ou devolvido).
- **Pedidos:** cada aba busca só os próprios dados, e a Operação vem pronta no primeiro carregamento. A página do pedido busca o envio junto com o resto. Salvar uma avaliação atualiza só a página daquele pedido. Uma ocorrência no envio não pede mais sincronização de estoque.
- **Devolvido continua devolvido** mesmo com um "pendente" atrasado do marketplace.
- **"Ontem" e "anteontem"** contam dias do calendário de São Paulo, não blocos de 24 horas.
- **Padrões do navegador (global, `styles.css`):** `color-scheme` por tema (barras de rolagem e controles nativos escuros no tema escuro), sem realce azul de toque, seleção de texto na cor da marca, anel de foco dos links igual ao dos botões, preenchimento automático sem fundo amarelo ou azul, e campos com pelo menos 16 px em telas de toque (o iOS não amplia a página ao focar). O `Button` vem com `type="button"` por padrão. Campos de código e link de rastreio sem maiúscula automática nem correção no celular. Foco volta ao botão "Editar avaliação" depois de avaliar.

## 2026-10-13: Produto indisponível não é oferecido no marketplace (item 08.a)

- **"Ignorar" é mandar estoque 0, não pular o anúncio.** Pular deixaria o estoque antigo no Mercado Livre e o anúncio venderia o que ninguém entrega. A sincronização manda 0 (o preço segue normal) enquanto o produto ou o fornecedor está inativo, ou enquanto o fornecedor não cobre a cidade ou a UF do dono do anúncio. A regra está em `shared/domain/catalog-availability.ts` (motivo e frase) e, no SQL, em `repositories/sql/supplier-coverage.ts` (`sellableOnMarketplace`), o mesmo `coversRegion` do catálogo.
- **Revendedor sem região cadastrada conta como coberto** (aprovado no ⏸1): ninguém publica sem CEP, e zerar anúncios reais por falta de dado faria mais mal do que bem.
- **Publicação na fila** de um produto que ficou indisponível falha de vez, sem chamar o marketplace, com a frase do motivo no card; o revendedor pode reprocessar quando o produto voltar.
- **Sincronização na hora** ao salvar um fornecedor no admin (a cobertura pode ter encolhido), ao ativar ou desativar produto ou fornecedor e quando o revendedor troca o CEP. Se o Redis falhar, a sincronização agendada de 15 minutos alcança. A troca de região feita pelo admin (`customers.functions.ts`, item 12 do chat B) ainda não dispara; entra na junção das branches.
- Pausar os anúncios, avisar cada revendedor e auditar a desativação é o item 08.b.

## 2026-10-13: Desativar produto ou fornecedor pausa os anúncios (item 08.b)

- **Pausar na mesma transação.** Desativar um produto ou fornecedor no admin (botão ou CSV com `ativo = nao`) muda para `paused` os anúncios publicados dele, de todos os revendedores (`pauseUnsellableListings`). A sincronização manda estoque 0, e o admin vê quantos anúncios pausou.
- **Reativar não reativa sozinho.** Os anúncios continuam pausados até o revendedor decidir. Enquanto o produto estiver indisponível, o servidor recusa retomá-lo (numa ação em massa, pula os indisponíveis), e o menu do card mostra "Indisponível" no lugar de "Reativar".
- **Aviso no sino** (`listing_unavailable`, aba Problemas): calculado do estado atual, como a falta de estoque, sem tabela nova. Fica até o produto voltar ("Limpar tudo" não o esconde). Também avisa o anúncio de fornecedor que deixou de cobrir a região do revendedor, que não é pausado (o 08.a já zera o estoque).
- **Card:** o rodapé vermelho do "esgotado" passa a dizer o motivo ("Fornecedor inativo", "Produto fora do catálogo", "Fora da sua região") e o que fazer; preço riscado e foto em cinza, sem a faixa "Esgotado".
- **Auditoria das escritas do catálogo adiada para o item 28** (decisão do usuário no ⏸1): `admin_audit_events` exige o cliente afetado (`userId`) e só o chat principal cria migrations.
- **Reativar × desativar ao mesmo tempo:** a reativação lê a disponibilidade com `FOR SHARE` nas linhas do produto e do fornecedor, na mesma transação do update. Se o admin desativa no meio, um espera o outro, e o resultado é sempre "pausado" (teste de concorrência em `catalog-deactivation.test.ts`). Uma publicação em andamento no instante da desativação pode terminar "no ar" com estoque 0 (08.a); o card e o sino mostram o motivo e o menu oferece "Pausar".
- **Pendente para o dono das migrations (principal):** índice em `listings.supplier_product_id`. Hoje a pausa de um fornecedor grande varre os anúncios de todos os revendedores dentro da trava do fornecedor.

## 2026-10-15 · Titular da conta (CPF) e fornecedores abertos a todos

- **Titular:** o cadastro pede nome completo e CPF, guardados em `tenant_profile` (migration 0024, colunas anuláveis) só com os dígitos e validados na borda (`cpfSchema`). Servem para notas fiscais e cobranças; não vão para logs nem para as telas da equipe (`getCustomerDetail` e a troca de região do admin devolvem o endereço sem `cpf` e `fullName`).
- **Contas antigas sem CPF:** o passo "Seu cadastro" do guia volta a aparecer até o titular ser informado, e a tela "Alterar seus dados" pede nome e CPF para salvar. Escolha consciente: o dado é necessário para cobrar. Publicar não exige o CPF.
- **Fornecedores:** a lista e a página de cada fornecedor abrem para qualquer revendedor, com ou sem endereço; o endereço só marca quem entrega. Publicar continua exigindo a cobertura no servidor (`getCatalogProductForRegion`, `getRegionProducts`). Custo e preço sugerido de todos os fornecedores ativos ficam visíveis a todo revendedor.
- **Pendências registradas:** a lista de fornecedores não tem paginação (cresce com o número de fornecedores); `getSupplierForRegion` e `listNichesForRegion` ficaram sem uso fora dos testes; a saúde do cliente no admin ainda considera "tem região" sem olhar o CPF.

## 2026-10-14: Uma loja do marketplace pertence a uma organização por vez (item 03, chat B)

- **Uma conexão viva por loja.** O índice único parcial da 0023 (`store_connections_live_shop_idx`, tudo menos `disconnected`) garante que a mesma conta do Mercado Livre não fica conectada em duas organizações. Conectar uma loja que outra organização tem conectada, expirada ou com erro é recusado com "Esta loja já está conectada em outra conta do SellBridge. Desconecte-a lá antes de conectar aqui." Reconectar na mesma organização continua permitido.
- **Conexão simultânea:** quando duas organizações conectam a mesma loja ao mesmo tempo, as duas passam pela checagem e o índice recusa a segunda; `upsertStoreConnection` traduz essa recusa para o mesmo conflito, e a tela de lojas mostra a mesma mensagem (antes, "Não foi possível conectar a loja").
- **Webhook vai para o dono atual** (aprovado no ⏸1): o evento identifica a loja, não a organização, e `findConnectedStoreByShop` acha a única conexão viva. Uma venda retida enquanto a loja estava expirada em A entra em B se A desconectar e B conectar a mesma conta antes do reprocessamento: B é quem tem o acesso à conta no marketplace.

## 2026-10-14: Dono da plataforma e contas da equipe (item 10.a, chat B)

- **Dono da plataforma** é a conta com e-mail em `ADMIN_EMAILS`, **e-mail verificado** e papel `admin` (aprovado no ⏸1). Uma conta com e-mail da lista ainda não verificado continua protegida, mas não ganha poder de dono. Regra única em `packages/shared/src/domain/platform-owner.ts`.
- **Só o dono gerencia a equipe.** Conta de atendente, supervisor, admin ou com e-mail da lista só é bloqueada, desbloqueada, rebaixada, removida, editada, tem senha trocada ou sessões listadas e encerradas por um dono. Dar papel da equipe a alguém, trocar o e-mail de uma conta para um e-mail da lista ou criar conta com um deles também exige dono: a mudança é conferida antes e depois.
- **Vale em todo caminho:** a trava roda no hook `before` do Better Auth (`apps/web/src/lib/server/account-protection.ts`) para todas as rotas do plugin admin que agem sobre uma conta, chamadas pela tela do app ou direto por HTTP. Os papéis são lidos como lista ("user,admin"), como o plugin os concede. As funções do app usam a mesma regra e devolvem à ficha o que quem vê pode fazer (`access`).
- **Ficha do cliente:** o cabeçalho mostra "Dono da plataforma"; para um admin comum, perfil e acesso de uma conta da equipe ficam visíveis e travados, com a frase do motivo, e o papel só muda pelas mãos de um dono.
- **Fica para o 10.b:** fechar por HTTP as rotas do plugin que o app não usa (`create-user`, `remove-user`, `set-user-password`, `list-users`…) e auditar o que sobrar. **Para o 10.c:** trocar o e-mail pelo admin pede nova verificação.

## 2026-10-14: Rotas do plugin admin fechadas ao navegador (item 10.b, chat B)

- **O navegador só chama duas rotas do plugin admin:** "entrar como cliente" (`/admin/impersonate-user`) e "voltar ao admin" (`/admin/stop-impersonating`). Todas as outras `/api/auth/admin/*` (criar, listar, ver, editar, mudar papel, trocar senha, bloquear, desbloquear, remover, listar e encerrar sessões, checar permissão) respondem 404 "Rota indisponível" a qualquer chamada HTTP, inclusive do dono. A lista é de rotas abertas: uma rota nova do plugin nasce fechada. Regra em `apps/web/src/lib/server/auth-route-policy.ts`, chamada no hook `before` do `auth.ts`, junto com o bloqueio de `/organization/*` que já existia.
- **Por quê:** as telas do admin agem pelas funções do servidor (`customers.functions.ts`), que conferem quem pode agir (item 10.a) e gravam a ação na linha do tempo do cliente. Pelas rotas cruas, um admin trocava a senha de um revendedor, apagava a conta ou criava contas sem deixar registro. Escolhido "desabilitar" em vez de "exigir dono e auditar", porque nenhuma tela usa essas rotas.
- **Continua valendo:** as chamadas `auth.api.*` do servidor (sem `request`) passam pela trava do 10.a; a criação de organização segue desligada (`allowUserToCreateOrganization: false`, `disableOrganizationDeletion`), e `requireTenantSession` confere a cada chamada se a pessoa ainda é membro da organização ativa.

## 2026-10-15: Custo pendente fica fora do lucro (item 09.b)

- **O que é custo pendente:** um item de pedido sem produto do catálogo (`order_items.supplier_product_id` nulo). Hoje isso só acontece quando a venda vem de um anúncio criado fora da SellBridge na mesma loja: não sabemos quanto o produto custou. Antes ele entrava com custo 0 e inflava o lucro.
- **Receita inteira, lucro só do que tem custo** (modelo aprovado no ⏸1): a venda com algum item de custo pendente continua na receita ("você vendeu"), mas o custo, a tarifa do marketplace, os reembolsos, as comissões, a taxa da SellBridge e o lucro dela ficam em zero. A receita dela aparece à parte (`pendingCostRevenueCents`), para a conta fechar: receita − receita pendente − custos e taxas = lucro. A regra vale para o pedido inteiro, mesmo que só um item seja de fora.
- **Sem migration:** "custo desconhecido" é derivado de "item sem produto", não de uma coluna nova. Nenhum código apaga produto de fornecedor; se um dia apagar, os itens daquele produto (`on delete set null`) passariam a contar como pendentes, e isso precisa ser revisto junto.
- **Uma regra só:** `computeOrderFinance` (`shared/domain/finance.ts`, custo `null` = desconhecido) e o SQL de `repositories/reports.ts` dizem o mesmo; `orderFinanceInput` (`order-detail.ts`) faz a ponte para a página do pedido e para a API pública.
- **CSV:** coluna nova "Custo pendente" (Sim/Não) e lucro em branco nesses pedidos. **API pública:** só campos novos (`pendingCostRevenueCents` nos totais, `pendingCostOrders` no resumo); nenhum campo antigo mudou de formato.
- **Fora do escopo:** o revendedor informar o custo à mão (precisa de coluna nova) e religar o item quando o anúncio aparece depois (mexe na reserva de estoque). As telas (aviso, gráfico, cascata, extrato, painel e página do pedido) são a parte 09.c.

## 2026-10-15: Custo pendente nas telas (item 09.c)

- **Uma marca só para "não sabemos":** hachura diagonal no cinza da receita, sem cor nova (aprovado no ⏸1). Vale para a camada do gráfico de barras, o degrau "Pendente" da cascata, os marcadores dos tooltips e da legenda e a barra de partes do pedido. No texto, sublinhado tracejado neutro; no extrato, `ToneStatus` âmbar "Custo pendente" no lugar do lucro.
- **A conta fecha na tela:** "Você vendeu X. Y de N vendas ainda não têm custo e ficaram fora do lucro. Do restante, …"; o custo do gráfico é receita − pendente − lucro; a margem (cabeçalho, gráfico de margem, lojas, Painel) é sobre a receita com custo conhecido (`profitMargin`), vazia quando não há nenhuma.
- **Painel:** o aviso fica na frase de leitura do período; o painel de atenção (do principal) não ganhou item novo.

## 2026-10-15: Troca de e-mail pela equipe e regras do "entrar como cliente" (item 10.c, chat B)

- **E-mail trocado pela equipe volta a ser não confirmado.** Quando um admin muda o e-mail de um cliente, a conta perde a marca de verificada, o novo endereço recebe o link de confirmação e o antigo recebe um aviso com o novo mascarado ("n***@loja.com.br") e o caminho para o suporte. A linha do tempo registra "Trocou o e-mail (aguarda confirmação)" sem os endereços. Falha no envio fica no log e não desfaz a troca (`features/admin/email-change.server.ts`).
- **Ações bloqueadas durante o "entrar como cliente"** (recusadas no servidor, pelo nome da função, em `lib/server/impersonation.ts`, aplicadas no `tenantMiddleware`): criar e revogar chaves de API; criar, excluir, ligar e desligar webhooks; desconectar loja; assinar e mudar a assinatura; dados do titular (CPF). Também ficam fechadas as rotas de segurança da conta do Better Auth (senha, sessões, vínculo e desvínculo de Google, tokens). Um teste confere que todo nome da lista existe, para uma renomeação não reabrir a trava. Conectar loja durante a visita e os botões da tela de Lojas entram depois da etapa 4 do chat de CPF (ordem combinada com o principal).
- **Tudo o mais fica registrado com o nome do admin:** cada escrita feita "como cliente" (inclusive abrir ou responder chamado e trocar nome ou foto) vira "Como o cliente: …" na linha do tempo, depois do sucesso. Marcar como lido não entra.
- **Duração explícita de 1 hora**, conferida no servidor pela criação da sessão (sem depender de cookie do navegador). O banner mostra "até HH:MM" e, a partir de telas médias, o que fica bloqueado; "Voltar ao admin" registra "Saiu da conta do cliente" quando a saída dá certo.
- **Promoção a dono apaga todas as formas de entrar** (senha e logins sociais) e as sessões, numa transação (`repositories/owner-promotion.ts`). O dono volta pelo link de redefinição de senha ou entrando com o Google de novo.

## 2026-10-15: Um modelo só de taxa para a prévia e o Financeiro (item 15.a)

- **Uma fórmula:** `shared/domain/fee-model.ts` estima a venda montando o pedido e chamando o próprio `computeOrderFinance` do Financeiro. Uma venda cobrada como o modelo estima termina com o lucro que a prévia prometeu, inclusive a taxa da SellBridge (`PLATFORM_FEE_BASIS_POINTS`), que a prévia ignorava (B17).
- **Configuração** (Zod, `.env.example`): `ESTIMATED_MARKETPLACE_FEE_BASIS_POINTS` (padrão 1400, os 14% de antes), `ESTIMATED_SHIPPING_CENTS` (padrão 0; `TODO(client:D5)`, quem paga o frete) e `MIN_MARGIN_PERCENT` (padrão 0, aprovado no ⏸1: só proíbe vender com prejuízo depois das taxas; o piso no servidor entra na 15.b).
- **Taxa por categoria:** a estrutura aceita uma taxa por categoria, mas fica vazia; nenhum percentual foi inventado. Ler a taxa real do Mercado Livre (`/sites/MLB/listing_prices` por categoria e preço, com cache) é uma tarefa separada (decisão do usuário no ⏸1).
- **Frete junto da tarifa:** o pedido tem um campo só para o que o marketplace fica; o frete estimado entra nele. Só bate com o Financeiro quando os pedidos reais gravarem o frete ali também (depende da D5).
- **Preço para uma margem:** o menor preço que mantém a margem depois de todas as taxas. As duas taxas arredondam para centavos, então um preço maior pode guardar um centavo a menos de lucro; a busca parte do limite exato de baixo e só sobe (a versão antiga de `profit.ts` errava por alguns centavos, por exemplo R$ 16,62 em vez de R$ 16,60).
- **Para as telas (15.b):** `getFeeSchedule` (`features/reports`, `tenantMiddleware`) entrega o modelo ao cliente.

## 2026-10-15 · Trocar de fornecedor num envio cancelado: não fazer

Decisão do usuário no ⏸1. Com a regra R3 ("uma loja, um fornecedor", etapa 4 do chat CPF), todo anúncio de uma loja é do fornecedor dela: mandar o pacote de um envio cancelado a outro fornecedor faria a loja anunciar o produto de A e entregar o de B, além de exigir um "produto equivalente" e recalcular custo, margem e estoque. Quando o fornecedor recusa, o revendedor reencaminha ao mesmo fornecedor (item 06) ou cancela a venda. Cancelar direto no marketplace fica para o item 22.

## 2026-10-15 · Rastreio automático e previsão de entrega (item 22.a)

- **Tarefa periódica no lugar do tópico `shipments`:** o worker lê a cada 30 minutos os envios do Mercado Livre ainda a caminho (fila `shipment-tracking`, 100 pedidos por vez, um de cada vez, o lido há mais tempo primeiro). O tópico `shipments` não entrou: a notificação traz só o id do envio, e achar o pedido exige mais uma chamada; fica para quando houver conta de teste para homologar. Uma leitura que falha marca `tracked_at` e vai para o fim da fila.
- **Datas do marketplace** em `order_shipments` (migration 0028): `estimated_delivery_at`, `dispatch_deadline_at` e `tracked_at`, com índice parcial nos envios a caminho. Ausência de data numa leitura não apaga a conhecida.
- **Revisão independente** (corrigido): o token é decifrado dentro do `try` (um token ilegível falha só aquele pedido); pedidos divididos entre fornecedores e lojas com token vencido ficam fora da lista; o índice é `tracked_at NULLS FIRST` e o filtro de status vai como constante, para casar com o índice parcial; cada nó do `lead_time` é lido sozinho e datas `unknown`/`unknown_frame` não viram previsão; a sincronização de estoque só roda se algum envio mudou de fato (`applyMarketplaceShipment` devolve `changed`); a junção confere o tenant da loja.
- **Regra de atraso** em `shared/domain/shipment-delay.ts` (prazo vale o dia inteiro em São Paulo, porque o ML data à meia-noite -03:00): despacho atrasado (com o fornecedor depois do prazo), entrega atrasada (enviado depois da previsão) e "confirme a entrega" (enviado há mais de 7 dias sem previsão, lojas fora do ML). As telas e o aviso no sino vêm na 22.b.

## 2026-10-15: Uploads seguros (item 11, chat B)

- **Teto do corpo antes de ler** (já vinha do audit): suporte e foto usam `readFormDataWithin`, que recusa pelo `Content-Length` e conta o stream, parando no limite.
- **O chamado é conferido antes de gravar o anexo:** responder chamado de outra organização (ou inexistente) dá 404 e a equipe respondendo chamado encerrado dá 409 sem nenhum arquivo ir para o disco (`findTicketForMessage`). A limpeza de `saveWithAttachments` continua como segunda camada para a corrida rara em que o chamado muda entre a checagem e a gravação.
- **Limite de envios por conta, em memória** (aprovado no ⏸1): anexos do suporte, 30 mensagens **com arquivo** a cada 10 minutos (abrir, responder, resposta da equipe; resposta só com texto não conta, para o atendente nunca ver "muitos arquivos" sem ter mandado nenhum); foto do perfil, 10 a cada 10 minutos. A foto confere antes de ler o corpo; o suporte confere logo depois de ler o formulário (que já tem teto de bytes), sempre que ele traz algum arquivo, mesmo que o arquivo seja recusado em seguida, para um envio repetido de arquivos inválidos também chegar ao 429. Uma mensagem com vários anexos em que um falha ao gravar apaga os que já foram gravados. Acima do limite a resposta é 429 com "Você enviou muitos arquivos em pouco tempo. Tente de novo em alguns minutos." Em memória pelo mesmo motivo do limite de login do Better Auth: uma instância web. Reiniciar o servidor zera a contagem; com várias instâncias, vai para o Redis ou uma tabela (item 32). Código de erro novo `RATE_LIMITED` (429) em `@sellbridge/shared/errors`.

## 2026-10-15 · Previsão e atraso nas telas (item 22.b)

- O atraso de cada envio é calculado no servidor (`repositories/shipment-timing.ts`, regra de `shared/domain/shipment-delay.ts`) e chega pronto às telas: "Despacho atrasado", "Entrega atrasada" ou "Confirme a entrega". O "Enviado" que conta para o lembrete é o primeiro "Enviado" do histórico.
- Painel de envio ("Operar pedido" e página do pedido): "Despachar até" enquanto está com o fornecedor, "Entrega prevista" depois de enviado, e o aviso empilhado sob o status. A página do pedido mostra a previsão no próprio painel de envio, e não num passo do resumo (o painel já está na página; um passo repetiria a mesma data).
- Sino: `shipment_late` na aba Problemas, com o que fazer e link para o pedido; como a falta de estoque, "Limpar tudo" não esconde e some quando o envio anda.
- Junto: a linha "Gerar novo link / Revogar acesso" passa a quebrar no celular, e a grade da página do pedido ganhou `grid-cols-1` (rolava 100 px em 320 px, já antes desta parte).

## 2026-10-15 · Contato e prazos do fornecedor (item 21.a)

- **Três campos novos em `suppliers`** (migration 0029): `contact_email` (opcional, guardado em minúsculas), `accept_within_hours` (padrão 24) e `dispatch_within_hours` (padrão 48). O prazo vai de 1 a 720 horas (30 dias), e o de aceite não pode passar o de despacho. Um `check` no banco garante isso também. Os fornecedores que já existiam ficaram com 24 h e 48 h.
- **Só a equipe vê o contato:** as consultas do lojista (diretório, lista e catálogo) escolhem as colunas uma a uma e não trazem o e-mail. Um teste confere isso.
- **Os prazos contam a partir do encaminhamento.** Quem usa esses prazos é a 21.c (aceite atrasado e prazo de despacho quando o marketplace não manda data). O e-mail é usado na 21.b, atrás da flag do encaminhamento automático, até a decisão D6 (login do fornecedor).
- **Formulário:** bloco "Pedidos" no cadastro do fornecedor, separado da cobertura, para não conflitar com a etapa 7 do chat CPF, que tira a cobertura da tela.

## 2026-10-15: Prévia com todas as taxas e piso de preço (item 15.b)

- **A prévia é a conta do Financeiro:** catálogo, publicação em massa, Nova publicação, card do anúncio e Editar preço usam o modelo de taxa (`getFeeSchedule`, pré-carregado nos loaders de Catálogo, Publicações e Nova publicação). Aparece a linha "Taxa da SellBridge (x%)" quando `PLATFORM_FEE_BASIS_POINTS` > 0, e o frete entra na linha do marketplace quando `ESTIMATED_SHIPPING_CENTS` > 0.
- **Piso no servidor (E7):** um preço precisa cobrir o custo e todas as taxas, mais `MIN_MARGIN_PERCENT` (padrão 0: só proíbe vender com prejuízo). Vale ao criar, ao editar (também pela API pública) e na publicação em massa, que recusa o lote inteiro antes de gravar e diz qual produto. Mesmo código de erro (conflito) e mesmas palavras nos três caminhos e nas telas: "Com as taxas, o preço mínimo para não ter prejuízo é R$ X".
- **Na tela, antes de enviar:** a Nova publicação confere o piso antes do pedido e esconde os preços prontos que ficariam abaixo dele; Editar preço avisa "Abaixo de R$ X você tem prejuízo depois das taxas" e não oferece atalhos de margem abaixo da mínima; a publicação em massa mostra o problema e trava o botão.
- **Anúncios já publicados abaixo do novo piso** continuam no ar (pausar, retomar, sincronizar e reprocessar não conferem preço); só a próxima edição de preço precisa respeitar o piso.
- **Pendências aceitas:** a categoria do produto ainda não chega ao piso nem à prévia (as taxas por categoria estão vazias; entra com a tarefa da taxa real do Mercado Livre); se a busca do modelo falhar, as telas usam o padrão de 14% sem a taxa da SellBridge, e o servidor continua sendo a regra.

## 2026-10-15: Token do fornecedor fora das URLs e limite do diagnóstico por cliente (item 17, chat B)

- **O token do link só aparece no próprio link** (`/fornecedor/pedido/$token`, que é o que se compartilha). A leitura do envio pela página (`getSupplierShipmentFn`) passou de GET para POST, porque o GET de uma server function leva os dados na URL da chamada (histórico, proxies, logs de acesso). A etiqueta do marketplace sai por um formulário POST com o token no corpo (`lib/server/supplier-link-token.ts`, até 1 KB); uma URL com `?token=` (link antigo) é recusada sem ler o token. O revendedor continua abrindo a etiqueta por GET, com a própria sessão. Um teste lê os `*.functions.ts` e acusa qualquer server function que receba o token do fornecedor por GET.
- **Relatórios de erro do navegador** (`/api/diagnostics/errors`): 30 por minuto por cliente (o primeiro endereço do cabeçalho `CLIENT_IP_HEADER`, o mesmo do Better Auth) e 600 por minuto no total. Antes, um contador único de 60 deixava um cliente calar os relatórios de todos.

## 2026-10-15: Redirect só para caminho interno e loja em "Atenção" (item 19, chat B)

- **`redirect` do login e do onboarding** passa por `internalPathSchema` (`@sellbridge/shared/schemas`): só caminho deste site, começando com `/`, sem `//`, sem `\`, sem espaço ou caractere de controle, e que continua na mesma origem ao ser resolvido. Um valor que não passa é descartado e a tela segue para o destino padrão, sem página de erro. O mesmo valor também alimenta o `callbackURL` do Google.
- **Falha de renovação que não é de autorização** (timeout, 5xx do marketplace) não grava `status = "error"`: isso pausaria a sincronização e tiraria a loja da fila de renovação, que é justamente quem tenta de novo. A loja segue `connected` com o motivo em `lastError`, e a tela deriva o estado "Atenção" (`storeHealth`, em `@sellbridge/shared/store-attention`): ponto e chip âmbar, o motivo no lugar de "Conectada há…", números de 30 dias mantidos, e a loja sobe para o topo da lista. Some na próxima renovação bem-sucedida ou na reconexão, que limpam o `lastError`.
- `recordStoreError` só grava enquanto o refresh token que falhou ainda é o salvo, como `markStoreStatus` e `updateStoreTokens`: uma falha lenta de antes de uma reconexão não marca a conexão nova.
- A ficha do cliente no admin ainda mostra só o `status`; o estado "Atenção" lá entra com o item 24 (Saúde das lojas).

## 2026-10-15: CPF na entrada, fornecedor de qualquer lugar, uma loja por fornecedor (chat CPF, etapas 1 a 8)

Pedido do cliente nos áudios de 14/10: o SellBridge liga quem não tem estoque a quem tem, **em qualquer lugar do Brasil**, e não a fornecedores perto do lojista. Esta decisão substitui as de "Região" (2026-10-08), do fluxo de CEP e da visibilidade por cobertura (Fase 1) e as partes de região do 08.a e do cadastro do titular, que ficam acima só como histórico. Plano completo: [2026-10-14-cpf-fornecedor-por-loja.md](reviews/2026-10-14-cpf-fornecedor-por-loja.md).

- **Entrada:** o onboarding pede nome completo e CPF (passo 1, salvo na hora) e o fornecedor da primeira loja (passo 2, `tenant_profile.starter_supplier_id`, migration 0026). Não pede mais endereço nem CEP. **Um CPF por conta** (índice único parcial `tenant_profile_cpf_idx`, migration 0025); a equipe só vê "CPF informado" ou "pendente", nunca o número.
- **Sem trava por região:** catálogo, publicação, busca, API pública e sincronização não olham onde o lojista está. `sellableOnMarketplace` (`repositories/sql/sellable.ts`) é só produto ativo e fornecedor ativo; o motivo `outside_region` saiu. Estado e cidade do fornecedor viraram filtros em Fornecedores e no picker do onboarding.
- **Uma loja, um fornecedor:** `store_connections.supplier_id` (migration 0025). A loja nasce com o fornecedor escolhido em Lojas (`?fornecedor=` no início do OAuth, guardado em `oauth_states.supplier_id`, migration 0027) ou, na primeira, com o do onboarding; reconectar mantém o fornecedor. Publicar produto de outro fornecedor numa loja é recusado no app, na API (409) e no worker. Loja sem fornecedor (conectada antes da regra, com anúncios de vários fornecedores) fica "pendente": os anúncios seguem vendendo, mas não entra publicação nova até escolher.
- **Trocar o fornecedor de uma loja** (lojista em Lojas ou equipe no admin, que fica no histórico) mostra antes o impacto: os anúncios no ar do fornecedor anterior viram `paused` (o sync manda 0) e os da fila viram erro com o motivo. Nada é apagado; reativar só volta quando a loja vende de novo aquele fornecedor.
- **Admin:** Clientes mostra o fornecedor de cada loja, filtra por fornecedor e troca o fornecedor de uma loja; Fornecedores não tem mais cobertura, lista os lojistas vinculados e confirma o impacto antes de desativar. A saúde do cliente conta os passos "Dados" e "Fornecedor" no lugar de "Região".
- **O que ficou no banco sem uso:** a tabela `supplier_coverage` e as colunas de endereço de `tenant_profile` (cep, state, city, rua…). Nada lê nem grava; apagá-las fica para uma migration depois da validação com o cliente. O `cep_cache` e o domínio de CEP (`shared/domain/cep*.ts`) também ficaram sem chamadas no app.

## 2026-10-16: Encaminhar sozinho e e-mail ao fornecedor (item 21.b)

- **Flag `AUTO_FORWARD_ENABLED`** (worker, padrão `false`) até a decisão D6 (fornecedor com login). Desligada, nenhum job é criado e nada muda: o pedido pago espera o revendedor encaminhar, como antes.
- **Ligada:** quando um pedido chega pago (webhook do marketplace), o worker põe na fila `order-auto-forward` um job por pedido (`jobId` com o id do pedido; notificações repetidas não somam). O job encaminha **só o caso sem dúvida**: pedido pago, ainda não encaminhado, todos os itens com fornecedor ativo e todo fornecedor com e-mail de pedidos (21.a). O endereço vem do envio da venda no Mercado Livre; enquanto o ML ainda não criou o envio, o job tenta de novo (5 tentativas a partir de 1 min, cerca de meia hora) e depois desiste. Qualquer outro caso (item sem fornecedor, fornecedor sem e-mail, outro marketplace, loja desconectada, sem endereço) fica com o revendedor, sem aviso novo.
- **No histórico do envio** o primeiro passo fica "por SellBridge": "Pedido encaminhado automaticamente e enviado ao fornecedor por e-mail." (`SHIPMENT_ACTORS.sellbridge`).
- **E-mail ao fornecedor** (também no encaminhamento manual, quando o fornecedor tem e-mail): número do pedido, itens, os dois prazos na mesma unidade ("12 horas e 48 horas" ou "1 dia e 3 dias") e o link de 30 dias. **Não leva nome nem endereço do comprador**: ficam atrás do link, que expira. O diálogo mostra "Enviamos este link para o e-mail do fornecedor."
- **E-mail que falha não desfaz o encaminhamento:** o envio ganha no histórico "O e-mail ao fornecedor não foi enviado. Gere um novo link e envie a ele." e o revendedor compartilha o link à mão. Os logs levam só ids (nada de e-mail, endereço ou link).
- **Envio de e-mail compartilhado** em `@sellbridge/shared/mailer` (Resend, web e worker), e o layout em `@sellbridge/shared/email-layout` (saiu de `apps/web/src/lib/server`). O item 25 (central de notificações) troca o envio direto pela fila de canais.
- **Pendências aceitas:** um job perdido (Redis fora no instante do webhook) não é refeito pelo sweeper, e o pedido fica com o revendedor; o worker sem `RESEND_API_KEY` em produção recusa o e-mail e anota a falha no histórico.

## 2026-10-15: Erros do Mercado Livre em português, com o que fazer (item 13.a)

- **De onde vêm as regras:** a página oficial "Validações" (developers.mercadolivre.com.br/pt_br/validacoes, lida em 2026-10-15) dá o formato do erro (`cause[]` com `cause_id`, `type`, `code`, `references`, `message`) e a tabela de códigos. Só os códigos dessa tabela ganharam frase própria; nenhum foi inventado.
- **O que o revendedor lê:** "o que aconteceu. o que fazer.", no tom das mensagens de indisponível do item 08: atributos obrigatórios (com os nomes que o ML deu), preço mínimo da categoria em reais, fotos pequenas, título curto, marca não autorizada, GTIN recusado e outros. Só `type: "error"` bloqueia: avisos (`warning`) não aparecem. Até dois erros por mensagem. Código desconhecido: "O Mercado Livre recusou o anúncio: <palavras do ML>. Revise o anúncio e tente de novo.", com o trecho do ML cortado em 300 caracteres. Resposta sem `cause` mantém a mensagem de antes.
- **Códigos só no log:** `details.causes` do erro leva os códigos do ML; a tela nunca mostra código.
- **Caminho até a tela:** sem mudança no worker nem no card; o motivo gravado no alvo já é a mensagem do erro. A descrição que falha calada (B13) é a parte 13.b.

## 2026-10-16 · Aceite atrasado e prazos do fornecedor (item 21.c)

- **O prazo conta do encaminhamento mais recente** (`latestForwardedAt`, o maior "Encaminhado" do histórico do envio): reencaminhar um envio cancelado recomeça a contar. Sem migration.
- **Regra** em `shared/domain/shipment-delay.ts`: entra o "Aceite atrasado" (`accept_overdue`), para o envio ainda "Encaminhado" depois do prazo de aceite do fornecedor. Quando o marketplace não manda data de despacho, o "Despacho atrasado" passa a usar o prazo de despacho do cadastro. Os prazos do cadastro valem até a hora exata, e as datas do marketplace continuam valendo o dia inteiro. Se o despacho também passou, ele aparece no lugar do aceite.
- **Telas:** o selo "Aceite atrasado" aparece na lista, na página do pedido e no sino ("{fornecedor} ainda não aceitou o pedido. Fale com o fornecedor."). O painel do envio mostra "Aceite até" e "Despachar até" com hora ("amanhã às 09:00", `formatDeadline`) para o revendedor e na página do fornecedor. A data de despacho do ML continua só com o dia.
