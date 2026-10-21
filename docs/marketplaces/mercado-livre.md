# Mercado Livre: referência usada pelo conector

Consultado em 2026-10-12 na documentação oficial. As referências abaixo documentam os campos usados pelo conector.

## Autenticação (`autenticacao-e-autorizacao`)

- Consentimento: `https://auth.mercadolivre.com.br/authorization?response_type=code&client_id=…&redirect_uri=…&state=…`, com PKCE opcional (`code_challenge`, `code_challenge_method=S256`).
- Token: `POST https://api.mercadolibre.com/oauth/token`, `application/x-www-form-urlencoded`, `grant_type=authorization_code` (com `client_id`, `client_secret`, `code`, `redirect_uri`, `code_verifier`) ou `grant_type=refresh_token` (com `refresh_token`).
- Resposta: `access_token`, `token_type`, `expires_in` (21600 = 6 h), `scope`, `user_id`, `refresh_token`.
- O refresh token é de uso único: cada renovação devolve um novo, que precisa ser salvo. Erro `invalid_grant` = token expirado, revogado ou já usado (reconectar). `429 local_rate_limited` = tentar de novo depois.

## Usuário (`consulta-de-usuarios`)

- `GET /users/me` → `id`, `nickname`.

## Publicação (`publicacao-de-produtos`, `categorizacao-de-produtos`, `descricao-de-produtos`)

