# SellBridge: regras de código (valem para todo chat e toda pasta do projeto)

Leia também `AGENTS.md` (Turborepo) e, para trabalho por itens, `docs/prompts/execucao-tela-a-tela.md` e `docs/prompts/coordenacao.md`.

## Princípios gerais

- Composição em vez de herança.
- Funções pequenas (até 60 linhas, até 4 parâmetros), com um nível de abstração por função.
- Nomes claros: variáveis, funções e arquivos dizem o que fazem, sem abreviações.
- No máximo 2 ou 3 níveis de `if`/`for` aninhados.
- Tratamento de erros consistente: `try/catch` nos pontos certos (bordas: rotas, jobs, chamadas externas), erros tipados (`AppError` de `@sellbridge/shared/errors`) e nunca engolir exceção em silêncio — no mínimo um log estruturado com o motivo.
- Validação de entrada nas bordas do sistema com Zod (formulários, URL, API pública, webhooks, CSV, respostas de marketplace e Stripe). Texto livre usa `freeText()` de `@sellbridge/shared/schemas`.
- TypeScript em modo strict, sem `as` inseguro, sem `any`, sem `!` de não nulo.
- Imutabilidade sempre que der: `const`, objetos e arrays novos em vez de mutar os recebidos.
- Logs estruturados (`logger` de `@sellbridge/shared/logger`), com nível e sem dados sensíveis (tokens, senhas, e-mails, CPF, endereços, parâmetros de consulta).
- Configurações e segredos só por variáveis de ambiente validadas com Zod, nunca no código.

## Regras de estilo

- Nunca usar `else`: retorno antecipado (early return).
- Código assíncrono com `async/await`, sem `.then` encadeado.
- Sempre checar null e undefined de forma explícita.
- Revisar espaçamento entre linhas e indentação antes de terminar (Prettier no projeto).
- Textos de tela em português do Brasil; código, comentários, commits e PRs em inglês.

## Testes de regressão

- Toda correção de bug vem com um teste de regressão que reproduz o bug: o teste precisa falhar sem a correção e passar com ela (rodar nos dois estados antes de concluir).
- Escolher o nível mais baixo que pega o bug: Vitest (`*.test.ts` ao lado do código) para lógica, schemas, formatação e funções puras; Playwright (`apps/web/e2e/*.spec.ts`) só quando o bug depende de navegador, layout, rota ou fluxo entre telas.
- O nome do teste descreve o comportamento correto, não o bug (ex.: `keeps the price floor when the fee changes`).
- Teste e correção vão no mesmo commit (`fix: ...`). Se não der para testar automaticamente, dizer o motivo no resumo final.

## Git

- Commits e pull requests atômicos, em inglês, no padrão Conventional Commits.
- Fluxo de cada implementação no website: implementar → validar (portões e testes verdes, verificação no navegador) → revisar → commit → push → abrir PR para `main`.
- Push e PR só depois de validado e revisado; se algum portão falhar, não commitar nem subir: deixar as mudanças na árvore e explicar.
- Se a branch já tem um PR aberto, o push atualiza esse PR em vez de abrir outro.
