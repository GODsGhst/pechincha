require('dotenv').config();
const mongoose = require('mongoose');
const connectDB = require('../src/config/database');
const Usuario = require('../src/models/Usuario');

async function main() {
  const email = String(process.argv[2] || '').trim().toLowerCase();
  const papel = String(process.argv[3] || 'admin').trim().toLowerCase();
  if (!email || !['admin', 'superadmin'].includes(papel)) {
    console.error('Uso: node scripts/promoverAdmin.js email@exemplo.com [admin|superadmin]');
    process.exit(1);
  }

  await connectDB();
  const usuario = await Usuario.findOneAndUpdate(
    { email },
    { $set: { papel } },
    { new: true }
  ).select('nome email papel');

  if (!usuario) {
    console.error(`Usuário não encontrado: ${email}`);
    await mongoose.disconnect();
    process.exit(1);
  }

  console.log(`Permissão liberada: ${usuario.nome} <${usuario.email}> (${usuario.papel})`);
  await mongoose.disconnect();
}

main().catch(async (err) => {
  console.error(err);
  await mongoose.disconnect().catch(() => {});
  process.exit(1);
});
