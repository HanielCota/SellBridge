# Prompt: revisão de sanitização, async, performance, segurança, lógica e padrões de navegador

Você tem autonomia total neste repositório: pode ler qualquer arquivo, rodar comandos e testes, editar código, refatorar e escrever testes novos (unitários, de integração e e2e). Não peça permissão para passos intermediários e não mande atualizações parciais. Trabalhe até o fim e só responda quando tudo estiver concluído, com o relatório completo na mensagem final. Não crie arquivos de relatório.

Se uma correção depender de decisão de negócio ambígua, escolha a opção mais segura (recusar de forma explícita em vez de aceitar em silêncio), siga em frente e explique a escolha no relatório.

Respeite as regras da casa (sem `else`, `async/await` sem `.then` encadeado, checagem explícita de null, Zod nas bordas, dinheiro em centavos, funções de até 60 linhas e até 4 parâmetros, sem `as` inseguro, textos de tela em português) e a divisão por área de `docs/prompts/coordenacao.md`: em arquivo de outra área, faça a menor mudança possível e registre. Migrations só pela "senha da vez".

## Como pensar

Não é busca por padrão com grep. Leia o código e siga o caminho de cada dado: de onde vem (usuário, marketplace, Stripe, CSV, URL, banco), por onde passa e onde é exibido, gravado, enviado ou executado. Para cada trecho, pergunte: o que um usuário mal-intencionado, uma rede lenta, uma resposta fora de ordem ou um volume 100 vezes maior fariam aqui?

## Ordem obrigatória

### Fase 1 — Sanitização (primeiro)

- Toda entrada externa validada e normalizada na borda: Zod com `.trim()`, tamanho mínimo e máximo, formato; texto livre sem caracteres de controle onde não fazem sentido.
- Saída segura em cada destino: HTML (`dangerouslySetInnerHTML`, HTML montado em string para impressão ou e-mail), atributos e URLs (`href`/`src` com `javascript:` ou `data:`), CSV exportado (fórmulas `= + - @` executadas pelo Excel), cabeçalhos HTTP, nomes de arquivo, logs (sem tokens, senhas, e-mails completos).
- Redirecionamentos e links montados com input do usuário (open redirect).
- Dados de terceiros (Mercado Livre, Stripe, CEP) tratados como não confiáveis antes de exibir ou gravar.

### Fase 2 — Async

- Promessas sem `await` (flutuantes), `forEach` com função async, `Promise.all` que deixa uma falha derrubar tudo quando o certo é `allSettled` (ou o contrário).
- Ordem de respostas: requisição antiga que chega depois da nova e sobrescreve o estado; buscas sem cancelamento (`AbortController`) ao trocar filtro ou sair da tela.
- `useEffect` assíncrono sem limpeza; estado atualizado depois de desmontar; timers e listeners sem remoção.
- Corridas entre requisições concorrentes no servidor (check-then-act sem transação ou trava), jobs que podem rodar duas vezes, retentativas sem idempotência.
- Timeouts ausentes em chamadas externas; erros engolidos em `catch` vazio ou só com log quando o usuário precisava saber.

### Fase 3 — Performance

- Consultas N+1, consultas sem `LIMIT` em tabela que cresce, colunas filtradas ou ordenadas sem índice (índice novo exige migration: registre se não puder criar).
- Loaders em cascata que poderiam rodar em paralelo; dados buscados duas vezes; cache do TanStack Query com chave errada ou invalidação ampla demais.
- Re-renderização desnecessária em listas grandes, cálculos pesados no render, imports pesados no pacote inicial (gráficos, editores) que poderiam ser carregados sob demanda, imagens sem tamanho definido (salto de layout).
- Trabalho síncrono pesado no servidor bloqueando o event loop.

### Fase 4 — Segurança

