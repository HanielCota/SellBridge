# Planos e cobrança do SaaS

A página `/assinatura`, acessível pelo menu da conta, apresenta os cinco planos pagos do plano
mestre do cliente (decisão de 18/11/2026): não há plano gratuito nem período de teste. A
mensalidade é cobrada pelo Asaas, na conta do SellBridge (decisão de 19/11/2026,
[docs/decisions/2026-11-19-mensalidade-pelo-asaas.md](decisions/2026-11-19-mensalidade-pelo-asaas.md)).

| Plano    | Preço      | Lojas | Anúncios | Extra                                     |
| -------- | ---------- | ----- | -------- | ----------------------------------------- |
| Start    | R$ 97/mês  | 3     | 300      |                                           |
| Pro      | R$ 197/mês | 5     | 1.000    |                                           |
| Business | R$ 397/mês | 10    | 3.000    |                                           |
| Black    | R$ 697/mês | 20    | 8.000    |                                           |
| Elite    | R$ 997/mês | 40    | 20.000   | Atendimento prioritário (resposta em 8 h) |

Preços e limites ficam em `packages/shared/src/domain/billing.ts` (`BILLING_PLANS`). O resto do
sistema é igual em todos os planos. A taxa do SellBridge (4% do preço dos produtos, fixa no código)
sai da parte do fornecedor em cada pagamento e não aparece para o revendedor. A assinatura pertence à organização; somente seu
proprietário pode assinar, pagar, trocar de plano, trocar a forma de pagamento e cancelar. Durante
o acesso da equipe como cliente, essas ações ficam bloqueadas.

## Sem plano e transição

- **Sem plano** (conta nova, assinatura cancelada ou mensalidade não paga depois da carência):
  não conecta loja nova nem publica anúncio novo. Pedidos, anúncios já no ar, estoque, preço e
  reconexão de loja continuam. A tela de lojas e o início da conexão mandam para `/assinatura`
  antes da página de consentimento do marketplace.
- **Transição:** contas criadas antes de `BILLING_LAUNCHED_AT` continuam sem limites até
  `BILLING_TRANSITION_ENDS_AT` (30 dias recomendados). O painel ("Precisa de você") e a página
  avisam com o último dia; nos 7 dias finais o aviso fica vermelho.
- **Atendimento prioritário:** o chamado de uma conta Elite abre como prioridade alta (urgente
  continua urgente).

## Conta cortesia (plano sem cobrança)

A equipe pode conceder a uma conta um dos cinco planos sem cobrança (decisão de 20/11/2026,
[docs/decisions/2026-11-20-conta-cortesia.md](decisions/2026-11-20-conta-cortesia.md)).

- **Onde:** na ficha do cliente em `/admin/clientes`, cartão "Plano sem cobrança". Só o perfil
  Administrador concede, muda e retira (`billing.grant_courtesy`); o motivo é obrigatório e tudo
  fica no registro de ações da equipe.
- **Validade:** até o fim de um dia escolhido (horário de Brasília) ou sem data para acabar. A
  partir de 7 dias antes, a conta vê o aviso com o último dia e a equipe vê a conta em "Cortesia
  acabando", na fila de pendências. Vencendo, a conta fica sem plano; o que está no ar continua.
- **Limites:** os do plano concedido, nos mesmos bloqueios de conectar loja e publicar anúncio. O
  Elite por cortesia também tem atendimento prioritário.
- **Cobrança:** nada é criado no Asaas por causa da cortesia. Se a conta já paga um plano, a
  assinatura para de renovar ao conceder (sem devolução do mês pago; se o Asaas falhar, nada é
  concedido) e a conta usa o maior dos dois planos até o mês pago acabar. Enquanto a cortesia vale,
  a conta não assina: para outro plano, a equipe muda a cortesia.
- **Lançamento:** a cortesia pode ser concedida com a cobrança desligada e passa a valer quando ela
  começa. Durante a transição, a conta antiga continua sem limites e sem o aviso de escolher plano.
- **Onde fica:** tabela `billing_courtesies`, separada de `billing_accounts` (que espelha o Asaas).
  Retirar apaga a linha; o histórico é `admin_audit_events`.

## Formas de pagamento

- **Cartão de crédito:** renova sozinho. O lojista vai ao Checkout recorrente do Asaas, que só
  aceita cartão; o cartão é digitado na página do Asaas e nunca passa pelo SellBridge. Quando os
  dados de cobrança têm endereço completo e celular, a página já abre preenchida.
