# API pública (v1)

A API REST do SellBridge permite que outros sistemas (ERP, planilhas, BI, um sistema próprio) leiam o catálogo, as lojas, os anúncios, os pedidos e o resumo financeiro de uma organização, criem e atualizem anúncios e recebam eventos por webhook.

- Base: `https://<seu-app>/api/v1` (em desenvolvimento, `http://localhost:3000/api/v1`).
- Referência interativa, gerada do código: [`/api/v1/docs`](http://localhost:3000/api/v1/docs).
- Documento OpenAPI 3.1: [`/api/v1/openapi.json`](http://localhost:3000/api/v1/openapi.json) (serve para gerar clientes ou importar no Postman/Insomnia).

Este documento explica o uso geral; os campos de cada operação estão na referência interativa.

## Começando

1. No app, abra o menu da conta → **Integrações** e clique em **Nova chave**.
2. Dê um nome (por exemplo, "ERP"), escolha as permissões (as de leitura já vêm marcadas) e, se quiser, uma validade de 30, 90 ou 365 dias.
3. Copie a chave (`sb_live_...`). Ela aparece **uma única vez**: o SellBridge guarda apenas um hash dela. Se perder, revogue e crie outra.
4. Teste:

```bash
export SELLBRIDGE_API_KEY="sb_live_..."
curl http://localhost:3000/api/v1/me -H "Authorization: Bearer $SELLBRIDGE_API_KEY"
```

```json
{
  "data": {
    "organization": { "id": "…", "name": "Ana Revendedora" },
    "apiKey": {
      "name": "ERP",
      "prefix": "sb_live_Ab12Cd",
      "scopes": ["catalog:read", "stores:read", "listings:read", "orders:read"],
      "expiresAt": null
    },
    "rateLimit": { "requestsPerMinute": 120 }
  }
}
```

## Autenticação

Toda requisição envia a chave no cabeçalho `Authorization`:

```
Authorization: Bearer sb_live_...
```

- Uma chave pertence a **uma organização** e só enxerga os dados dela.
- Chaves revogadas ou expiradas passam a receber `401` imediatamente.
- A chave é um segredo de servidor: guarde-a em variável de ambiente ou cofre de senhas e nunca a use em código que roda no navegador ou num app instalado.
- Cada organização pode ter até 20 chaves ativas. Use uma chave por integração, para poder revogar uma sem derrubar as outras.
- O app mostra quando cada chave foi usada pela última vez (com precisão de um minuto), o que ajuda a encontrar chaves esquecidas.

## Escopos

Cada chave tem um conjunto de escopos. Uma operação fora dos escopos da chave responde `403` com `code: "forbidden"`.

| Escopo            | Permite                                           |
| ----------------- | ------------------------------------------------- |
| `catalog:read`    | Ler o catálogo de produtos                        |
| `stores:read`     | Ler as lojas conectadas                           |
| `listings:read`   | Ler anúncios e o status em cada loja              |
| `listings:write`  | Criar anúncios, mudar preço, pausar e reativar    |
| `orders:read`     | Ler pedidos                                       |
| `financials:read` | Ler o resumo financeiro                           |
| `events:read`     | Ler eventos (`GET /events`)                       |
| `webhooks:manage` | Cadastrar, alterar e remover endpoints de webhook |

`GET /me` funciona com qualquer chave válida.

## Convenções

### Formato

- JSON em UTF-8, com nomes de campos em camelCase.
- Um recurso vem em `{ "data": { ... } }`.
- Listas vêm em `{ "data": [ ... ], "pagination": { ... } }`.
- Campos novos podem aparecer a qualquer momento (veja [Versionamento](#versionamento)): ignore os que você não conhece.

### Paginação

Listas são paginadas por número de página:

| Parâmetro  | Padrão | Limites |
| ---------- | ------ | ------- |
| `page`     | 1      | ≥ 1     |
| `pageSize` | 20     | 1 a 100 |

```json
{
  "data": [],
  "pagination": { "page": 2, "pageSize": 20, "total": 134, "totalPages": 7 }
}
```

Para sincronizar mudanças de forma incremental, não percorra todas as páginas de novo: use os [eventos](#eventos-e-webhooks), que têm cursor.

### Dinheiro

Valores monetários são **inteiros em centavos de real (BRL)**, com o sufixo `Cents`: `"priceCents": 12990` é R$ 129,90. Não há ponto flutuante na API.

### Datas

Datas e horas são strings ISO 8601 em UTC, como `"2026-10-11T14:03:12.000Z"`.

### Erros

Erros seguem o [RFC 9457](https://www.rfc-editor.org/rfc/rfc9457) com `Content-Type: application/problem+json`:

```json
{
  "type": "https://sellbridge.dev/docs/api/errors#validation_failed",
  "title": "Dados inválidos",
  "status": 400,
  "code": "validation_failed",
  "detail": "Alguns campos estão inválidos; veja `issues`.",
  "requestId": "6f1c2a9e-…",
  "issues": [{ "path": "body.priceCents", "message": "Informe o preço de venda" }]
}
```

Decida pelo `code`, que é estável; `title` e `detail` são textos para pessoas e podem mudar. Informe o `requestId` (também no cabeçalho `X-Request-Id`) ao falar com o suporte.

| Status | `code`                     | Quando                                                                        |
| ------ | -------------------------- | ----------------------------------------------------------------------------- |
| 400    | `idempotency_key_required` | `POST` sem `Idempotency-Key` válida                                           |
| 401    | `unauthorized`             | Chave ausente, inválida, revogada ou expirada                                 |
| 403    | `forbidden`                | A chave não tem o escopo da operação                                          |
| 404    | `not_found`                | O recurso não existe ou é de outra organização                                |
| 409    | `conflict`                 | A operação conflita com o estado atual (por exemplo, loja desconectada)       |
| 409    | `idempotency_in_progress`  | A primeira requisição com a mesma `Idempotency-Key` ainda está rodando        |
| 400    | `validation_failed`        | JSON malformado, ou corpo, parâmetros ou query fora do formato; veja `issues` |
| 422    | `validation_failed`        | Formato certo, mas viola uma regra (por exemplo, preço abaixo do custo)       |
| 422    | `idempotency_key_reused`   | A mesma `Idempotency-Key` foi usada com outra requisição                      |
| 413    | `payload_too_large`        | Corpo maior que 64 KB                                                         |
| 429    | `rate_limited`             | Limite de requisições atingido; espere `Retry-After` segundos                 |
| 502    | `upstream_error`           | Falha num serviço externo (por exemplo, o marketplace)                        |
| 500    | `internal_error`           | Erro inesperado; tente de novo (num `POST`, com uma nova `Idempotency-Key`)   |

### Limite de requisições

Cada chave pode fazer **120 requisições por minuto** (janela fixa de um minuto). Toda resposta traz:

| Cabeçalho             | Significado                          |
| --------------------- | ------------------------------------ |
| `RateLimit-Limit`     | Requisições permitidas na janela     |
| `RateLimit-Remaining` | Quantas ainda restam na janela atual |
| `RateLimit-Reset`     | Segundos até a janela recomeçar      |

Acima do limite a resposta é `429` com `Retry-After` (em segundos). Espere esse tempo antes de tentar de novo.

### Idempotência

Todo `POST` exige o cabeçalho `Idempotency-Key`, com um valor único por operação (8 a 255 caracteres de letras, números, `_`, `-`, `.` ou `:`; um UUID serve). Se a conexão cair e você não souber se o anúncio foi criado, reenvie **exatamente a mesma requisição com a mesma chave**: o SellBridge devolve a resposta original (com o cabeçalho `Idempotent-Replayed: true`) em vez de criar um segundo anúncio.

```bash
IDEMPOTENCY_KEY=$(uuidgen)

# Primeira tentativa: a conexão cai antes da resposta chegar.
curl -X POST http://localhost:3000/api/v1/listings \
  -H "Authorization: Bearer $SELLBRIDGE_API_KEY" \
  -H "Idempotency-Key: $IDEMPOTENCY_KEY" \
  -H "Content-Type: application/json" \
  -d '{"productId":"…","priceCents":12990,"storeIds":["…"]}'

# Nova tentativa com a MESMA chave e o MESMO corpo: devolve o anúncio criado na primeira.
curl -X POST http://localhost:3000/api/v1/listings \
  -H "Authorization: Bearer $SELLBRIDGE_API_KEY" \
  -H "Idempotency-Key: $IDEMPOTENCY_KEY" \
  -H "Content-Type: application/json" \
  -d '{"productId":"…","priceCents":12990,"storeIds":["…"]}'
```

- A chave vale por 24 horas; depois disso, o mesmo valor inicia uma operação nova.
- Mesma chave com corpo diferente: `422 idempotency_key_reused` (gere uma chave nova para cada operação).
- Se a primeira ainda estiver em andamento: `409 idempotency_in_progress` com `Retry-After: 1`.
- Toda resposta é guardada, inclusive as de erro (`5xx` também: a falha pode ter acontecido depois de o anúncio ser criado). Depois de um erro, confira o estado (por exemplo com `GET /listings`) e, se for o caso, tente de novo com uma **nova** chave. Se a requisição original morreu no meio do caminho, a chave é liberada depois de 5 minutos.

## Eventos e webhooks

Pedidos e anúncios geram eventos:

| Tipo                   | Quando                               |
| ---------------------- | ------------------------------------ |
| `order.created`        | Um pedido novo chegou do marketplace |
| `order.status_changed` | Um pedido mudou de status            |
| `listing.published`    | Um anúncio foi publicado numa loja   |
| `listing.failed`       | Uma loja recusou um anúncio          |

O `data` de cada evento é um retrato pequeno (ids, status, totais em centavos). Para o restante, busque o recurso pelo id. Eventos ficam disponíveis por 30 dias.

Há duas formas de recebê-los, que podem ser combinadas:

### Consulta periódica (`GET /events`)

Com o escopo `events:read`, leia os eventos em ordem, a partir do último que você processou. Cada evento tem um `sequence` crescente; guarde o maior que você já processou e passe-o em `after`:

```bash
curl "http://localhost:3000/api/v1/events?after=1842" \
  -H "Authorization: Bearer $SELLBRIDGE_API_KEY"
```

Repita até a resposta vir vazia e então espere alguns segundos antes da próxima consulta. É o jeito mais simples de manter um sistema sincronizado sem expor uma URL pública, e serve de rede de segurança para webhooks perdidos.

### Webhooks

Com o escopo `webhooks:manage`, cadastre uma URL HTTPS que recebe um `POST` a cada evento. Ao criar o endpoint você recebe um segredo (`whsec_...`), mostrado uma única vez, usado para assinar as entregas.

Cada entrega tem o corpo:

```json
{
  "id": "1f0c…",
  "type": "order.created",
  "createdAt": "2026-10-11T14:03:12.000Z",
  "data": { "orderId": "…", "status": "paid", "totalCents": 12990 }
}
```

e os cabeçalhos `SellBridge-Signature`, `SellBridge-Event-Id` e `SellBridge-Event-Type`.

**Verifique a assinatura sempre.** O cabeçalho tem o formato:

```
SellBridge-Signature: t=1791813792,v1=5257a869e7ecebeda32affa62cdca3fa51cad7e77a0e56ff536d0ce8e108d8bd
```

`v1` é o HMAC-SHA256, em hexadecimal, de `"<t>.<corpo bruto>"` com o segredo do endpoint; `t` é o horário do envio em segundos Unix. Calcule sobre o corpo **exatamente como chegou**, antes de interpretar o JSON, compare em tempo constante e recuse assinaturas com mais de 5 minutos de diferença do seu relógio (protege contra reenvio de requisições antigas).

```js
import { createHmac, timingSafeEqual } from "node:crypto";
import express from "express";

const WEBHOOK_SECRET = process.env.SELLBRIDGE_WEBHOOK_SECRET; // whsec_...
const TOLERANCE_SECONDS = 5 * 60;

function isValidSignature(header, rawBody) {
  const parts = Object.fromEntries(header.split(",").map((part) => part.trim().split("=", 2)));
  const timestamp = Number(parts.t);
  if (!Number.isInteger(timestamp) || !parts.v1) {
    return false;
  }
  if (Math.abs(Date.now() / 1000 - timestamp) > TOLERANCE_SECONDS) {
    return false;
  }
  const expected = createHmac("sha256", WEBHOOK_SECRET).update(`${timestamp}.${rawBody}`).digest();
  const received = Buffer.from(parts.v1, "hex");
  return received.length === expected.length && timingSafeEqual(received, expected);
}

const app = express();

// express.raw: a assinatura é do corpo bruto, não do JSON reinterpretado.
app.post("/webhooks/sellbridge", express.raw({ type: "application/json" }), (request, response) => {
  const rawBody = request.body.toString("utf8");
  if (!isValidSignature(request.get("SellBridge-Signature") ?? "", rawBody)) {
    return response.status(400).send("assinatura inválida");
  }
  const event = JSON.parse(rawBody);
  // Responda logo e processe depois (fila, job em segundo plano...).
  enqueue(event);
  return response.sendStatus(204);
});

app.listen(4000);
```

Boas práticas para o receptor:

- **Responda 2xx rápido** (o SellBridge espera no máximo 10 segundos) e processe o evento em segundo plano. Qualquer status fora de 2xx, redirecionamento, erro de rede ou demora conta como falha.
- **Trate entregas repetidas.** A mesma entrega pode chegar mais de uma vez; use o `id` do evento (também em `SellBridge-Event-Id`) para ignorar duplicatas.
- **Não dependa da ordem.** Em caso de retentativa, um evento pode chegar depois de outro mais novo; use `createdAt` ou busque o estado atual do recurso.
- Entregas que falham são tentadas de novo com espera crescente (30 s, 2 min, 10 min, 30 min, 1 h, 3 h e 6 h), até 8 tentativas, cerca de 11 horas no total. Depois disso a entrega fica marcada como falha; recupere o que faltou com `GET /events`.

## Versionamento

- A versão está no caminho: `/api/v1`.
- Dentro da v1 só fazemos mudanças **compatíveis**: novos endpoints, novos campos em respostas, novos parâmetros opcionais, novos tipos de evento e novos códigos de erro. Seu cliente deve ignorar campos e tipos de evento que não conhece.
- Mudanças incompatíveis (remover ou renomear campo, mudar tipo ou significado, tornar um parâmetro obrigatório) só acontecem numa nova versão (`/api/v2`), que convive com a v1 por um período de transição anunciado.

## Referência

A lista completa de operações, parâmetros, corpos e respostas, com exemplos, está em [`/api/v1/docs`](http://localhost:3000/api/v1/docs), gerada do mesmo código que atende as requisições.
