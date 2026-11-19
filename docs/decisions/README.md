# Decisões (um arquivo por decisão)

Desde 2026-11-19, cada decisão nova fica num arquivo próprio nesta pasta. O registro antigo, [`docs/decisions.md`](../decisions.md), guarda tudo até essa data e não recebe entradas novas.

## Por quê

Antes, todo PR escrevia no fim do mesmo arquivo. Quando um PR entrava, os outros abertos ficavam em conflito só por causa desse fim, e cada conflito custava uma checagem nova. Com um arquivo por decisão, dois PRs não escrevem no mesmo lugar.

## Como registrar

- **Nome do arquivo:** `AAAA-MM-DD-assunto-curto.md`, com a data da decisão e o assunto em kebab-case, sem acento (ex.: `2026-11-19-taxa-do-canal-na-venda-manual.md`).
- **Primeira linha:** `# AAAA-MM-DD: Título`, no mesmo formato dos títulos de `decisions.md`.
- **Conteúdo:** o mesmo de antes: o que foi decidido, por quê, quem decidiu (com a frase, quando houver) e o que foi descartado. Uma decisão por arquivo.
- **Mudou uma decisão antiga:** crie um arquivo novo que diga qual decisão ele substitui. Não reescreva a antiga.
- **Mesmo assunto no mesmo dia:** acrescente ao arquivo que já existe, ou use um sufixo (`-2`).

## Como ler

Para saber o que vale hoje, leia `docs/decisions.md` (até 2026-11-18) e depois os arquivos desta pasta, em ordem de nome, que é a ordem de data.