- **Pix:** uma assinatura do Asaas com Pix. Todo mês o Asaas gera a cobrança e manda o Pix por
  e-mail; o lojista paga a cada mês (o Pix Automático é outro produto e ficou de fora).
- **Boleto:** não é oferecido.

"Trocar forma de pagamento" vale a partir da próxima mensalidade: cartão para Pix muda a mesma
assinatura; Pix para cartão (ou um cartão novo) abre um Checkout cuja primeira cobrança é a próxima
mensalidade, e a assinatura antiga é encerrada quando a nova aparece. O mês já pago continua valendo
(`prepaid_until`).

## Troca de plano

- **Subir:** o lojista paga uma cobrança avulsa com a diferença de preço proporcional aos dias que
  faltam até a próxima mensalidade (Pix ou cartão, pela forma que ele usa). O plano novo vale quando
  ela é paga; a assinatura passa a cobrar o preço novo a partir da próxima mensalidade. Se a
  diferença for menor que R$ 5,00 (o mínimo do Asaas), o plano muda na hora, sem cobrança.
- **Descer:** agendado. A próxima mensalidade já sai com o preço menor e o plano menor começa no dia
  dela; até lá, continua o maior. Escolher de novo o plano atual cancela o agendamento.
- Antes de confirmar, a página mostra o valor da diferença ou a data em que o plano menor começa.

## Atraso, aviso e cancelamento

- A mensalidade vence no dia; o plano vale até o fim desse dia. Se o Asaas marca a cobrança como
  vencida, o plano continua por `BILLING_PAST_DUE_GRACE_DAYS` dias (padrão 5, o do contrato do
  revendedor; mensalidade vencida antes de 01/12/2026 fica com pelo menos os 7 de antes) a partir do
  vencimento, com o aviso "Pagamento da assinatura pendente" no painel e em `/assinatura`, com o
  último dia e o botão "Pagar agora" (abre a fatura do Asaas). Depois disso a conta fica sem plano;
  a assinatura não é cancelada e, se o lojista pagar, o plano volta.
- O Asaas manda por e-mail cada cobrança e os lembretes (notificações ligadas no cliente).
- Cancelar encerra a assinatura no Asaas; o mês pago vale até o fim, sem devolução proporcional, e
  nada renova. Assinar de novo durante esse mês começa a cobrar quando ele acaba.
- A primeira mensalidade da conta cancelada em até 7 dias depois de paga é devolvida inteira pelo
  estorno do Asaas, e o plano acaba na hora (dia 7 devolve, dia 8 não). Mensalidades seguintes,
  diferenças de troca de plano e a primeira mensalidade de uma nova assinatura não são devolvidas.
- Excluir a conta cancela no Asaas, sem devolução, a assinatura e o que estiver em aberto antes de
  apagar qualquer dado; se o Asaas falhar, nada é apagado. A tela avisa os dias pagos que a conta
  perde e oferece "Só cancelar o plano". Os pagamentos já feitos ficam no Asaas como registro.

## Como o estado é lido

O SellBridge nunca libera um plano pelo retorno do pagamento: o webhook
`POST /api/webhooks/asaas-assinatura` (conferido pelo `asaas-access-token`) só diz qual assinatura
ou cobrança mudou, e o estado é relido no Asaas (assinatura e cobranças). Avisos repetidos são
aplicados uma vez (`billing_events`) e uma leitura mais antiga nunca sobrescreve uma mais nova
(`last_event_created`). O webhook responde 200 após processar o aviso e 503 se não conseguir consultar ou aplicar o estado. O Asaas tenta entregar o aviso novamente e pausa a fila depois de 15 falhas
seguidas. Para um aviso perdido não custar um plano pago, a página `/assinatura` relê o Asaas
sempre que há pagamento esperando ou a mensalidade está a menos de 2 dias.

Mudanças da assinatura são serializadas por organização com uma trava consultiva
(`pg_try_advisory_xact_lock`), que não segura linha: a publicação e a conexão de loja nunca esperam
o Asaas. A trava usa um pool PostgreSQL separado e limitado a duas conexões por processo web.
Ao excluir a conta, a assinatura e o cliente no Asaas são removidos antes de qualquer dado.

