# 2026-11-19: A exclusão de conta entrega a pausa dos anúncios ao worker

**Substitui**, em `docs/decisions.md` (exclusão de conta, "Falhas no meio"), o orçamento de 30 s para pausar. Antes, quando ele acabava, as lojas restantes eram desconectadas sem pausar.

**Decisão:**

- A exclusão não pausa mais os anúncios enquanto a pessoa espera. Para cada loja conectada com anúncios no ar, ela põe um trabalho na fila `deleted-store-pause` e só então desconecta a loja e apaga os dados.
- O trabalho leva o que a pausa precisa: o marketplace, a loja, a chave de acesso (cifrada, como no banco), os anúncios e os preços. Os dados da loja somem logo depois, por isso ele não depende deles.
- O worker zera o estoque de cada anúncio. O primeiro envio espera um minuto, para que uma rodada de estoque já em andamento não devolva o estoque depois do zero.
- Enquanto sobrar anúncio no ar, o worker tenta de novo, com espera crescente (1, 2, 4 … 64 minutos), por cerca de duas horas. É o prazo em que a chave ainda vale: 4 h na Shopee, 6 h no Mercado Livre. Anúncio já encerrado no marketplace conta como pausado.
- Quando nenhuma falha pode passar numa nova tentativa (marketplace sem essa função, acesso revogado), o trabalho desiste na hora.
- A falha final aparece em Problemas, com os anúncios que ficaram no ar, para a equipe pausar à mão.
- O trabalho sai do Redis ao terminar, com sucesso ou falha, e a chave sai junto.
- Se o trabalho não puder ser posto na fila (Redis fora), a exclusão para antes de desconectar ou apagar qualquer coisa e pede para tentar de novo em alguns minutos.
- Uma loja sem acesso (expirada, com erro ou sem chave) não tem como ser pausada. Os anúncios dela vão para Problemas com a lista, para a equipe pausar à mão, e a exclusão segue.
- Em Problemas, cada número de anúncio aparece com o prefixo `id_`, para a limpeza de dados pessoais não confundir um número longo com CPF.

**Por quê:** uma conta excluída não pode deixar anúncio vendendo, porque ninguém mais atenderia esses pedidos.

**Descartado:**

- Esperar a pausa terminar antes de excluir: a pessoa ficaria presa no diálogo, e uma loja que não responde travaria a exclusão para sempre.
- Guardar a pausa pendente numa tabela: exigiria migração e guardaria a chave por mais tempo que o necessário.

Pedido: lista de pendências antes do lançamento, de 18/11/2026.
