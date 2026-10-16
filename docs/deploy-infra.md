# Notas de deploy da infraestrutura

## Migration 0023 em banco antigo (loja viva em duas contas)

A 0023 cria `store_connections_live_shop_idx`: uma loja do marketplace só pode estar viva
(status diferente de `disconnected`) em uma conta. Um banco antigo em que duas contas
conectaram a mesma loja não conseguia criar o índice e a migração parava.

A 0023 agora limpa esses casos antes de criar o índice:

- fica viva a conexão mais recente (`connected_at`, com desempate pelo `id`), qualquer que seja
  o status dela (uma conexão `expired` mais nova vence uma `connected` mais antiga);
- as outras passam a `disconnected`, sem tokens (como o "Desconectar" do app), com um
  `last_error` que explica o motivo. Esse texto só aparece no banco: a loja some da tela
  "Lojas" da conta que a perdeu, então avise o dono antes (consulta abaixo);
- se ele tentar conectar de novo, o app recusa enquanto a outra conta estiver com a loja
  (mensagem de conflito do item 03).

Bancos que já aplicaram a 0023 não são afetados: o migrador só roda migrations com `when`
posterior à última aplicada. Um banco em que a 0023 falhou ficou sem ela (a transação foi
desfeita) e a aplica de novo no próximo deploy.

Antes do deploy, para saber quem será afetado:

```sql
select marketplace, external_shop_id, array_agg(tenant_id order by connected_at desc) as tenants
from store_connections
where status <> 'disconnected'
group by marketplace, external_shop_id
having count(*) > 1;
```

## Alertas de erro (item 32.a)

- Variável `ALERT_WEBHOOK_URL` (só HTTPS), no web e no worker. Vazia, os alertas ficam
  desligados.
- Cada log de nível `error` vira uma mensagem `[SellBridge web|worker] erro: <evento>` com a
  linha do log, já sem dados pessoais (mesma redação do `logger`), cortada em 1900 caracteres.
- O mesmo evento manda no máximo um alerta a cada 5 minutos por processo; o seguinte diz quantas
  repetições houve no intervalo.
- O corpo tem `text` (Slack, Google Chat) e `content` (Discord). Timeout de 3 s, sem nova
  tentativa; falha no envio vira um log `warn` `alerts.delivery_failed`, nunca outro alerta.
