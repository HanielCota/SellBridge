# Revisão de qualidade antes do commit

Use depois da auditoria de limites (primeira revisão) e antes do ⏸3. Escopo padrão: o diff ainda sem commit e a área do chat (ver `coordenacao.md`). Em arquivo de outra área, só a menor correção possível, anotada em decisões.

Trabalhe até o fim sem pedir licença para passos intermediários. Leia o código de verdade, siga cada caminho do começo ao fim e só aponte o que conseguir provar com um cenário concreto. Corrija na origem, escreva o teste que falha antes da correção e rode os portões no final.

## 1. Sanitização

- Toda entrada externa (formulário, URL, server function, API pública, webhook, link do fornecedor, payload do marketplace) passa por Zod na borda, com tamanho máximo, faixa e formato.
- Texto do usuário exibido para outra pessoa: sem HTML injetável (`dangerouslySetInnerHTML`, `href` com `javascript:`), contatos removidos onde a regra pede, caracteres de controle e nulos tratados.
- Links e URLs montados com dados do usuário: protocolo permitido (`http`/`https`), `rel="noopener noreferrer"` em `target="_blank"`.
- Nada sensível (token, e-mail, endereço) em query string, log ou mensagem de erro devolvida ao cliente.

## 2. Async

- `await` faltando, promessa solta sem `void` e sem tratamento, `forEach` com `async`, `Promise.all` onde uma falha deveria cancelar as outras ou `allSettled` onde deveria.
- Corridas: duas abas, clique duplo, debounce que chega atrasado, resposta antiga sobrescrevendo a nova, navegação no meio de uma mutação.
- Transações: leitura e escrita da mesma linha sem trava, chamada de rede dentro de transação, efeito colateral (fila, e-mail) antes do commit.
- Estado de carregamento e erro de toda mutação: botão desabilitado enquanto envia, erro mostrado, foco devolvido.

## 3. Performance

- Consultas: N+1, falta de índice para o filtro usado, `select *` em tabela larga, consulta sem `LIMIT` em tabela que cresce, contagem cara repetida.
- React: re-render em cascata, objeto ou função nova em prop de componente memorizado, efeito que roda a cada render, lista grande sem chave estável, imagem sem tamanho.
- Rede: requisição duplicada (prefetch e query com chaves diferentes), invalidação ampla demais, waterfall de requisições que podiam ir juntas.

## 4. Segurança

- Escopo de conta em toda consulta (`tenantId`) e de papel em toda ação; o link do fornecedor só alcança o próprio envio, e nunca depois de expirado ou revogado.
- Regra de negócio garantida no servidor, não só escondida na tela.
- Mensagens de erro sem detalhe interno; respostas iguais para "não existe" e "não é seu".
- CSRF, cabeçalhos de cache em respostas privadas, cookies.

## 5. Lógica

- Para cada regra de negócio tocada: os estados possíveis, as transições e o que acontece em cada borda (vazio, um, muitos, cancelado no meio, repetido, fora de ordem).
- Telas e servidor dizem o mesmo sobre o mesmo dado (status, contagem, data, dinheiro).
- Textos que prometem algo que o código não faz.

## 6. Padrões do navegador

Procure o que ficou com a aparência ou o comportamento padrão do navegador em vez do sistema de design:

- Foco: anel padrão, `outline: none` sem substituto, ordem de tab, foco perdido ao abrir e fechar diálogo.
- Controles nativos sem estilo: `select`, `input type=date/number` (setas), `checkbox`/`radio`, barra de rolagem, preenchimento automático (fundo amarelo ou azul no autofill).
- Comportamentos: `button` sem `type` dentro de `form` (envia sem querer), Enter enviando formulário, `alert`/`confirm`/`prompt`, link que deveria ser botão e vice-versa, `title` como única dica, seleção de texto em botões, realce azul de toque no celular, zoom ao focar input com fonte < 16 px no iOS, arrastar imagem.
- Tema: `color-scheme` no escuro (controles nativos claros no tema escuro), cor de seleção, cursor.

## 7. Testes de ponta a ponta

- Para cada fluxo tocado, um e2e que percorre o caminho real do usuário, de entrar até ver o resultado, incluindo a borda mais provável de quebrar (filtro vazio, voltar, recarregar, clique duplo, erro do servidor).
- Rodar as suítes afetadas com `--workers=1` e as de acessibilidade.

## Resposta final

Resumo, achados por severidade (crítico, alto, médio, baixo) com arquivo:linha, cenário concreto e o que foi feito; mudanças de comportamento; decisões tomadas sozinho; pendências com o motivo; testes rodados e resultado.
