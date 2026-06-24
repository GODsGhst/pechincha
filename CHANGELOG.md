# Consult Price — Changelog & Handoff

> Documento de continuidade. Se a sessão acabar, qualquer pessoa (ou outro
> agente de IA, ex.: Codex) consegue continuar o projeto lendo este arquivo.
> Última atualização: 2026-06-23.

---

## 1. O que é o projeto

App **colaborativo de comparação de preços por cupons fiscais (NFC-e)**, da FANS
(Faculdade de Nova Serrana). O usuário escaneia o QR Code do cupom fiscal; os
itens e preços são extraídos e viram um histórico por produto, estabelecimento
e data — para comparar onde está mais barato em compras futuras. Cada cupom
escaneado alimenta a base de toda a comunidade.

Nome de exibição do app: **Consult Price** (alinhado ao repo do grupo).

---

## 2. Repositório e localização

- **GitHub (oficial, pessoal):** https://github.com/GODsGhst/pechincha (público) — contém `backend/` + `app/`.
- **Local no PC:** `C:\Users\gh0st\Desktop\TrabalhoProva` — é um repositório git próprio (branch `main`), já conectado ao GitHub acima.
- **Repo do GRUPO (de um colega):** `CONSULT-PRICE/consult-price-api` — a conta GODsGhst só tem permissão de **leitura** nele. Para contribuir: fork + Pull Request, ou pedir acesso de colaborador.
- ⚠️ A pasta `TrabalhoProva` fica dentro de `C:\Users\gh0st`, que por acidente também é um repo git (a home inteira). **Sempre rode git dentro de `TrabalhoProva`**, nunca na home.

---

## 3. Como rodar (TESTADO E FUNCIONANDO)

### Pré-requisitos já instalados nesta máquina
- Node.js, npm; dependências (`node_modules`) já instaladas em `backend/` e `app/`.
- Android SDK em `%LOCALAPPDATA%\Android\Sdk` (via Android Studio). `adb` em `...\Sdk\platform-tools`.
- Celular Android (serial `RQCY1000HRB`) com **Expo Go (SDK 54)** instalado, conectado por **USB** com depuração ativada.

### Passo a passo (2 terminais)

**Terminal 1 — backend persistente local (recomendado para salvar notinhas):**
```powershell
cd C:\Users\gh0st\Desktop\TrabalhoProva\backend
npm run dev:persist
```

**Alternativa descartável — backend com dados de exemplo (banco em memória):**
```powershell
cd C:\Users\gh0st\Desktop\TrabalhoProva\backend
npm run dev:demo
```

**Terminal 2 — app (Metro em modo Expo Go):**
```powershell
cd C:\Users\gh0st\Desktop\TrabalhoProva\app
npm start -- --go
```

**Abrir no celular pelo cabo (o scan do QR NÃO funciona — explicação na seção 7):**
```cmd
"%LOCALAPPDATA%\Android\Sdk\platform-tools\adb.exe" reverse tcp:8081 tcp:8081
"%LOCALAPPDATA%\Android\Sdk\platform-tools\adb.exe" reverse tcp:3001 tcp:3001
"%LOCALAPPDATA%\Android\Sdk\platform-tools\adb.exe" shell am start -a android.intent.action.VIEW -d "exp://127.0.0.1:8081"
```

**Login de teste:** `demo@consultprice.com` / `senha123`

> Se o adb der "device offline": `adb kill-server` depois `adb start-server` e reconecte o cabo.
> Se o Metro subir na 8082 (porta 8081 ocupada), use `8082` no reverse e no `exp://127.0.0.1:8082`.

---

## 4. Arquitetura

### Backend (`backend/`) — Node.js + Express + MongoDB (Mongoose)
```
backend/src/
├── config/database.js          # conexão MongoDB
├── controllers/                # auth, produto, compra, estabelecimento, nfce, comparacao
├── middleware/authMiddleware.js# valida JWT
├── models/                     # Usuario, Estabelecimento, Produto, Compra, HistoricoPreco
├── routes/                     # uma por recurso
├── services/
│   ├── nfceParser.js           # parsing do HTML da NFC-e (cheerio) + chave de acesso
│   ├── compraService.js        # dedup de produto + atualiza menor/ultimo preço + histórico
│   ├── geoService.js           # geocodifica endereço (Nominatim/OpenStreetMap)
│   └── qrCodeService.js        # decodifica QR de imagem (jimp + qrcode-reader)
├── app.js                      # express + rotas
└── scripts/
    ├── seed.js                 # dados de exemplo
    ├── devDemo.js              # sobe MongoDB em memória + seed + API (npm run dev:demo)
    └── testeApi.js             # teste e2e (npm run test:api) — 28 checagens
```

