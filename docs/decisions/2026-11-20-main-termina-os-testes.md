# 2026-11-20: A `main` termina os próprios testes

Aplica a proposta 3 de [`2026-11-20-regressoes-18-19-11.md`](2026-11-20-regressoes-18-19-11.md).

**Decisão:** a rodada da CI de um merge na `main` nunca é cancelada nem trocada pela do merge seguinte. Guilherme, 20/11/2026: "Então ok vamos assim".

## Por quê

Em 18 e 19/11, 37 das 50 rodadas da `main` foram canceladas por merges em sequência, e três desencontros entre PRs só apareceram horas depois. Cada PR estava certo sozinho; o erro só existia com os dois juntos, e a rodada que pegaria isso não chegou ao fim.

## Como funciona

- No `ci.yml`, cada push na `main` tem um grupo de concorrência próprio (o commit), sem cancelamento. Rodadas de merges seguidos correm lado a lado.
- Nos PRs nada muda: um push novo cancela a rodada anterior da mesma branch.
- O merge e o deploy não esperam essa rodada.

## Descartado

- Só desligar o `cancel-in-progress` com o mesmo grupo: o GitHub guarda uma única rodada à espera por grupo, e um terceiro merge ainda derrubaria a segunda.
