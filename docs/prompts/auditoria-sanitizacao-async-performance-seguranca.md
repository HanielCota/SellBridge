# Missão: auditoria de sanitização, async, performance, segurança, lógica e padrões de navegador

Você tem autonomia total neste repositório: pode ler qualquer arquivo, rodar comandos, executar testes, editar código, refatorar e escrever novos testes. Não peça permissão para passos intermediários e não mande atualizações parciais. Trabalhe até o fim e só responda quando tudo estiver concluído, com o relatório completo na mensagem final. Não crie arquivos de relatório (.md, .txt ou similares).

Se uma correção depender de decisão de negócio ambígua, escolha a opção mais segura (recusar de forma explícita em vez de ignorar, truncar ou adivinhar), siga em frente e explique a escolha no relatório final.

A ordem das fases é a ordem de prioridade: **sanitização, async, performance e segurança primeiro**; depois lógica e testes ponta a ponta; por último, o que ainda está no padrão do navegador.

## Regras deste repositório

- Siga `AGENTS.md`, `docs/decisions.md` e as regras de estilo (sem `else`, retorno antecipado, nomes por extenso, Zod nas bordas, sem engolir erro).
- Trabalhe isolado: pasta, branch, banco, Redis e portas próprios (`docs/prompts/coordenacao.md`, na pasta do chat C). Nunca rode testes contra o banco de outro chat.
- Commits só locais, em inglês, no formato Conventional Commits; nada de push.
- Não mexa em migrations sem a "senha da vez" da coordenação; o que precisar de migration vira pendência.

## Como pensar

Não é uma busca por padrões com grep. Siga o dado de verdade: de onde vem (usuário, marketplace, admin, banco, URL, cabeçalho, arquivo), por onde passa e onde termina (HTML, SQL, log, e-mail, CSV, cabeçalho de resposta, outra API). Para cada achado, pergunte: dá para provocar isso de fora? Com que entrada exata? O que quebra, vaza ou fica errado?

## Fase 1 — Sanitização (entrada e saída)

- Toda entrada externa validada com Zod na borda: server functions, rotas de API, webhooks, search params, formulários, CSV, respostas de marketplace. Strings com `trim`, tamanho máximo e caracteres proibidos (NUL, controle) quando forem gravadas.
- Saída no contexto certo: HTML (React escapa, mas `dangerouslySetInnerHTML`, `href`/`src` com `javascript:` ou `data:`, `target="_blank"` sem `rel`), e-mail (HTML montado à mão), CSV (injeção de fórmula: `=`, `+`, `-`, `@`, tab e CR no começo da célula), cabeçalhos (`content-disposition` com nome de arquivo do usuário, CRLF), logs (dados pessoais, tokens, quebras de linha forjando eventos).
- SQL: todo `sql.raw`, `sql` com interpolação, `ILIKE` com curingas, ordenação por campo vindo da URL.
- Caminhos e URLs: path traversal em chaves de storage, redirect aberto (`?redirect=`), URLs de imagem e webhook (SSRF), normalização Unicode e nomes de arquivo.
- Texto exibido de outros tenants (avaliações, chamados): dados de contato, HTML, links.

## Fase 2 — Async

- Promises soltas (sem `await`, sem `void` consciente), `forEach` com `async`, `await` faltando antes de retorno em `try` (o `catch` não pega).
- Corridas: verificar-e-agir sem trava (TOCTOU), contagem antes de inserir, duas abas ou duas requisições ao mesmo tempo, webhooks repetidos fora de ordem, jobs reprocessados.
- Transações: o que precisa ser atômico e não é; efeitos externos (fila, e-mail, marketplace) dentro de transação que pode reverter, ou fora dela quando deveria ser depois do commit.
- `Promise.all` que deixa trabalho pela metade quando uma parte falha; `allSettled` sem olhar as falhas; laços com `await` sequencial que poderiam ser paralelos (ou o contrário, quando a ordem importa).
- Prazos: chamadas externas sem timeout, `AbortController` ausente, retentativas sem teto.
- React: efeitos com corrida (resposta antiga sobrescrevendo a nova), estado após desmontar, mutações duplas por clique duplo, invalidação de cache que esquece consultas relacionadas.

## Fase 3 — Performance

- Banco: N+1, consultas sem índice nos filtros e ordenações usados (rode `EXPLAIN` nos caminhos quentes), `count(*)` caro em toda paginação, `OFFSET` grande, agregações recalculadas a cada request, consultas sem `LIMIT`.
- Servidor: trabalho repetido por requisição, loops O(n²) em listas que crescem, serialização de payloads grandes, consultas em série que poderiam ser paralelas.
- Cliente: re-renderizações desnecessárias, listas grandes sem paginação, bibliotecas pesadas no bundle inicial, imagens sem tamanho/`loading="lazy"`, consultas disparadas várias vezes, `staleTime` ausente.
- Worker: lotes, concorrência, filas que acumulam.