### App (`app/`) — Expo SDK 54 / React Native 0.81 (JS)
```
app/
├── App.js                      # fontes + AuthProvider + CartProvider + navegação (gate de login)
└── src/
    ├── theme.js                # design system (verde esmeralda, fontes, espaçamento)
    ├── api/client.js           # fetch + base URL (auto-detecta IP/porta 3001) + injeção do token
    ├── context/AuthContext.js  # login/registro/logout; token no expo-secure-store
    ├── context/CartContext.js  # carrinho (em memória)
    ├── components/TabBar.js     # barra de abas custom com botão central de escanear (FAB)
    ├── utils/format.js         # formatBRL, tempoRelativo
    └── screens/                # Login, Home, Scan, Cart, Search, Product, Profile, Area
```

### Segurança (cliente fino)
O app só lê o QR, busca o HTML na SEFAZ e envia ao backend. Todo o parsing,
dedup, análise e o banco ficam no servidor — só o resultado volta. O token JWT
fica no Keychain (iOS) / Keystore (Android) via `expo-secure-store`.

---

## 5. Endpoints da API

| Método | Rota | Auth | Descrição |
|---|---|---|---|
| POST | `/api/auth/register` | Não | Cadastro |
| POST | `/api/auth/login` | Não | Login (retorna token + usuario) |
| POST | `/api/nfce/processar` | Sim | Processa cupom: body `{ html }` ou `{ url_origem }` ou `{ imagem_base64 }`. Dedup por chave de acesso (409 se repetido) |
| GET | `/api/produtos?nome=` | Não | Busca produtos |
| GET | `/api/produtos/menores?limite=` | Não | Ranking de menores preços (Home) |
| GET | `/api/produtos/:id` | Não | Detalhe + histórico de preços |
| GET/POST/PUT/DELETE | `/api/produtos[...]` | misto | CRUD |
| GET | `/api/compras` | Sim | Compras do usuário (perfil) |
| GET/POST/PUT/DELETE | `/api/compras[...]` | Sim | CRUD de compras |
| GET | `/api/estabelecimentos` | Não | Lista |
| GET | `/api/estabelecimentos/mapa` | Não | Lojas com coordenadas + estatísticas |
| GET | `/api/estabelecimentos/:id/historico` | Não | Série temporal de preços do local |
| GET | `/api/comparacao/menores` | Sim | Menores preços dos produtos que o usuário comprou |
| POST | `/api/comparacao/cesta` | Sim | Compara a lista livre do carrinho e ranqueia a cesta por estabelecimento |
| GET | `/api/comparacao/compras/:id?visao=total\|unitario` | Sim | Compara a compra (cesta total ou item a item) |

---

## 6. Telas do app

1. **Login/Cadastro** — gate de acesso; token no SecureStore.
2. **Início** — header esmeralda, busca, categorias, "melhores preços".
3. **Escanear** (botão central) — câmera lê QR → busca SEFAZ → backend → tela de recompensa "+1 colaboração".
4. **Lista** (carrinho) — itens desejados, melhor cesta por estabelecimento, cobertura e total.
5. **Buscar** — busca de produtos com debounce.
6. **Produto** — melhor preço + preços por local/data + "adicionar à lista".
7. **Perfil** — total de colaborações + histórico + sair.
8. **Área de pesquisa** — GPS via Expo Location + raio de distância + lojas próximas do backend.

Design guiado por psicologia comportamental: Lei de Fitts/zona do polegar
(botão de escanear central), Lei de Hick (poucas abas), aversão à perda
(economias enquadradas como "economize R$ X"), recompensa variável (colaborações).

---

## 7. Armadilhas importantes (LER antes de continuar)

