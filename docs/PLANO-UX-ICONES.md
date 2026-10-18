# Projeto Sell Bridge – Melhoria visual com ícones e tooltips

> Prompt original do usuário, recebido em 2026-10-18. Consultar antes de cada sessão deste trabalho.
> Branch: `feat/ux-icones-tooltips`. Progresso: `docs/evidencias-visuais/PROGRESSO.md`.

## Contexto

O Sell Bridge é uma plataforma com três áreas: vendedor, fornecedor e administração. O objetivo é reduzir a fricção visual para usuários não técnicos. Eles não associam um ícone sozinho à função dele, então cada ícone deve vir acompanhado de texto, e alguns itens devem ter uma legenda explicativa (tooltip) ao passar o mouse.

Antes de qualquer ação, leia este prompt inteiro, leia o CLAUDE.md (se existir) e entenda a estrutura do projeto. Salve este prompt em /docs/PLANO-UX-ICONES.md para consultá-lo em sessões futuras.

## Forma de trabalho

- Uma seção da navbar por vez, nunca tudo de uma vez.
- Ordem das áreas: 1) Vendedor → 2) Fornecedor → 3) Administração.
- Dentro de cada área, siga a ordem das seções da navbar.
- Se uma seção tiver itens demais para revisar de uma vez, proponha dividi-la em subseções e trate cada subseção como um ciclo completo.
- Em cada seção eu aprovo em dois momentos: a escolha do design e o resultado final.
- Nunca avance para a próxima seção sem minha aprovação explícita.

## Escopo de cada seção

Entra na análise de cada seção tudo o que o usuário vê e com que interage nela:

- O próprio item da navbar que leva à seção.
- Botões, links e ações.
- Cards, carrosséis e abas (por exemplo: Mais vistos, Menos vistos, Mais comprados, Menos comprados).
- Filtros, campos de busca e ordenação.
- Cabeçalhos e ações de tabelas.
- Modais, menus suspensos e submenus abertos a partir da seção.
- Telas vazias, mensagens de erro e de confirmação.
  Nem todo item precisa receber ícone ou tooltip: a decisão segue os critérios contra poluição visual.

## Regras obrigatórias

1. Não altere lógica, estados, chamadas de API, rotas, nomes de props ou estruturas de dados. A mudança é somente de apresentação.
2. Respeite a arquitetura, a orientação a objetos, os padrões de componentes, a organização de pastas e as convenções de nomenclatura existentes. Antes de criar algo novo, verifique se já existe algo equivalente e reutilize.
3. Não use emojis como ícones em nenhuma hipótese.
4. Mudanças pequenas e incrementais. Se algo exigir mexer em lógica, pare e me pergunte.
5. Nada é implementado sem que eu tenha visto a imagem do local e escolhido uma das propostas de design.
6. Trabalhe em uma branch própria (por exemplo, feat/ux-icones-tooltips), com um commit por seção concluída e mensagem descritiva. Nunca faça push ou merge sem minha autorização.
7. Credenciais de teste nunca devem ser gravadas em arquivos versionados.
8. Nunca use a base de dados ou a API de produção. Trabalhe apenas em ambiente local ou de homologação.
9. Componentes compartilhados: antes de alterar qualquer componente, verifique se ele é usado em outras áreas ou seções. Se for, avise quais telas serão afetadas e aguarde minha decisão antes de mexer.
10. Testes: se algum teste existente quebrar por causa da mudança visual, não altere o teste por conta própria. Mostre qual teste quebrou, por quê, e proponha a correção para eu aprovar.

## ETAPA 0 – Análise geral (não altere nenhum arquivo do sistema)

