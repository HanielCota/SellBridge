# 2026-11-18: NF-e em venda à ordem (modelo B), com a nota do revendedor

Pedido do cliente em 18/11/2026 (Carlos, StockShopp): "A nota tem que sair para o revendedor, o cliente final quem tem que emitir a nota é o revendedor." Decisão do Guilherme no mesmo dia: "B agora, com o Bling do revendedor"; plano revisto aprovado com "Aprovo, pode começar". Substitui, para quem vende como empresa, o modelo A de 2026-11-10 (que continua para quem vende com CPF).

- **Três notas a cada entrega, nesta ordem** (Portaria SRE 41/2023 da SEFAZ-SP, que aplica o art. 40 do Convênio SINIEF s/nº de 1970; CFOPs do Ajuste SINIEF 3/2024):
  1. revendedor → comprador, venda, 5120/6120, com o marketplace como intermediador;
  2. fornecedor → comprador, remessa por conta e ordem, 5923/6923, a nota que vai na caixa, citando a nota 1;
  3. fornecedor → revendedor, venda à ordem, 5119/6119 (5118/6118 para produção própria), citando a chave da nota 2.
- **A nota 1 é do revendedor, feita onde ele já emite.** O cliente contou (18/11, 21:10) que muitos revendedores usam o UpSeller, que emite a NF-e e manda ao marketplace sozinho, mas não tem API pública documentada. Então o SellBridge lê a nota no pedido do marketplace (Mercado Livre: `GET /shipments/{id}/invoice_data`; Shopee: `invoice_data` do `get_order_detail`, quando o conector entrar) ou o revendedor cola a chave de 44 números no pedido. Só vale nota modelo 55 com o CNPJ do revendedor. Conectar o Bling do revendedor para o SellBridge emitir a nota 1 fica como opção, numa parte posterior.
- **Quem vende com CPF continua no modelo A** (decisão 8, "Vamos de A"): pessoa física não emite NF-e; no Mercado Livre ela usa a DC-e, e a nota do fornecedor só acompanha a caixa. Trocar CPF por CNPJ no cadastro leva ao modelo B. O painel e o cadastro sugerem abrir um MEI, sem travar nada. Emitir a DC-e pelo SellBridge é outra tarefa.
- **Cadastro fiscal da empresa do revendedor:** inscrição estadual (ou isenta), regime e cidade com o código do IBGE (parte 1).
- **A etiqueta espera as notas** (parte 5): no Mercado Livre, a etiqueta das logísticas drop_off e cross_docking só sai depois da nota importada, e a nota precisa ser do CNPJ do vendedor (`invalid_sender_cnpj`).
- **Risco a testar antes de ligar para todos:** o Mercado Livre recusa nota cujo CEP de quem emite difere do CEP de origem do envio (`wrong_sender_zipcode`). Na venda à ordem a nota 1 tem o CEP do revendedor e o pacote sai do fornecedor. Um pedido real de teste decide.
- **O que cada contador confirma:** o valor da nota 2; se o CFOP de cada nota segue o estado do comprador ou do revendedor; se MEI pode ser o revendedor; o texto da natureza de operação no estado de cada um. Ficam como configuração, para mudar sem código.
- **Descartado:** ler a nota direto do UpSeller (sem API documentada) e o modelo A para empresa (o Mercado Livre e a Shopee recusam nota de outro CNPJ).
