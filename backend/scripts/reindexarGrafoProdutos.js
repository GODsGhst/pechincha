// Reconstroi o indice em grafo usado pela busca de produtos.
//
// Dry-run: npm run graph:products
// Aplicar: npm run graph:products:apply

require('dotenv').config();

const mongoose = require('mongoose');
const { reindexarProdutos } = require('../src/services/productGraphService');

const aplicar = process.argv.includes('--apply');

async function main() {
  if (!process.env.MONGODB_URI) {
    throw new Error('MONGODB_URI nao configurado');
  }

  await mongoose.connect(process.env.MONGODB_URI, {
    autoIndex: process.env.NODE_ENV !== 'production'
  });
  const resultado = await reindexarProdutos({ aplicar });
  console.log(JSON.stringify(resultado, null, 2));
  await mongoose.disconnect();
}

main().catch(async (err) => {
  console.error(err.message);
  try { await mongoose.disconnect(); } catch (_e) {}
  process.exit(1);
});
