# 2026-11-20: Teto diário de e-mails

**Decisão:** o SellBridge nunca envia mais e-mails por dia do que um teto, somando o site e o worker, e nunca mais do que um teto por destinatário. Guilherme, 20/11/2026, sobre os números abaixo: "Sim, pode seguir".

## Por quê

Todo e-mail sai pelo Resend e é cobrado por volume. O código só limitava as tentativas de cada aviso; nada limitava o total. Um defeito que gere avisos em laço, ou um uso indevido, viraria custo sem ninguém perceber. A chave do Resend só volta para o worker em produção depois que este teto estiver no ar.

## Os números

| Tipo                                                                              | Sistema todo, por dia | Mesmo destinatário, por dia | Variáveis                                                          |
| --------------------------------------------------------------------------------- | --------------------- | --------------------------- | ------------------------------------------------------------------ |
| Conta (confirmar e-mail, nova senha, convite da equipe, aviso de troca de e-mail) | 100                   | 10                          | `EMAIL_ACCOUNT_DAILY_CAP`, `EMAIL_ACCOUNT_DAILY_CAP_PER_RECIPIENT` |
| Todo o resto (avisos, encaminhamento ao fornecedor, convites, lembretes)          | 500                   | 50                          | `EMAIL_DAILY_CAP`, `EMAIL_DAILY_CAP_PER_RECIPIENT`                 |

- São os valores padrão; cada um muda pela variável de ambiente, no site e no worker (os dois precisam do mesmo valor). `0` não envia nenhum e-mail daquele tipo.
- O plano do Resend da conta não foi conferido. Os números são conservadores para o uso atual (6 tipos de aviso por e-mail, mais encaminhamento, convites e lembretes) e o pior caso, 600 por dia, fica em cerca de 18 mil por mês.
- Cada pedido encaminhado é um e-mail para o fornecedor. Um fornecedor com mais de 50 pedidos num dia bate o teto por destinatário; nesse caso, subir `EMAIL_DAILY_CAP_PER_RECIPIENT`.

## Como funciona

- **Um lugar só:** o teto mora no `createMailer` (`packages/shared/src/email/mailer.ts`), por onde todo e-mail passa. Não há envio que escape dele.
- **Contador compartilhado:** fica no Redis, que o site e o worker já usam, e a conta é feita num passo único (um script), então dois processos nunca passam do teto juntos. O endereço não vai para o Redis: a chave usa um resumo (hash) dele.
- **O dia** é o dia de Brasília: vira à meia-noite de lá (03:00 UTC).
- **Duas cotas:** os e-mails de conta têm cota própria, então avisos em massa nunca prendem a confirmação de cadastro nem a recuperação de senha.
- **Tentativa conta:** o e-mail é contado antes de ir ao Resend, mesmo que o Resend falhe depois. Assim uma sequência de tentativas repetidas também é contida.
- **Redis fora do ar:** sem conseguir contar, o e-mail comum não sai (enviar sem contar é o que o teto existe para impedir) e é tentado de novo depois; o e-mail de conta sai mesmo assim, porque são poucos e o cadastro e a recuperação já têm limite próprio.

## Ao bater o teto

- **Aviso do sino:** continua no sino. O e-mail dele fica guardado até a virada do dia e sai depois, sem gastar as tentativas (`postponeNotification`).
- **Encaminhamento ao fornecedor:** o pedido é encaminhado do mesmo jeito; como já acontecia quando um e-mail falha, o histórico da entrega diz que o e-mail não saiu e o revendedor pode mandar o link de novo.
- **E-mail pedido por um clique:** quem clicou vê que o limite de hoje foi atingido.
- **Equipe:** uma vez por dia para cada teto (o geral, o de conta e o por destinatário de cada um), um erro `email.daily_cap_reached` aparece em Problemas, na área E-mail, e vai para o `ALERT_WEBHOOK_URL` quando configurado. Cada e-mail barrado gera um aviso `email.daily_cap_blocked` no log. Nenhum dos dois carrega o endereço.

## Descartado

- **Contador na memória de cada processo:** o site e o worker são processos separados; cada um teria o seu teto e a soma passaria.
- **Tabela no Postgres:** funciona, mas pede migração e uma transação por e-mail; o Redis já é compartilhado e tem contador com validade.
- **Janela móvel de 24 horas:** mais justa na teoria, mas difícil de explicar ("quando volta?"); o dia de calendário responde "amanhã".
- **Devolver a cota quando o Resend falha:** deixaria uma sequência de falhas e novas tentativas sem limite.
- **Fila de espera para todo e-mail barrado:** só os avisos têm fila própria hoje; criar outra para os demais é mudança maior do que o teto pede.
- **Trocar de provedor, ou usar o limite do próprio Resend:** fora do escopo; e o limite do provedor não avisa a equipe nem separa os e-mails de conta.
