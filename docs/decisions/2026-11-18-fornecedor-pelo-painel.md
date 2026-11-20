# 2026-11-18: O fornecedor trata os pedidos pelo painel (aposentar o link, etapa 1)

Guilherme aprovou em 18/11/2026 ("Aprovo todas", "Pode começar") a proposta de tirar o caminho duplicado do fornecedor: em vez do link do pedido (`/fornecedor/pedido/<token>`), o painel. Esta é a etapa 1; a etapa 2 (apagar a página do link, a geração de link no pedido do revendedor e as colunas do token) vem num PR separado, na data que ele escolher.

- **Fornecedor com painel** (`suppliers.organization_id` preenchido):
  - O e-mail do pedido leva para `/fornecedor/painel/pedidos?query=<número>`, sem link.
  - Um link antigo não abre mais o envio, nem para ler nem para mudar (`linkShipmentSource`, também na etiqueta): a página só diz o número do pedido e abre o painel, onde o login vem primeiro. Link vencido ou revogado continua "Link inválido".
  - O revendedor não gera, copia nem revoga link: o pedido diz que o fornecedor vê o envio no painel. O envio ainda nasce com um token, que não abre nada; ele sai na etapa 2.
- **Fornecedor cuidado pela equipe** (sem conta): o link continua igual, e a página e o e-mail do pedido oferecem "Criar meu acesso ao painel".
- **Convite** (`/fornecedor/convite/<token>`):
  - Assinado com `BETTER_AUTH_SECRET` (HMAC, `supplier-invite:` na frente), vale 14 dias e não fica guardado no banco. Sai da ficha do fornecedor no admin (por e-mail ao e-mail de pedidos, e para copiar) e da página do link.
  - Só liga o fornecedor a uma conta com o **e-mail confirmado igual ao e-mail de pedidos**, e só enquanto ele está ativo e não tem dono. Assim, um convite vazado sozinho não dá acesso a nada. A ligação usa o perfil de fornecedor da pessoa que ainda não tem marca; quem já criou outra marca é mandado ao suporte (juntar cadastros fica fora).
  - O cadastro de fornecedor e o login voltam ao convite depois da confirmação do e-mail (`redirect=/fornecedor/convite`), para a pessoa não cair em "Cadastre sua marca" e criar um fornecedor vazio. O convite fica guardado no navegador (`pending-invite.ts`), e não no endereço de volta, como manda a decisão do token fora das URLs. Em outro navegador, a página pede para abrir o convite de novo.
  - Bloqueado durante o "entrar como cliente".
- **Contagem:** a lista de fornecedores do admin mostra quantos ativos ainda não têm painel e filtra só esses (`?panel=none`).
- **Descartado:** convite guardado no banco, que daria para cancelar antes dos 14 dias (pediria migration); o fornecedor "assumir" a marca no passo "Cadastre sua marca" pelo e-mail, sem convite (mexeria na tela da marca e não teria a intenção da equipe).
- **Revisar se:** o segredo do Better Auth for trocado (os convites em aberto deixam de valer) ou se o fornecedor precisar de funcionários com acesso ao painel (hoje só o dono da conta).
