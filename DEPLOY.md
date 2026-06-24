# Colocar o backend online (grátis) — Render + MongoDB Atlas

Para o app (ou qualquer pessoa do grupo) testar sem rodar o backend no PC.
Tudo no plano gratuito. O backend já está pronto (lê `PORT`, `MONGODB_URI` e
`JWT_SECRET` do ambiente). O `render.yaml` na raiz automatiza o deploy.

> O que **só você** pode fazer: criar as contas (Atlas e Render) — elas pedem
> seu e-mail/login no navegador. Os 3 passos abaixo levam ~10 min. Depois me
> mande a URL do Render que eu ligo o app nela (ou siga o passo 3 você mesmo).

---

## Passo 1 — Banco de dados grátis (MongoDB Atlas)

1. Crie a conta: https://www.mongodb.com/cloud/atlas/register
2. Crie um cluster **M0 (Free)**.
3. **Database Access** → crie um usuário e senha (anote).
4. **Network Access** → Add IP Address → **Allow access from anywhere** (`0.0.0.0/0`).
5. **Connect → Drivers** → copie a *connection string*, algo como:
   `mongodb+srv://USUARIO:SENHA@cluster0.xxxxx.mongodb.net/consult_price`
   (troque `USUARIO`/`SENHA` e adicione `/consult_price` antes do `?`).

## Passo 2 — Hospedar o backend (Render)

1. Crie a conta: https://render.com (entre com o GitHub).
2. **New → Blueprint** → conecte o repositório **GODsGhst/pechincha**.
   O Render lê o `render.yaml` e cria o serviço `consult-price-api`.
3. Em **Environment**, defina:
   - `MONGODB_URI` = a connection string do Atlas (passo 1).
   - (`JWT_SECRET` o Render gera sozinho.)
4. **Create / Deploy**. Em alguns minutos sai uma URL pública, ex.:
   `https://consult-price-api.onrender.com`
5. Teste no navegador: abrir essa URL deve mostrar
   `{"message":"API do Comparador de Preços por Cupons Fiscais",...}`.

> O plano free hiberna após ~15 min sem uso; a 1ª chamada depois disso demora
> ~30s (cold start). Normal para testes.

### (Opcional) Popular com dados de exemplo
No seu PC, aponte o seed para o Atlas e rode uma vez:
```bash
cd backend
# Windows PowerShell:
$env:MONGODB_URI="mongodb+srv://USUARIO:SENHA@cluster0.xxxxx.mongodb.net/consult_price"; npm run seed
```
Cria 3 lojas, 7 produtos e o login de teste `demo@consultprice.com` / `senha123`.

## Passo 3 — Apontar o app para a API online

No `app/app.json`, dentro de `expo`, adicione:
```json
"extra": {
  "apiUrl": "https://consult-price-api.onrender.com/api"
}
```
Pronto: o app passa a usar o backend online em qualquer lugar (não precisa
mais de Wi-Fi local nem `adb reverse`). No Expo Go, recarregue o app.

> Me mande a URL do Render que eu faço esse passo 3 e valido pra você.

---

## Alternativas de hospedagem
- **Railway** (`railway.app`) — também roda Express direto; usa créditos grátis.
- **Vercel** — grátis, porém exige adaptar o Express para função serverless.
- **Fly.io** / **Koyeb** — grátis com limites; pedem cartão.

Render foi escolhido por rodar o Express **sem alterar o código**.
