const mongoose = require('mongoose');

const usuarioSchema = new mongoose.Schema({
  nome:      { type: String, required: true, trim: true },
  email:     { type: String, required: true, unique: true, lowercase: true, trim: true },
  senha:     { type: String, required: true, select: false }, // armazenada com bcrypt
  papel:     { type: String, enum: ['usuario', 'admin'], default: 'usuario' },
  criado_em: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Usuario', usuarioSchema);
