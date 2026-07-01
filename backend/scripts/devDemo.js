// Modo demonstração: sobe um MongoDB em memória, popula com dados de exemplo
// e inicia a API — tudo num comando, sem precisar instalar banco.
// Os dados são apagados ao encerrar (não persistem). Para uso real, configure
// MONGODB_URI (Atlas ou local) e rode `npm run dev`.

require('dotenv').config();
const os = require('os');
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');
const seed = require('./seed');
const app = require('../src/app');

function ipLocal() {
  for (const ifaces of Object.values(os.networkInterfaces())) {
    for (const iface of ifaces) {
      if (iface.family === 'IPv4' && !iface.internal) return iface.address;
    }
  }
  return 'localhost';
}

(async () => {
  console.log('Iniciando MongoDB em memória (modo demonstração)...');
  const mongod = await MongoMemoryServer.create();
  process.env.MONGODB_URI = mongod.getUri('consult_price_demo');
  process.env.JWT_SECRET = process.env.JWT_SECRET || 'demo_secret_dev';

  await mongoose.connect(process.env.MONGODB_URI);
  const resumo = await seed();

  const PORT = process.env.PORT || 3001;
  app.listen(PORT, () => {
    const ip = ipLocal();
    console.log('\n========================================');
    console.log('  Consult Price — API em modo DEMO');
    console.log('========================================');
    console.log(`  Local:   http://localhost:${PORT}/api`);
    console.log(`  Celular: http://${ip}:${PORT}/api  (mesma Wi-Fi)`);
    console.log('  Dados de exemplo:', JSON.stringify(resumo));
    console.log('  Login de teste:  demo@consultprice.com / Senha123');
    console.log('  (dados em memória — somem ao encerrar com Ctrl+C)');
    console.log('========================================\n');
  });

  const encerrar = async () => {
    await mongoose.disconnect();
    await mongod.stop();
    process.exit(0);
  };
  process.on('SIGINT', encerrar);
  process.on('SIGTERM', encerrar);
})().catch((err) => {
  console.error('Erro ao iniciar o modo demo:', err);
  process.exit(1);
});
