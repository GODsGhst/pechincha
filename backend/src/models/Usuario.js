const mongoose = require('mongoose');

const usuarioSchema = new mongoose.Schema({
  nome:      { type: String, required: true, trim: true },
  email:     { type: String, required: true, unique: true, lowercase: true, trim: true },
  senha:     { type: String, required: true, select: false }, // armazenada com bcrypt
  papel:     { type: String, enum: ['usuario', 'admin', 'superadmin'], default: 'usuario' },
  login: {
    tentativas_falhas: { type: Number, default: 0, select: false },
    bloqueado_ate:    { type: Date, default: null, select: false },
    ultimo_falha_em:  { type: Date, default: null, select: false }
  },
  reset_senha: {
    token_hash:    { type: String, default: null, select: false },
    expira_em:     { type: Date, default: null, select: false },
    solicitado_em: { type: Date, default: null, select: false }
  },
  admin_2fa: {
    codigo_hash:   { type: String, default: null, select: false },
    expira_em:     { type: Date, default: null, select: false },
    solicitado_em: { type: Date, default: null, select: false },
    tentativas:    { type: Number, default: 0, select: false }
  },
  criado_em: { type: Date, default: Date.now }
});

usuarioSchema.index({ 'reset_senha.expira_em': 1 }, { sparse: true });
usuarioSchema.index({ 'admin_2fa.expira_em': 1 }, { sparse: true });

module.exports = mongoose.model('Usuario', usuarioSchema);