A criação de cobrança, assinatura Pix ou checkout grava primeiro uma reserva em
\`billing_accounts.pending_reference\` (\`creating:<id>\`). A referência externa na operação do
Asaas inclui o mesmo ID. Se a confirmação se perder, o suporte deve reconciliar a operação no
Asaas e registrar o recurso identificado ou confirmar que a criação falhou antes de liberar
nova tentativa.

## Lançamento

1. Na conta do SellBridge no Asaas (produção), confirme que ela emite cobranças com Pix e cartão e
   que o Checkout está liberado.
2. Em Minha Conta > Informações, cadastre o site `https://app.sellbridge.com.br`: sem ele o Asaas
   recusa o endereço de volta da cobrança da diferença (ela sai sem a volta automática) e do
   Checkout com cartão (que exige um endereço https).
3. Em Minha conta > Configurações de cobrança, mude a geração das cobranças de assinatura de 40
   para **7 dias** antes do vencimento: o Pix do mês chega perto da data.
4. Em Integrações > Webhooks, cadastre `https://SEU_DOMINIO/api/webhooks/asaas-assinatura`, com o
   mesmo token de `ASAAS_WEBHOOK_TOKEN`, envio sequencial, e os eventos de cobrança
   (`PAYMENT_CREATED`, `PAYMENT_CONFIRMED`, `PAYMENT_RECEIVED`, `PAYMENT_OVERDUE`,
   `PAYMENT_DELETED`, `PAYMENT_RESTORED`, `PAYMENT_REFUNDED`), de assinatura (`SUBSCRIPTION_*`) e
   de checkout (`CHECKOUT_PAID`).
5. Devoluções (primeira mensalidade em até 7 dias): o Asaas trata o estorno pela API como ação
   crítica e o deixa esperando autorização (sandbox, 19/11/2026). Configure a autorização das ações
   críticas da integração (Integrações > Segurança) ou aprove cada devolução no painel. Enquanto
   espera, o SellBridge já considera a mensalidade devolvida e o plano encerrado.
6. No serviço web (Coolify), defina `ASAAS_API_KEY`, `ASAAS_WALLET_ID`, `ASAAS_WEBHOOK_TOKEN`
   (`ASAAS_API_URL` fica no padrão de produção), `BILLING_LAUNCHED_AT` e
   `BILLING_TRANSITION_ENDS_AT` (ISO 8601 em UTC, por exemplo `2026-12-01T03:00:00Z` para a
   meia-noite de Brasília), e retire `BILLING_UNLIMITED`.

Sem a conta do Asaas e as duas datas, os planos aparecem como "Em breve" e não há limite sobre a
operação. Em produção isso só é aceito de propósito: o serviço web não inicia sem essas variáveis,
a menos que `BILLING_UNLIMITED=true` diga que a operação roda sem limites. As chaves do Asaas
sozinhas não ligam a cobrança dos planos: elas também servem ao repasse com proteção dos
fornecedores.

**Depois do lançamento, não volte a `BILLING_UNLIMITED=true` com assinaturas ativas.** O modo sem
limites desliga a cobrança só do lado do SellBridge: as assinaturas que já existem no Asaas
continuam gerando cobranças todo mês, e as ações da tela de assinatura (cancelar, trocar de plano,
trocar a forma de pagamento) ficam fora do ar. Antes de ligar esse modo, cancele as assinaturas no
painel do Asaas e avise os revendedores.

**Nota da mensalidade:** o Asaas emite NFS-e automática por assinatura
(`POST /v3/subscriptions/{id}/invoiceSettings`), com a conta habilitada para notas e o serviço
municipal configurado. Ainda não está ligado: fica para uma próxima entrega.

## Validação antes de produção

No sandbox do Asaas: assinar cada forma de pagamento, subir de plano pagando a diferença, descer
(agendamento), atrasar (o sandbox não vence cobranças sozinho: o estado vencido é testado nos
testes automáticos), trocar a forma de pagamento e cancelar. O Checkout com cartão tem reCAPTCHA:
o pagamento de teste é feito por uma pessoa. Os testes automáticos nunca chamam o Asaas real.

Referências: [Assinaturas](https://docs.asaas.com/docs/assinaturas),
[Atualizar assinatura](https://docs.asaas.com/reference/atualizar-assinatura-existente),
[Checkout recorrente](https://docs.asaas.com/docs/checkout-com-assinatura-recorrente),
[Eventos de assinatura](https://docs.asaas.com/docs/eventos-para-assinaturas) e
[NFS-e de assinaturas](https://docs.asaas.com/docs/emitir-notas-fiscais-automaticamente-para-assinaturas).
