# 2026-11-23: Nota fiscal (NFS-e) da mensalidade emitida pelo Asaas no pagamento

**Decisão:** cada mensalidade paga dos planos ganha a sua nota fiscal de serviço, emitida pelo Asaas na conta do SellBridge. Guilherme, 23/11/2026, ao aprovar o plano: "Pode seguir".

- **Quando a nota sai:** quando o pagamento é confirmado (`effectiveDatePeriod: ON_PAYMENT_CONFIRMATION`), nunca antes. Pix não pago e cartão recusado não geram nota.
- **Onde é ligada:** ao criar a assinatura por Pix; ao vincular a assinatura do cartão, que só chega ao SellBridge depois do primeiro pagamento; e ao trocar de plano, para a nota dizer o plano novo ("Assinatura SellBridge, plano Pro").
- **Mensalidade já paga antes de a nota ser ligada:** no Asaas de teste (23/11), uma cobrança paga antes da configuração não ganha nota sozinha. Por isso, na primeira vez que a nota é ligada numa assinatura, o SellBridge agenda a nota de cada cobrança já paga que ainda não tem nota. Nas vezes seguintes não agenda nada (o Asaas cuida), para nunca sair nota em dobro. Duas tentativas ao mesmo tempo na mesma assinatura não acontecem: uma trava no banco deixa só uma rodar.
- **Endereço:** o Asaas recusa a nota se o cliente dele não tiver e-mail, endereço e CEP (Asaas de teste, 23/11). Antes de ligar a nota, o SellBridge copia o e-mail do dono e o endereço de cobrança da conta para o cliente no Asaas.
- **Dados fiscais do contador:** só por variáveis de ambiente `ASAAS_INVOICE_*` (lista em `docs/billing.md`), nunca no código.
- **Sem os dados (o contador ainda não passou):** a nota fica desligada, a assinatura segue normal e cada assinatura nova deixa um aviso (`billing.invoice_not_configured`). Assim a entrega vai ao ar antes dos dados e liga sozinha quando eles entram.
- **Dados pela metade ou com erro de digitação** (ex.: `2,5` em vez de `2.5`): a nota também fica desligada, o site continua no ar e vai um erro para Problemas e o Discord (`billing.invoice_config_invalid`) dizendo qual variável corrigir. Não derruba o site, porque a cobrança já está no ar e uma variável fiscal errada não pode parar as vendas.
- **Asaas recusa:** a assinatura continua valendo, e o motivo do Asaas vai para Problemas e o Discord (`billing.invoice_settings_failed`).
- **Quem assinou antes de os dados entrarem:** um script de uma vez só, que pode rodar de novo sem efeito duplicado (`docs/billing.md`, "Nota da mensalidade").

## Descartado

- **Emitir a nota antes do pagamento** (no vencimento ou dias antes): sairia nota de mensalidade que não foi paga.
- **Recusar iniciar o site com dados fiscais incompletos,** como acontece com as chaves do Asaas: um erro de digitação no Coolify derrubaria o site com a cobrança no ar.
- **Rodar a correção das assinaturas antigas sozinha a cada deploy:** com mais de uma cópia do site no ar, duas poderiam agendar a mesma nota. O script roda uma vez, por uma pessoa, quando os dados estiverem prontos.
- **Botão no painel de admin para essa correção:** é uma tela para usar uma vez; não compensa.