- Leia o package.json e identifique bibliotecas de ícones existentes (lucide-react, react-icons, @heroicons/react, @phosphor-icons/react, @tabler/icons-react, @fortawesome, entre outras). Se existir, use a do projeto. Se não, proponha o Lucide e justifique.
- Verifique se já existe componente de tooltip ou biblioteca de UI que ofereça um (Radix, shadcn/ui, MUI, Headless UI etc.).
- Descubra como rodar o projeto localmente e confirme que ele sobe sem erros, apontando para ambiente local ou de homologação.
- Verifique se existem dados de exemplo (seed, fixtures ou mocks) para que as telas não apareçam vazias nos prints. Se não houver, me diga e proponha uma forma segura de popular o ambiente local.
- Verifique a ferramenta de captura de tela disponível (Playwright, Puppeteer etc.). Se não houver, me diga o que precisa ser instalado e aguarde.
- Verifique como acessar cada área (vendedor, fornecedor, administração). Se precisar de usuários de teste, me peça.
- Verifique se o projeto usa arquivos de tradução (i18n). Se usar, todos os textos novos devem ir para esses arquivos.
- Verifique se o projeto tem modo escuro. Se tiver, ele deve ser considerado nas propostas e nos prints.
- Verifique se existe um padrão de linguagem nos textos atuais (você/o senhor, termos usados para pedidos, vendas, produtos etc.).
- Mapeie a navbar das três áreas e liste as seções de cada uma, na ordem.
- Identifique funções que se repetem entre seções e entre áreas.
- Identifique componentes compartilhados entre áreas.
- Entregue um resumo com tudo isso, mais a lista de seções na ordem de execução. Aguarde minha aprovação.

## ETAPA 1 – Base reutilizável (feita uma única vez)

### Componente de tooltip

- Único componente, no padrão do projeto, usado em todas as áreas.
- Aparece acima do elemento quando o mouse entra (atraso de cerca de 300 ms) e some quando o mouse sai.
- Aparece com foco do teclado, com acessibilidade adequada (role="tooltip", aria-describedby).
- Funciona também em botões desabilitados, para explicar por que a ação está bloqueada.
- Reposiciona se for cortado pela borda da tela.
- Em telas de toque: toque para abrir, toque fora para fechar.
- Visual discreto, com as cores, fontes e espaçamentos do tema atual, nos modos claro e escuro (se existir).

### Dicionário de ícones

- Arquivo central, nas convenções do projeto, que associa cada FUNÇÃO a um ícone e à chave do texto de tooltip.
- Todo ícone deve vir desse dicionário, nunca importado solto no componente.
- Importe apenas os ícones usados, de forma individual, nunca a biblioteca inteira, para não aumentar o peso do site.
- O dicionário cresce a cada seção concluída.

### Glossário de termos

- Crie /docs/GLOSSARIO-UX.md com os termos padronizados da plataforma (por exemplo: se é "pedido" ou "venda", "produto" ou "item") e o tom de voz dos textos.
- Todos os tooltips devem seguir esse glossário. Termo novo entra no glossário antes de ser usado.

O estilo visual do tooltip e dos ícones será definido pela proposta que eu escolher na primeira seção. A partir daí, esse estilo vira o padrão de todo o projeto.

## CICLO POR SEÇÃO (repetir para cada seção ou subseção)

### Passo 1 – Imagem do que vai mudar

- Capture a tela ANTES de cada tela da seção, sem modificar nada, com dados de exemplo carregados.
- Marque com círculo (ou elipse) vermelho cada área que será modificada.
- Liste os itens marcados, indicando quais já existem no dicionário (reaproveitados) e quais são novos.
- Informe a URL da tela, os arquivos que serão alterados e se algum deles é componente compartilhado com outras áreas.

### Passo 2 – Três propostas de design clicáveis

- Crie 3 propostas realmente diferentes entre si (por exemplo: A – minimalista, ícone pequeno ao lado do texto; B – ícone com fundo suave; C – ícone acima do texto), todas dentro do tema atual e dos critérios contra poluição visual.
- Gere uma página de pré-visualização isolada, fora do código de produção (por exemplo, /docs/propostas/vendedor/financeiro/index.html), mostrando as 3 propostas sobre uma reprodução fiel da tela, com hover funcionando. Cada proposta deve ter um rótulo visível (A, B, C). Se houver modo escuro, inclua um botão para alternar. Informe o caminho para eu abrir no navegador.
- Capture cada proposta com o tooltip aberto, para a documentação.
- Apresente as 3 opções para eu escolher usando a ferramenta de perguntas com opções clicáveis (AskUserQuestion). Se não estiver disponível, numere como A, B e C.
- A partir da segunda seção, as propostas partem do padrão já escolhido, variando apenas o necessário para os itens novos.
- Aguarde minha escolha. Não implemente nada antes disso.

