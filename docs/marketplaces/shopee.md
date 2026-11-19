# Shopee: referência usada pelo conector

Consultado em 2026-11-18 na documentação oficial da Shopee Open Platform v2 (`open.shopee.com`, Developer Guide e API Reference). O conector foi escrito e testado com respostas simuladas no formato documentado, sem chamada real. O que precisa do teste com uma loja (de verdade ou do sandbox) está marcado com **[teste real]**.

O conector entra em fatias: 1) conectar e renovar o acesso (esta página); 2) publicar, preço e estoque; 3) pedidos e avisos; 4) preparar envio e etiqueta. Até cada fatia chegar, a operação correspondente responde "ainda não está disponível para a Shopee".

## Aplicativo ([Crie seu App](https://open.shopee.com/developer-guide/740), [Go Live](https://open.shopee.com/developer-guide/741))

- A categoria do app é escolhida na criação e não muda depois. Ela define quais APIs o app pode usar. Para integradora que atende lojas de terceiros, a categoria é **ERP System** (não tem o botão "Authorize" no console: o SellBridge monta o link).
- A chave do sandbox (app em "Developing") é diferente da de produção, que só existe depois do Go Live.
- Sem a lista de IPs do servidor (IP Address Whitelist) ligada, a Shopee devolve nome, endereço e CPF do comprador mascarados.

## Endereços ([API calls](https://open.shopee.com/developer-guide/16), [Authorization and Authentication](https://open.shopee.com/developer-guide/20))

|                      | Produção                                                        | Sandbox                                               |
| -------------------- | --------------------------------------------------------------- | ----------------------------------------------------- |
| API                  | `https://openplatform.shopee.com.br` (servidores perto dos EUA) | `https://openplatform.sandbox.test-stable.shopee.sg`  |
| Autorização (Brasil) | `https://open.shopee.com.br/auth`                               | `https://open.sandbox.test-stable.shopee.com.br/auth` |

`SHOPEE_SANDBOX=true` troca os dois.

## Assinatura

- Toda chamada leva `partner_id`, `timestamp` (segundos; vale 5 minutos) e `sign` na query. As chamadas de loja levam também `access_token` e `shop_id` na query; por isso a URL nunca vai para o log.
- `sign` = HMAC-SHA256 em hexadecimal minúsculo, chave = partner key, sobre:
  - chamada pública: `partner_id + caminho + timestamp`;
  - chamada de loja: `partner_id + caminho + timestamp + access_token + shop_id`.
- O exemplo de texto assinado da documentação (`2001887/api/v2/shop/get_shop_info1655714431…14701711`) virou teste.
- GET leva os parâmetros na query; POST leva no corpo JSON. Na referência, `method: 2` é GET e `method: 1` é POST.

## Autorização da loja

- Link: `{autorização}?partner_id&auth_type=seller&redirect_uri&response_type=code&state`. O domínio do `redirect_uri` precisa ser o cadastrado no console (Live Redirect URL Domain). No sandbox, com o domínio de teste vazio, o domínio não é conferido.
- O `state` vai como parâmetro documentado **e** dentro do `redirect_uri`, para o retorno achar o state mesmo se a Shopee devolver só `code` e `shop_id`. **[teste real]** qual dos dois volta.
- O vendedor escolhe por quanto tempo autoriza: 7, 30, 90, 180 ou 365 dias. Passado esse prazo, precisa autorizar de novo.
- Retorno: `?code=…&shop_id=…`. O `code` vale 10 minutos e uma vez só. Conta principal devolve `main_account_id` no lugar de `shop_id`; o SellBridge pede para entrar com a conta da loja.
- Token: `POST /api/v2/auth/token/get` (chamada pública), corpo `{ code, partner_id, shop_id }` → `access_token` (4 h), `refresh_token` (30 dias, uso único), `expire_in` (segundos).
- Renovação: `POST /api/v2/auth/access_token/get`, corpo `{ refresh_token, partner_id, shop_id }` → um par novo. O refresh antigo deixa de valer, e o access token antigo ainda vale 5 minutos. A renovação é por loja, por isso a interface comum passou a receber a loja (`refreshTokens(refreshToken, { externalShopId })`).
- Nome da loja: `GET /api/v2/shop/get_shop_info` → `shop_name`, `region`, `status`. Só loja do Brasil (`BR`) e ativa (`NORMAL`) conecta.

## Erros

- A resposta traz `error` (vazio no sucesso), `message` e `request_id`. A mensagem original da Shopee vai só para o log (`shopee.refused`). A tela mostra o texto em português de `shopee/error-messages.ts`.
- Acesso morto (`invalid_acceess_token`, `invalid_access_token`, `partner_shop_no_link`, ou `error_auth` falando de access_token ou shop) → a loja precisa reconectar.
- Refresh token recusado (mensagem citando `refresh_token`) → loja expirada. **[teste real]** o texto exato.
- `error_rate_limit` e `error_limit` (limite do dia) → tentar de novo. `error_server`, `error_inner` e `error_network` só se repetem em GET.

## Ativação (no dia em que as chaves chegarem)

O conector fica desligado enquanto `SHOPEE_PARTNER_ID` e `SHOPEE_PARTNER_KEY` não estiverem preenchidos; a tela de Lojas mostra a Shopee como "Em breve".

1. No console da Shopee (open.shopee.com > Console):
   - app da categoria ERP System;
   - Live Redirect URL Domain `app.sellbridge.com.br`;
   - Push Mechanism com a URL `https://app.sellbridge.com.br/api/webhooks/shopee` (os avisos entram na fatia 3);
   - IP Address Whitelist com o IP do servidor.
2. No Coolify, no app web **e** no worker: `SHOPEE_PARTNER_ID` e `SHOPEE_PARTNER_KEY` (e `SHOPEE_SANDBOX=true` só no ambiente de teste). Reiniciar os dois.
3. Sandbox: Console > Test Account (Sandbox v2) > criar uma loja de teste do Brasil e autorizar pelo botão "Conectar Shopee" da tela de Lojas. O código de verificação no sandbox é 123456.
4. Conferir:
   - o nome da loja na tela;
   - a renovação do acesso (forçar com `expires_at` perto de vencer);
   - a reconexão depois de revogar a autorização na Central do Vendedor.
