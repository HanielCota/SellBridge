# Planos e cobrança do SaaS

A página `/assinatura`, acessível pelo menu da conta, apresenta os planos Gratuito
(2 lojas / 25 anúncios), Pro (10 / 500) e Business (50 / 5.000). Os preços pagos são
obtidos dos preços cadastrados no Stripe, sem valores comerciais presumidos no código.
A assinatura pertence à organização; somente seu proprietário pode contratar ou acessar
as faturas, atualizar o cartão, trocar de plano e cancelar pelo Stripe Customer Portal.

## Ativação

1. Crie produtos Pro e Business no Stripe com preços fixos em BRL, recorrência mensal
   e quantidade unitária. Configure os limites comerciais conforme necessário em
   `packages/shared/src/domain/billing.ts` antes de divulgar os planos.
2. Defina `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PRO_PRICE_ID` e
   `STRIPE_BUSINESS_PRICE_ID` no ambiente do serviço web. Use chaves de teste inicialmente.
3. Ative o Customer Portal: atualização do cartão, download de faturas, cancelamento
   ao fim do período e mudança entre os dois preços cadastrados. Configure as opções
   de rateio e recuperação de pagamentos de acordo com sua operação comercial.
4. Cadastre `https://SEU_DOMINIO/api/webhooks/stripe` com os eventos
   `customer.subscription.created`, `updated`, `deleted`, `paused` e `resumed`.
   O segredo é específico desse endpoint. No desenvolvimento use
   `stripe listen --forward-to localhost:3000/api/webhooks/stripe`.
5. Execute `pnpm database:migrate` e reinicie o serviço web com as variáveis.

Sem a configuração completa, os planos aparecem como “Em breve”; não há checkout
nem imposição de novos limites sobre a operação existente. Em produção isso só é aceito
de propósito: com `NODE_ENV=production`, o serviço web não inicia se faltar alguma das
quatro variáveis, a menos que `BILLING_UNLIMITED=true` diga que a operação roda sem limites. Não há cartão de crédito
armazenado pelo SellBridge. A coleta do cartão e a cobrança mensal ficam no Stripe.

## Fluxo e regras

O Checkout cria uma assinatura recorrente para um customer exclusivo da organização.
A criação do customer é idempotente; requisições de checkout são serializadas por
organização, sessões abertas anteriores são expiradas e uma assinatura existente abre
o portal em vez de criar outra. O retorno de sucesso nunca libera um plano: somente
um webhook assinado sincroniza o estado confirmado pelo provedor.

O endpoint valida a assinatura com o corpo original e tolerância de tempo do SDK.
Os eventos são deduplicados em transação; há bloqueio por customer e consulta ao
estado atual no Stripe para lidar com retentativas e eventos fora de ordem. Falhas
respondem 500 para que o Stripe reenvie o evento. Eventos de clientes externos ao
SellBridge não alteram dados locais.

Apenas `active`, `trialing` ou `past_due`, com período vigente e preço conhecido, liberam
os limites pagos. Na inadimplência (`past_due`), o período vigente termina
`BILLING_PAST_DUE_GRACE_DAYS` dias (padrão 7) depois da renovação que falhou: o webhook grava
essa data em `period_end`, e o cliente vê o aviso "Pagamento da assinatura pendente" no painel
e em `/assinatura`, com o último dia. Depois disso, ou com `unpaid`, pausa ou término, valem os
limites gratuitos ("Pagamento da assinatura não realizado").
Cancelamento ao final do período preserva o plano até seu encerramento. Dados,
conexões e anúncios existentes não são removidos. Os limites impedem novas
conexões e novos anúncios; atualização de preço, reconexão de uma loja já ativa e
consulta de dados continuam disponíveis. A cota de anúncios conta **publicações vivas por loja
de destino**: um anúncio em duas lojas ocupa duas vagas; publicações com erro não contam (as de
lojas desconectadas continuam contando, porque voltam ao ar na reconexão). "Reprocessar"
pede vaga para cada publicação com erro que volta à fila. A criação via API e em lote usa a mesma
regra dos anúncios individuais. O bloqueio por organização evita ultrapassar limites
com requisições simultâneas.

Nenhuma chamada ao Stripe acontece com uma linha travada. O checkout cria o customer fora de
transação e serializa por organização com uma trava consultiva (`pg_try_advisory_xact_lock`),
que não segura linha: a publicação e a conexão de loja nunca esperam o Stripe; um segundo
clique enquanto o primeiro abre o pagamento recebe "Já estamos abrindo o pagamento". O webhook
lê o estado no Stripe antes da transação, e vale a leitura mais recente (`last_event_created`
guarda a hora da leitura em milissegundos). Toda chamada tem 5 s de limite e 1 retentativa.

## Validação antes de produção

No modo de teste do Stripe, contrate cada plano e confira a confirmação pelo webhook,
renovação, troca de plano, cartão recusado, recuperação do pagamento, faturas e
cancelamento ao fim do período. Reenvie eventos e altere a ordem das entregas.
Verifique também limites com requisições simultâneas e autorização com outro membro.
Os testes locais exercitam assinatura de webhook, estados de assinatura, isolamento,
deduplicação e limites; pagamentos reais dependem de uma conta Stripe configurada.

Referências: [Stripe Subscriptions](https://docs.stripe.com/billing/subscriptions/webhooks),
[Checkout](https://docs.stripe.com/api/checkout/sessions/create) e
[Customer Portal](https://docs.stripe.com/customer-management).

## Validação realizada

O relatório de configuração e teste integrado está em [billing-validation.md](billing-validation.md).
Para desenvolvimento local, use `pnpm billing:listen` antes de iniciar o aplicativo.
