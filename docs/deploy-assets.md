# Assets durante deploys

O servidor de produção (`apps/web/server.ts`, também usado por `pnpm start`) publica
os arquivos de `dist/client/assets` em `WEB_ASSETS_DIR` antes de abrir a porta HTTP.
Somente arquivos completos entram no arquivo persistente, sem sobrescrever nomes
existentes. Assim, containers antigos e novos podem iniciar simultaneamente.

No Docker, `WEB_ASSETS_DIR=/data/uploads/.web-assets` reutiliza o volume persistente
de uploads já configurado no Coolify. A montagem de `/data/uploads` deve ser a mesma
entre as versões. Os uploads ficam fora da árvore servida; somente `/assets/` pode
consultar o arquivo persistente. Arquivos públicos sem hash vêm do build atual.
Fora do Docker, o padrão é `apps/web/.web-assets`; configure `WEB_ASSETS_DIR` para um
diretório persistente se os releases usarem checkouts separados.

Um browser que recebeu HTML da versão anterior continua encontrando seus módulos,
CSS e fontes mesmo após a remoção do container anterior. Assets recebem
`Cache-Control: public, max-age=31536000, immutable`; HTML recebe `no-store`.
Um asset inexistente retorna 404 com `no-store`, sem cair na renderização HTML.

O documento também instala um script antes dos módulos da aplicação para recuperar
falhas de importação ou do módulo inicial com uma recarga após um segundo. Há no
máximo uma tentativa por minuto e aba, inclusive após a recarga. Erros comuns da
aplicação, recursos externos e estado offline não causam recarga automática.
Se `sessionStorage` não estiver disponível, a recuperação automática é desativada
para evitar loops. Uma recarga pode descartar dados ainda não salvos; a retenção
dos assets é a proteção principal para que esse fallback não seja necessário.

## Operação

- Não apague `.web-assets` durante um deploy. Ela contém arquivos referenciados
  por abas de versões anteriores e cresce com os builds. Monitore o uso do volume;
  qualquer limpeza precisa considerar o tempo de vida dessas abas.
- A retenção começa no primeiro deploy com este servidor. Os builds anteriores à
  adoção não são recuperados retroativamente. Abas dessas versões devem ser
  recarregadas uma vez após a implantação.
- Preserve o rolling update e o healthcheck do Coolify: o container novo só recebe
  tráfego depois de publicar os assets e iniciar com sucesso.
- Falhas reais de rede, indisponibilidade do proxy e a primeira implantação ainda
  podem gerar mensagens no console. A recuperação não promete eliminar falhas de
  rede; ela evita que uma falha de módulo deixe a página sem recuperação.

## Validação

Os testes em `production-assets.test.ts` simulam dois releases, removem o primeiro
e verificam que o servidor atual continua entregando seus módulos com MIME correto.
Também exercitam publicação concorrente, arquivos ausentes e isolamento dos dados.
Os testes de `asset-recovery.test.ts` executam o script inline antes da hidratação
e verificam a recuperação do entrypoint, limite de recargas e exceções.

Referência: [falhas de carregamento no Vite](https://vite.dev/guide/build#load-error-handling).
