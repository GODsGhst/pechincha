// Modo desenvolvimento persistente: sobe um MongoDB local em disco usando
// mongodb-memory-server, mas com dbPath fixo. Assim não precisa instalar MongoDB
// nem criar Atlas para testar salvamento real entre reinícios.

require('dotenv').config();
const fs = require('fs');
const os = require('os');
const path = require('path');
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');
const Usuario = require('../src/models/Usuario');
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

async function seedInicialSeVazio() {
  const usuarios = await Usuario.countDocuments();
  if (usuarios > 0) {
    return { reutilizado: true, usuarios };
  }

  const resumo = await seed();
  return { reutilizado: false, ...resumo };
}

(async () => {
  const dbPath = path.resolve(__dirname, '..', '.data', 'mongodb');
  fs.mkdirSync(dbPath, { recursive: true });

  console.log('Iniciando MongoDB persistente local...');
  const mongod = await MongoMemoryServer.create({
    instance: {
      dbName: 'consult_price_persistente',
      dbPath,
      storageEngine: 'wiredTiger',
    },
  });

  process.env.MONGODB_URI = mongod.getUri('consult_price_persistente');
  process.env.JWT_SECRET = process.env.JWT_SECRET || 'persist_secret_dev';

  await mongoose.connect(process.env.MONGODB_URI);
  const resumo = await seedInicialSeVazio();

  const PORT = process.env.PORT || 3001;
  const servidor = app.listen(PORT, () => {
    const ip = ipLocal();
    console.log('\n========================================');
    console.log('  Consult Price — API persistente local');
    console.log('========================================');
    console.log(`  Local:   http://localhost:${PORT}/api`);
    console.log(`  Celular: http://${ip}:${PORT}/api  (mesma Wi-Fi)`);
    console.log(`  Banco:   ${dbPath}`);
    console.log('  Login de teste:  demo@consultprice.com / Senha123');
    console.log('  Dados:', JSON.stringify(resumo));
    console.log('  (notas salvas continuam após reiniciar)');
    console.log('========================================\n');
  });

  const encerrar = async () => {
    servidor.close();
    await mongoose.disconnect();
    await mongod.stop();
    process.exit(0);
  };
  process.on('SIGINT', encerrar);
  process.on('SIGTERM', encerrar);
})().catch((err) => {
  console.error('Erro ao iniciar o modo persistente:', err);
  process.exit(1);
});
