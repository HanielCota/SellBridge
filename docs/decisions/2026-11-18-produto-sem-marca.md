# 2026-11-18: Produto sem marca vai como a marca genérica de cada canal

- **Pedido do cliente (18/11):** na exportação para o Mercado Livre a marca não foi, nem "Genérica". O fornecedor digita a marca livremente; cada canal chama "sem marca" de um jeito.
- **Regra única** em `@sellbridge/shared/product-brand` (`isNoBrand`): marca vazia ou uma palavra que diz "sem marca" ("sem marca", "s/ marca", "genérica", "genérico", "nenhuma", "n/a"…), sem acento nem maiúscula. Marca de verdade continua como está.
- **Mercado Livre:** manda a marca genérica da categoria. Lido na API pública em 18/11: travesseiro e fone pedem "Genérica"; bolsa e camiseta pedem "Generic" (id `35977846` na lista). Ordem: valor genérico da lista, palavra entre aspas da dica do BRAND, "Genérica". Uma marca obrigatória em branco deixa de travar a publicação.
- **Shopee:** "No Brand" (`brand_id` 0), ligado pelo chat da Shopee usando a mesma regra. **TikTok:** o conector já não manda marca.
- **Fora:** anúncios já publicados sem marca não mudam sozinhos (não há atualização da ficha de anúncio publicado). Aprovado pelo Guilherme em 18/11/2026 ("Sim, pode seguir").
