// Organiza produtos já existentes no banco:
// - preenche categoria/tipo/marca quando o normalizador consegue inferir
// - padroniza caixa do nome de exibição
// - junta duplicados com a mesma chave confiável, preservando compras,
//   listas e histórico
//
// Dry-run: npm run organize:products
// Aplicar: npm run organize:products:apply

require('dotenv').config();

const mongoose = require('mongoose');
const { organizarProdutos } = require('../src/services/productMaintenanceService');

const aplicar = process.argv.includes('--apply');

async function main() {
  if (!process.env.MONGODB_URI) {
    throw new Error('MONGODB_URI não configurado');
  }

  await mongoose.connect(process.env.MONGODB_URI);
  const resultado = await organizarProdutos({ aplicar });
  console.log(JSON.stringify(resultado, null, 2));
  await mongoose.disconnect();
}

main().catch(async (err) => {
  console.error(err.message);
  try { await mongoose.disconnect(); } catch (_e) {}
  process.exit(1);
});