## Fase 4 — Segurança

- Autorização por tenant em toda leitura e escrita (IDOR): um id de outra conta precisa dar "não encontrado". Papéis (revendedor, equipe, admin, atendente, personificação).
- Sessão e cookies (`Secure`, `HttpOnly`, `SameSite`), CSRF nas rotas que não são server functions, CORS, cabeçalhos de segurança (CSP, `X-Content-Type-Options`, `Referrer-Policy`, `frame-ancestors`).
- Segredos fora do código e dos logs; tokens com entropia, hash e expiração; comparação em tempo constante.
- Uploads: tipo real, tamanho, nome, entrega com `content-type` e `content-disposition` corretos, sem execução no domínio da aplicação.
- Rate limit e enumeração (login, cadastro, recuperação de senha, busca).
- Mensagens de erro que vazam detalhes internos.

## Fase 5 — Lógica

- Regras de negócio contra `docs/decisions.md`: estados de pedido, envio, estoque, publicação, chamado, cobrança. Transições impossíveis permitidas, estados finais que voltam, regras iguais implementadas de jeitos diferentes no JS e no SQL, na tela e no servidor.
- Bordas: listas vazias, um item, muitos; primeiro e último; datas no limite; valores no limite.
- Mensagens e telas que dizem uma coisa enquanto o servidor faz outra.

## Fase 6 — Testes ponta a ponta

- Rode os e2e existentes (Playwright) no seu próprio servidor e worker. Registre o que já falhava antes das suas mudanças.
- Escreva e2e novos para cada bug corrigido que tenha efeito visível, e para os fluxos críticos sem cobertura (publicar, vender, encaminhar ao fornecedor, financeiro, suporte, admin).
- Siga `playwright-best-practices`: seletores por papel e nome, sem `waitForTimeout`, dados criados pelo próprio teste e limpos no fim.

## Fase 7 — O que ainda está no padrão do navegador

Abra cada tela no navegador (desktop e 390 px, tema claro e escuro) e procure o que não foi desenhado, só herdado do navegador:

- Controles nativos sem estilo: `<select>`, `<input type="date|number|search|file">` (setinhas do número, roda do mouse mudando valor, "x" da busca, botão "Escolher arquivo"), checkbox e radio nativos, `<details>` com o triângulo padrão.
- Foco: anel padrão (`outline: auto`) em vez do anel do design system, foco invisível, `:focus` em vez de `:focus-visible`.
- Formulários: balão de validação nativo (`required`, `type="email"`) no lugar das mensagens do app, autofill amarelo/azul, `autocomplete` errado ou ausente, `autocapitalize`/`autocorrect`/`spellcheck` em campos de código, e-mail e SKU, botão sem `type` virando submit.
- Celular: zoom do iOS ao focar campo com fonte menor que 16 px, realce azul do toque, `overscroll`/puxar para atualizar, duplo toque com zoom, teclado errado (`inputMode`), `100vh` cortado pela barra do navegador.
- Tema escuro: `color-scheme` ausente (barras de rolagem e controles claros no escuro), seleção de texto, cor de placeholder, `::-webkit-scrollbar`.
- Outros: cores de link visitado, sublinhado padrão, imagem arrastável, menu de contexto em elementos interativos, `title` como tooltip, estilos de impressão, `prefers-reduced-motion` ignorado, `beforeunload` padrão.

Corrija usando os componentes e tokens do design system (`components/ui`), nunca com estilo solto.

## Correção

Para cada problema: corrija na origem, escreva o teste que falharia sem a correção (unitário, integração ou e2e), rode os testes do grupo e revise se a correção abriu outra borda. No fim, tudo precisa passar: lint, tipos, formatação, sem `else`, testes e e2e (menos o que já falhava antes, documentado).

## Resposta final (só na última mensagem)

- **Resumo geral**: o que analisou, quantos problemas achou, corrigiu e deixou pendentes, e como verificou.
- **Achados por fase e severidade**, cada um com arquivo:linha, cenário concreto (entrada exata), impacto e o que foi feito.
- **Mudanças de comportamento**: o que passou a ser recusado, exibido ou devolvido de outra forma.
- **Decisões tomadas sozinho** e por quê.
- **Pendências** e por quê (migration, decisão de produto, área de outro chat).
- **Testes**: quais e2e foram escritos, o que roda, o que já falhava antes.
- **Problemas fora do escopo** notados no caminho.
- **Recomendações** para não voltar.

Severidade:

- **Crítico**: corrompe dados, causa perda financeira, abre brecha de segurança ou derruba produção.
- **Alto**: resultado errado silencioso (cálculos, permissões, dados de outro tenant).
- **Médio**: erro ou lentidão em caso plausível.
- **Baixo**: cosmético ou defensivo.

Comece pela Fase 1.
