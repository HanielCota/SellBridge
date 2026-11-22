# 2026-11-20: Nota de venda do revendedor emitida pelo Bling dele

Na venda à ordem, o revendedor que vende como empresa pode conectar o próprio Bling, e o SellBridge emite a nota de venda dele para o comprador (nota 1) por lá. Aprovado pelo Guilherme em 20/11/2026 ("Aprovo"), junto com os códigos fiscais editáveis e a regra do cartão. A parte 6 do plano de 18/11/2026 entrou no MVP em 19/11/2026 ("é bom incluir no mvp").

- **Escolha do revendedor:** "Como você emite a nota de venda?":
  - **No meu sistema (envio o XML):** o padrão, que já existia (decisão de 19/11/2026, `2026-11-19-xml-da-nota-do-revendedor.md`).
  - **Pelo meu Bling (automático).** Vale para as parcelas criadas depois que ele liga a opção. As anteriores seguem esperando a nota como antes.
- **Conexão:** o mesmo aplicativo do SellBridge no Bling que o fornecedor usa, com a conta do revendedor. Os tokens ficam cifrados, como os do fornecedor, e o revendedor desconecta quando quiser.
- **Como a nota é feita:**
  - É criada direto no Bling (`POST /nfe`), sem pedido de venda, e enviada à SEFAZ (`POST /nfe/{id}/enviar`).
  - O comprador entra como contato, com o CPF ou CNPJ e o endereço do pedido.
  - Cada item leva o NCM, a origem e a unidade do cadastro fiscal do produto do fornecedor, com o preço que o comprador pagou.
  - Leva também a natureza de operação de venda escolhida pelo revendedor e o CFOP: 5120 no mesmo estado e 6120 fora dele, comparando o estado do revendedor com o do comprador.
  - O intermediador é o Mercado Livre (CNPJ 03.007.331/0001-41, da página "Importar nota fiscal" do Mercado Livre), com o apelido do comprador.
- **Editável:** a natureza, os dois CFOPs, o CNPJ do intermediador e as formas de pagamento vêm preenchidos com o padrão e ficam editáveis na tela do revendedor, porque quem decide a parte fiscal é o contador dele.
- **Cartão (NT 2025.001, em vigor desde 01/09/2025):** a venda paga com cartão leva na nota a bandeira, o código de autorização e o CNPJ do Mercado Livre. Pix não leva.
  - No Bling, a bandeira fica na forma de pagamento cadastrada pelo revendedor. A nota recebe essa forma e o código de autorização do pagamento no Mercado Livre.
  - O SellBridge liga cada forma do Bling do revendedor pelo tipo e pela bandeira, e o revendedor pode mudar a ligação.
  - Se faltar a forma de um pagamento, a nota daquele pedido não sai, e o cartão diz qual forma criar no Bling. O SellBridge não cria nada no Bling do revendedor.
- **Sem nota em dobro:** o pedido de criação fica marcado antes da chamada e a nota leva uma referência própria. Numa nova tentativa, o SellBridge procura a nota pendente antes de criar outra, como já faz na remessa do fornecedor.
- **Depois de autorizada:** o SellBridge baixa o XML no Bling do revendedor (`GET /nfe/documento/{chave}`) e manda ao Mercado Livre pelo mesmo caminho do envio do XML. A partir daí as notas do fornecedor e a etiqueta seguem como já seguiam.
- **Quando dá errado:** a recusa do Bling, da SEFAZ ou do Mercado Livre aparece no cartão "Sua nota de venda" em português, com "Tentar de novo". O envio do XML à mão continua disponível.
- **Testes:** só com um Bling e um Mercado Livre falsos.
- **Antes de ligar para todos:** a primeira nota real sai numa conta de teste de um revendedor, com o ok do Guilherme. Antes disso, o app do SellBridge precisa ter, no painel de desenvolvedor do Bling, os escopos de Notas Fiscais (criar e enviar), Naturezas de Operação e Formas de Pagamento.
- **Descartado:**
  - pedido de venda com nota gerada a partir dele: mexe no estoque e no financeiro do Bling do revendedor sem necessidade;
  - o SellBridge criar formas de pagamento no Bling do revendedor: mudaria a configuração da conta dele.
- **Fora desta etapa:** frete e desconto na nota (os itens saem pelo preço que o comprador pagou); outros marketplaces, que seguem com a chave digitada.
