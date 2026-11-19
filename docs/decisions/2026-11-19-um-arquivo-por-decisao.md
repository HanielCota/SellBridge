# 2026-11-19: Um arquivo por decisão

- **Decisão (dono do produto, "Sim muda", chat da Central):** as decisões novas vão para `docs/decisions/`, um arquivo por decisão. O `docs/decisions.md` fica como histórico até 2026-11-18 e não recebe entradas novas.
- **Por quê:** com vários chats trabalhando ao mesmo tempo, quase todo PR escrevia no fim de `docs/decisions.md`. A cada merge, os PRs abertos ficavam em conflito só por esse trecho (em 19/11, o #290 e o #292), e cada conflito pedia uma checagem nova e um ok novo.
- **Transição:** PRs que já estavam abertos podem manter a entrada em `docs/decisions.md`. O trabalho novo usa a pasta.
- **Descartado:**
  - O `merge=union` do git no arquivo único: o GitHub não usa esse ajuste ao dizer se um PR tem conflito.
  - Mover o histórico para arquivos separados: muito diff e nenhum ganho para quem lê.
