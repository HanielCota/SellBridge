# 2026-11-21: Regras de cadastro dos contratos

**O que foi decidido.** A seção 3 da lista do cliente com o que os contratos de Fornecedor e de Vendedor exigem (recebida em 20/11/2026) entra no sistema em quatro partes, todas atrás de uma única chave, "Regras de cadastro dos contratos" (Configurações da equipe), **desligada** até o Guilherme ligar. Os contratos ainda esperam o advogado.

1. **Fornecedor novo só ME, EPP ou maior.** A consulta de CNPJ que já existe (BrasilAPI, dados abertos da Receita) passa a guardar o porte. O sistema lê `opcao_pelo_mei` (MEI) e `codigo_porte` (01 micro, 03 pequeno porte, 05 demais, 00 não informado; layout oficial `cnpj-metadados.pdf` da Receita, lido em 21/11/2026). Com a chave ligada:
   - MEI é recusado na hora, com o motivo no painel;
   - porte não informado vai para a equipe;
   - consulta fora do ar continua tentando por 1 hora e depois vai para a equipe, como antes;
   - nunca há aprovação sem saber o porte.

   A conta de recebimento (Asaas) só abre no CNPJ de empresa que não seja MEI, então pessoa física não entra como fornecedor. A Receita atualiza os dados uma vez por mês: por isso a equipe pode aprovar um recusado que prove ter saído do MEI ("Aprovar mesmo assim" na ficha).

2. **Revendedor com CPF precisa ter 18 anos ou mais.** O sistema pede a data de nascimento. Nome oficial (vai na nota) e nome fantasia (aparece nas telas) ficam separados.
3. **Aviso de 72 horas para o fornecedor atualizar os dados**, com suspensão automática se ele não atualizar. Fornecedor MEI ou sem CNPJ que já estava cadastrado ganha um prazo de 30 dias para se adequar. A suspensão segura pedidos novos (estoque zero nos anúncios), não apaga nada e sai sozinha quando os dados passam. Ela é uma só, compartilhada com o chat do aceite do contrato.
4. **Orientação de endereços no marketplace**, na tela Lojas: o endereço principal é o do revendedor; coleta e devolução usam o do fornecedor.

**Por quê.** É o que o contrato exige ("Fornecedor: só empresa do Simples para cima"). O sistema está em produção com usuários, e ninguém já cadastrado pode ser bloqueado de surpresa: com a chave desligada nada muda, e quem já estava aprovado continua aprovado.

**Quem decidiu.** Guilherme, 21/11/2026: "Faz o que tiver de código aí com aquela lista", e, sobre o plano, "Aprovo os quatro", com os prazos sugeridos (30 dias e 72 horas).

**Descartado.**

- Serpro Consulta CNPJ: oficial e em tempo real, mas pago e com contrato.
- Decidir só pelo porte: o MEI também é microempresa no porte, então só o porte não separa o MEI.
- Bloquear na hora fornecedores antigos.
- Conferir a idade pelo CPF: o número não traz a data de nascimento. A conferência com documento e selfie é do aceite eletrônico (seção 1).