- Autorização em toda server function e rota de API: middleware certo (`tenantMiddleware`, `adminMiddleware`, `staffMiddleware`), `tenantId` sempre do contexto, nunca do input; isolamento entre tenants nas consultas.
- IDOR: acesso por id de pedido, anúncio, chamado, anexo, loja ou envio de outro tenant.
- Sessão e cookies (`httpOnly`, `secure`, `sameSite`), CSRF nas ações que mudam estado, limites de taxa em login, cadastro, recuperação de senha e uploads.
- Cabeçalhos de segurança (CSP, `X-Content-Type-Options`, `frame-ancestors`, `Referrer-Policy`), segredos fora do bundle do cliente, mensagens de erro sem detalhes internos.
- SSRF em URLs informadas pelo usuário (webhooks, imagens), uploads (tipo real por magic bytes, tamanho antes de ler).

### Fase 5 — Lógica e testes de ponta a ponta

- Fluxos principais lidos de ponta a ponta procurando regra errada: cadastro → onboarding (CEP) → conectar loja → catálogo → publicar → venda (webhook) → encaminhar ao fornecedor → envio → entrega → avaliação → financeiro; suporte (abrir, responder, encerrar); admin (clientes, fornecedores, desativação).
- Estados impossíveis aceitos, transições fora de ordem, botões que permitem ação inválida para o estado atual, mensagens que não batem com o que aconteceu.
- Escreva e2e (Playwright, `--workers=1`, com dados próprios do teste e limpeza no fim) para todo fluxo crítico sem cobertura, e unitários para cada regra corrigida. Teste que prova bug falha antes da correção.

### Fase 6 — Padrões de navegador

Procure tudo que ainda aparece com o visual ou o comportamento padrão do navegador em vez do design do SellBridge:

- `window.alert`, `confirm`, `prompt`; balões nativos de validação (`required`, `pattern`, `type="email"`) em inglês ou fora do padrão das mensagens do projeto; `title=` usado como dica no lugar de tooltip do projeto.
- `<select>`, `<input type="date|time|number|file|color|range">`, `<details>/<summary>`, barras de rolagem, setas de `type="number"`, botão de "Escolher arquivo", ícone de calendário nativo, quando a tela vizinha usa o componente do projeto.
- Contorno de foco padrão sem o anel do projeto (ou sem foco visível nenhum), realce azul de toque no celular (`-webkit-tap-highlight-color`), fundo amarelo do preenchimento automático, seleção de texto em controles, cursor errado, `button` sem `type` dentro de `form` (envio acidental), link sem estilo, imagem quebrada sem alternativa, rolagem por trás de diálogo aberto, zoom automático do iOS em campos com fonte menor que 16 px.
- Corrija usando os componentes e tokens existentes (ver `docs/prompts/execucao-tela-a-tela.md`, seções 4.3 e 4.4) e confira com capturas em claro e escuro, computador e celular.

## Correção

1. Corrija na origem e não espalhe checagens pelo código.
2. Prefira recusar com erro claro a aceitar ou cortar em silêncio.
3. Cada correção ganha teste, e o teste que prova o bug falha antes da correção.
4. Rode lint, tipos, formatação, a regra sem `else`, testes, build e e2e a cada grupo de mudanças. Tudo precisa passar no fim, com a suíte e2e completa.
5. Revise as próprias correções: elas criaram riscos novos?
6. Commit local (Conventional Commits em inglês, trailer `Co-Authored-By`), sem push.

## Resposta final (só na última mensagem)

- **Resumo geral:** o que analisou, quantos problemas encontrou, corrigiu e deixou pendentes, contagem de testes antes e depois.
- **Achados por fase**, ordenados por severidade, cada um com arquivo:linha, cenário concreto, impacto e o que foi feito.
- **Testes de ponta a ponta adicionados** e o que cada um garante.
- **Mudanças de comportamento** observáveis pelo usuário.
- **Decisões tomadas sozinho** e por quê.
- **Pendências** (migration, decisão de produto, área de outro chat) e **riscos futuros**.
- **Recomendações** para não voltar.

Severidade: **Crítico** (vazamento ou corrupção de dados, perda financeira, brecha de segurança, queda em produção) · **Alto** (resultado errado silencioso) · **Médio** (erro ou travamento em caso plausível) · **Baixo** (cosmético ou defensivo).
