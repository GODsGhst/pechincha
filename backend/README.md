# Backend — Comparador de Preços por Cupons Fiscais

API REST do Sistema Colaborativo de Comparação de Preços por Cupons Fiscais (NFC-e).

**Stack:** Node.js + Express + MongoDB (Mongoose) + JWT + Cheerio

## Como rodar

```bash
cd backend
npm install

# MODO DEMO — sobe um MongoDB em memória já populado com dados de exemplo.
# Não precisa instalar nem configurar banco. Os dados somem ao encerrar.
npm run dev:demo
#   Login de teste: demo@consultprice.com / Senha123

# MODO PERSISTENTE LOCAL — salva as notas em backend/.data/mongodb.
# Também não precisa instalar MongoDB. Use este para testar salvamento real.
npm run dev:persist
#   Login de teste: demo@consultprice.com / Senha123

# desenvolvimento real (precisa do MONGODB_URI no .env — Atlas ou local)
cp .env.example .env
npm run dev

# produção
npm start
```

## Variáveis de ambiente (.env)

| Variável | Descrição | Padrão |
|---|---|---|
| `PORT` | Porta da API | `3001` |
| `MONGODB_URI` | String de conexão do MongoDB | `mongodb://localhost:27017/comparador_precos` |
| `JWT_SECRET` | Chave de assinatura dos tokens | — (obrigatória) |
| `JWT_EXPIRES_IN` | Expiração do token | `7d` |
| `CORS_ORIGIN` | Origens permitidas (separadas por vírgula). Em produção, só URLs HTTPS explícitas | lista local/dev |
| `PASSWORD_RESET_BASE_URL` | URL usada para montar link de redefinição de senha. Em produção, deve ser HTTPS | — |
| `PASSWORD_RESET_EXPOSE_TOKEN` | Expor token de reset no JSON (somente dev/teste; bloqueado em produção) | `true` em dev |
| `SMTP_HOST` | Host SMTP para enviar e-mail de recuperação | — |
| `SMTP_PORT` | Porta SMTP | `587` |
| `SMTP_SECURE` | `true` para SMTP com TLS direto | `false` |
| `SMTP_USER` | Usuário SMTP | — |
| `SMTP_PASS` | Senha/token SMTP | — |
| `EMAIL_FROM` | Remetente exibido nos e-mails | `SMTP_USER` |

> Para não perder notas ao reiniciar, use `npm run dev:persist` ou configure um
> `MONGODB_URI` real e rode `npm run dev`. O comando `npm run dev:demo` é
> descartável por design.

## Endpoints

### Autenticação
| Método | Rota | Auth |
|---|---|---|
| POST | `/api/auth/register` | Não |
| POST | `/api/auth/login` | Não |
| POST | `/api/auth/forgot-password` | Não |
| POST | `/api/auth/reset-password` | Não |

O login tem limite por IP, limite por e-mail e bloqueio temporário da conta
após tentativas repetidas de senha. A recuperação de senha salva apenas o hash
do token temporário no banco e envia as instruções por e-mail quando o SMTP está
configurado. Em desenvolvimento/teste o token pode voltar no JSON para facilitar
a apresentação; em produção não exponha esse token.

Os limites de requisição usam buckets compartilhados no MongoDB, com chaves
hashadas, então continuam funcionando quando a API roda com múltiplos workers
ou mais de uma instância.

Em produção, a API não inicia se faltar configuração crítica: `MONGODB_URI`,
`JWT_SECRET` forte, `CORS_ORIGIN` HTTPS, `PASSWORD_RESET_BASE_URL` HTTPS e SMTP
completo (`SMTP_HOST`, `SMTP_USER`, `SMTP_PASS`). Isso impede publicar o reset
de senha sem envio de e-mail real ou com configuração de desenvolvimento.

### NFC-e
| Método | Rota | Auth |
|---|---|---|
| POST | `/api/nfce/processar` | Sim |

Aceita três formas de entrada no body (use uma):

| Campo | Descrição |
|---|---|
| `imagem_base64` | Foto do cupom — o back-end decodifica o QR Code (jimp + qrcode-reader) e busca o HTML |
| `url_origem` | URL já extraída do QR Code — o back-end busca o HTML |
| `html` | HTML da página da NFC-e já capturado |

O back-end extrai a **chave de acesso** (44 dígitos) do cupom — do HTML ou
da própria URL do QR Code. Essa chave identifica a nota de forma única, então
um cupom já importado retorna **`409 Conflict`** (com o `compra_id` da compra
existente) em vez de duplicar os preços no histórico.

