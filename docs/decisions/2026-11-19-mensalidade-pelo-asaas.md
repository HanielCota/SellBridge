# 2026-11-19: Mensalidade dos planos pelo Asaas

Substitui a cobrança pelo Stripe de [2026-11-18-planos-do-plano-mestre.md](2026-11-18-planos-do-plano-mestre.md).
Continuam valendo os cinco planos, os limites, a transição de 30 dias, subir na hora e descer na
próxima mensalidade.

- **Decisão (Guilherme, 19/11, chat da Central):** "Sim, troca pro Asaas". A mensalidade passa a
  ser cobrada pelas assinaturas do Asaas, seguindo a decisão de 18/11 ("vai ser somente asaas para
  pagar"). Pix e cartão; o boleto fica fora, como nas vendas.
- **D1, subir de plano (Guilherme: "Sim, as duas", opção A):** a API do Asaas não calcula o valor
  proporcional (a documentação manda calcular, emitir uma cobrança avulsa e atualizar a
  assinatura). Ao subir, o SellBridge cobra a diferença de preço proporcional aos dias que faltam
  numa cobrança avulsa; o plano novo vale quando ela é paga, e a assinatura cobra o preço novo da
  próxima mensalidade em diante. Abaixo de R$ 5,00 (mínimo do Asaas) o plano muda sem cobrança.
- **D2, Pix (mesma resposta):** cartão que renova sozinho pelo Checkout recorrente do Asaas (que só
  aceita cartão), ou Pix pago todo mês pela assinatura via API. O Pix Automático fica fora.
- **Descer de plano:** a assinatura já cobra o preço menor na próxima mensalidade
  (`updatePendingPayments`) e o plano menor começa nesse dia.
- **Atraso:** carência de 7 dias a partir do vencimento; depois, sem plano, sem cancelar a
  assinatura.
- **Lançamento:** a geração das cobranças da assinatura passa de 40 para 7 dias antes do
  vencimento na conta do Asaas (passo em `docs/billing.md`).
- **Nota da mensalidade:** o Asaas emite NFS-e por assinatura (`invoiceSettings`); registrado, fora
  do escopo.
- **Cancelar e excluir (Guilherme, 19/11: "Sim, manda assim").** Valem só para o revendedor; o
  fornecedor não paga plano.
  - **Cancelar o plano:** a assinatura para de renovar e o lojista usa o plano até o fim do mês já
    pago, sem devolução proporcional.
  - **Primeira mensalidade cancelada em até 7 dias** depois de paga: devolução integral pelo estorno
    do Asaas, e o plano acaba na hora (dia 7 devolve, dia 8 não). Não vale para as mensalidades
    seguintes, para a diferença de troca de plano nem para a primeira mensalidade de uma nova
    assinatura: o dia do primeiro pagamento da conta fica guardado (`first_paid_on`).
  - **Excluir a conta:** antes de apagar qualquer coisa, cancela no Asaas a assinatura e o que
    estiver em aberto (o Pix não pago, a diferença de uma troca de plano, o checkout do cartão).
    Se o cancelamento falhar, nada é apagado. Sem devolução. Antes de confirmar, a tela avisa "Você
    ainda tem N dias pagos do plano X. Se excluir a conta agora, perde esses dias." e oferece
    "Só cancelar o plano".
  - **Pagamentos já feitos** ficam no Asaas como registro do que a SellBridge recebeu; no nosso
    banco, nada liga esses pagamentos à pessoa depois da exclusão.
- **Stripe:** "Sim, remove", num PR separado, depois deste. Neste, o Stripe deixa de vender planos.
- **Descartado:** opção B (subir sem cobrar o proporcional: o lojista ganharia o resto do mês no
  plano maior) e opção C (recomeçar o ciclo no dia da troca: o lojista pagaria duas vezes no mesmo
  mês); coletar o cartão em tela própria (traria o cartão para o servidor do SellBridge).
