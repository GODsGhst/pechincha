require('dotenv').config();
const mongoose = require('mongoose');
const connectDB = require('../src/config/database');
const Usuario = require('../src/models/Usuario');

async function main() {
  const email = String(process.argv[2] || '').trim().toLowerCase();
  if (!email) {
    console.error('Uso: node scripts/promoverAdmin.js email@exemplo.com');
    process.exit(1);
  }

  await connectDB();
  const usuario = await Usuario.findOneAndUpdate(
    { email },
    { $set: { papel: 'admin' } },
    { new: true }
  ).select('nome email papel');

  if (!usuario) {
    console.error(`Usuário não encontrado: ${email}`);
    await mongoose.disconnect();
    process.exit(1);
  }

  console.log(`Admin liberado: ${usuario.nome} <${usuario.email}> (${usuario.papel})`);
  await mongoose.disconnect();
}

main().catch(async (err) => {
  console.error(err);
  await mongoose.disconnect().catch(() => {});
  process.exit(1);
});
