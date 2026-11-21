# 2026-11-21: Operação e indicadores dos contratos

Os contratos de Fornecedor e de Vendedor (lista do cliente de 20/11/2026) pedem horário de corte por marketplace, código de rastreio em até 2 horas, indicadores dos últimos 30 dias e devolução em 5 dias úteis. O Guilherme aprovou o plano em cinco partes em 21/11/2026 ("Aprovo os quatro"). Cada parte nasce atrás de uma chave desligada nas Configurações do admin. As penalidades com multa em dinheiro esperam o advogado e ficam de fora.

## Parte 1: dias úteis com feriados e horário de corte

- **Dias úteis:** de segunda a sexta, no horário de Brasília, sem os feriados nacionais. Entram Carnaval (segunda e terça), Sexta-feira Santa e Corpus Christi, porque bancos e transportadoras fecham neles (Guilherme, 21/11/2026). Feriado estadual e municipal fica de fora: a cidade de um fornecedor não é a de outro. Os feriados são calculados no código (Páscoa pelo algoritmo de Meeus), sem lista para manter nem biblioteca nova.
- **Horário de corte:** Mercado Livre 14h30, Shopee 13h e TikTok Shop 18h, editáveis na tela de Configurações. A venda que chega ao fornecedor antes do horário é postada até o fim daquele dia útil. A que chega no horário exato ou depois, até o fim do próximo dia útil.
- **A data do marketplace manda:** quando o marketplace manda a data de postagem, vale a dele. O Mercado Livre já aplica o horário de corte da loja na data dele. O horário de corte só preenche o prazo do pedido que chega sem essa data. Shopee e TikTok ainda não operam: o horário deles fica só na configuração.
- **Quando o relógio começa:** no mesmo momento dos prazos do fornecedor, ou seja, no encaminhamento ou no pagamento, quando o admin exige pagamento antes de preparar.
- **Quem fica de fora:** fornecedor operado pela equipe e pacote do Mercado Livre Full, que o fornecedor não posta.
- **Chave:** desligada por padrão. Ao ligar, vale só para os pedidos criados daí em diante. Os que já estão com o fornecedor seguem com o prazo de antes, como nas regras de recebimento.
- **Com a chave ligada**, a data do corte toma o lugar do prazo em horas do próprio fornecedor nos pedidos sem data do marketplace. Ela aparece em todos os lugares que já mostravam a data do Mercado Livre:
  - "Postar até" no painel do fornecedor;
  - "Despacho atrasado" na fila e nos avisos;
  - o termômetro do fornecedor;
  - a tela de envios da equipe;
  - o reembolso por atraso no despacho.
- **Onde fica:** o cálculo é feito no banco (`effectiveDispatchDeadlineAt`, em `shipment-timing.ts`), para a fila, os filtros e as contagens concordarem. A regra escrita em TypeScript (`cutoffPostingDay`) é a referência, e um teste confere que as duas dão o mesmo dia.
- **Descartado:**
  - gravar a data no pedido no momento do encaminhamento, porque ela ficaria errada quando o relógio começa no pagamento;
  - aplicar o corte por cima da data do Mercado Livre, porque o Mercado Livre cobra pela data dele.
