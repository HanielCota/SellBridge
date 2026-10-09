# Mercado Livre — referência usada pelo conector

Consultado em 2026-10-08 na documentação oficial (developers.mercadolivre.com.br/pt_br). Só o que está listado aqui foi implementado; o resto ficou como `TODO` no código.

## Autenticação (`autenticacao-e-autorizacao`)

- Consentimento: `https://auth.mercadolivre.com.br/authorization?response_type=code&client_id=…&redirect_uri=…&state=…`, com PKCE opcional (`code_challenge`, `code_challenge_method=S256`).
- Token: `POST https://api.mercadolibre.com/oauth/token`, `application/x-www-form-urlencoded`, `grant_type=authorization_code` (com `client_id`, `client_secret`, `code`, `redirect_uri`, `code_verifier`) ou `grant_type=refresh_token` (com `refresh_token`).
- Resposta: `access_token`, `token_type`, `expires_in` (21600 = 6 h), `scope`, `user_id`, `refresh_token`.
- **Refresh token de uso único**: cada renovação devolve um novo, que precisa ser salvo. Erro `invalid_grant` = token expirado, revogado ou já usado (reconectar). `429 local_rate_limited` = tentar de novo depois.

## Usuário (`consulta-de-usuarios`)

- `GET /users/me` → `id`, `nickname`.

## Publicação (`publicacao-de-produtos`, `categorizacao-de-produtos`, `descricao-de-produtos`)

- `POST /items` com `title`, `category_id`, `price`, `currency_id`, `available_quantity`, `buying_mode: "buy_it_now"`, `condition`, `listing_type_id`, `pictures: [{ source }]`, `attributes`.
- O SKU do vendedor vai no atributo `SELLER_SKU` (não em `seller_custom_field`).
- Categoria obrigatória; preditor: `GET /sites/MLB/domain_discovery/search?limit=1&q=…` → `category_id`, `category_name`.
- Descrição: `POST /items/{id}/description` com `{ "plain_text": "…" }`.
- Atualização de preço/estoque: `PUT /items/{id}`.
- **Atenção:** a documentação anuncia a migração para "User Products", em que o título deixa de ser enviado. O conector usa o fluxo clássico; ver `TODO(user-products)`.

## Pedidos (`gerenciamento-de-vendas`)

- `GET /orders/{id}`; busca: `GET /orders/search?seller={id}&order.date_created.from=…&sort=date_desc` (paginação `offset`/`limit`).
- Campos usados: `id`, `status`, `date_created`, `total_amount`, `buyer.nickname`, `order_items[].item.id`, `.item.title`, `.quantity`, `.unit_price`, `.sale_fee`.
- Status: `confirmed`, `payment_required`, `payment_in_process`, `partially_paid`, `paid`, `partially_refunded`, `pending_cancel`, `cancelled`, `invalid`.
- `sale_fee` é descrito só como "comissão de vendas"; os exemplos têm quantidade 1. Tratamos como valor por unidade (`TODO(sale-fee)`).

## Notificações (`produto-receba-notificacoes`)

- `POST` na URL de callback com `{ _id, resource, user_id, topic, application_id, attempts, sent, received }`; tópico de vendas: `orders_v2` (`resource: "/orders/{id}"`).
- Responder **HTTP 200 em até 500 ms**; processar depois em fila. Novas tentativas durante 1 h (8 tentativas); perdidas ficam em `GET /missed_feeds?app_id=…` por 2 dias.
- **Não há assinatura**. Validação adotada: `application_id` igual ao nosso `client_id` + `user_id` de uma loja conectada; os dados do pedido são sempre buscados na API com o token da loja (o payload nunca é confiável). A documentação lista os IPs de origem para quem quiser filtrar na borda.
