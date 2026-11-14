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
- Os dois exemplos da documentação viram testes: o de Get Authorized Shops (`b596b73e…2dc8`) e o do webhook (`5dec0f11…ac05`).

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

## Pedidos ([Get Order List](https://partner.tiktokshop.com/docv2/page/650aa8094a0bb702c06df242), [Get Order Detail](https://partner.tiktokshop.com/docv2/page/6894134ba28e5204961601a5))

- Busca: `POST /order/202309/orders/search?page_size=…&sort_field=create_time&sort_order=DESC&page_token=…` com corpo `{ create_time_ge }` → `data.orders[]`, `data.next_page_token`.
- Detalhe: `GET /order/202507/orders?ids=…` → `data.orders[]`.
- Cada `line_items[]` é **uma unidade** (não há quantidade): o conector agrupa por `product_id` + `sku_id` e conta.
- Situações: `UNPAID`, `ON_HOLD` → pendente; `AWAITING_SHIPMENT`, `PARTIALLY_SHIPPING`, `AWAITING_COLLECTION` → pago; `IN_TRANSIT` → enviado; `DELIVERED`, `COMPLETED` → entregue; `CANCELLED` → cancelado. `ON_HOLD` é pendente de propósito: o comprador ainda pode cancelar sem o vendedor.
- Valores em texto decimal (`"59.90"`), convertidos para centavos sem arredondar ponto flutuante. `payment.total_amount` = total pago.
- Tarifa do TikTok: o detalhe do pedido **não traz** a tarifa do vendedor (ela sai na API de Finanças depois do repasse). O conector grava 0 por enquanto. **[teste real]** decidir como trazer a tarifa.
- Endereço: o TikTok mascara o nome em pedidos com logística da plataforma e o envio usa a etiqueta do TikTok, então o conector não importa o endereço (mesma resposta de "não suportado" do formulário de encaminhamento).

## Webhooks ([Overview](https://partner.tiktokshop.com/docv2/page/tts-webhooks-overview), [Order status change](https://partner.tiktokshop.com/docv2/page/650300b8a57708028b430b4a))

- `POST` no endereço cadastrado no app; assinatura no cabeçalho `Authorization`: HMAC-SHA256 hexadecimal, chave = app secret, sobre `app_key + corpo cru`.
- Corpo: `{ type, tts_notification_id, shop_id, timestamp, data }`. Mudança de situação do pedido: `type: 1`, `data.order_id`, `data.order_status`. O evento guardado é o `tts_notification_id`; o pedido é sempre lido de novo na API (o corpo nunca é confiável).
- Responder 200 em até 3 s (o SellBridge já guarda e processa em fila). Novas tentativas: 2 min, 30 min, 3 h, 12 h.

## Etiqueta ([Get Package Shipping Document](https://partner.tiktokshop.com/docv2/page/650aa5fac16ffe02b8f112ca))

- `GET /fulfillment/202309/packages/{package_id}/shipping_documents?document_type=SHIPPING_LABEL&document_format=PDF` → `data.doc_url` (vale 24 h), `data.tracking_number`. O `package_id` vem de `packages[].id` no detalhe do pedido.
- Só funciona depois de o envio ser organizado no TikTok (`Ship Package`); antes disso o conector avisa em português. O SellBridge não organiza o envio sozinho. **[teste real]** o passo de organizar o envio no fluxo do fornecedor.

## Ativação (no dia em que as chaves chegarem)

O conector fica desligado enquanto `TIKTOK_SHOP_APP_KEY`, `TIKTOK_SHOP_APP_SECRET` e `TIKTOK_SHOP_SERVICE_ID` não estiverem todos preenchidos; a tela de Lojas mostra o TikTok Shop como "Em breve".

1. No Partner Center, no app: Redirect URL `https://app.sellbridge.com.br/api/oauth/tiktok_shop/callback`; webhook `https://app.sellbridge.com.br/api/webhooks/tiktok_shop` com o tópico `ORDER_STATUS_CHANGE` (e `SELLER_DEAUTHORIZATION`, `UPCOMING_AUTHORIZATION_EXPIRATION`); permissões de produtos, pedidos, logística/fulfillment e loja.
2. No Coolify, no app web **e** no worker: `TIKTOK_SHOP_APP_KEY`, `TIKTOK_SHOP_APP_SECRET` e `TIKTOK_SHOP_SERVICE_ID` (o Service ID está na página do app). Reiniciar os dois.
3. Em Partner Center > Development Shops, criar uma loja de teste do Brasil e autorizar pelo botão "Conectar TikTok Shop" da tela de Lojas.
4. Conferir na loja de teste, nesta ordem: conexão e nome da loja; publicação de um produto com peso; mudança de preço e de estoque; um pedido de teste chegando pelo webhook e pela busca; a etiqueta depois de organizar o envio; a renovação do acesso (forçar com `expires_at` perto de vencer).
5. Anotar aqui o que for diferente da documentação e tirar as marcas **[teste real]** resolvidas.
