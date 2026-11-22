# 2026-11-18: Planos do plano mestre: cinco pagos, sem plano grátis

O cliente mandou no plano mestre (PDF de outubro) cinco planos pagos: Start R$ 97, Pro R$ 197, Business R$ 397, Black R$ 697 e Elite R$ 997, e no áudio 1 a taxa de 4% para a plataforma. Guilherme, 18/11: "Vamos de A1" (seguir o cliente: cinco planos pagos, sem plano grátis, sem teste grátis, mensalidade e taxa juntas). A tabela de limites e a transição foram aprovadas no mesmo dia ("Aprovo, pode seguir"). Substitui os três planos de 2026-10-16 (Gratuito, Pro, Business) e fecha a pendência D10.

- **O que cada plano libera:** só lojas e anúncios mudam (3/300, 5/1.000, 10/3.000, 20/8.000, 40/20.000), mais o atendimento prioritário no Elite, o único recurso por plano que o cliente citou. Os números são proposta nossa; nada que ainda não existe entra na venda. Equipe do lojista e IA ficam fora até existirem.
- **Sem plano:** não conecta loja nova nem publica. Pedidos, anúncios no ar e sincronização continuam: o plano nunca para uma venda.
- **Transição:** quem já usava antes do lançamento fica sem limites até a data de fim (30 dias recomendados), com aviso no painel. Datas em variável de ambiente, sem migração; produção não liga a cobrança sem elas.
- **Troca de plano:** pela confirmação do portal do Stripe, que mostra o novo valor. Subir vale na hora; descer, no fim do período (configuração do portal).
- **Fornecedor:** não paga plano; o plano só limita lojas e anúncios do revendedor.
- **Descartado:** plano grátis (o cliente nunca pediu); bloquear a conta inteira ou deixá-la só leitura depois da transição (pararia pedidos do fornecedor e do comprador); a cortesia por conta no admin (fica para quando for pedida).
