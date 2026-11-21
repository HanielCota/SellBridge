# 2026-11-20: Devolução de Pix ao revendedor é manual, pela equipe

## O que foi decidido

Quando o Asaas não devolve sozinho um pagamento feito por Pix ao fornecedor, a devolução é feita à mão por alguém da equipe do SellBridge, no Asaas. O sistema não tenta outro caminho automático. O trabalho do sistema é deixar o caminho manual claro:

- **Revendedor (tela do pedido):** a situação do pagamento diz que quem devolve é a equipe do SellBridge e mostra o botão "Pedir a devolução à equipe", que abre um chamado no suporte já com o assunto, o pedido e a primeira frase preenchidos. Se já existe chamado aberto sobre o pedido, o botão vira "Ver o chamado da devolução" e leva a ele. A tela mostra o último dia para pedir.
- **Equipe (Problemas):** o item diz "Devolução manual", o valor, como foi pago e a data-limite. Dentro dele há um guia: valor a devolver, para quem, de qual conta sai, o código da cobrança, o chamado do revendedor e o passo a passo no Asaas.
- **Prazo:** o Asaas guarda o valor por até 30 dias depois do pagamento. Depois disso ele é liberado ao fornecedor, e a devolução passa a depender do fornecedor.

## Por quê

O Asaas só devolve um pagamento quando a conta que recebeu tem o valor inteiro livre. No pagamento protegido, parte do valor sai da conta do fornecedor na hora (a taxa do SellBridge e a tarifa do Asaas) e o resto fica guardado até a entrega. No cartão a devolução sai normalmente; no Pix ela pode ser recusada. O sistema já tratava a recusa (marcava o pagamento e avisava em Problemas), mas a mensagem não dizia a ninguém o que fazer, e o revendedor lia que "a equipe vai falar com você" sem ter como pedir.

Devolver à mão, com chamado, é o que o mercado faz nesses casos, e evita que o SellBridge mova dinheiro por conta própria numa situação que precisa de conferência.

## Quem decidiu

Guilherme, em 20/11/2026, em call com o Haniel: "isso tem que ser manualmente" (a pessoa abre chamado e alguém resolve). Sobre deixar isso claro na tela e combinar quem olha: "pode ser assim se for a prática comum do mercado".

## O que foi descartado

- Devolução automática com o SellBridge completando o valor que falta na conta do fornecedor.
- Devolução automática por fora, com um Pix de volta ao revendedor.
- Botão para devolver pagamento em dobro (continua manual, fora deste trabalho).

## O que foi conferido na documentação do Asaas (20/11/2026)

- A devolução exige saldo livre no valor exato, não tem tarifa e pode ser pedida até 90 dias depois do recebimento.
- No painel, o caminho é Cobranças > Todas > abrir a cobrança > Solicitar estorno > Avançar > Solicitar estorno.
- A conta principal enxerga as contas dos fornecedores em Parceiros > Subcontas e pode transferir saldo para elas.

## O que ficou sem confirmar

- A documentação não mostra a conta principal entrando no painel da conta do fornecedor. O passo de pedir o estorno no painel pode depender do fornecedor ou do gerente da conta no Asaas.
- Liberar à mão o valor guardado aparece na documentação só como chamada de sistema da plataforma, não como botão do painel.
- O caminho inteiro não foi feito de ponta a ponta numa conta de produção.

## Junto, do mesmo passeio de testes

- Uma diferença de plano paga depois de trocada por outra passa a ser registrada em Problemas (antes o dinheiro entrava e ninguém era avisado).
- A tela de cancelar o plano avisa, antes de confirmar, que o que foi pago a mais para subir de plano não volta: só a primeira mensalidade, dentro dos 7 dias.
- A mensagem de envio já pago, no Asaas, diz que o valor está "protegido no Asaas", como nas outras telas.
