# 2026-11-20: Uma nota por venda quando o Bling do revendedor emite

**Decisão.** Enquanto o Bling do revendedor cuida da nota de venda de um pedido (venda à ordem), o SellBridge não aceita outra nota para o mesmo pedido, nem por chave digitada nem por XML:

- **O Bling está emitindo** (a rodada começou e não parou): recusa e pede para esperar. Se o Bling parar, o motivo aparece na tela e outra nota pode ser enviada.
- **A nota saiu do Bling e foi registrada:** recusa a troca. Para trocar, o revendedor cancela a nota no Bling e fala com o suporte.
- **O Bling parou depois de criar a nota:** o SellBridge pergunta ao Bling, na hora, em que situação ela está.
  - Autorizada: só aceita o XML dessa mesma nota.
  - Ainda na SEFAZ: recusa e pede para esperar a resposta.
  - Rejeitada, denegada, bloqueada, cancelada ou nunca enviada: aceita outra nota.
  - Se o Bling não responde: recusa e pede para tentar de novo.
- **O Bling parou antes de criar a nota:** aceita outra nota.

A recusa vale também dentro da gravação, com a linha da nota travada. Assim, uma rodada do Bling que comece no meio do envio também é vista.

**Por quê.** Duas notas autorizadas para a mesma venda obrigam o revendedor a cancelar uma delas e confundem a remessa do fornecedor, que cita a nota de venda. O revisor do PR #333 achou a brecha: o envio manual do XML não olhava o Bling. Ele sugeriu aceitar só a mesma chave quando o Bling já tem a nota. Essa sugestão não cobria a nota enviada à SEFAZ cuja chave ainda não voltou, por isso a regra acima pergunta ao Bling.

**Quem decidiu.** Pedido do Guilherme, repassado pela Central do SellBridge em 20/11/2026 ("a trava contra duas notas na mesma venda"). A regra de cada situação foi proposta pelo chat da nota.

**Descartado.**

- Aceitar só a mesma chave quando ela já está gravada. Não cobre a nota que está na SEFAZ.
- Guardar a situação do Bling numa coluna nova. Pede migração, e a pergunta ao Bling na hora do envio já resolve.
