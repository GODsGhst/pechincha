// Popula um MongoDB REAL (ex.: Atlas) com dados de exemplo, para testar a API
// hospedada. Rode UMA vez apontando para o banco de produção:
//   MONGODB_URI="mongodb+srv://..." npm run seed
// ATENÇÃO: o seed limpa as coleções antes de inserir (ver scripts/seed.js).

require('dotenv').config();
const mongoose = require('mongoose');
const seed = require('./seed');

(async () => {
  const uri = process.env.MONGODB_URI;
  if (!uri || uri.includes('localhost')) {
    console.error('Defina MONGODB_URI com o banco remoto (Atlas). Ex.:');
    console.error('  MONGODB_URI="mongodb+srv://usuario:senha@cluster.mongodb.net/consult_price" npm run seed');
    process.exit(1);
  }

  console.log('Conectando ao banco remoto...');
  await mongoose.connect(uri);
  const resumo = await seed();
  console.log('Seed concluído:', JSON.stringify(resumo));
  console.log('Login de teste: demo@consultprice.com / senha123');
  await mongoose.disconnect();
  process.exit(0);
})().catch((err) => {
  console.error('Falha no seed:', err.message);
  process.exit(1);
});
