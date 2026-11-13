# TikTok Shop: referência usada pelo conector

Consultado em 2026-11-13 na documentação oficial do TikTok Shop Partner Center (`partner.tiktokshop.com/docv2`). Tudo abaixo foi conferido **só na documentação**: o conector foi escrito e testado com respostas simuladas no formato documentado, sem chamada real. O que precisa do teste com a conta real está marcado com **[teste real]**.

## Autenticação ([Authorization overview](https://partner.tiktokshop.com/docv2/page/authorization-overview-202407))

- Link de autorização (vendedor, fora dos EUA): `https://services.tiktokshop.com/open/authorize?service_id={service_id}&state={state}`. O `service_id` aparece na página do app no Partner Center. O link **não leva** `redirect_uri`: o TikTok usa a Redirect URL cadastrada no app.
- Volta: `{redirect_url}?code=…&state=…`. Recusa: `code=null&error=auth_denied` (por isso o callback lê `error` antes de `code`). O `code` vale 30 minutos e uma vez só.
- Token: `GET https://auth.tiktok-shops.com/api/v2/token/get?app_key&app_secret&auth_code&grant_type=authorized_code` (o valor `authorized_code` é o certo, não `authorization_code`).
- Renovação: `GET https://auth.tiktok-shops.com/api/v2/token/refresh?app_key&app_secret&refresh_token&grant_type=refresh_token`.
- Resposta: `{ code, message, request_id, data: { access_token, access_token_expire_in, refresh_token, refresh_token_expire_in, open_id, seller_name, seller_base_region, user_type, granted_scopes } }`. `access_token_expire_in` é a **data** de expiração em segundos Unix (não uma duração); o token vale 7 dias. **[teste real]** se o refresh token muda a cada renovação (o conector salva o que vier).
- Lojas autorizadas: `GET /authorization/202309/shops` → `data.shops[]` com `id`, `name`, `region`, `seller_type`, `cipher`, `code`. O `id` é o que os webhooks mandam em `shop_id` (é o `external_shop_id` da conexão); o `cipher` vai em `shop_cipher` nas chamadas da loja. O conector não guarda o cipher: busca de novo pela lista (com cache em memória de até 1 h), então não precisou de migração.

## Assinatura ([Sign your API request](https://partner.tiktokshop.com/docv2/page/sign-your-api-request), [Common parameters](https://partner.tiktokshop.com/docv2/page/common-parameters))

- Host: `https://open-api.tiktokglobalshop.com`. Versão no caminho (`/product/202309/products`).
- Em toda chamada: `app_key`, `timestamp` (segundos, até 5 min no passado e 30 s no futuro) e `sign` na query; `x-tts-access-token` no cabeçalho (fora da assinatura); `shop_cipher` na query quando a rota pede.
- `sign` = HMAC-SHA256 em hexadecimal, chave = app secret, sobre `secret + caminho + {chave}{valor} das queries em ordem alfabética (sem sign e access_token) + corpo exato enviado + secret`. Corpo `multipart/form-data` fica fora.
- Os dois exemplos da documentação viram testes: o de Get Authorized Shops (`b596b73e…2dc8`) e o da assinatura do webhook (`5dec0f11…ac05`).

## Erros ([Common errors](https://partner.tiktokshop.com/docv2/page/common-errors))

- O corpo sempre traz `code` (0 = sucesso) e `message`. `36009004` é reaproveitado para vários problemas: só o `code` não basta.
- Acesso expirado ou inválido: `105002`, e `36009004` com "access_token"/"x-tts-access-token" na mensagem → loja precisa reconectar. Sem permissão (escopo): `105005`. Limite de chamadas: HTTP 429 ou `36009002` (tentar de novo). Erro interno: `36009003`.
- As mensagens de tela ficam em `tiktok-shop/error-messages.ts`, em português; a mensagem original do TikTok fica só no log.

## Produtos ([Create Product](https://partner.tiktokshop.com/docv2/page/6502fc8da57708028b42b18a), [Product API overview](https://partner.tiktokshop.com/docv2/page/650b23eef1fd3102b93d2326))

- Fotos: o TikTok não aceita link externo. Cada foto é baixada pelo worker (só `https`, endereço público, até 10 MB) e enviada em `POST /product/202309/images/upload` (`multipart/form-data`, campo `data`, `use_case=MAIN_IMAGE`) → `data.uri`. Até 9 fotos.
- Categoria: `POST /product/202309/categories/recommend` com `product_title` → `data.leaf_category_id`. Brasil usa a árvore `v1`.
- Armazém: `GET /logistics/202309/warehouses` → o `SALES_WAREHOUSE` ativo marcado `is_default`.
- Criação: `POST /product/202309/products` com `title`, `description` (HTML), `category_id`, `main_images[].uri`, `skus[{ seller_sku, price{amount,currency:"BRL"}, inventory[{warehouse_id,quantity}] }]`, `package_weight{value,unit:"GRAM"}` e `idempotency_key` → `data.product_id`, `data.skus[].id`. O peso da embalagem é obrigatório: vem do peso líquido do cadastro fiscal do produto; sem ele, a publicação para com um aviso para preencher o peso.
- A `idempotency_key` (chave estável do destino) é a proteção documentada contra criar duas vezes num reenvio. **[teste real]** o que a API responde quando a mesma chave chega de novo.
- Atributos obrigatórios por categoria (`/product/202309/categories/{id}/attributes`) e marca **não** são preenchidos ainda: uma recusa por atributo aparece em português com o código. **[teste real]** quais categorias do catálogo pedem atributos.
- Preço: `POST /product/202309/products/{product_id}/prices/update` com `skus[{id, price{amount,currency}}]`. Estoque: `POST /product/202309/products/{product_id}/inventory/update` com `skus[{id, inventory[{warehouse_id,quantity}]}]`. O `id` do SKU e o armazém vêm de `GET /product/202309/products/{product_id}`.
- Descrição: `POST /product/202509/products/{product_id}/partial_edit` com `{ description }` (manda o produto para nova auditoria).

## Pedidos, webhooks e etiqueta

Ainda não lidos: a busca de pedidos e os webhooks respondem "ainda não está disponível", como antes do conector. Ficam para a próxima etapa, no mesmo formato do Mercado Livre.

## Ativação (no dia em que as chaves chegarem)

O conector fica desligado enquanto `TIKTOK_SHOP_APP_KEY`, `TIKTOK_SHOP_APP_SECRET` e `TIKTOK_SHOP_SERVICE_ID` não estiverem todos preenchidos; a tela de Lojas mostra o TikTok Shop como "Em breve".

1. No Partner Center, no app: Redirect URL `https://app.sellbridge.com.br/api/oauth/tiktok_shop/callback`; permissões de produtos, pedidos, logística/fulfillment e loja.
2. No Coolify, no app web **e** no worker: `TIKTOK_SHOP_APP_KEY`, `TIKTOK_SHOP_APP_SECRET` e `TIKTOK_SHOP_SERVICE_ID` (o Service ID está na página do app). Reiniciar os dois.
3. Em Partner Center > Development Shops, criar uma loja de teste do Brasil e autorizar pelo botão "Conectar TikTok Shop" da tela de Lojas.
4. Conferir na loja de teste, nesta ordem: conexão e nome da loja; publicação de um produto com peso; mudança de preço e de estoque; troca da descrição; a renovação do acesso (forçar com `expires_at` perto de vencer).
5. Anotar aqui o que for diferente da documentação e tirar as marcas **[teste real]** resolvidas.
