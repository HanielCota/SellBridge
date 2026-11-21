# 2026-11-21: Perguntas e mensagens do comprador no SellBridge

**Decisão:** o revendedor vê e responde dentro do SellBridge as perguntas que os compradores fazem nos anúncios do Mercado Livre e, depois, as mensagens de quem já comprou. Quando a dúvida é do produto, o fornecedor sugere a resposta e o revendedor publica. Guilherme, 21/11/2026, sobre o plano: "Pode seguir" (a decisão 10 do mapa de 18/11 já dizia "completo, com o fornecedor ajudando").

## O plano, em fatias com PR próprio

1. **Perguntas antes da venda** (esta fatia): receber, guardar, a tela "Perguntas" com o selo de espera, responder e o aviso no sino.
2. **A ajuda do fornecedor:** "Pedir ajuda ao fornecedor"; ele escreve uma sugestão sem ver os dados do comprador; a sugestão volta preenchida e o revendedor revisa e publica.
3. **Mensagens depois da venda:** a aba "Depois da venda" e o bloco no pedido, com o prazo do Mercado Livre e a conversa bloqueada explicada.
4. **Avisos por e-mail** agrupados (no máximo um a cada 15 minutos por loja) e "prazo acabando", dentro do teto diário de e-mails.

Para depois: Shopee e TikTok (a tabela já guarda o marketplace), resposta automática ou por IA, puxar conversa por motivo, anexos, respostas prontas e bloquear comprador. Reclamações ficam com a Margot#1052.

## Como funciona (fatia 1)

- **Chave:** `BUYER_QUESTIONS_ENABLED`, no site e no worker, desligada por padrão. Desligada, o worker trata o aviso `questions` como tópico ignorado e não roda a varredura; o site não mostra a página, o item do menu, o número no menu nem as perguntas no sino.
- **Aviso do Mercado Livre:** o tópico `questions` traz só `/questions/{id}`. O worker lê a pergunta de novo com o token da loja (`GET /questions/{id}?api_version=4`), confere que ela é da loja conectada e guarda. Aviso repetido atualiza a mesma linha (única por marketplace e número da pergunta).
- **Só anúncios do SellBridge:** a pergunta de um anúncio que a conta vende fora do SellBridge fica com o Mercado Livre, como já acontece com as reclamações.
- **Nada do comprador:** guardamos o texto da pergunta, nunca o id, o nome ou o contato de quem perguntou.
- **Varredura de segurança:** a cada 30 minutos, cada loja do Mercado Livre conectada lista as perguntas sem resposta (`GET /questions/search?seller_id=…&status=UNANSWERED`). As que o SellBridge ainda mostra como esperando e o Mercado Livre não lista mais são lidas uma a uma: foram respondidas ou apagadas lá.
- **Responder:** `POST /answers`, nunca repetido (um POST repetido publicaria duas vezes). Antes do envio a pergunta é "pega" no banco: de dois cliques, ou de duas pessoas, só o primeiro envia. Um envio que travou libera a pergunta depois de 2 minutos. Se o Mercado Livre falha, a pergunta é lida de novo: respondida com o mesmo texto conta como enviada; respondida com outro texto, apagada ou com o anúncio encerrado é explicada na tela; ainda esperando, a pessoa tenta de novo sem perder o que escreveu.
- **Selo de espera:** verde "Nova" até 1 hora, amarelo "Esperando" até 24 horas, vermelho "Atrasada" depois. O Mercado Livre mostra ao comprador o tempo médio de resposta do vendedor e diz que responder em menos de 1 hora aumenta as vendas; pergunta sem resposta pesa na média por até uma semana.
- **Limite:** 2.000 caracteres por resposta, como a documentação do Mercado Livre.

## Antes de ligar em produção

- O aplicativo do Mercado Livre precisa receber o tópico **Perguntas** (`questions`). Hoje ele recebe `orders_v2`, `items`, `shipments` e `post_purchase`.
- Conferir no aplicativo a permissão funcional de comunicação com o comprador; se faltar, as lojas talvez precisem reconectar.

## Descartado

- **O fornecedor responder direto no Mercado Livre:** falaria em nome de uma conta que não é dele; a reputação é do revendedor.
- **Mostrar também as perguntas de anúncios feitos fora do SellBridge:** sem o produto do fornecedor, não há com quem pedir ajuda, e o revendedor já as vê no Mercado Livre.
- **Guardar o comprador** para agrupar perguntas da mesma pessoa: dado pessoal que a fatia não usa.
- **Repetir o POST em caso de falha:** poderia publicar a resposta duas vezes.
