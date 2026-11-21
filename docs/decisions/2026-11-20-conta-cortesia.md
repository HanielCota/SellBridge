# 2026-11-20: Conta cortesia (plano sem cobrança)

Acrescenta a [2026-11-18-planos-do-plano-mestre.md](2026-11-18-planos-do-plano-mestre.md) e a
[2026-11-19-mensalidade-pelo-asaas.md](2026-11-19-mensalidade-pelo-asaas.md): continuam os cinco
planos pagos, sem plano gratuito e sem período de teste para todos. A cortesia é uma exceção que a
equipe concede a uma conta, uma a uma.

- **Decisão (Guilherme, 20/11, chat da Central):** "É pra usar sem pagar, é a conta do cliente da
  stockshop". A primeira conta é a da StockShopp, dona do projeto, que também revende pelo
  SellBridge.
- **Plano aprovado (Guilherme, 20/11, chat da conta cortesia): "Ok, sem e-mail".**
  - **Quem concede:** só o perfil Administrador (permissão `billing.grant_courtesy`), na ficha do
    cliente no admin. Escolhe um dos cinco planos, a validade (um último dia ou sem data para
    acabar) e escreve o motivo, que é obrigatório. Pode mudar e retirar, sempre com motivo. O
    servidor recusa os outros perfis.
  - **Registro:** conceder, mudar e retirar ficam no registro de ações da equipe
    (`admin_audit_events`: quem, quando, plano, validade e motivo).
  - **O que a conta vê:** "Seu plano: X", com o selo "Cortesia, sem cobrança" e até quando vale.
    Não recebe o aviso de escolher plano nem de pagamento, e nada é criado no Asaas por causa dela.
    Passa pelos bloqueios de conectar loja e publicar anúncio com os limites do plano concedido.
  - **Fim da validade:** a partir de 7 dias antes, a conta vê o aviso no painel e na tela de
    assinatura, com o último dia, e a equipe vê a conta na fila de pendências dos clientes
    ("Cortesia acabando"). Vencendo, a conta fica sem plano como qualquer outra: não conecta loja
    nova nem publica anúncio novo, e nada do que está no ar é perdido. Sem e-mail.
  - **Conta que já paga:** ao conceder, a assinatura para de renovar no Asaas na hora (e o que
    estava aberto e não pago é fechado), sem devolução do mês já pago. Se o Asaas falhar, a
    cortesia não é concedida. Enquanto o mês pago ainda vale, a conta usa o maior dos dois planos.
    O admin mostra esse aviso antes de confirmar.
  - **Conta cortesia que quer assinar:** enquanto a cortesia vale, a tela não oferece assinar e o
    servidor recusa. Para outro plano, a equipe muda a cortesia. Depois que ela vence ou é
    retirada, a conta assina normalmente.
  - **Transição do lançamento:** a conta antiga com cortesia continua sem limites até o fim da
    transição, como as outras, só sem o aviso de escolher plano. Os limites do plano concedido
    valem depois.
  - **Antes do lançamento:** a cortesia pode ser concedida com a cobrança ainda desligada
    (`BILLING_UNLIMITED`) e passa a valer quando a cobrança começa.
- **Banco:** a migração `0103_billing_courtesies` cria a tabela `billing_courtesies` (uma linha por
  conta: plano, fim, motivo, quem concedeu) e acrescenta `courtesy` ao tipo `customer_issue_kind`.
  A cortesia fica fora de `billing_accounts`, que espelha o Asaas: nenhuma leitura do Asaas mexe
  nela. Retirar apaga a linha; o histórico é o registro de ações.
- **Descartado:**
  - lista de contas isentas no código ou em variável de ambiente (não é auditável e exige
    deploy para mudar);
  - gravar um plano "ativo" falso em `billing_accounts` (a próxima leitura do Asaas apagaria, e a
    tela mostraria uma assinatura que não existe);
  - cancelar a assinatura paga com devolução automática (devolução é dinheiro saindo: fica para a
    equipe decidir caso a caso, no Asaas);
  - deixar a conta assinar durante a cortesia, com a cobrança começando no fim dela (mais um
    caminho de cobrança para um caso raro);
  - e-mail no aviso de 7 dias (exigiria uma rotina diária nova).