- **SDK do Expo:** use **SDK 54 estável**. O `create-expo-app@latest` instalou **SDK 56 canary**, que NENHUM Expo Go publicado roda ("Project is incompatible with this version of Expo Go"). Corrigido com `npm i expo@^54` + `npx expo install --fix` + reinstalação limpa (`rm -rf node_modules package-lock.json && npm install --legacy-peer-deps`). **Não voltar pra 56/canary.**
- **Rodar no Android é por USB + adb**, não por scan de QR: o celular está conectado por cabo (não na mesma Wi-Fi do PC), então o QR (que aponta pra um IP de rede) não alcança. Por isso usa-se `adb reverse` + abrir `exp://127.0.0.1:8081`.
- **`adb reverse tcp:3001`** é essencial: sem ele, `localhost:3001` no celular seria o próprio celular, não o PC (onde está o backend).
- **cmd vs PowerShell:** `$env:VAR="..."` é PowerShell; em cmd é `set VAR=...`. Setar `ANDROID_HOME` ajuda o Expo a achar o SDK.
- **Banco:** o modo `dev:demo` usa MongoDB **em memória** — os dados **somem ao encerrar**. Para persistir de verdade, configurar `MONGODB_URI` (Atlas ou local) no `backend/.env` e usar `npm run dev`.
- **Banco local persistente:** use `npm run dev:persist` para salvar as notas em `backend/.data/mongodb` sem depender de MongoDB instalado nem Atlas.
- O erro de hook `check-sql-files.py` que aparece a cada escrita é **órfão e inofensivo** (some ao reiniciar o Claude Code).

---

## 8. Histórico do que foi feito (changelog)

- **Backend completo:** auth JWT, parser de NFC-e (cheerio), leitura de QR por imagem (jimp), dedup de produtos e de cupons (chave de acesso → 409), histórico de preços, endpoints de mapa/geocodificação (Nominatim), comparação (total/unitário). Teste e2e: **28/28**.
- **Integração do repo do colega:** trazida a extração da chave de acesso (44 dígitos) + dedup de cupom.
- **App móvel (Expo/React Native):** 8 telas, design verde esmeralda profissional, navegação centrada no escanear, cliente de API, contexto de auth (SecureStore) e de carrinho. Empacota limpo.
- **Modo demo:** `npm run dev:demo` (MongoDB em memória + seed: 3 lojas em Nova Serrana, 7 produtos com histórico, usuário de teste).
- **Correção de SDK:** migrado de SDK 56 canary → SDK 54 estável (compatível com Expo Go).
- **Cesta mais barata:** criado `POST /api/comparacao/cesta` e ligado à tela Lista para comparar o carrinho livre.
- **Scanner/GPS:** scanner passou a enviar a URL da NFC-e ao backend; galeria tenta ler QR localmente; Área de pesquisa usa `expo-location`.
- **Persistência local:** criado `npm run dev:persist`, com MongoDB em disco em `backend/.data/mongodb`; diferente de `dev:demo`, não apaga notas ao reiniciar.
- **Repositório:** criado `GODsGhst/pechincha` (backend + app), separado do antigo (que estava por engano no repo do "Conversor de Moedas").

Commits relevantes (branch `main` de `pechincha`): backend inicial, app móvel, modo demo, fix SDK 54.

---

## 9. Pendências / próximos passos (em ordem sugerida)

1. **MongoDB Atlas para produção** — o desenvolvimento já pode usar `npm run dev:persist` com dados em disco. Para deploy/uso real fora da máquina, criar conta no Atlas e colar a connection string em `backend/.env` (`MONGODB_URI`).
2. **Mapa real** — `react-native-maps` + `expo-location` na tela Área de pesquisa, usando as coordenadas que o backend já geocodifica (`/estabelecimentos/mapa`).
3. **Persistência do carrinho** — hoje o `CartContext` é em memória; usar `@react-native-async-storage/async-storage`.
4. **Importar QR da galeria** no scanner (a tela já prevê o botão).
5. **Subir o backend/app no repo do grupo** (`CONSULT-PRICE/consult-price-api`) via fork + PR (conta só tem leitura).

---

## 10. Estado dos servidores nesta sessão

Nesta sessão, o **backend** (`dev:demo`, porta 3001) e o **Metro** (porta 8081)
foram iniciados em background pelo assistente. Eles **encerram ao fechar a
sessão do Claude**. Para rodar de novo, siga a seção 3.