### Produtos
| Método | Rota | Auth |
|---|---|---|
| GET | `/api/produtos?nome=arroz` | Não |
| GET | `/api/produtos/menores?limite=20&nome=...` | Não |
| GET | `/api/produtos/:id` | Não |
| POST | `/api/produtos` | Sim |
| PUT | `/api/produtos/:id` | Sim |
| DELETE | `/api/produtos/:id` | Sim |

`/menores` retorna o ranking dos menores preços registrados, com o
estabelecimento (e coordenadas) onde cada um foi encontrado — alimenta a
barra lateral do mapa.

### Compras
| Método | Rota | Auth |
|---|---|---|
| GET | `/api/compras` | Sim |
| GET | `/api/compras/:id` | Sim |
| POST | `/api/compras` | Sim |
| PUT | `/api/compras/:id` | Sim |
| DELETE | `/api/compras/:id` | Sim |

### Estabelecimentos
| Método | Rota | Auth |
|---|---|---|
| GET | `/api/estabelecimentos` | Não |
| GET | `/api/estabelecimentos/mapa` | Não |
| GET | `/api/estabelecimentos/:id/historico?produto_id=...` | Não |
| GET | `/api/estabelecimentos/:id` | Não |
| POST | `/api/estabelecimentos` | Sim |
| PUT | `/api/estabelecimentos/:id` | Sim |
| DELETE | `/api/estabelecimentos/:id` | Sim |

`/mapa` retorna todos os estabelecimentos com coordenadas (lat/lng) e
estatísticas para os marcadores: total de preços registrados, produtos
distintos, quantos produtos têm o menor preço ali e última atividade.

`/:id/historico` retorna a série temporal de preços do estabelecimento
(para o gráfico de evolução), com filtro opcional por produto.

Os endereços extraídos das NFC-e são geocodificados automaticamente via
Nominatim/OpenStreetMap (gratuito). Se a geocodificação falhar, as
coordenadas podem ser definidas manualmente via
`PUT /api/estabelecimentos/:id` com `{ "localizacao": { "lat": ..., "lng": ... } }`.

### Comparação (baseada nas compras do usuário)
| Método | Rota | Auth |
|---|---|---|
| GET | `/api/comparacao/menores` | Sim |
| POST | `/api/comparacao/cesta` | Sim |
| GET | `/api/comparacao/compras/:id?visao=total\|unitario` | Sim |

`/menores` retorna os menores preços atuais **apenas dos produtos que o
usuário já comprou** (com estabelecimento e coordenadas) — é a fonte da
barra lateral do mapa.

`/cesta` compara uma lista livre, como o carrinho do app. Recebe
`{ "itens": [{ "produto_id": "...", "quantidade": 1 }] }`, simula o total
em cada estabelecimento com o último preço conhecido de cada produto e
retorna o ranking por menor total, cobertura e melhores preços individuais.

`/compras/:id` analisa uma compra do usuário em dois modos, escolhidos
pelo parâmetro `visao`:

- **`visao=total`** — simula a cesta inteira em cada estabelecimento
  usando o último preço conhecido de cada produto e ranqueia pelo valor
  final estimado. Estabelecimentos que não têm preço para todos os itens
  aparecem com `cobertura_completa: false`.
- **`visao=unitario`** — item por item: valor pago, menor preço atual,
  onde ele está e a economia unitária/total. Inclui um `resumo` com
`valor_pago`, `valor_minimo_possivel` e `economia_potencial`.

### Administração
| Método | Rota | Auth |
|---|---|---|
| GET | `/api/admin/resumo` | Admin |
| GET | `/api/admin/usuarios` | Admin |
| PUT | `/api/admin/usuarios/:id/papel` | Superadmin |
| GET | `/api/admin/precos` | Admin |
| PUT | `/api/admin/precos/:id` | Admin |
| DELETE | `/api/admin/precos/:id` | Admin |
| POST | `/api/admin/produtos/juntar` | Admin |
| GET | `/api/admin/auditoria` | Admin |

Use `npm run admin:promote -- email@exemplo.com superadmin` para promover o
primeiro super administrador. Administradores podem verificar e corrigir
produtos, preços, estabelecimentos e junções; super administradores também
podem alterar permissões de usuários.

Rotas autenticadas exigem o header `Authorization: Bearer <token>`.

## Estrutura

```
backend/
├── src/
│   ├── config/database.js          # Conexão MongoDB
│   ├── controllers/                # Recebem requisição, delegam, respondem
│   ├── middleware/authMiddleware.js # Validação JWT
│   ├── models/                     # Schemas Mongoose
│   ├── routes/                     # Mapeiam URLs para controllers
│   ├── services/
│   │   ├── nfceParser.js           # Parsing do HTML da NFC-e (Cheerio)
│   │   └── compraService.js        # Deduplicação de produtos + histórico de preços
│   └── app.js                      # Express app + rotas
├── server.js                       # Entry point
└── package.json
```
