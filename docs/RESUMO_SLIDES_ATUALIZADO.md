---
marp: true
paginate: true
theme: default
---

# Pechincha

## Resumo atualizado do projeto

Comparador de precos por cupons fiscais NFC-e, com app mobile, site, API,
painel administrativo, cache offline e camadas de seguranca.

<!--
Fala: "Este resumo ja inclui as ultimas melhorias: seguranca, recuperacao de senha, confirmacao de e-mail, admin, LGPD e funcionamento offline."
-->

---

# Problema

- Pesquisar preco manualmente toma tempo.
- O mesmo produto muda de preco entre mercados.
- O cupom fiscal ja tem dados uteis, mas normalmente fica parado.
- Sem historico, o usuario nao sabe onde economizaria.

<!--
Fala: "A ideia do Pechincha e aproveitar dados que o usuario ja tem: a notinha fiscal. A partir dela, o sistema monta historico real de precos."
-->

---

# Solucao

O Pechincha permite:

- ler QR Code de NFC-e;
- extrair produtos, valores e estabelecimento;
- salvar historico de compras e precos;
- comparar produtos e cestas;
- consultar mapa de estabelecimentos;
- usar app e site com a mesma API.

<!--
Fala: "O sistema transforma a nota fiscal em dados pesquisaveis. Depois o usuario consegue buscar produto, comparar compra e montar lista."
-->

---

# Arquitetura

```text
App Expo / Site React
        |
        v
Backend Node.js + Express
        |
        v
MongoDB
```

Servicos auxiliares:

- NFC-e / SEFAZ para dados do cupom;
- OpenStreetMap/Nominatim para geocodificacao;
- SMTP gratuito para e-mails de conta.

<!--
Fala: "A arquitetura segue MVC no backend: routes, controllers, models e services. O app e o site sao clientes finos, sem regra sensivel ou acesso direto ao banco."
-->

---

# Stack

| Camada | Tecnologias |
|---|---|
| Backend | Node.js, Express, Mongoose |
| Banco | MongoDB |
| App | Expo, React Native |
| Site | React, Vite |
| NFC-e | Cheerio, axios, QR Code |
| Seguranca | JWT, bcrypt, rate limit, 2FA |

<!--
Fala: "O projeto usa JavaScript de ponta a ponta, o que facilita integracao entre app, site e API."
-->

---

# Fluxo NFC-e

1. Usuario escaneia o QR Code.
2. App envia URL, imagem ou HTML para a API.
3. Backend valida a origem e busca/processa a NFC-e.
4. Parser extrai itens, loja, data, total e chave de acesso.
5. Sistema salva compra, produtos e historico de precos.
6. Usuario visualiza a notinha e pode comparar precos.

<!--
Fala: "A chave de acesso de 44 digitos evita duplicar a mesma nota e protege a qualidade do historico."
-->

---

# Funcionalidades do app

- Login, cadastro e confirmacao de e-mail.
- Recuperacao de senha.
- Escaneamento de QR Code.
- Historico de notinhas.
- Busca de produtos e menores precos.
- Lista/carrinho sincronizado.
- Mapa de estabelecimentos.
- Perfil com exportacao e exclusao de dados.

<!--
Fala: "O app ficou completo para o uso principal: escanear, guardar historico, pesquisar e comparar."
-->

---

# Offline e cache

O app continua util mesmo sem internet:

- guarda ultimas buscas e precos consultados;
- mantem historico/notinhas ja carregadas;
- mantem lista de compras em cache;
- enfileira alteracoes da lista;
- enfileira cupons lidos para sincronizar depois.

<!--
Fala: "A proposta offline e permitir que o usuario continue vendo dados recentes e nao perca acoes quando a conexao cair."
-->

---

# Site e painel admin

O site permite:

- login e cadastro;
- busca de produtos;
- lista de compras;
- historico;
- exportacao de dados;
- acesso ao painel administrativo.

No admin:

- gerenciar produtos;
- corrigir precos;
- gerenciar estabelecimentos;
- juntar produtos duplicados;
- alterar papeis de usuarios com superadmin.

<!--
Fala: "O site complementa o app e facilita administracao em tela maior."
-->

---

# Seguranca de conta

- Senhas com bcrypt.
- Politica de senha forte.
- Limite de tentativas de login.
- Rate limit por IP e por conta.
- Recuperacao de senha por e-mail.
- Confirmacao de e-mail no cadastro.
- 2FA por e-mail para admin e superadmin.

<!--
Fala: "Essas medidas reduzem risco de forca bruta, invasao de conta e uso indevido do painel admin."
-->

---

# Seguranca da API

- JWT com algoritmo restrito.
- Rotas protegidas por middleware.
- Permissoes separadas para usuario, admin e superadmin.
- CORS restrito em producao.
- Headers HTTP de seguranca.
- Bloqueio de metodos HTTP indevidos.
- Validacao de Content-Type JSON.
- Validacao contra URLs locais/privadas na NFC-e.

<!--
Fala: "O backend concentra as regras sensiveis. O usuario comum nao consegue acessar rotas de admin nem dados de outras contas."
-->

---

# Privacidade e LGPD

- Aceite de termos e politica de privacidade no cadastro.
- Exportacao de dados pessoais em JSON.
- Exclusao da propria conta.
- Exclusao remove compras, importacoes, lista e historico vinculado.
- Tokens de reset/verificacao ficam salvos apenas como hash.

<!--
Fala: "A parte de privacidade cobre os pontos basicos: consentimento, portabilidade/exportacao e exclusao de dados."
-->

---

# Deploy gratuito

Pensado para rodar com custo zero:

- backend no Render free;
- site estatico no Render;
- MongoDB em plano gratuito ou local;
- e-mail via SMTP gratuito;
- OpenStreetMap/Nominatim sem custo;
- sem servicos pagos obrigatorios.

<!--
Fala: "A arquitetura evita dependencias pagas obrigatorias. Para producao, so precisa configurar credenciais gratuitas com cuidado."
-->

---

# Precisa instalar nova versao?

Depende de como voce esta usando:

- Site: nao precisa instalar, basta fazer deploy/atualizar o site.
- Backend: nao instala no celular, basta fazer deploy da API.
- App no Expo Go: basta recarregar o projeto.
- APK instalado no celular: precisa gerar e instalar uma nova versao.

Nao houve dependencia nativa nova, mas houve mudanca em telas e logica do app.

<!--
Fala: "Como mudamos Login, Perfil e fluxo de autenticacao no app, quem usa APK antigo precisa instalar um APK novo para ver essas telas."
-->

---

# O que foi validado

- Teste completo da API: 134 verificacoes OK.
- Build do site: OK.
- Export Android do app: OK.
- Auditoria de dependencias: 0 vulnerabilidades altas/criticas.
- Regras de producao validadas.

<!--
Fala: "A validacao automatizada cobre autenticacao, admin, NFC-e, produtos, lista, compras, comparacao, mapa, privacidade e exclusao."
-->

---

# Resultado final

O Pechincha entrega:

- app mobile;
- site;
- backend MVC;
- banco MongoDB;
- leitura de NFC-e;
- comparacao de precos;
- painel admin;
- seguranca de conta;
- privacidade basica;
- modo offline/cache;
- deploy gratuito.

<!--
Fala: "O projeto saiu de uma ideia de comparador para uma aplicacao completa, com fluxo real de uso e cuidados importantes de seguranca."
-->
