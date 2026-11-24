# 2026-11-21: Aceite eletrônico dos contratos com registro de prova

**Quem decidiu:** Guilherme, 21/11/2026, na Central: "Faz o que tiver de código aí com aquela lista" e, sobre o plano, "Aprovo os quatro". Origem: a lista de requisitos dos contratos de Fornecedor e de Vendedor que o cliente mandou em 20/11/2026 (seções 1 e 2). Os contratos ainda esperam o advogado.

## O que foi decidido

- **Chave desligada.** A assinatura só é pedida quando a equipe liga a chave "Pedir a assinatura do contrato" em Configurações (`platform_settings.contract_signing_required_since`; nulo = desligada). Com ela desligada, nada muda para ninguém: a sessão lê uma linha e segue.
- **Textos num arquivo só.** Os dois contratos (resumo item a item e texto completo) moram em `packages/shared/src/domain/contract-documents.ts`, com versão e data de início. Desde 23/11/2026 a tela não marca mais o texto como provisório (Guilherme: "remova aquilo de 'provisorio'"); a versão continua `2026-11-21-provisorio`, porque a chave foi ligada em produção no mesmo dia e pode já haver assinaturas dessa versão. Trocar o texto = editar esse arquivo e subir a versão.
- **Tela de assinatura** (`/assinar-contrato`): etapa 1, uma caixa por ponto do resumo e o link para o contrato completo (`/contrato/fornecedor`, `/contrato/vendedor`, páginas públicas); etapa 2, código de 6 números enviado ao e-mail da conta.
- **Código por e-mail:** vale 10 minutos, aceita 5 tentativas, um novo só depois de 1 minuto e no máximo 5 por dia por pessoa. O e-mail usa a cota geral, não a de acesso à conta, para nunca gastar a recuperação de senha de ninguém. No banco fica só o HMAC-SHA256 do código (chave `BETTER_AUTH_SECRET`, ligado à pessoa); o código novo só invalida os anteriores depois que o e-mail sai; se o envio falhar, ele é descartado e o anterior continua valendo.
- **Prova de cada assinatura** (`contract_signatures`, só inserção): versão, SHA-256 do texto exato aceito (título, resumo e texto completo), itens marcados, data e hora (UTC), fuso do navegador, IP, navegador e tipo de aparelho (lidos do user agent, guardado também), e nome, CPF, CNPJ, empresa, e-mail e telefone do momento. Os dados pessoais e o IP ficam cifrados com a mesma chave dos tokens das lojas (`TOKEN_ENCRYPTION_KEY`). Nada disso vai para log.
- **A prova sobrevive à conta.** As chaves estrangeiras de `contract_signatures` são `set null`: apagar a conta ou o perfil não apaga a prova, que existe para defender uma disputa. O prazo de guarda (5 anos depois do fim do contrato) entra na fatia dos documentos, com a limpeza automática.
- **Quem assina:** o perfil (loja do vendedor ou marca do fornecedor), por quem está usando a conta. A equipe, entrando como cliente, não pede código nem assina (bloqueado como o aceite dos termos).
- **Prazos** (Guilherme, "Aprovo os quatro"):
  - perfil criado depois de ligar a chave: assina antes de usar o painel (o fornecedor, portanto, antes de enviar o catálogo);
  - perfil que já existia: 30 dias, contados de quando a chave liga ou de quando uma versão nova começa (o que for depois), com um aviso no topo do painel;
  - vendedor depois dos 30 dias: o painel só abre depois de assinar;
  - fornecedor depois dos 30 dias: continua no painel para enviar as vendas já feitas; a pausa dos anúncios entra na fatia 3.
- **Versão nova pede novo aceite:** a assinatura vale por versão; uma versão nova volta a pedir, com os mesmos 30 dias para quem já usava.

## Ponto de encaixe da selfie e do SMS

A selfie com prova de vida e o código por SMS dependem de um serviço externo ainda em pesquisa. Ficam de fora desta fatia, com o encaixe pronto:

- `contract_signatures.verification_method` (hoje só `email_code`) recebe os valores novos (`sms_code`, `selfie_liveness`) com a migração do serviço escolhido; o resultado da verificação (identificador da checagem no serviço, nota de semelhança) entra em colunas novas da mesma tabela.
- A etapa extra entra entre as duas etapas da tela (`use-contract-signing.ts`): a etapa 2 só libera depois que o serviço confirmar, e `signContract` passa a exigir a confirmação do serviço antes de gravar.
- O SMS reaproveita a tabela `contract_signing_codes` e as mesmas regras de validade e tentativas; só muda o envio (o telefone do perfil em vez do e-mail).

## Cuidados antes de ligar a chave

- **Fornecedor:** o aviso dos 30 dias diz que, depois do prazo, os produtos param de receber pedidos novos. Isso só acontece com a parte 3 (pausa dos anúncios pela suspensão do fornecedor, combinada com o chat de regras de cadastro). Não ligar a chave para fornecedores antes da parte 3 estar no ar.
- **Bloqueio só na tela:** nesta fatia o bloqueio é o desvio das páginas para a tela de assinatura. As funções do servidor e a API pública não conferem a assinatura. A parte 3 decide se o servidor também passa a cobrar (por exemplo, recusar a publicação de quem está bloqueado).
- **Chave de cifra:** a prova é cifrada com a `TOKEN_ENCRYPTION_KEY`, a mesma dos tokens das lojas, numa versão só e sem dado associado. Trocar essa chave deixa ilegíveis as provas, que precisam durar 5 anos depois do fim do contrato. Antes de qualquer troca, é preciso uma rotação que releia e recifre as provas (ou uma chave própria com versão), a decidir na parte 2, junto com os documentos.

## O que foi descartado

- **Plugin de código por e-mail do Better Auth (`emailOTP`):** serve para entrar na conta ou confirmar o e-mail, não para assinar um documento específico com prova ligada à versão.
- **Uma tabela paralela de aceite:** a assinatura não substitui o aceite dos termos de uso (`terms_acceptances`), que continua igual; o contrato é um documento a mais, por perfil.
- **Biblioteca para ler o navegador:** uma leitura simples do user agent basta para dizer "celular, Safari" numa disputa, e o texto inteiro fica guardado.
- **Recusar o envio das vendas já feitas do fornecedor atrasado:** deixaria o comprador sem o produto. Só os anúncios pausam (fatia 3).
