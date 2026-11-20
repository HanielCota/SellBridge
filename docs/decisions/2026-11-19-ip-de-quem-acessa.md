# 2026-11-19: IP de quem acessa, com um proxy só na frente

**Decisão:** o endereço de quem acessa vem de uma regra só (`apps/web/src/lib/server/client-address.ts`), a mesma do Better Auth. Ela vale para o limite de login e para o recebedor de erros do navegador. O cabeçalho `CLIENT_IP_HEADER` (padrão `x-forwarded-for`) só conta quando traz um endereço válido e mais nada. Com qualquer outro conteúdo, o pedido conta como sem endereço e entra no balde comum.

**Suposição sobre a produção (conferida no Coolify em 19/11/2026, só leitura):**

- Há um proxy só, o Traefik do Coolify, entre a internet e o site.
- O DNS de `app.sellbridge.com.br` aponta direto para o servidor, sem Cloudflare na frente.
- O site não tem porta aberta para fora: só o Traefik fala com ele.

**Quando mudar:**

- Se ligarem o proxy da Cloudflare, defina `CLIENT_IP_HEADER=cf-connecting-ip`.
- Se entrar outro proxy na frente do Traefik, revise esta regra antes de subir.
- Se o site ganhar uma porta aberta para a internet, revise esta regra antes de subir.

**Por quê:** o limite de tentativas depende do endereço. Com uma regra só, o login e o recebedor de erros leem o endereço do mesmo jeito. Um teste trava a regra, para que uma atualização do Better Auth não a mude sem aviso.

**Descartado:**

- Configurar uma lista de proxies confiáveis (`trustedProxies`): com um proxy só, ela não acrescenta nada e esconde a suposição numa configuração.

Pedido: lista de pendências antes do lançamento, de 18/11/2026.