- `POST /items` com `title`, `category_id`, `price`, `currency_id`, `available_quantity`, `buying_mode: "buy_it_now"`, `condition`, `listing_type_id`, `pictures: [{ source }]`, `attributes`.
- O SKU do vendedor vai no atributo `SELLER_SKU` (não em `seller_custom_field`).
- Categoria obrigatória; preditor: `GET /sites/MLB/domain_discovery/search?limit=1&q=…` → `category_id`, `category_name`.
- Descrição: `POST /items/{id}/description` com `{ "plain_text": "…" }`.
- Atualização de preço/estoque: `PUT /items/{id}`.
- `GET /users/{seller_id}` consulta `tags` em cada publicação. Com `user_product_seller`, o conector envia `family_name` e omite `title` e `variations`; sem a tag, mantém o título clássico. O Mercado Livre gera `user_product_id` e a família a partir dos atributos. O nome usa o título do anúncio limitado a 60 caracteres.
- `GET /categories/{id}/attributes`: atributos com `required` ou `new_required` são obrigatórios (publicamos produtos novos). Quando há `conditional_required`, `POST /categories/{id}/attributes/conditional` recebe o corpo completo e retorna `required_attributes`. A publicação é bloqueada com os nomes e códigos ausentes, sem inventar marca, modelo ou GTIN.
- Os valores vêm de `supplier_products.mercado_livre_attributes`, editável no cadastro administrativo como `BRAND=Marca`, `MODEL=Modelo`, etc., um por linha. A importação CSV preserva esses atributos existentes. `SELLER_SKU` sempre recebe o SKU do produto. Atributos somente de leitura são recusados.
- Referências: [Preço por variação](https://developers.mercadolivre.com.br/pt_br/guia-para-produtos/preco-variacao), [User Products](https://developers.mercadolivre.com.br/pt_br/user-products), [Atributos](https://developers.mercadolivre.com.br/pt_br/api-docs-pt-br/atributos).

### Conciliação e prevenção de duplicados

- Antes de criar, consulta `GET /users/{seller_id}/items/search?sku={idempotencyKey}` e `?seller_sku={sku}`. A primeira busca usa `seller_custom_field`, onde gravamos a chave estável do destino; a segunda usa o atributo `SELLER_SKU`. Cada resultado é consultado por `GET /items/{id}` e deve pertencer à loja.
- Reutiliza somente o anúncio com `seller_custom_field` igual à chave desse destino. Outro destino do SellBridge pode compartilhar o SKU; um anúncio sem marcador exige conferência manual. Múltiplos anúncios com a mesma chave, anúncios encerrados e buscas incompletas bloqueiam a criação. Um anúncio ativo ou pausado recuperado recebe o preço e estoque atuais antes de ser salvo localmente.
- O worker salva `listing_targets.creation_started_at` **antes** de `POST /items`. Uma falha ao salvar o marcador impede o POST. Rejeições definitivas (400/401/429) limpam o marcador; falhas de rede, timeout, 5xx ou resposta inválida o preservam. O HTTP nunca repete automaticamente um POST incerto.
- Toda tentativa, inclusive o Reprocessar, concilia antes de criar. Com o marcador presente e nenhum anúncio encontrado, a decisão depende da idade do marcador: até 10 minutos, a busca pode só não ter indexado o anúncio ainda, então nada é criado e a mensagem pede para aguardar e reprocessar; depois de 10 minutos, a ausência confirma que a criação não ocorreu, o marcador é limpo e o anúncio é criado (com um marcador novo). Isso cobre também uma queda entre salvar o marcador e enviar o POST.
- Destinos antigos sem marcador persistido não permitem distinguir uma criação incerta anterior à migração; confira essas publicações antes de reprocessar. A garantia pressupõe que o marcador `seller_custom_field` não seja removido no marketplace.
- A descrição continua opcional: falha é registrada e não provoca uma nova criação.
- Referência: [Busca de itens, por SKU](https://developers.mercadolivre.com.br/pt_br/itens-e-buscas).

## Pedidos (`gerenciamento-de-vendas`)

- `GET /orders/{id}`; busca: `GET /orders/search?seller={id}&order.date_created.from=…&sort=date_desc` (paginação `offset`/`limit`).
- Campos usados: `id`, `status`, `date_created`, `total_amount`, `buyer.nickname`, `order_items[].item.id`, `.item.title`, `.quantity`, `.unit_price`, `.sale_fee`.
- Status (tabela oficial, lida em 2026-10-13) e como entram no SellBridge: `confirmed`, `payment_required`, `payment_in_process` e `partially_paid` → pendente; `paid` e `partially_refunded` → pago (o valor devolvido vira ajuste, item 04.b); `pending_cancel`, `cancelled` e `invalid` → cancelado. Um status fora da tabela fica pendente e gera o log `mercado_livre.unknown_order_status`.
- `tags`: `fraud_risk_detected` significa "não envie, cancele"; o pedido fica pendente mesmo pago e nunca é liberado ao fornecedor. Uma venda marcada como "não concretizada" continua `confirmed` na API (o dinheiro é devolvido sozinho) e, por isso, fica pendente.
- Exemplos de cada status em `packages/marketplaces/src/mercado-livre/fixtures/orders.ts`.
- Reembolso: a soma de `payments[].transaction_amount_refunded` (valor já devolvido ao comprador, em reais) vira um único ajuste por pedido (`order_adjustments.marketplace_key = 'refund'`), sempre com o total mais recente. Num pedido que conta receita ele desconta do lucro; num pedido devolvido aparece em "Devoluções"; num cancelado é removido.
- `sale_fee` é a tarifa **por unidade**, conforme [Provisões](https://developers.mercadolivre.com.br/pt_ar/provisoes). Somamos `round(sale_fee × 100) × quantity` por linha. Valores nulos/ausentes contribuem zero. Exemplo: 2 unidades com `sale_fee: 6` resultam em R$ 12,00.
- Não somamos novamente o custo fixo: [Custos por vender](https://developers.mercadolivre.com.br/pt_br/servicos-gerenciamento-de-contatos/comissao-por-vender) confirma que ele já compõe a taxa. As taxas reais vêm do pedido; não estimamos com uma porcentagem fixa.
- A semântica foi confirmada documentalmente e coberta por testes com múltiplas unidades/linhas; ainda é necessário comparar com uma venda real da conta antes da ativação em produção.

## Envios (`gerenciamento-de-envios`)

- O envio de um pedido é lido em duas etapas. A visão antiga de `GET /orders/{id}/shipments`, que devolvia o envio completo, foi descontinuada no fim de setembro de 2026. A atual (Hosted View) devolve só `[{ id, type }]`, sem ordem garantida, e `204` sem corpo enquanto o envio não existe. Pegamos o único `type: "forward"`: `return` e `return_to_buyer` são devoluções. Depois, `GET /shipments/{id}` com o cabeçalho `x-format-new: true`.
- Status do envio (`GET /shipment_statuses`) e como entram no SellBridge:

  | Mercado Livre                                                                                                | SellBridge                               |
  | ------------------------------------------------------------------------------------------------------------ | ---------------------------------------- |
  | `pending`, `handling`, `ready_to_ship`, `stale_ready_to_ship`                                                | nada muda: valem as etapas do fornecedor |
  | `shipped`, `stale_shipped`                                                                                   | Enviado                                  |
  | `delivered`                                                                                                  | Entregue                                 |
  | `not_delivered` com subestado `returned`, `returned_to_warehouse`, `returned_to_hub` ou `returned_to_agency` | Devolvido                                |
  | `not_delivered` com qualquer outro subestado (ex.: `returning_to_sender`, `receiver_absent`, `lost`)         | Não entregue                             |
  | `cancelled`                                                                                                  | Cancelado                                |

- Pedido devolvido: quando todo envio de venda voltou ao vendedor ("Devolvido") ou quando o pacote de devolução do comprador (`type: "return"`) chega como `delivered`. Esse pacote só é consultado quando a lista do pedido tem um. O status do pedido no Mercado Livre continua "pago", então um pedido devolvido não volta a "pago" numa sincronização; só o cancelamento o muda. As unidades que já saíram não voltam sozinhas à prateleira do fornecedor: a devolução vai para o endereço do revendedor.
- Entregue, Devolvido e Cancelado são finais: uma leitura atrasada não muda o envio de volta. "Não entregue" e "Devolvido" só vêm do marketplace; ninguém os escolhe à mão.
- Exemplos de cada status em `packages/marketplaces/src/mercado-livre/fixtures/shipments.ts`.
- A homologar com a conta de teste: se `GET /shipments/{id}` traz o endereço completo do destinatário (a visão antiga pedia `x-api-version: 2` para os dados pessoais). Sem endereço, a tela avisa ("O marketplace não informou o endereço completo") e o endereço é digitado à mão.
- O envio é lido quando alguém pede (botão na Operação) e, desde o item 22.a, por uma tarefa do worker a cada 30 minutos (`shipment-tracking`): até 100 pedidos por vez, de lojas do Mercado Livre conectadas, com envio ainda a caminho, o lido há mais tempo primeiro. Uma leitura que falha vai para o fim da fila (`tracked_at`), e token recusado expira a loja.
- Previsão e prazo: `lead_time.estimated_delivery_time.date` (entrega prevista) e `lead_time.estimated_handling_limit.date` (prazo de despacho), lidos de `GET /shipments/{id}` com `x-format-new: true` e guardados em `order_shipments`. Sem esses campos, ou com data ilegível, fica vazio; uma leitura sem eles não apaga a data já conhecida. Formato tirado da documentação oficial ("Mercado Envios", "Gerenciamento de envios"); a homologar com a conta de teste.
- Os tópicos `shipments` e `post_purchase` (reclamações e devoluções) ainda não são assinados; a tarefa de 30 minutos cobre o rastreio enquanto isso.

## Notificações (`produto-receba-notificacoes`)

- `POST` na URL de callback com `{ _id, resource, user_id, topic, application_id, attempts, sent, received }`; tópico de vendas: `orders_v2` (`resource: "/orders/{id}"`).
- Responder HTTP 200 em até 500 ms e processar depois em fila. Novas tentativas durante 1 h (8 tentativas); perdidas ficam em `GET /missed_feeds?app_id=…` por 2 dias.
- Não há assinatura. Validação adotada: `application_id` igual ao nosso `client_id` + `user_id` de uma loja conectada; os dados do pedido são sempre buscados na API com o token da loja (o payload nunca é confiável). A documentação lista os IPs de origem para quem quiser filtrar na borda.

## Ativação (passo a passo)

O conector fica desligado enquanto `MERCADO_LIVRE_CLIENT_ID` e `MERCADO_LIVRE_CLIENT_SECRET` estiverem vazios; a tela de Lojas mostra o Mercado Livre como "Em breve".

1. Criar o aplicativo no DevCenter do Mercado Livre (developers.mercadolivre.com.br), com a conta que será dona da integração.
2. URL de redirecionamento: `{APP_URL}/api/oauth/mercado_livre/callback`. O portal exige um endereço público com HTTPS; para testar localmente, exponha o app com um túnel (Cloudflare Tunnel ou ngrok) e use esse endereço como `APP_URL` no `.env`.
3. Notificações: URL `{APP_URL}/api/webhooks/mercado_livre`, tópicos `orders_v2` (vendas) e `items` (anúncios).
4. Permissões: leitura, escrita e acesso offline (sem o acesso offline não vem o `refresh_token`).
5. No `.env`, preencher `MERCADO_LIVRE_CLIENT_ID` e `MERCADO_LIVRE_CLIENT_SECRET` e reiniciar app e worker.
6. Testar com usuário de teste: o Mercado Livre permite criar usuários de teste (`POST /users/test_user`) para publicar e comprar sem dinheiro real. Conectar a loja de teste pela tela de Lojas e publicar um produto.

## Pendências antes de vender de verdade

- Fotos: todo anúncio precisa de ao menos uma imagem (`pictures`). Hoje os produtos dos fornecedores não têm fotos, então a publicação real será recusada até o catálogo receber imagens.
- Aplicar a migração `0013_ml_publication.sql` antes de iniciar o worker atualizado.
- Preencher atributos reais da categoria no cadastro do produto.
- Confirmar o endereço da página da venda usado na página do pedido: `https://www.mercadolivre.com.br/vendas/{id}/detalhe`.
- Homologar a conta de teste nos dois fluxos, inclusive a conciliação após falha, e comparar a taxa com um pedido de quantidade maior que 1.
