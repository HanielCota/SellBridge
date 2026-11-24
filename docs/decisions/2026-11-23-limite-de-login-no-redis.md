# 2026-11-23: limite de tentativas de login no Redis

**Decisão:** os contadores de tentativas do login, do cadastro e do pedido de link de nova senha ficam no Redis, e não mais na memória do site. Assim eles não zeram a cada atualização do site (várias por dia). Os limites, por endereço de quem acessa e por caminho:

- login (e-mail e Google): 10 tentativas a cada 15 minutos;
- cadastro: 5 a cada hora;
- link de nova senha: 3 a cada 15 minutos;
- apagar a conta: 5 por minuto (como antes).

Os outros caminhos seguem o padrão do Better Auth (troca de senha e de e-mail: 3 a cada 10 segundos).

**Como:** é o encaixe do próprio Better Auth (`rateLimit.customStorage`, versão 1.7.7), em `apps/web/src/lib/server/auth-rate-limit.ts`. A contagem é um script atômico no Redis (`packages/shared/src/runtime/redis-rate-limit-store.ts`), pela mesma conexão das filas. A janela é fixa: começa na primeira tentativa, e as recusadas não esticam a espera.

**Endereço de quem acessa:** a chave leva o endereço (regra de `2026-11-19-ip-de-quem-acessa.md`). Ela vai para o Redis embaralhada (HMAC com o segredo do login), some sozinha no fim da janela e nunca vai para os logs.

**Se o Redis cair:** o site conta na própria memória, como antes, e registra um aviso. O login continua funcionando e com limite.

**Por quê:** achado S2 da varredura de segurança. Com a janela de 10 segundos de antes, guardar no Redis quase não ajudaria; a janela de minutos é o que freia quem tenta adivinhar senhas. Escolha do Guilherme em 23/11/2026: "Sim, com a B".

**Descartado:**

- `storage: "database"` do Better Auth: precisaria de uma tabela nova (migração) e escreveria no banco a cada tentativa.
- `secondaryStorage` do Better Auth: levaria também as sessões para o Redis, o que ninguém pediu.
