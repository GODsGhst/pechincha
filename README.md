# Pechincha — Comparador de Preços por Cupons Fiscais (NFC-e)

Sistema colaborativo que lê o **QR Code de cupons fiscais (NFC-e)**, extrai os
itens comprados e monta um histórico de preços por produto, estabelecimento e
data — para comparar onde está mais barato em compras futuras.

Projeto da FANS (Faculdade de Nova Serrana).

## Estrutura

```
pechincha/
├── backend/   API REST (Node.js + Express + MongoDB)
└── app/       Aplicativo híbrido (Expo / React Native) — iOS e Android
```

## Backend

API REST com autenticação JWT, parsing de NFC-e (Cheerio), deduplicação de
produtos e de cupons (chave de acesso), histórico de preços e comparação.

```bash
cd backend
npm install
cp .env.example .env   # configure o MONGODB_URI e o JWT_SECRET
npm run dev            # sobe a API
npm run test:api       # teste de ponta a ponta (MongoDB em memória)
```

Endpoints principais: `/api/auth`, `/api/nfce/processar`, `/api/produtos`,
`/api/compras`, `/api/estabelecimentos`, `/api/comparacao`. Detalhes em
[backend/README.md](backend/README.md).

## App (em construção)

Aplicativo híbrido focado em dois gestos de baixo atrito:

1. **Escanear** o QR Code do cupom (ação central, sempre ao alcance do polegar).
2. **Carrinho** — montar uma lista de itens desejados e ver onde a cesta sai
   mais barata, com a localização.

Além de **busca de preços** e **login** (cada usuário vê apenas suas notas).

### Segurança

O app faz a requisição à SEFAZ e envia os dados ao backend, que faz o cadastro
e a análise — apenas o resultado volta ao aplicativo. Nenhuma regra de negócio
ou credencial de banco fica no dispositivo (cliente fino). O token JWT é
guardado no Keychain (iOS) / Keystore (Android).

### Design

Layout e arquitetura de navegação guiados por teoria comportamental (Lei de
Fitts e zona do polegar para a ação de escanear, Lei de Hick para reduzir
opções, aversão à perda no enquadramento das economias, recompensa variável
para reforçar o hábito de escanear).

## Stack

- **Backend:** Node.js, Express, MongoDB (Mongoose), JWT, Cheerio, jimp + qrcode-reader
- **App:** Expo (React Native), expo-camera, expo-secure-store