### Passo 3 – Execução

- Implemente somente a proposta escolhida, respeitando todas as regras obrigatórias.
- Atualize o dicionário de ícones, os arquivos de tradução (se houver) e o glossário com os itens novos.

### Passo 4 – Prints de como era e como ficou

- ANTES: a captura do Passo 1, com círculo vermelho.
- DEPOIS: mesma tela, mesmo enquadramento, tamanho de janela e dados, com círculo vermelho na área modificada. Para tooltips, mostrar a legenda aberta.
- Capturas em desktop (1440x900) e em celular (390x844). Se houver modo escuro, capture também no modo escuro em desktop.
- Círculo vermelho com contorno visível (3 a 4 px), sem preenchimento, sem cobrir o conteúdo.
- Link do local modificado: URL da tela e caminho de cada arquivo alterado.
- Confirme que nenhuma lógica foi alterada, que o projeto compila e que os testes existentes passam (ou liste os que quebraram, conforme a regra 10).
- Faça o commit da seção.
- PARE e aguarde minha aprovação para a próxima seção.

## Regra de reaproveitamento de ícones

- Mesma função = mesmo ícone e mesmo texto de tooltip, em qualquer seção ou área.
- Função diferente = ícone diferente, mesmo que nome ou posição sejam parecidos. Exemplo: "Baixar comprovante" e "Exportar relatório" não compartilham ícone.
- Nunca use o mesmo ícone para duas funções diferentes.
- Na dúvida se duas funções são iguais, pergunte antes.

## Ícones

- Sempre acompanhados do texto da função, nunca sozinhos, exceto padrões universais (fechar, buscar), e mesmo assim com tooltip.
- Ícone ao lado de texto é decorativo: use aria-hidden="true" para o leitor de tela não ler a função duas vezes. Ícone sozinho precisa de aria-label.
- No máximo um ícone por item. Tamanho e espessura de traço padronizados. Cor herdada do texto ao lado.
- Sugestão para o carrossel da hero do vendedor: Mais vistos → olho; Menos vistos → olho riscado; Mais comprados → tendência subindo; Menos comprados → tendência caindo.

## Textos dos tooltips

- Linguagem simples, sem termos técnicos, seguindo o tom e os termos do GLOSSARIO-UX.md.
- No máximo uma frase de cerca de 80 caracteres, dizendo o que o usuário consegue fazer ali.
- Em botões desabilitados, explicar o motivo do bloqueio e, se possível, o que fazer para liberar (por exemplo: "Cadastre uma forma de pagamento para liberar esta opção").

## Critérios contra poluição visual

- Tooltip só onde a função não é óbvia pelo texto.
- Sem novas cores, animações chamativas ou elementos decorativos.

## Documentação

Estrutura por área e seção, por exemplo:
/docs/evidencias-visuais/vendedor/financeiro/
1-antes.png
2-proposta-a.png, 2-proposta-b.png, 2-proposta-c.png
3-depois-desktop.png, 3-depois-mobile.png, 3-depois-escuro.png (se houver)

Mantenha /docs/evidencias-visuais/PROGRESSO.md atualizado a cada seção com:

- Área e seção concluída, com data e hash do commit.
- Proposta escolhida (A, B ou C) e links das três propostas.
- Tabela de mudanças: descrição, arquivo alterado, URL da tela, imagem antes, imagem depois.
- Ícones reaproveitados e ícones novos.
- Componentes compartilhados alterados e telas afetadas.
- Testes que precisaram de ajuste (com minha aprovação).
- Próxima seção da fila.

## Início

Comece agora pela ETAPA 0 e pare ao final dela.
