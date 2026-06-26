# Colocar o projeto online — Render + MongoDB Atlas

Para o app, o site e qualquer pessoa do grupo testarem sem rodar servidor no PC.
O `render.yaml` na raiz cria/atualiza dois serviços:

- `consult-price-api`: backend Node/Express.
- `pechincha-web`: site web estático.

> O que **só você** pode fazer: criar as contas (Atlas e Render) — elas pedem
> seu e-mail/login no navegador. O app já aponta para a API pública em
> `app/app.json`.

---

## Passo 1 — Banco de dados grátis (MongoDB Atlas)

1. Crie a conta: https://www.mongodb.com/cloud/atlas/register
2. Crie um cluster **M0 (Free)**.
3. **Database Access** → crie um usuário e senha (anote).
4. **Network Access** → em plano grátis do Render, normalmente será preciso
   liberar `0.0.0.0/0`, porque o IP de saída pode variar. Use senha forte no
   usuário do banco. Em produção paga, prefira IP fixo/dedicado do Render e
   restrinja a allowlist no Atlas.
5. **Connect → Drivers** → copie a *connection string*, algo como:
   `mongodb+srv://USUARIO:SENHA@cluster0.xxxxx.mongodb.net/consult_price`
   (troque `USUARIO`/`SENHA` e adicione `/consult_price` antes do `?`).

## Passo 2 — Hospedar backend e site (Render)

1. Crie a conta: https://render.com (entre com o GitHub).
2. **New → Blueprint** → conecte o repositório **GODsGhst/pechincha**.
   O Render lê o `render.yaml` e cria/atualiza `consult-price-api` e
   `pechincha-web`.
3. No serviço `consult-price-api`, abra **Environment** e defina manualmente:
   - `MONGODB_URI` = a connection string do Atlas (passo 1).
   - (`JWT_SECRET` o Render gera sozinho.)
4. **Manual Deploy / Deploy latest commit**. Em alguns minutos sai uma URL pública, ex.:
   `https://consult-price-api.onrender.com`
5. Teste no navegador: abrir essa URL deve mostrar
   `{"message":"API do Comparador de Preços por Cupons Fiscais",...}`.

> O `MONGODB_URI` não fica no `render.yaml`: ele é segredo e deve permanecer
> no painel do Render. Se o Blueprint aparecer como **Failed sync**, confirme
> que o serviço já tem essa variável em **Environment** e rode o sync/deploy de novo.

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

## Passo 3 — Conferir app e site

O app já está configurado em `app/app.json`:

```json
"extra": {
  "apiUrl": "https://consult-price-api.onrender.com/api"
}
```

O site usa `VITE_API_URL=https://consult-price-api.onrender.com/api`, definido
no próprio `render.yaml`. Depois do deploy, valide:

- API: `https://consult-price-api.onrender.com`
- Site: `https://pechincha-web.onrender.com`

---

## Alternativas de hospedagem
- **Railway** (`railway.app`) — também roda Express direto; usa créditos grátis.
- **Vercel** — grátis, porém exige adaptar o Express para função serverless.
- **Fly.io** / **Koyeb** — grátis com limites; pedem cartão.

Render foi escolhido por rodar o Express **sem alterar o código**.
