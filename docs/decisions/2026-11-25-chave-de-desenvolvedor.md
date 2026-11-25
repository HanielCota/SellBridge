# 2026-11-25: Chave de desenvolvedor, separada da API dos clientes e visível só para os devs

**Decisão:** o SellBridge ganha uma **chave de desenvolvedor**, diferente das chaves da API v1 (as da tela "Integrações", que cada organização cria para os próprios sistemas) e dos webhooks, que continuam como estão. A chave de desenvolvedor serve para os devs do SellBridge usarem os dados em outros projetos.

- **Quem vê:** só as contas cujos e-mails estão na lista `DEVELOPER_EMAILS`, configurada no servidor (Coolify). Para todas as outras, inclusive a equipe e o administrador, a tela e as rotas não existem (respondem como página inexistente). O papel da conta no app não dá esse acesso, porque o administrador pode mudar papéis; a lista só muda por quem tem acesso ao servidor.
- **Onde:** uma tela escondida, "Chaves de desenvolvedor", onde o dev cria a chave e marca os tipos de informação que ela libera.
- **O que enxerga:** os dados de **todas** as organizações e fornecedores, limitados aos tipos marcados na chave. Entra o máximo possível como opção; quem cria a chave escolhe o que ela libera. Os dados pessoais dos compradores (endereço e CPF) são uma opção própria, desmarcada por padrão; sem ela, o pedido traz só o nome do comprador.
- **Começa só com leitura.** Criar ou mudar dados por essa chave fica para uma decisão futura.
- **Nunca sai:** tokens das lojas, chaves do Asaas, senhas e qualquer segredo guardado cifrado.
- **Travas:** a chave aparece uma vez só e fica guardada como hash; tem validade e pode ser revogada; todo uso fica registrado.

**Quem decidiu.** Guilherme, 25/11/2026, no chat da API para outro projeto:

1. "Eu quero uma api pra developers ... somente a gente tera acesso para usar em outros projetos. Eu preciso que ela puxe tudo que for possivel e ao gerar uma chave seja configuravel com o tipo de informação que eu quero."
2. "Eu não quero mexer nas chaves do webhook eu quero uma chave de api diferente para devs que n fique acessivel nem pra quem é admin somente para os devs do sellbridge."
3. Entre lista de e-mails no servidor com tela escondida (1) e chave criada só por comando no servidor (2): "vamos de 1. coloca so os emails das contas pra quem deve aparecer la no colify".
4. Sobre endereço e CPF dos compradores: "eu quero o maximo de coisas possivel ai na hora de cirar a chave a pessoa escolhe oque vai na chave".

## Atualização (25/11/2026, etapa 2): sem CPF do comprador

O SellBridge nunca guardou o CPF dos compradores (os marketplaces não mandam), só o endereço de entrega, cifrado. A opção passou a se chamar "Endereço de entrega dos compradores" e entrega só o endereço. Guilherme escolheu "Só endereço" entre isso e anotar uma task para guardar o CPF no futuro.

## Descartado

- **Estender a v1 das organizações** com mais tipos de dado: cada chave continuaria presa a uma organização, e a tela "Integrações" é vista pelos clientes.
- **Um papel "dev" na equipe:** o administrador pode mudar papéis e se daria o acesso.
- **Chave criada só por comando no servidor** (opção 2): mais fechada, mas cada chave nova ou revogada dependeria de alguém entrar no servidor.
- **Só webhooks:** não permitem consultar os dados.
